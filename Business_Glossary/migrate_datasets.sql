-- ============================================================
-- migrate_datasets.sql
-- One-time migration: promote the 5 terms that have a dataset
-- name stored in custom_field 147 into proper dataset nodes
-- (type=9) in the glossary hierarchy.
--
-- Before:  Theme (g2) → Term (g3, CF147='Dataset Name')
-- After:   Theme (g2) → Dataset node (g3, type=9) → Term (g4)
--
-- Run once as SC_QAWS (or a DBA).
-- ============================================================

DECLARE
    CURSOR c IS
        SELECT g3.id          AS term_id,
               g3.parent_id   AS theme_id,
               g2.securityclassification AS sec_class,
               CAST(SUBSTR(cf.customfieldvalue, 1, 4000) AS VARCHAR2(4000)) AS ds_name_en
          FROM sc_qaws.glossary     g2
          JOIN sc_qaws.glossary     g3  ON g3.parent_id = g2.id
          JOIN sc_qaws.custom_field cf  ON cf.facetobjectid         = g3.id
                                       AND cf.customfieldmetadataid = 147
         WHERE g2."type"           IN (2, 5)
           AND g3."type"     NOT IN (1, 2, 5, 9, 10)
           AND cf.customfieldvalue IS NOT NULL;

    l_ds_id NUMBER;
BEGIN
    FOR r IN c LOOP
        -- find existing dataset node with same name under the same theme
        BEGIN
            SELECT id INTO l_ds_id
              FROM sc_qaws.glossary
             WHERE parent_id   = r.theme_id
               AND "type"      = 9
               AND primaryname = r.ds_name_en
               AND ROWNUM      = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                -- create a new dataset node (type=9) under the theme
                SELECT NVL(MAX(id), 0) + 1 INTO l_ds_id FROM sc_qaws.glossary;
                INSERT INTO sc_qaws.glossary (
                    id, primaryname, refnumber, parent_id,
                    "type", status, ispublic,
                    securityclassification,
                    createdatetime, lastupdatedatetime
                ) VALUES (
                    l_ds_id,
                    r.ds_name_en,
                    'DS-' || TO_CHAR(l_ds_id),
                    r.theme_id,
                    9,        -- Dataset
                    1,        -- Active
                    1,        -- Public
                    r.sec_class,
                    SYSDATE,
                    SYSDATE
                );
        END;

        -- reparent the term under the dataset node
        UPDATE sc_qaws.glossary
           SET parent_id          = l_ds_id,
               lastupdatedatetime = SYSDATE
         WHERE id = r.term_id;

        -- remove CF 147 from the term (now stored in the tree)
        DELETE FROM sc_qaws.custom_field
         WHERE facetobjectid         = r.term_id
           AND customfieldmetadataid = 147;

        DBMS_OUTPUT.PUT_LINE(
            'Migrated term id=' || r.term_id ||
            ' under dataset node id=' || l_ds_id ||
            ' (' || r.ds_name_en || ')'
        );
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Migration complete.');
END;
/

-- Refresh the materialized view so changes appear immediately
EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');
