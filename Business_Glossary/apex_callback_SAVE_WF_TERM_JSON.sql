-- ============================================================
-- APEX Ajax Callback:  SAVE_WF_TERM_JSON
-- Called from workflow review page when the reviewer edits and
-- saves changes to a pending glossary term request.
-- Updates:  1) JSON_VAL in SEC_T_PROCESSES_LANDING
--           2) primaryname / description in SC_QAWS.GLOSSARY
--           3) custom_field rows (AR name 120, AR def 121, source 146)
--
-- Input:  x01 = full JSON payload (includes landing_id + all fields)
-- Output: {"status":"ok"} or {"status":"error","message":"..."}
-- ============================================================

DECLARE
    l_payload    VARCHAR2(32767) := apex_application.g_x01;

    -- from payload
    l_landing_id NUMBER;
    l_gls_id     NUMBER;
    l_term_ref   VARCHAR2(200);
    l_parent_ref VARCHAR2(200);
    l_name_en    VARCHAR2(4000);
    l_name_ar    VARCHAR2(4000);
    l_def_en     VARCHAR2(4000);
    l_def_ar     VARCHAR2(4000);
    l_source        VARCHAR2(4000);
    l_dataset_en    VARCHAR2(4000);
    l_dataset_ar    VARCHAR2(4000);
    l_justification VARCHAR2(4000);
    l_use           VARCHAR2(200);

    -- resolved parent
    l_parent_id  NUMBER;

    -- preserved from original row
    l_orig_json  CLOB;
    l_subby      VARCHAR2(200);
    l_subon      VARCHAR2(200);

    l_new_json   CLOB;
    l_cf_id      NUMBER;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p, '');
        l := REPLACE(l, '\',   '\\');
        l := REPLACE(l, '"',   '\"');
        l := REPLACE(l, CHR(10), '\n');
        l := REPLACE(l, CHR(13), '');
        RETURN '"' || l || '"';
    END jstr;

    /* upsert one custom_field row */
    PROCEDURE upsert_cf (p_gls_id  IN NUMBER,
                         p_meta_id IN NUMBER,
                         p_value   IN VARCHAR2) IS
    BEGIN
        IF p_value IS NULL THEN RETURN; END IF;

        UPDATE SC_QAWS.CUSTOM_FIELD
           SET customfieldvalue    = p_value,
               lastupdatedatetime = SYSDATE
         WHERE facetobjectid         = p_gls_id
           AND customfieldmetadataid = p_meta_id;

        IF SQL%ROWCOUNT = 0 THEN
            SELECT NVL(MAX(id), 0) + 1 INTO l_cf_id FROM SC_QAWS.CUSTOM_FIELD;
            INSERT INTO SC_QAWS.CUSTOM_FIELD
                (id, facetobjectid, customfieldmetadataid,
                 customfieldvalue, createdatetime, lastupdatedatetime)
            VALUES
                (l_cf_id, p_gls_id, p_meta_id,
                 p_value, SYSDATE, SYSDATE);
        END IF;
    END upsert_cf;

BEGIN
    -- ── validate input ─────────────────────────────────────────
    IF l_payload IS NULL THEN
        HTP.P('{"status":"error","message":"No data received."}');
        RETURN;
    END IF;

    -- ── parse payload ──────────────────────────────────────────
    l_landing_id := TO_NUMBER(JSON_VALUE(l_payload, '$.landing_id'));
    l_gls_id     := TO_NUMBER(JSON_VALUE(l_payload, '$.glossary_id'));
    l_term_ref   := JSON_VALUE(l_payload, '$.term_ref');
    l_parent_ref := JSON_VALUE(l_payload, '$.parent_ref');
    l_name_en    := JSON_VALUE(l_payload, '$.name_en');
    l_name_ar    := JSON_VALUE(l_payload, '$.name_ar');
    l_def_en     := JSON_VALUE(l_payload, '$.def_en');
    l_def_ar     := JSON_VALUE(l_payload, '$.def_ar');
    l_source        := JSON_VALUE(l_payload, '$.source');
    l_dataset_en    := JSON_VALUE(l_payload, '$.dataset_en');
    l_dataset_ar    := JSON_VALUE(l_payload, '$.dataset_ar');
    l_justification := JSON_VALUE(l_payload, '$.justification');
    l_use           := JSON_VALUE(l_payload, '$.use');

    IF l_name_en IS NULL THEN
        HTP.P('{"status":"error","message":"Term Name (EN) is required."}');
        RETURN;
    END IF;

    IF l_landing_id IS NULL OR l_gls_id IS NULL THEN
        HTP.P('{"status":"error","message":"Invalid landing_id or glossary_id."}');
        RETURN;
    END IF;

    -- ── preserve original submitted_by / submitted_on ──────────
    SELECT JSON_VAL
      INTO l_orig_json
      FROM SEC_T_PROCESSES_LANDING
     WHERE PROCESSES_LANDING_ID = l_landing_id;

    l_subby := JSON_VALUE(l_orig_json, '$.submitted_by');
    l_subon := JSON_VALUE(l_orig_json, '$.submitted_on');

    -- ── build updated JSON ─────────────────────────────────────
    l_new_json :=
        '{'                                                             ||
        '"glossary_id":'   || TO_CHAR(l_gls_id)              || ','   ||
        '"term_ref":'      || jstr(l_term_ref)                || ','   ||
        '"name_en":'       || jstr(l_name_en)                 || ','   ||
        '"name_ar":'       || jstr(l_name_ar)                 || ','   ||
        '"def_en":'        || jstr(l_def_en)                  || ','   ||
        '"def_ar":'        || jstr(l_def_ar)                  || ','   ||
        '"parent_ref":'    || jstr(l_parent_ref)              || ','   ||
        '"source":'        || jstr(l_source)                  || ','   ||
        '"dataset_en":'    || jstr(l_dataset_en)              || ','   ||
        '"dataset_ar":'    || jstr(l_dataset_ar)              || ','   ||
        '"justification":' || jstr(l_justification)           || ','   ||
        '"use":'           || jstr(l_use)                     || ','   ||
        '"status":3,'                                                   ||
        '"submitted_by":'  || jstr(l_subby)                   || ','   ||
        '"submitted_on":'  || jstr(l_subon)                   || ','   ||
        '"updated_by":'    || jstr(apex_application.g_user)   || ','   ||
        '"updated_on":'    || jstr(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')) ||
        '}';

    -- ── update landing table ───────────────────────────────────
    UPDATE SEC_T_PROCESSES_LANDING
       SET JSON_VAL     = l_new_json,
           UPDATED_BY   = apex_application.g_user,
           UPDATED_DATE = SYSDATE
     WHERE PROCESSES_LANDING_ID = l_landing_id;

    -- ── resolve new parent_id if parent_ref provided ───────────
    IF l_parent_ref IS NOT NULL THEN
        BEGIN
            SELECT id INTO l_parent_id
              FROM SC_QAWS.GLOSSARY
             WHERE refnumber = l_parent_ref
               AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN l_parent_id := NULL;
        END;
    END IF;

    -- ── update glossary base row ───────────────────────────────
    UPDATE SC_QAWS.GLOSSARY
       SET primaryname        = l_name_en,
           description        = l_def_en,
           parent_id          = NVL(l_parent_id, parent_id),
           lastupdatedatetime = SYSDATE
     WHERE id = l_gls_id;

    -- ── upsert custom_field rows ───────────────────────────────
    upsert_cf(l_gls_id, 120, l_name_ar);        -- Arabic name
    upsert_cf(l_gls_id, 121, l_def_ar);         -- Arabic definition
    upsert_cf(l_gls_id, 146, l_source);         -- Source
    upsert_cf(l_gls_id, 147, l_dataset_en);     -- Dataset EN
    upsert_cf(l_gls_id, 148, l_dataset_ar);     -- Dataset AR
    upsert_cf(l_gls_id, 149, l_justification);  -- Justification
    upsert_cf(l_gls_id, 150, l_use);            -- Use

    COMMIT;

    HTP.P('{"status":"ok"}');

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        ROLLBACK;
        HTP.P('{"status":"error","message":"Workflow ticket not found."}');
    WHEN OTHERS THEN
        ROLLBACK;
        HTP.P('{"status":"error","message":' ||
              jstr(SUBSTR(SQLERRM, 1, 300)) || '}');
END;
