-- ============================================================
-- APEX Ajax Callback:  GET_THEME_TERMS
-- Page:  Business Glossary (page 167)
-- Name:  GET_THEME_TERMS
-- Type:  Ajax Callback
-- ============================================================
-- Inputs (via apex.server.process):
--   x01 = topic_name
--   x02 = theme_name
--   x03 = term_seq  (1-based position within the group)
--   x04 = dataset_name  (empty string = direct terms under theme,
--                        non-empty = terms under this dataset node)
-- Returns JSON object from F_GLOSSARY_THEME_TERMS.
-- ============================================================

DECLARE
    l_dataset VARCHAR2(4000) := NULLIF(TRIM(apex_application.g_x04), '');
BEGIN
    HTP.P(
        SC_QAWS.F_GLOSSARY_THEME_TERMS(
            p_topic_name   => apex_application.g_x01,
            p_theme_name   => apex_application.g_x02,
            p_term_seq     => TO_NUMBER(NVL(NULLIF(TRIM(apex_application.g_x03), ''), '1')),
            p_dataset_name => l_dataset
        )
    );
END;
