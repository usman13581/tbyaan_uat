CREATE OR REPLACE FUNCTION SC_QAWS.F_BUSINESS_GLOSSARY_TREE
    RETURN CLOB
IS
    l_html        CLOB;
    l_left        CLOB;
    l_topic_i     PLS_INTEGER := 0;
    l_theme_i     PLS_INTEGER := 0;
    l_first_th    BOOLEAN     := TRUE;
    l_has_rows    BOOLEAN     := FALSE;
    l_has_ds      BOOLEAN     := FALSE;
    l_term_count  PLS_INTEGER := 0;

    -- Distinct topics ordered alphabetically (OTHERS last)
    CURSOR c_topics IS
        SELECT DISTINCT
               topic_name,      topic_name_ar
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
         ORDER BY
               CASE WHEN topic_name IS NULL                  THEN 'ZZZZ'
                    WHEN UPPER(TRIM(topic_name)) = 'OTHERS'  THEN 'ZZZZ'
                    ELSE UPPER(TRIM(topic_name))
               END NULLS LAST;

    -- Themes within a topic (GENERIC last)
    CURSOR c_themes (p_topic IN VARCHAR2) IS
        SELECT DISTINCT
               theme_name,      theme_name_ar
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
           AND (   (p_topic IS NULL     AND topic_name IS NULL)
                OR (p_topic IS NOT NULL AND topic_name = p_topic)
               )
         ORDER BY
               CASE WHEN theme_name IS NULL                   THEN 'ZZZZ'
                    WHEN UPPER(TRIM(theme_name)) = 'GENERIC'  THEN 'ZZZZ'
                    ELSE UPPER(TRIM(theme_name))
               END NULLS LAST;

    -- Datasets within a topic (all themes combined, sorted by name)
    CURSOR c_datasets (p_topic IN VARCHAR2) IS
        SELECT DISTINCT
               theme_name,      dataset_name,      dataset_name_ar
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
           AND (   (p_topic IS NULL     AND topic_name IS NULL)
                OR (p_topic IS NOT NULL AND topic_name = p_topic)
               )
           AND dataset_name IS NOT NULL
         ORDER BY dataset_name;

    PROCEDURE al (p IN VARCHAR2) IS
    BEGIN
        IF l_left IS NULL THEN DBMS_LOB.CREATETEMPORARY(l_left, TRUE); END IF;
        DBMS_LOB.APPEND(l_left, TO_CLOB(p));
    END al;

BEGIN
    FOR rt IN c_topics LOOP
        l_has_rows := TRUE;
        l_topic_i  := l_topic_i + 1;

        /* ── Count terms for this topic ─────────────────────── */
        SELECT COUNT(*) INTO l_term_count
          FROM sc_qaws.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name  != 'National Standards for Statistical Data (NSSD)'
           AND (   (rt.topic_name IS NULL     AND topic_name IS NULL)
                OR (rt.topic_name IS NOT NULL AND topic_name = rt.topic_name)
               );

        /* ── Topic header ───────────────────────────────────── */
        al(
               '<div class="gls-topic-item">'
            ||   '<button type="button" class="gls-topic-btn"'
            ||     ' data-target="tlist-' || TO_CHAR(l_topic_i) || '">'
            ||     '<span class="gls-topic-arrow">&#8250;</span>'
            ||     '<div class="gls-topic-titles">'
            ||       '<span class="gls-topic-en">'
            ||         apex_escape.html(NVL(rt.topic_name, 'No Topic'))
            ||       '</span>'
            ||       CASE WHEN rt.topic_name_ar IS NOT NULL THEN
                               '<span class="gls-topic-ar" dir="rtl">'
                            || apex_escape.html(rt.topic_name_ar) || '</span>'
                      ELSE '' END
            ||     '</div>'
            ||     '<span class="gls-topic-count">(' || TO_CHAR(l_term_count) || ')</span>'
            ||   '</button>'
            ||   '<div class="gls-theme-list" id="tlist-' || TO_CHAR(l_topic_i) || '">'
        );

        /* ── Themes first ───────────────────────────────────── */
        FOR rth IN c_themes(rt.topic_name) LOOP
            l_theme_i := l_theme_i + 1;
            al(
                   '<div class="gls-theme-item">'
                || '<button type="button"'
                ||   ' class="gls-theme-btn'
                ||     CASE WHEN l_first_th THEN ' is-active' ELSE '' END || '"'
                ||   ' data-theme-id="' || TO_CHAR(l_theme_i) || '"'
                ||   ' data-topic="'    || apex_escape.html_attribute(rt.topic_name)  || '"'
                ||   ' data-theme="'    || apex_escape.html_attribute(rth.theme_name) || '"'
                ||   ' data-dataset="">'
                ||   '<span class="gls-theme-en">'
                ||     apex_escape.html(NVL(rth.theme_name, 'No Theme'))
                ||   '</span>'
                ||   CASE WHEN rth.theme_name_ar IS NOT NULL THEN
                               '<span class="gls-theme-ar" dir="rtl">'
                            || apex_escape.html(rth.theme_name_ar) || '</span>'
                      ELSE '' END
                || '</button>'
                || '</div>'
            );
            l_first_th := FALSE;
        END LOOP;

        /* ── Datasets at end ────────────────────────────────── */
        l_has_ds := FALSE;
        FOR rds IN c_datasets(rt.topic_name) LOOP
            IF NOT l_has_ds THEN
                al('<div class="gls-dataset-list">');
                l_has_ds := TRUE;
            END IF;
            al(
                   '<div class="gls-dataset-item">'
                || '<button type="button" class="gls-dataset-btn"'
                ||   ' data-topic="'   || apex_escape.html_attribute(rt.topic_name)    || '"'
                ||   ' data-theme="'   || apex_escape.html_attribute(rds.theme_name)   || '"'
                ||   ' data-dataset="' || apex_escape.html_attribute(rds.dataset_name) || '">'
                ||   '<span class="gls-ds-arrow">&#8250;</span>'
                ||   '<span class="gls-dataset-en">'
                ||     apex_escape.html(rds.dataset_name)
                ||   '</span>'
                ||   CASE WHEN rds.dataset_name_ar IS NOT NULL THEN
                               '<span class="gls-dataset-ar" dir="rtl">'
                            || apex_escape.html(rds.dataset_name_ar) || '</span>'
                      ELSE '' END
                || '</button>'
                || '<div class="gls-term-list"'
                ||   ' data-topic="'   || apex_escape.html_attribute(rt.topic_name)    || '"'
                ||   ' data-theme="'   || apex_escape.html_attribute(rds.theme_name)   || '"'
                ||   ' data-dataset="' || apex_escape.html_attribute(rds.dataset_name) || '">'
                || '</div>'
                || '</div>'
            );
        END LOOP;
        IF l_has_ds THEN al('</div>'); END IF;  /* gls-dataset-list */

        /* ── Close theme-list + topic-item ──────────────────── */
        al('</div></div>');
    END LOOP;

    /* ── Assemble final HTML ────────────────────────────────── */
    DBMS_LOB.CREATETEMPORARY(l_html, TRUE);

    IF l_has_rows THEN
        DBMS_LOB.APPEND(l_html, TO_CLOB(
               '<div class="gls-tree-wrap">'
            ||   '<div class="gls-page-title">'
            ||     '<div class="gls-title-main">Business Glossary</div>'
            ||     '<div class="gls-title-main-ar" dir="rtl">&#1575;&#1604;&#1605;&#1587;&#1585;&#1583; &#1575;&#1604;&#1578;&#1580;&#1575;&#1585;&#1610;</div>'
            ||   '</div>'
            ||   '<div class="gls-search-bar">'
            ||     '<input type="text" id="gls-search-input" class="gls-search-input"'
            ||       ' placeholder="Search by term name, definition or code..." />'
            ||     '<button type="button" id="gls-search-btn" class="gls-search-btn">&#128269; Search</button>'
            ||     '<button type="button" id="gls-search-clear" class="gls-search-clear-btn" style="display:none">&#10005; Clear</button>'
            ||     '<button type="button" id="gls-hdr-edit" class="gls-search-btn" disabled>&#9998; Edit</button>'
            ||     '<button type="button" id="gls-hdr-submit" class="gls-search-btn gls-btn-submit" style="display:none" disabled>&#10003; Submit Changes</button>'
            ||     CASE WHEN UPPER(apex_application.g_user) IN ('SAALI','SMALMHEIRI','RMOSMAN')
                       THEN '<button type="button" id="gls-hdr-save-admin" class="gls-search-btn gls-btn-admin" style="display:none" disabled>&#128274; Save as Admin</button>'
                            || '<span id="gls-is-admin" style="display:none">Y</span>'
                       ELSE '' END
            ||     '<button type="button" id="gls-hdr-new-term" class="gls-search-btn">&#43; New Term</button>'
            ||   '</div>'
            ||   '<div class="gls-body">'
            ||     '<div class="gls-left-panel">'
            ||       '<div class="gls-nav-tree">'
        ));
        DBMS_LOB.APPEND(l_html, l_left);
        DBMS_LOB.APPEND(l_html, TO_CLOB(
                   '</div>'   /* .gls-nav-tree   */
            ||   '</div>'     /* .gls-left-panel */
            ||   '<div class="gls-right-panel">'
            ||     '<div id="gls-right-content" class="gls-right-content">'
            ||       '<div class="gls-placeholder">'
            ||         '<div class="gls-placeholder-icon">&#8594;</div>'
            ||         '<div class="gls-placeholder-text">Select a theme from the left panel</div>'
            ||       '</div>'
            ||     '</div>'
            ||   '</div>'     /* .gls-right-panel */
            ||   '</div>'     /* .gls-body        */
            || '</div>'       /* .gls-tree-wrap   */
        ));
    ELSE
        DBMS_LOB.APPEND(l_html, TO_CLOB(
               '<div class="gls-tree-wrap">'
            ||   '<div class="gls-empty"><div class="gls-empty-title">No glossary records found.</div></div>'
            || '</div>'
        ));
    END IF;

    RETURN l_html;

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END F_BUSINESS_GLOSSARY_TREE;
/
