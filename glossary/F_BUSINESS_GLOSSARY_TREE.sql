CREATE OR REPLACE FUNCTION SC_EDP.F_BUSINESS_GLOSSARY_TREE
    RETURN CLOB
IS
    l_html      CLOB;
    l_left      CLOB;
    l_gname     VARCHAR2(4000);
    l_gname_ar  VARCHAR2(4000);
    l_prev_top  VARCHAR2(4000);
    l_prev_thm  VARCHAR2(4000);
    l_topic_i   PLS_INTEGER := 0;
    l_theme_i   PLS_INTEGER := 0;
    l_first_th  BOOLEAN     := TRUE;
    l_has_rows  BOOLEAN     := FALSE;

    CURSOR c IS
        SELECT DISTINCT
               glossary_name,     glossary_name_ar,
               topic_name,        topic_name_ar,
               theme_name,        theme_name_ar
          FROM sc_edp.business_glossary
         WHERE "Axon Viewing" = 'Public'
           AND glossary_name != 'National Standards for Statistical Data (NSSD)'
         ORDER BY glossary_name, topic_name, theme_name;

    r c%ROWTYPE;

    PROCEDURE al (p IN VARCHAR2) IS
    BEGIN
        IF l_left IS NULL THEN DBMS_LOB.CREATETEMPORARY(l_left, TRUE); END IF;
        DBMS_LOB.APPEND(l_left, TO_CLOB(p));
    END al;

BEGIN
    OPEN c;
    LOOP
        FETCH c INTO r;
        EXIT WHEN c%NOTFOUND;
        l_has_rows := TRUE;

        IF l_gname IS NULL THEN
            l_gname    := r.glossary_name;
            l_gname_ar := r.glossary_name_ar;
        END IF;

        /* NEW TOPIC */
        IF NVL(l_prev_top,'#NULL#') <> NVL(r.topic_name,'#NULL#') THEN
            IF l_prev_top IS NOT NULL THEN
                al('</div></div>');  /* close theme-list + topic-item */
            END IF;

            l_topic_i  := l_topic_i + 1;
            l_prev_top := r.topic_name;
            l_prev_thm := NULL;

            al(
                   '<div class="gls-topic-item">'
                ||   '<button type="button" class="gls-topic-btn"'
                ||     ' data-target="tlist-' || TO_CHAR(l_topic_i) || '">'
                ||     '<span class="gls-topic-arrow">&#8250;</span>'
                ||     '<div class="gls-topic-titles">'
                ||       '<span class="gls-topic-en">'
                ||         apex_escape.html(NVL(r.topic_name,'No Topic'))
                ||       '</span>'
                ||       CASE WHEN r.topic_name_ar IS NOT NULL THEN
                               '<span class="gls-topic-ar" dir="rtl">'
                            || apex_escape.html(r.topic_name_ar) || '</span>'
                          ELSE '' END
                ||     '</div>'
                ||   '</button>'
                ||   '<div class="gls-theme-list" id="tlist-' || TO_CHAR(l_topic_i) || '">'
            );
        END IF;

        /* NEW THEME */
        IF NVL(l_prev_thm,'#NULL#') <> NVL(r.theme_name,'#NULL#') THEN
            l_theme_i  := l_theme_i + 1;
            l_prev_thm := r.theme_name;

            al(
                   '<button type="button"'
                ||   ' class="gls-theme-btn' || CASE WHEN l_first_th THEN ' is-active' ELSE '' END || '"'
                ||   ' data-theme-id="' || TO_CHAR(l_theme_i) || '"'
                ||   ' data-topic="' || apex_escape.html_attribute(r.topic_name) || '"'
                ||   ' data-theme="' || apex_escape.html_attribute(r.theme_name) || '">'
                ||   '<span class="gls-theme-en">' || apex_escape.html(NVL(r.theme_name,'No Theme')) || '</span>'
                ||   CASE WHEN r.theme_name_ar IS NOT NULL THEN
                           '<span class="gls-theme-ar" dir="rtl">'
                        || apex_escape.html(r.theme_name_ar) || '</span>'
                     ELSE '' END
                || '</button>'
            );

            l_first_th := FALSE;
        END IF;

    END LOOP;
    CLOSE c;

    IF l_has_rows THEN
        al('</div></div>');  /* close last theme-list + topic-item */
    END IF;

    /* assemble */
    DBMS_LOB.CREATETEMPORARY(l_html, TRUE);

    IF l_has_rows THEN
        DBMS_LOB.APPEND(l_html, TO_CLOB(
               '<div class="gls-tree-wrap">'
            ||   '<div class="gls-header">'
            ||     '<div class="gls-title-main">'
            ||       apex_escape.html(NVL(l_gname,'Business Glossary'))
            ||     '</div>'
            ||     CASE WHEN l_gname_ar IS NOT NULL THEN
                         '<div class="gls-title-main-ar" dir="rtl">'
                      || apex_escape.html(l_gname_ar) || '</div>'
                   ELSE '' END
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
        IF c%ISOPEN THEN CLOSE c; END IF;
        RAISE;
END F_BUSINESS_GLOSSARY_TREE;
/
