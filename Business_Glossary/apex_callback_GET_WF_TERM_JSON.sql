-- ============================================================
-- APEX Ajax Callback:  GET_WF_TERM_JSON
-- Used on workflow review pages to load a glossary term request.
-- Resolves landing_id via WF_T_PROCESSES, reads JSON_VAL from
-- SEC_T_PROCESSES_LANDING, enriches with request_type (NEW/UPDATE).
--
-- Input:  x01 = P76_WORKFLOW_PROCESS_ID  (workflow process PK)
-- Output: JSON object with all term fields + landing_id + request_type
-- ============================================================

DECLARE
    l_wf_process_id NUMBER := TO_NUMBER(apex_application.g_x01);
    l_id            NUMBER;   -- resolved PROCESSES_LANDING_ID
    l_json          CLOB;

    -- parsed fields
    l_gls_id     NUMBER;
    l_term_ref   VARCHAR2(200);
    l_name_en    VARCHAR2(4000);
    l_name_ar    VARCHAR2(4000);
    l_def_en     VARCHAR2(4000);
    l_def_ar     VARCHAR2(4000);
    l_parent_ref VARCHAR2(200);
    l_source     VARCHAR2(4000);
    l_subby         VARCHAR2(200);
    l_subon         VARCHAR2(200);
    l_justification VARCHAR2(4000);
    l_use           VARCHAR2(200);

    l_req_type   VARCHAR2(10);   -- 'NEW' or 'UPDATE'
    l_cnt        NUMBER;
    l_out        CLOB;

    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
        l VARCHAR2(32767);
    BEGIN
        l := NVL(p, '');
        l := REPLACE(l, '\',   '\\');
        l := REPLACE(l, '"',   '\"');
        l := REPLACE(l, CHR(10), '\n');
        l := REPLACE(l, CHR(13), '');
        RETURN '"' || l || '"';
    END jstr;

BEGIN
    -- ── resolve PROCESSES_LANDING_ID from workflow process ID ──
    SELECT WORKFLOW_TRANSACTION_VALUE
      INTO l_id
      FROM WF_T_PROCESSES
     WHERE WORKFLOW_PROCESS_ID = l_wf_process_id;

    -- ── fetch raw JSON from landing table ──────────────────────
    SELECT JSON_VAL
      INTO l_json
      FROM SEC_T_PROCESSES_LANDING
     WHERE PROCESSES_LANDING_ID = l_id;

    -- ── parse fields ───────────────────────────────────────────
    l_gls_id     := TO_NUMBER(JSON_VALUE(l_json, '$.glossary_id'));
    l_term_ref   := JSON_VALUE(l_json, '$.term_ref');
    l_name_en    := JSON_VALUE(l_json, '$.name_en');
    l_name_ar    := JSON_VALUE(l_json, '$.name_ar');
    l_def_en     := JSON_VALUE(l_json, '$.def_en');
    l_def_ar     := JSON_VALUE(l_json, '$.def_ar');
    l_parent_ref := JSON_VALUE(l_json, '$.parent_ref');
    l_source     := JSON_VALUE(l_json, '$.source');
    l_subby         := JSON_VALUE(l_json, '$.submitted_by');
    l_subon         := JSON_VALUE(l_json, '$.submitted_on');
    l_justification := JSON_VALUE(l_json, '$.justification');
    l_use           := JSON_VALUE(l_json, '$.use');

    -- ── determine NEW vs UPDATE ────────────────────────────────
    -- If an active public term already exists with this term_ref → UPDATE request
    -- Otherwise → NEW term request
    SELECT COUNT(*)
      INTO l_cnt
      FROM SC_QAWS.GLOSSARY
     WHERE refnumber = l_term_ref
       AND ispublic  = 1
       AND status    = 1;

    l_req_type := CASE WHEN l_cnt > 0 THEN 'UPDATE' ELSE 'NEW' END;

    -- ── build response JSON ────────────────────────────────────
    l_out :=
        '{'                                                   ||
        '"status":"ok",'                                      ||
        '"landing_id":'    || TO_CHAR(l_id)       || ','      ||
        '"request_type":'  || jstr(l_req_type)   || ','      ||
        '"glossary_id":'   || TO_CHAR(NVL(l_gls_id, 0)) || ',' ||
        '"term_ref":'      || jstr(l_term_ref)   || ','      ||
        '"name_en":'       || jstr(l_name_en)    || ','      ||
        '"name_ar":'       || jstr(l_name_ar)    || ','      ||
        '"def_en":'        || jstr(l_def_en)     || ','      ||
        '"def_ar":'        || jstr(l_def_ar)     || ','      ||
        '"parent_ref":'    || jstr(l_parent_ref) || ','      ||
        '"source":'        || jstr(l_source)     || ','      ||
        '"justification":' || jstr(l_justification) || ','     ||
        '"use":'           || jstr(l_use)          || ','     ||
        '"submitted_by":'  || jstr(l_subby)        || ','     ||
        '"submitted_on":'  || jstr(l_subon)                   ||
        '}';

    HTP.P(l_out);

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        HTP.P('{"status":"error","message":"Workflow process or landing ticket not found."}');
    WHEN OTHERS THEN
        HTP.P('{"status":"error","message":' ||
              '"' || REPLACE(SUBSTR(SQLERRM, 1, 300), '"', '\"') || '"}');
END;
