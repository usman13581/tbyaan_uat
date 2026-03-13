-- ============================================================
-- APEX Ajax Callback:  SAVE_DRAFT_TERM
-- Inserts draft term directly into sc_qaws.glossary (ispublic=0)
-- and sc_qaws.custom_field for AR name (120), AR def (121), source (146)
-- Input:  x01 = JSON string from JS
-- Output: {"status":"ok","id":NNN} or {"status":"error","message":"..."}
-- ============================================================

DECLARE
    l_payload   VARCHAR2(32767) := apex_application.g_x01;

    -- fixed values confirmed from diagnostic queries
    l_term_type    CONSTANT NUMBER := 3;   -- standard term type (6851 existing terms)
    l_draft_status CONSTANT NUMBER := 3;   -- status: Pending Review (workflow approval changes to 1=Active)

    -- new IDs
    l_new_id    NUMBER;
    l_cf_id     NUMBER;
    l_wf_id     NUMBER;      -- workflow ticket ID (from SEC_T_PROCESSES_LANDING_SEQ)

    -- workflow JSON
    l_review_json CLOB;

    -- looked-up parent
    l_parent_id   NUMBER;
    l_sec_class   NUMBER;

    -- parsed fields
    l_name_en    VARCHAR2(4000);
    l_name_ar    VARCHAR2(4000);
    l_term_ref   VARCHAR2(200);
    l_parent_ref VARCHAR2(4000);
    l_def_en     VARCHAR2(4000);
    l_def_ar     VARCHAR2(4000);
    l_source     VARCHAR2(4000);

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p,'');
        l := REPLACE(l, '\',  '\\');
        l := REPLACE(l, '"',  '\"');
        l := REPLACE(l, CHR(10), '\n');
        l := REPLACE(l, CHR(13), '');
        RETURN '"' || l || '"';
    END jstr;

    /* ── Insert one custom_field row ── */
    PROCEDURE ins_cf (p_glossary_id IN NUMBER,
                      p_meta_id     IN NUMBER,
                      p_value       IN VARCHAR2) IS
    BEGIN
        IF p_value IS NULL THEN RETURN; END IF;
        SELECT NVL(MAX(id), 0) + 1 INTO l_cf_id FROM sc_qaws.custom_field;
        INSERT INTO sc_qaws.custom_field (id, facetobjectid, customfieldmetadataid, customfieldvalue, createdatetime, lastupdatedatetime)
        VALUES (l_cf_id, p_glossary_id, p_meta_id, p_value, SYSDATE, SYSDATE);
    END ins_cf;

BEGIN
    -- ── validate input ──────────────────────────────────────
    IF l_payload IS NULL THEN
        HTP.P('{"status":"error","message":"No data received."}');
        RETURN;
    END IF;

    -- ── parse JSON ──────────────────────────────────────────
    l_name_en    := JSON_VALUE(l_payload, '$.name_en');
    l_name_ar    := JSON_VALUE(l_payload, '$.name_ar');
    l_term_ref   := JSON_VALUE(l_payload, '$.term_ref');
    l_parent_ref := JSON_VALUE(l_payload, '$.parent_ref');
    l_def_en     := JSON_VALUE(l_payload, '$.def_en');
    l_def_ar     := JSON_VALUE(l_payload, '$.def_ar');
    l_source     := JSON_VALUE(l_payload, '$.source');

    IF l_name_en IS NULL THEN
        HTP.P('{"status":"error","message":"Term Name (EN) is required."}');
        RETURN;
    END IF;

    -- ── resolve parent internal ID and security class ────────
    BEGIN
        SELECT id, securityclassification
          INTO l_parent_id, l_sec_class
          FROM sc_qaws.glossary
         WHERE refnumber = l_parent_ref
           AND ROWNUM = 1;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            HTP.P('{"status":"error","message":"Parent ref ' || l_parent_ref || ' not found."}');
            RETURN;
    END;

    -- ── generate new glossary ID ─────────────────────────────
    SELECT NVL(MAX(id), 0) + 1 INTO l_new_id FROM sc_qaws.glossary;

    -- ── insert into glossary (ispublic=0 = not shown on front end) ──
    INSERT INTO sc_qaws.glossary (
        id,
        primaryname,
        description,
        refnumber,
        parent_id,
        "type",
        status,
        ispublic,
        securityclassification,
        createdatetime,
        lastupdatedatetime
    ) VALUES (
        l_new_id,
        l_name_en,
        l_def_en,
        l_term_ref,
        l_parent_id,
        l_term_type,
        l_draft_status,
        0,             -- 0 = not public; MV filter "Axon Viewing"='Public' hides it
        l_sec_class,   -- inherited from parent term
        SYSDATE,
        SYSDATE
    );

    -- ── insert Arabic name (custom field 120) ────────────────
    ins_cf(l_new_id, 120, l_name_ar);

    -- ── insert Arabic definition (custom field 121) ──────────
    ins_cf(l_new_id, 121, l_def_ar);

    -- ── insert source (custom field 146) ────────────────────
    ins_cf(l_new_id, 146, l_source);

    -- ── build workflow review JSON ───────────────────────────
    l_review_json :=
        '{' ||
        '"glossary_id":'  || TO_CHAR(l_new_id)   || ',' ||
        '"term_ref":'     || jstr(l_term_ref)     || ',' ||
        '"name_en":'      || jstr(l_name_en)      || ',' ||
        '"name_ar":'      || jstr(l_name_ar)      || ',' ||
        '"def_en":'       || jstr(l_def_en)       || ',' ||
        '"def_ar":'       || jstr(l_def_ar)       || ',' ||
        '"parent_ref":'   || jstr(l_parent_ref)   || ',' ||
        '"source":'       || jstr(l_source)        || ',' ||
        '"status":3,'     ||
        '"submitted_by":' || jstr(apex_application.g_user) || ',' ||
        '"submitted_on":' || jstr(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')) ||
        '}';

    -- ── insert workflow ticket ────────────────────────────────
    SELECT SEC_T_PROCESSES_LANDING_SEQ.NEXTVAL INTO l_wf_id FROM DUAL;

    INSERT INTO SEC_T_PROCESSES_LANDING (
        PROCESSES_LANDING_ID,
        TRANSACTION_TYPE,
        TRANSACTION_VALUE,
        IS_ACTIVE,
        IS_DONE,
        JSON_VAL,
        INSERT_BY,
        INSERT_DATE,
        UPDATED_BY,
        UPDATED_DATE
    ) VALUES (
        l_wf_id,
        'SCAD-BG',
        l_wf_id,
        1,
        0,
        l_review_json,
        apex_application.g_user,
        SYSDATE,
        apex_application.g_user,
        SYSDATE
    );

    COMMIT;

    HTP.P(
        '{"status":"ok"' ||
        ',"id":'       || TO_CHAR(l_new_id)   ||
        ',"term_ref":' || jstr(l_term_ref)     ||
        ',"name_en":' || jstr(l_name_en)       ||
        '}'
    );

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        HTP.P('{"status":"error","message":' ||
              jstr(SUBSTR(SQLERRM, 1, 500)) || '}');
END;
