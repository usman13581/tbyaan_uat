-- ============================================================
-- APEX Ajax Callback:  GET_GLOSSARY_CODES
-- Page:  Business Glossary (page 167)
-- Name:  GET_GLOSSARY_CODES
-- Type:  Ajax Callback
-- ============================================================
-- Paste this block into the PL/SQL Code field of the callback.
-- It returns a JSON array of distinct term codes (C#) sorted
-- numerically so the dropdown is in order.
-- ============================================================

DECLARE
    l_json  CLOB    := '[';
    l_first BOOLEAN := TRUE;

    CURSOR c IS
        SELECT DISTINCT TO_CHAR("C#") AS code
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
           AND "C#" IS NOT NULL
         ORDER BY TO_NUMBER(TO_CHAR("C#"));
BEGIN
    FOR r IN c LOOP
        IF NOT l_first THEN
            l_json := l_json || ',';
        END IF;
        l_json  := l_json || '"' || r.code || '"';
        l_first := FALSE;
    END LOOP;
    l_json := l_json || ']';
    HTP.P(l_json);
END;
