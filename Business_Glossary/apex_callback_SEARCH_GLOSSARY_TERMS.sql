-- ============================================================
-- APEX Ajax Callback:  SEARCH_GLOSSARY_TERMS
-- Page:  Business Glossary (page 167)
-- Name:  SEARCH_GLOSSARY_TERMS
-- Type:  Ajax Callback
-- ============================================================
-- Inputs (via apex.server.process):
--   x01 = search string (matches EN name, AR name, EN definition, code, term_ref)
-- Returns up to 50 results as a JSON array.
-- ============================================================

DECLARE
    l_search VARCHAR2(4000) := UPPER(TRIM(apex_application.g_x01));
    l_json   CLOB;
    l_first  BOOLEAN := TRUE;

    CURSOR c IS
        -- ROW_NUMBER computed over ALL terms first (full theme position),
        -- then filtered — so seq matches what F_GLOSSARY_THEME_TERMS returns.
        SELECT term_name_en,
               term_name_ar,
               TO_CHAR("C#")                            AS code,
               term_ref,
               topic_name,
               theme_name,
               SUBSTR(term_definition_en, 1, 200)       AS def_snippet,
               term_seq
          FROM (
                SELECT term_name_en,
                       term_name_ar,
                       "C#",
                       term_ref,
                       topic_name,
                       theme_name,
                       term_definition_en,
                       ROW_NUMBER() OVER (
                           PARTITION BY topic_name, theme_name
                           ORDER BY term_name_en, id
                       )                                AS term_seq
                  FROM sc_qaws.business_glossary
                 WHERE "Axon Viewing" = 'Public'
                   AND glossary_name != 'National Standards for Statistical Data (NSSD)'
               )
         WHERE l_search IS NOT NULL
           AND (   UPPER(term_name_en)       LIKE '%' || l_search || '%'
                OR UPPER(term_name_ar)       LIKE '%' || l_search || '%'
                OR UPPER(term_definition_en) LIKE '%' || l_search || '%'
                OR UPPER(TO_CHAR("C#"))      LIKE '%' || l_search || '%'
                OR UPPER(term_ref)           LIKE '%' || l_search || '%'
               )
         ORDER BY term_name_en
         FETCH FIRST 50 ROWS ONLY;

    -- subprograms must come after all variable/cursor declarations
    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p, '');
        l := REPLACE(l, '\',   '\\');
        l := REPLACE(l, '"',   '\"');
        l := REPLACE(l, CHR(9),  '\t');   -- tab
        l := REPLACE(l, CHR(10), '\n');   -- newline
        l := REPLACE(l, CHR(13), '');     -- CR
        -- strip any remaining control characters (invalid in JSON strings)
        l := REGEXP_REPLACE(l, '[[:cntrl:]]', '');
        RETURN '"' || l || '"';
    END jstr;
BEGIN
    DBMS_LOB.CREATETEMPORARY(l_json, TRUE);
    DBMS_LOB.APPEND(l_json, TO_CLOB('['));

    FOR r IN c LOOP
        IF NOT l_first THEN
            DBMS_LOB.APPEND(l_json, TO_CLOB(','));
        END IF;
        DBMS_LOB.APPEND(l_json, TO_CLOB(
            '{' ||
            '"name_en":'  || jstr(r.term_name_en)      || ',' ||
            '"name_ar":'  || jstr(r.term_name_ar)      || ',' ||
            '"code":'     || jstr(r.code)               || ',' ||
            '"term_ref":' || jstr(r.term_ref)           || ',' ||
            '"topic":'    || jstr(r.topic_name)         || ',' ||
            '"theme":'    || jstr(r.theme_name)         || ',' ||
            '"seq":'      || TO_CHAR(r.term_seq)        || ',' ||
            '"def":'      || jstr(r.def_snippet)        ||
            '}'
        ));
        l_first := FALSE;
    END LOOP;

    DBMS_LOB.APPEND(l_json, TO_CLOB(']'));
    HTP.P(l_json);
END;
