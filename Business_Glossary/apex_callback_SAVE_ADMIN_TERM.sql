-- ============================================================
-- APEX Ajax Callback:  SAVE_ADMIN_TERM
-- Saves an existing active term directly (no workflow).
-- Updates sc_qaws.glossary + sc_qaws.custom_field in-place,
-- then refreshes the MV so changes appear immediately.
--
-- Custom field IDs:
--   120=name_ar, 121=def_ar, 146=source,
--   147=dataset_en, 148=dataset_ar, 149=justification, 150=use
--
-- Input:  x01 = JSON string from JS (same payload as SAVE_DRAFT_TERM)
-- Output: {"status":"ok","id":NNN} or {"status":"error","message":"..."}
-- ============================================================

DECLARE
    l_payload   VARCHAR2(32767) := apex_application.g_x01;

    -- parsed fields
    l_term_ref      VARCHAR2(200);
    l_parent_ref    VARCHAR2(200);
    l_name_en       VARCHAR2(4000);
    l_name_ar       VARCHAR2(4000);
    l_def_en        VARCHAR2(4000);
    l_def_ar        VARCHAR2(4000);
    l_source        VARCHAR2(4000);
    l_dataset_en    VARCHAR2(4000);
    l_dataset_ar    VARCHAR2(4000);
    l_justification VARCHAR2(4000);
    l_use           VARCHAR2(200);

    -- resolved IDs
    l_orig_id   NUMBER;
    l_parent_id NUMBER;
    l_cf_id     NUMBER;

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
                (l_cf_id, p_gls_id, p_meta_id, p_value, SYSDATE, SYSDATE);
        END IF;
    END upsert_cf;

BEGIN
    -- ── validate input ──────────────────────────────────────
    IF l_payload IS NULL THEN
        HTP.P('{"status":"error","message":"No data received."}');
        RETURN;
    END IF;

    -- ── parse JSON ──────────────────────────────────────────
    l_term_ref      := JSON_VALUE(l_payload, '$.term_ref');
    l_parent_ref    := JSON_VALUE(l_payload, '$.parent_ref');
    l_name_en       := JSON_VALUE(l_payload, '$.name_en');
    l_name_ar       := JSON_VALUE(l_payload, '$.name_ar');
    l_def_en        := JSON_VALUE(l_payload, '$.def_en');
    l_def_ar        := JSON_VALUE(l_payload, '$.def_ar');
    l_source        := JSON_VALUE(l_payload, '$.source');
    l_dataset_en    := JSON_VALUE(l_payload, '$.dataset_en');
    l_dataset_ar    := JSON_VALUE(l_payload, '$.dataset_ar');
    l_justification := JSON_VALUE(l_payload, '$.justification');
    l_use           := JSON_VALUE(l_payload, '$.use');

    IF l_term_ref IS NULL THEN
        HTP.P('{"status":"error","message":"term_ref is required."}');
        RETURN;
    END IF;

    IF l_name_en IS NULL THEN
        HTP.P('{"status":"error","message":"Term Name (EN) is required."}');
        RETURN;
    END IF;

    -- ── find the active term by term_ref ─────────────────────
    BEGIN
        SELECT id INTO l_orig_id
          FROM SC_QAWS.GLOSSARY
         WHERE refnumber = l_term_ref
           AND ispublic  = 1
           AND status    = 1
           AND ROWNUM    = 1;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            HTP.P('{"status":"error","message":"Active term with ref ' || l_term_ref || ' not found."}');
            RETURN;
    END;

    -- ── resolve parent_ref to parent_id (optional) ───────────
    IF l_parent_ref IS NOT NULL THEN
        BEGIN
            SELECT id INTO l_parent_id
              FROM SC_QAWS.GLOSSARY
             WHERE refnumber = l_parent_ref
               AND ROWNUM    = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN l_parent_id := NULL;
        END;
    END IF;

    -- ── update the glossary row directly ─────────────────────
    UPDATE SC_QAWS.GLOSSARY
       SET primaryname        = l_name_en,
           description        = l_def_en,
           parent_id          = NVL(l_parent_id, parent_id),
           lastupdatedatetime = SYSDATE
     WHERE id = l_orig_id;

    -- ── upsert custom_field rows ─────────────────────────────
    upsert_cf(l_orig_id, 120, l_name_ar);
    upsert_cf(l_orig_id, 121, l_def_ar);
    upsert_cf(l_orig_id, 146, l_source);
    upsert_cf(l_orig_id, 147, l_dataset_en);
    upsert_cf(l_orig_id, 148, l_dataset_ar);
    upsert_cf(l_orig_id, 149, l_justification);
    upsert_cf(l_orig_id, 150, l_use);

    COMMIT;

    -- ── refresh MV so changes appear immediately ─────────────
    DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');

    HTP.P(
        '{"status":"ok"' ||
        ',"id":'       || TO_CHAR(l_orig_id) ||
        ',"term_ref":' || jstr(l_term_ref)   ||
        ',"name_en":'  || jstr(l_name_en)    ||
        '}'
    );

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        HTP.P('{"status":"error","message":' ||
              jstr(SUBSTR(SQLERRM, 1, 500)) || '}');
END;
