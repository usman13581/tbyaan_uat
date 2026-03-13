-- ============================================================
-- APEX Ajax Callback:  GET_NEW_TERM_CODE
-- Returns next available code (MAX C# + 1) and auto term_ref
-- ============================================================

DECLARE
    l_code NUMBER;
BEGIN
    SELECT NVL(MAX("C#"), 0) + 1
      INTO l_code
      FROM sc_qaws.business_glossary;

    HTP.P(
        '{"code":'     || TO_CHAR(l_code) ||
        ',"term_ref":' || '"GLOS-' || TO_CHAR(l_code) || '"' ||
        '}'
    );
END;
