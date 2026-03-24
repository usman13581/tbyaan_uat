-- ============================================================
-- APEX Ajax Callback:  GET_TREE_TERMS
-- Page:  Business Glossary (page 167)
-- Name:  GET_TREE_TERMS
-- Type:  Ajax Callback
-- ============================================================
-- Returns the ordered term list for a given topic/theme/dataset
-- so the left-panel tree can lazy-load and display clickable
-- term items when a dataset node is expanded.
--
-- Inputs (via apex.server.process):
--   x01 = topic_name
--   x02 = theme_name
--   x03 = dataset_name  (empty string = direct terms under theme)
--
-- Returns: [{"seq":1,"name_en":"..."}]
-- ============================================================

DECLARE
    l_topic   VARCHAR2(4000) := TRIM(apex_application.g_x01);
    l_theme   VARCHAR2(4000) := TRIM(apex_application.g_x02);
    l_dataset VARCHAR2(4000) := NULLIF(TRIM(apex_application.g_x03), '');
    l_json    CLOB;
    l_first   BOOLEAN := TRUE;

    CURSOR c IS
        SELECT term_seq, term_name_en
          FROM (
                SELECT term_name_en,
                       ROW_NUMBER() OVER (
                           PARTITION BY topic_name, theme_name, dataset_name
                           ORDER BY term_name_en, id
                       ) AS term_seq
                  FROM sc_qaws.business_glossary
                 WHERE "Axon Viewing" = 'Public'
                   AND glossary_name != 'National Standards for Statistical Data (NSSD)'
                   AND topic_name = l_topic
                   AND theme_name = l_theme
                   AND (   (l_dataset IS NOT NULL AND dataset_name  = l_dataset)
                        OR (l_dataset IS NULL     AND dataset_name IS NULL)
                       )
               )
         ORDER BY term_seq;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p, '');
        l := REPLACE(l, '\',   '\\');
        l := REPLACE(l, '"',   '\"');
        l := REPLACE(l, CHR(9),  '\t');
        l := REPLACE(l, CHR(10), '\n');
        l := REPLACE(l, CHR(13), '');
        l := REGEXP_REPLACE(l, '[[:cntrl:]]', '');
        RETURN '"' || l || '"';
    END jstr;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_json, TRUE);
    DBMS_LOB.APPEND(l_json, TO_CLOB('['));

    FOR r IN c LOOP
        IF NOT l_first THEN DBMS_LOB.APPEND(l_json, TO_CLOB(',')); END IF;
        DBMS_LOB.APPEND(l_json, TO_CLOB(
            '{"seq":' || TO_CHAR(r.term_seq) || ',"name_en":' || jstr(r.term_name_en) || '}'
        ));
        l_first := FALSE;
    END LOOP;

    DBMS_LOB.APPEND(l_json, TO_CLOB(']'));
    HTP.P(l_json);
END;
