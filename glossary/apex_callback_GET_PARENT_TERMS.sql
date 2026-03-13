-- ============================================================
-- APEX Ajax Callback:  GET_PARENT_TERMS
-- Returns distinct parent refs with context labels for dropdown
-- ============================================================

DECLARE
    l_json  CLOB    := '[';
    l_first BOOLEAN := TRUE;

    CURSOR c IS
        SELECT DISTINCT
               parent_term_ref                                           AS ref,
               CASE WHEN dataset_name IS NOT NULL
                    THEN topic_name || ' › ' || theme_name || ' › ' || dataset_name
                    ELSE topic_name || ' › ' || theme_name
               END                                                       AS label
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
           AND parent_term_ref IS NOT NULL
         ORDER BY 2;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN '"' || REPLACE(REPLACE(NVL(p,''), '\','\\'), '"','\"') || '"';
    END;
BEGIN
    FOR r IN c LOOP
        IF NOT l_first THEN l_json := l_json || ','; END IF;
        l_json  := l_json || '{"ref":' || jstr(r.ref) || ',"label":' || jstr(r.label) || '}';
        l_first := FALSE;
    END LOOP;
    l_json := l_json || ']';
    HTP.P(l_json);
END;
