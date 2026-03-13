/*
 * V_BUSINESS_GLOSSARY.sql
 *
 * Creates SC_QAWS.BUSINESS_GLOSSARY as a MATERIALIZED VIEW on SC_QAWS base tables.
 *
 * Run this as SC_QAWS (or a DBA).
 *
 * Manual refresh: EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY','C');
 */

-- ── Drop any existing object with this name ──────────────────────────────────
BEGIN EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW SC_QAWS.BUSINESS_GLOSSARY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP VIEW  SC_QAWS.BUSINESS_GLOSSARY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE SC_QAWS.BUSINESS_GLOSSARY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ── Materialized View ─────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW SC_QAWS.BUSINESS_GLOSSARY
BUILD IMMEDIATE
REFRESH COMPLETE ON DEMAND
ENABLE QUERY REWRITE
AS
SELECT
    /* ── Root glossary ──────────────────────────────────────────── */
    g0.primaryname                                                          AS glossary_name,
    CAST(SUBSTR(cf_g0ar.customfieldvalue, 1, 4000) AS VARCHAR2(4000))      AS glossary_name_ar,

    /* ── Topic ──────────────────────────────────────────────────── */
    g1.primaryname                                                          AS topic_name,
    CAST(SUBSTR(cf_g1ar.customfieldvalue, 1, 4000) AS VARCHAR2(4000))      AS topic_name_ar,
    g1.refnumber                                                            AS topic_ref,

    /* ── Theme / Sub-Theme ──────────────────────────────────────── */
    g2.primaryname                                                          AS theme_name,
    CAST(SUBSTR(cf_g2ar.customfieldvalue, 1, 4000) AS VARCHAR2(4000))      AS theme_name_ar,
    g2.refnumber                                                            AS theme_ref,

    /* ── Dataset (only populated when g3 is a Dataset node) ─────── */
    CASE WHEN g3."type" = 9 THEN g3.primaryname END                         AS dataset_name,
    CASE WHEN g3."type" = 9
         THEN CAST(SUBSTR(cf_g3_120.customfieldvalue, 1, 4000) AS VARCHAR2(4000))
    END                                                                     AS dataset_name_ar,

    /* ── Term identity ───────────────────────────────────────────── */
    COALESCE(g4.id,        g3.id)                                           AS id,
    COALESCE(g4.id,        g3.id)                                           AS "C#",
    COALESCE(g4.refnumber, g3.refnumber)                                    AS term_ref,

    /* ── Term names ──────────────────────────────────────────────── */
    COALESCE(g4.primaryname, g3.primaryname)                                AS term_name_en,
    CAST(COALESCE(
        SUBSTR(cf_g4_120.customfieldvalue, 1, 4000),
        CASE WHEN g3."type" != 9
             THEN SUBSTR(cf_g3_120.customfieldvalue, 1, 4000) END
    ) AS VARCHAR2(4000))                                                    AS term_name_ar,

    /* ── Term definitions ────────────────────────────────────────── */
    CAST(COALESCE(
        SUBSTR(g4.description, 1, 4000),
        SUBSTR(g3.description, 1, 4000)
    ) AS VARCHAR2(4000))                                                    AS term_definition_en,
    CAST(COALESCE(
        SUBSTR(cf_g4_121.customfieldvalue, 1, 4000),
        CASE WHEN g3."type" != 9
             THEN SUBSTR(cf_g3_121.customfieldvalue, 1, 4000) END
    ) AS VARCHAR2(4000))                                                    AS term_definition_ar,

    /* ── Term source ─────────────────────────────────────────────── */
    CAST(COALESCE(
        SUBSTR(cf_g4_146.customfieldvalue, 1, 4000),
        CASE WHEN g3."type" != 9
             THEN SUBSTR(cf_g3_146.customfieldvalue, 1, 4000) END
    ) AS VARCHAR2(4000))                                                    AS term_source,

    /* ── Parent ref ──────────────────────────────────────────────── */
    CASE WHEN g3."type" = 9 THEN g3.refnumber
         ELSE g2.refnumber
    END                                                                     AS parent_term_ref,

    /* ── Axon Viewing (maps ispublic=1 → 'Public') ───────────────── */
    CASE WHEN COALESCE(g4.ispublic, g3.ispublic) = 1
         THEN 'Public' ELSE 'Private' END                                   AS "Axon Viewing",

    /* ── Term status (from status lookup) ───────────────────────── */
    st.primaryname                                                          AS term_status,
    COALESCE(g4.status, g3.status)                                         AS term_status_id,

    /* ── Security classification ─────────────────────────────────── */
    sc.primaryname                                                          AS security_classification,
    COALESCE(g4.securityclassification, g3.securityclassification)         AS security_classification_id

FROM glossary          g0
JOIN glossary          g1  ON g1.parent_id = g0.id
JOIN glossary          g2  ON g2.parent_id = g1.id
JOIN glossary          g3  ON g3.parent_id = g2.id
LEFT JOIN glossary     g4  ON g4.parent_id = g3.id

LEFT JOIN status                  st ON st.id = COALESCE(g4.status, g3.status)
LEFT JOIN security_classification sc ON sc.id = COALESCE(g4.securityclassification, g3.securityclassification)

LEFT JOIN custom_field cf_g0ar
     ON cf_g0ar.facetobjectid = g0.id AND cf_g0ar.customfieldmetadataid = 120
LEFT JOIN custom_field cf_g1ar
     ON cf_g1ar.facetobjectid = g1.id AND cf_g1ar.customfieldmetadataid = 120
LEFT JOIN custom_field cf_g2ar
     ON cf_g2ar.facetobjectid = g2.id AND cf_g2ar.customfieldmetadataid = 120
LEFT JOIN custom_field cf_g3_120
     ON cf_g3_120.facetobjectid = g3.id AND cf_g3_120.customfieldmetadataid = 120
LEFT JOIN custom_field cf_g3_121
     ON cf_g3_121.facetobjectid = g3.id AND cf_g3_121.customfieldmetadataid = 121
LEFT JOIN custom_field cf_g3_146
     ON cf_g3_146.facetobjectid = g3.id AND cf_g3_146.customfieldmetadataid = 146
LEFT JOIN custom_field cf_g4_120
     ON cf_g4_120.facetobjectid = g4.id AND cf_g4_120.customfieldmetadataid = 120
LEFT JOIN custom_field cf_g4_121
     ON cf_g4_121.facetobjectid = g4.id AND cf_g4_121.customfieldmetadataid = 121
LEFT JOIN custom_field cf_g4_146
     ON cf_g4_146.facetobjectid = g4.id AND cf_g4_146.customfieldmetadataid = 146

WHERE g0.parent_id IS NULL
  AND g1."type" = 1
  AND g2."type" IN (2, 5)
  AND (
        (g3."type" NOT IN (1, 2, 5, 9, 10) AND g4.id IS NULL)
        OR
        (g3."type" = 9 AND g4.id IS NOT NULL AND g4."type" NOT IN (1, 2, 5, 9, 10))
      );
/

-- ── Indexes on the MV for fast filtering used in the functions ────────────────
CREATE INDEX SC_QAWS.idx_bg_topic_theme
    ON SC_QAWS.BUSINESS_GLOSSARY (topic_name, theme_name);

CREATE INDEX SC_QAWS.idx_bg_viewing
    ON SC_QAWS.BUSINESS_GLOSSARY ("Axon Viewing", glossary_name);

CREATE INDEX SC_QAWS.idx_bg_status
    ON SC_QAWS.BUSINESS_GLOSSARY (term_status);
/

-- ── Manual refresh command (run anytime data changes) ────────────────────────
-- EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY','C');
