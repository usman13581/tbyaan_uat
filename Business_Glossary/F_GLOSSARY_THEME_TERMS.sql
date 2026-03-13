CREATE OR REPLACE FUNCTION SC_QAWS.F_GLOSSARY_THEME_TERMS (
    p_topic_name  IN VARCHAR2,
    p_theme_name  IN VARCHAR2,
    p_term_seq    IN NUMBER DEFAULT 1
)
    RETURN CLOB
IS
    l_json  CLOB;
    l_src   VARCHAR2(32767);
    l_total NUMBER := 0;

    TYPE t_term IS RECORD (
        id                  NUMBER,
        c_no                NUMBER,
        term_ref            VARCHAR2(4000),
        dataset_name        VARCHAR2(4000),
        dataset_name_ar     VARCHAR2(4000),
        term_name_en        VARCHAR2(4000),
        term_name_ar        VARCHAR2(4000),
        term_definition_en  VARCHAR2(4000),
        term_definition_ar  VARCHAR2(4000),
        term_source         VARCHAR2(4000),
        parent_term_ref     VARCHAR2(4000)
    );
    r t_term;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p, '');
        l := REPLACE(l, '\',  '\\');
        l := REPLACE(l, '"',  '\"');
        l := REPLACE(l, CHR(10), '\n');
        l := REPLACE(l, CHR(13), '');
        RETURN '"' || l || '"';
    END jstr;

BEGIN
    -- Total count for this topic/theme (MV scan is fast with idx_bg_topic_theme)
    SELECT COUNT(*) INTO l_total
      FROM sc_qaws.business_glossary
     WHERE "Axon Viewing"  = 'Public'
       AND glossary_name  != 'National Standards for Statistical Data (NSSD)'
       AND topic_name      = p_topic_name
       AND theme_name      = p_theme_name;

    -- Fetch exactly the one row at position p_term_seq — no loop needed
    SELECT id, "C#", term_ref,
           dataset_name,      dataset_name_ar,
           term_name_en,      term_name_ar,
           term_definition_en, term_definition_ar,
           term_source,       parent_term_ref
      INTO r.id, r.c_no, r.term_ref,
           r.dataset_name,    r.dataset_name_ar,
           r.term_name_en,    r.term_name_ar,
           r.term_definition_en, r.term_definition_ar,
           r.term_source,     r.parent_term_ref
      FROM (
            SELECT id, "C#", term_ref,
                   dataset_name,      dataset_name_ar,
                   term_name_en,      term_name_ar,
                   term_definition_en, term_definition_ar,
                   term_source,       parent_term_ref,
                   ROW_NUMBER() OVER (ORDER BY term_name_en, id) AS term_seq
              FROM sc_qaws.business_glossary
             WHERE "Axon Viewing"  = 'Public'
               AND glossary_name  != 'National Standards for Statistical Data (NSSD)'
               AND topic_name      = p_topic_name
               AND theme_name      = p_theme_name
           )
     WHERE term_seq = p_term_seq;

    -- Resolve source label
    IF r.term_source IS NULL AND r.dataset_name IS NOT NULL THEN
        l_src :=
            'National Standards for Statistical Data / '
         || CHR(1583)||CHR(1604)||CHR(1610)||CHR(1604)||' '
         || CHR(1575)||CHR(1604)||CHR(1605)||CHR(1593)||CHR(1575)||CHR(1610)||CHR(1610)||CHR(1585)||' '
         || CHR(1575)||CHR(1604)||CHR(1608)||CHR(1591)||CHR(1606)||CHR(1610)||CHR(1577)||' '
         || CHR(1604)||CHR(1604)||CHR(1576)||CHR(1610)||CHR(1575)||CHR(1606)||CHR(1575)||CHR(1578)||' '
         || CHR(1575)||CHR(1573)||CHR(1581)||CHR(1589)||CHR(1575)||CHR(1574)||CHR(1610)||CHR(1577);
    ELSE
        l_src := TO_CHAR(r.term_source);
    END IF;

    -- Build JSON
    DBMS_LOB.CREATETEMPORARY(l_json, TRUE);
    DBMS_LOB.APPEND(l_json, TO_CLOB(
        '{'
     || '"seq":'    || TO_CHAR(p_term_seq)   || ','
     || '"total":'  || TO_CHAR(l_total)       || ','
     || '"id":'     || TO_CHAR(r.id)           || ','
     || '"code":'        || jstr(TO_CHAR(r.c_no))    || ','
     || '"term_ref":'    || jstr(r.term_ref)          || ','
     || '"parent_ref":'  || jstr(r.parent_term_ref)   || ','
     || '"name_en":'     || jstr(r.term_name_en)      || ','
     || '"name_ar":'     || jstr(r.term_name_ar)      || ','
     || '"dataset_en":'  || jstr(r.dataset_name)      || ','
     || '"dataset_ar":'  || jstr(r.dataset_name_ar)   || ','
     || '"source":'      || jstr(l_src)
    ));

    -- definitions can be large — append separately
    DBMS_LOB.APPEND(l_json, TO_CLOB(',"def_en":'));
    DBMS_LOB.APPEND(l_json, TO_CLOB(jstr(SUBSTR(r.term_definition_en, 1, 4000))));
    DBMS_LOB.APPEND(l_json, TO_CLOB(',"def_ar":'));
    DBMS_LOB.APPEND(l_json, TO_CLOB(jstr(SUBSTR(r.term_definition_ar, 1, 4000))));
    DBMS_LOB.APPEND(l_json, TO_CLOB('}'));

    RETURN l_json;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN TO_CLOB('{"error":"Term not found","seq":' || TO_CHAR(p_term_seq) || ',"total":' || TO_CHAR(l_total) || '}');
    WHEN OTHERS THEN
        RAISE;
END F_GLOSSARY_THEME_TERMS;
/
