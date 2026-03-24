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

    -- parsed type
    l_type      VARCHAR2(10);

    -- resolved IDs
    l_orig_id   NUMBER;
    l_parent_id NUMBER;
    l_sec_class NUMBER;
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
    l_type          := NVL(JSON_VALUE(l_payload, '$.type'), 'UPDATE');
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

    -- ── resolve parent_ref to parent_id ─────────────────────
    IF l_parent_ref IS NOT NULL THEN
        BEGIN
            SELECT id, securityclassification
              INTO l_parent_id, l_sec_class
              FROM SC_QAWS.GLOSSARY
             WHERE refnumber = l_parent_ref
               AND ROWNUM    = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN l_parent_id := NULL; l_sec_class := NULL;
        END;
    END IF;

    -- ── resolve dataset node (find or create type=9 under theme) ──
    -- Applies when dataset_en is given and the resolved parent is a
    -- theme node (type 2 or 5). The term is then placed under the
    -- dataset node instead of directly under the theme.
    DECLARE
        l_parent_type NUMBER;
        l_ds_id       NUMBER;
    BEGIN
        IF l_dataset_en IS NOT NULL AND l_parent_id IS NOT NULL THEN
            BEGIN
                SELECT "type" INTO l_parent_type
                  FROM SC_QAWS.GLOSSARY
                 WHERE id = l_parent_id;
            EXCEPTION WHEN NO_DATA_FOUND THEN l_parent_type := NULL;
            END;

            IF l_parent_type IN (2, 5) THEN
                -- find existing dataset node
                BEGIN
                    SELECT id INTO l_ds_id
                      FROM SC_QAWS.GLOSSARY
                     WHERE parent_id   = l_parent_id
                       AND "type"      = 9
                       AND primaryname = l_dataset_en
                       AND ROWNUM      = 1;
                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        -- create new dataset node
                        SELECT NVL(MAX(id), 0) + 1 INTO l_ds_id FROM SC_QAWS.GLOSSARY;
                        INSERT INTO SC_QAWS.GLOSSARY (
                            id, primaryname, refnumber, parent_id,
                            "type", status, ispublic,
                            createdatetime, lastupdatedatetime
                        ) VALUES (
                            l_ds_id, l_dataset_en,
                            'DS-' || TO_CHAR(l_ds_id),
                            l_parent_id, 9, 1, 1, SYSDATE, SYSDATE
                        );
                        -- store Arabic dataset name on the node
                        IF l_dataset_ar IS NOT NULL THEN
                            SELECT NVL(MAX(id), 0) + 1 INTO l_cf_id FROM SC_QAWS.CUSTOM_FIELD;
                            INSERT INTO SC_QAWS.CUSTOM_FIELD
                                (id, facetobjectid, customfieldmetadataid,
                                 customfieldvalue, createdatetime, lastupdatedatetime)
                            VALUES (l_cf_id, l_ds_id, 120, l_dataset_ar, SYSDATE, SYSDATE);
                        END IF;
                END;
                -- reparent term under the dataset node
                l_parent_id := l_ds_id;
            END IF;
        END IF;
    END;

    -- ══════════════════════════════════════════════════════════
    -- PATH A: NEW — insert directly as active (no workflow)
    -- ══════════════════════════════════════════════════════════
    IF l_type = 'NEW' THEN

        IF l_parent_id IS NULL THEN
            HTP.P('{"status":"error","message":"Parent Ref is required for new terms."}');
            RETURN;
        END IF;

        SELECT NVL(MAX(id), 0) + 1 INTO l_orig_id FROM SC_QAWS.GLOSSARY;

        INSERT INTO SC_QAWS.GLOSSARY (
            id, primaryname, description, refnumber, parent_id,
            "type", status, ispublic, securityclassification,
            createdatetime, lastupdatedatetime
        ) VALUES (
            l_orig_id, l_name_en, l_def_en, l_term_ref, l_parent_id,
            3,   -- standard term type
            1,   -- Active
            1,   -- Public (visible immediately)
            l_sec_class,
            SYSDATE, SYSDATE
        );

    -- ══════════════════════════════════════════════════════════
    -- PATH B: UPDATE — find active term and update in place
    -- ══════════════════════════════════════════════════════════
    ELSE

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

        UPDATE SC_QAWS.GLOSSARY
           SET primaryname        = l_name_en,
               description        = l_def_en,
               parent_id          = NVL(l_parent_id, parent_id),
               lastupdatedatetime = SYSDATE
         WHERE id = l_orig_id;

    END IF;

    -- ── upsert custom_field rows (works for both NEW and UPDATE) ──
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
