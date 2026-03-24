-- ============================================================
-- APEX Ajax Callback:  DELETE_TERM
-- Page:  Business Glossary (page 167)
-- Name:  DELETE_TERM
-- Type:  Ajax Callback
-- ============================================================
-- Deletes a glossary term (and its custom fields) by term_ref.
-- The term is located in the BUSINESS_GLOSSARY MV, then the
-- actual glossary row is deleted from SC_QAWS.GLOSSARY.
--
-- Inputs (via apex.server.process):
--   x01 = term_ref
--   x02 = topic_name   (for MV lookup)
--   x03 = theme_name
--   x04 = dataset_name (empty = direct term under theme)
--
-- Returns: {"status":"ok"} or {"status":"error","message":"..."}
-- ============================================================

DECLARE
    l_term_ref  VARCHAR2(4000) := TRIM(apex_application.g_x01);
    l_topic     VARCHAR2(4000) := TRIM(apex_application.g_x02);
    l_theme     VARCHAR2(4000) := TRIM(apex_application.g_x03);
    l_dataset   VARCHAR2(4000) := NULLIF(TRIM(apex_application.g_x04), '');
    l_id        NUMBER;
BEGIN
    -- Resolve the glossary row id from the MV
    SELECT id INTO l_id
      FROM sc_qaws.business_glossary
     WHERE term_ref    = l_term_ref
       AND topic_name  = l_topic
       AND theme_name  = l_theme
       AND (   (l_dataset IS NULL     AND dataset_name IS NULL)
            OR (l_dataset IS NOT NULL AND dataset_name = l_dataset)
           )
       AND ROWNUM = 1;

    -- Delete all custom fields for this term
    DELETE FROM sc_qaws.custom_field
     WHERE facetobjectid = l_id;

    -- Delete the glossary row
    DELETE FROM sc_qaws.glossary
     WHERE id = l_id;

    COMMIT;

    -- Refresh MV so the deleted term is no longer visible
    DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');

    HTP.P('{"status":"ok"}');

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        HTP.P('{"status":"error","message":"Term not found."}');
    WHEN OTHERS THEN
        ROLLBACK;
        HTP.P('{"status":"error","message":' ||
              apex_escape.json(SQLERRM) || '}');
END;
