-- ============================================================
-- Procedure:  SC_QAWS.P_APPROVE_GLOSSARY_TERM
-- Purpose:    Final approval step for glossary workflow.
--
-- NEW TERM request:
--   - Activates the draft row (ispublic=1, status=1)
--
-- UPDATE TERM request:
--   - Finds the original ACTIVE term by term_ref
--   - Syncs JSON data (name/def/source) to the original term
--   - Deletes the temporary draft row and its custom_field rows
--   - Original term stays active with updated content
--
-- Usage (APEX workflow final approval PL/SQL step):
--   BEGIN
--       SC_QAWS.P_APPROVE_GLOSSARY_TERM(
--           p_workflow_process_id => :P76_WORKFLOW_PROCESS_ID
--       );
--   END;
-- ============================================================

CREATE OR REPLACE PROCEDURE SC_QAWS.P_APPROVE_GLOSSARY_TERM (
    p_workflow_process_id IN NUMBER
)
AS
    l_landing_id NUMBER;
    l_json       CLOB;

    -- from JSON
    l_gls_id        NUMBER;   -- draft row ID (inserted by SAVE_DRAFT_TERM)
    l_term_ref      VARCHAR2(200);
    l_name_en       VARCHAR2(4000);
    l_name_ar       VARCHAR2(4000);
    l_def_en        VARCHAR2(4000);
    l_def_ar        VARCHAR2(4000);
    l_source        VARCHAR2(4000);
    l_dataset_en    VARCHAR2(4000);
    l_dataset_ar    VARCHAR2(4000);
    l_justification VARCHAR2(4000);
    l_use           VARCHAR2(200);
    l_parent_ref    VARCHAR2(200);

    -- for UPDATE path: original active term
    l_orig_id    NUMBER;
    l_parent_id  NUMBER;

    l_cf_id      NUMBER;
    l_is_update  BOOLEAN := FALSE;

    /* upsert one custom_field row for a given glossary id */
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
    -- ── resolve PROCESSES_LANDING_ID ───────────────────────────
    SELECT WORKFLOW_TRANSACTION_VALUE
      INTO l_landing_id
      FROM WF_T_PROCESSES
     WHERE WORKFLOW_PROCESS_ID = p_workflow_process_id;

    -- ── read latest JSON (includes any reviewer edits) ─────────
    SELECT JSON_VAL
      INTO l_json
      FROM SEC_T_PROCESSES_LANDING
     WHERE PROCESSES_LANDING_ID = l_landing_id;

    l_gls_id        := TO_NUMBER(JSON_VALUE(l_json, '$.glossary_id'));
    l_term_ref      := JSON_VALUE(l_json, '$.term_ref');
    l_name_en       := JSON_VALUE(l_json, '$.name_en');
    l_name_ar       := JSON_VALUE(l_json, '$.name_ar');
    l_def_en        := JSON_VALUE(l_json, '$.def_en');
    l_def_ar        := JSON_VALUE(l_json, '$.def_ar');
    l_source        := JSON_VALUE(l_json, '$.source');
    l_dataset_en    := JSON_VALUE(l_json, '$.dataset_en');
    l_dataset_ar    := JSON_VALUE(l_json, '$.dataset_ar');
    l_justification := JSON_VALUE(l_json, '$.justification');
    l_use           := JSON_VALUE(l_json, '$.use');
    l_parent_ref    := JSON_VALUE(l_json, '$.parent_ref');

    IF l_gls_id IS NULL THEN
        RAISE_APPLICATION_ERROR(-20001,
            'P_APPROVE_GLOSSARY_TERM: glossary_id missing in JSON ' ||
            '(landing_id=' || TO_CHAR(l_landing_id) || ')');
    END IF;

    -- ── resolve parent_ref to parent_id ───────────────────────
    IF l_parent_ref IS NOT NULL THEN
        BEGIN
            SELECT id INTO l_parent_id
              FROM SC_QAWS.GLOSSARY
             WHERE refnumber = l_parent_ref
               AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN l_parent_id := NULL;
        END;
    END IF;

    -- ── detect NEW vs UPDATE ───────────────────────────────────
    -- If another active public term with the same term_ref exists
    -- (id different from the draft), this is an UPDATE request.
    BEGIN
        SELECT id
          INTO l_orig_id
          FROM SC_QAWS.GLOSSARY
         WHERE refnumber = l_term_ref
           AND ispublic  = 1
           AND status    = 1
           AND id       != l_gls_id
           AND ROWNUM    = 1;

        l_is_update := TRUE;   -- original active term found
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            l_is_update := FALSE;  -- no existing active term → NEW
    END;

    -- ══════════════════════════════════════════════════════════
    -- PATH A: UPDATE — sync to original term, delete draft
    -- ══════════════════════════════════════════════════════════
    IF l_is_update THEN

        -- update original term with final approved data
        UPDATE SC_QAWS.GLOSSARY
           SET primaryname        = l_name_en,
               description        = l_def_en,
               parent_id          = NVL(l_parent_id, parent_id),
               lastupdatedatetime = SYSDATE
         WHERE id = l_orig_id;

        -- sync custom_field rows on the original term
        upsert_cf(l_orig_id, 120, l_name_ar);
        upsert_cf(l_orig_id, 121, l_def_ar);
        upsert_cf(l_orig_id, 146, l_source);
        upsert_cf(l_orig_id, 147, l_dataset_en);
        upsert_cf(l_orig_id, 148, l_dataset_ar);
        upsert_cf(l_orig_id, 149, l_justification);
        upsert_cf(l_orig_id, 150, l_use);

        -- delete the temporary draft custom_field rows
        DELETE FROM SC_QAWS.CUSTOM_FIELD
         WHERE facetobjectid = l_gls_id;

        -- delete the temporary draft glossary row
        DELETE FROM SC_QAWS.GLOSSARY
         WHERE id = l_gls_id;

    -- ══════════════════════════════════════════════════════════
    -- PATH B: NEW — activate the draft row directly
    -- ══════════════════════════════════════════════════════════
    ELSE

        -- sync latest JSON data to the draft row (reviewer may have edited)
        UPDATE SC_QAWS.GLOSSARY
           SET primaryname        = l_name_en,
               description        = l_def_en,
               parent_id          = NVL(l_parent_id, parent_id),
               ispublic           = 1,   -- now visible in glossary UI
               status             = 1,   -- Active
               lastupdatedatetime = SYSDATE
         WHERE id = l_gls_id;

        -- sync custom_field rows on the draft (now the real term)
        upsert_cf(l_gls_id, 120, l_name_ar);
        upsert_cf(l_gls_id, 121, l_def_ar);
        upsert_cf(l_gls_id, 146, l_source);
        upsert_cf(l_gls_id, 147, l_dataset_en);
        upsert_cf(l_gls_id, 148, l_dataset_ar);
        upsert_cf(l_gls_id, 149, l_justification);
        upsert_cf(l_gls_id, 150, l_use);

    END IF;

    -- ── close the workflow ticket ──────────────────────────────
    UPDATE SEC_T_PROCESSES_LANDING
       SET IS_DONE      = 1,
           IS_ACTIVE    = 0,
           UPDATED_BY   = SYS_CONTEXT('APEX$SESSION', 'APP_USER'),
           UPDATED_DATE = SYSDATE
     WHERE PROCESSES_LANDING_ID = l_landing_id;

    COMMIT;

    -- ── refresh MV so changes appear immediately in glossary ───
    DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END P_APPROVE_GLOSSARY_TERM;
/

-- GRANT EXECUTE ON SC_QAWS.P_APPROVE_GLOSSARY_TERM TO APEX_PUBLIC_USER;
