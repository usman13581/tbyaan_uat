-- ============================================================
-- APEX Ajax Callback:  GET_DATASETS_FOR_THEME
-- Page:  Business Glossary (page 167)
-- Name:  GET_DATASETS_FOR_THEME
-- Type:  Ajax Callback
-- ============================================================
-- Inputs (via apex.server.process):
--   x01 = theme_ref  (refnumber of the theme / parent node)
-- Returns distinct dataset names under that theme as a JSON array.
-- Used to populate the dataset datalist on the new/edit term form.
-- ============================================================

DECLARE
    l_theme_ref VARCHAR2(200) := TRIM(apex_application.g_x01);
    l_json      VARCHAR2(32767) := '[';
    l_first     BOOLEAN := TRUE;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN '"' ||
               REPLACE(REPLACE(REPLACE(REPLACE(NVL(p,''),
                   '\',  '\\'),
                   '"',  '\"'),
                   CHR(10), '\n'),
                   CHR(13), '') ||
               '"';
    END jstr;
BEGIN
    FOR r IN (
        SELECT DISTINCT dataset_name, dataset_name_ar
          FROM sc_qaws.business_glossary
         WHERE theme_ref    = l_theme_ref
           AND dataset_name IS NOT NULL
           AND "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
         ORDER BY dataset_name
    ) LOOP
        IF NOT l_first THEN l_json := l_json || ','; END IF;
        l_json := l_json ||
            '{"name_en":'  || jstr(r.dataset_name)    || ',' ||
            '"name_ar":'   || jstr(r.dataset_name_ar) || '}';
        l_first := FALSE;
    END LOOP;

    l_json := l_json || ']';
    HTP.P(l_json);
END;
