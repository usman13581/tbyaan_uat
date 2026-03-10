/* ============================================================
   BUSINESS GLOSSARY TREE  –  Lazy Load + Fixed Card Layout
   Backend returns JSON, JS fills fixed HTML template
   ============================================================ */

var GlossaryApp = (function () {
    'use strict';

    var termCache = {};
    var curTopic  = '';
    var curTheme  = '';
    var curSeq    = 1;
    var curTotal  = 1;

    /* ── Fixed card HTML — rendered once, values injected ── */
    var CARD_HTML =
        '<div class="gls-term-card">' +
            '<div class="gls-term-head">' +
                '<div class="gls-names-grid">' +
                    '<div class="gls-name-block">' +
                        '<label class="gls-label">Term Name (EN)</label>' +
                        '<input id="gls-name-en" type="text" class="gls-input" name="f02">' +
                    '</div>' +
                    '<div class="gls-name-block">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1575;&#1604;&#1605;&#1589;&#1591;&#1604;&#1581;</label>' +
                        '<input id="gls-name-ar" type="text" class="gls-input gls-rtl" name="f03" dir="rtl">' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="gls-term-body">' +
                '<div class="gls-two-col">' +
                    '<div class="gls-field-group"><label class="gls-label">Code</label><input id="gls-code" type="text" class="gls-input" name="f04"></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Term Ref</label><input id="gls-termref" type="text" class="gls-input" name="f05"></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Parent Ref</label><input id="gls-parentref" type="text" class="gls-input" name="f06"></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Source</label><input id="gls-source" type="text" class="gls-input" name="f11"></div>' +
                '</div>' +
                '<div class="gls-two-col">' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label">Dataset (EN)</label>' +
                        '<input id="gls-dataset-en" type="text" class="gls-input" name="f07">' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                        '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl" name="f08" dir="rtl">' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label">Definition (EN)</label>' +
                        '<textarea id="gls-def-en" class="gls-textarea" name="f09"></textarea>' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1604;&#1578;&#1593;&#1585;&#1610;&#1601;</label>' +
                        '<textarea id="gls-def-ar" class="gls-textarea gls-rtl" name="f10" dir="rtl"></textarea>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="gls-slider-nav">' +
            '<button type="button" class="gls-nav-btn gls-prev">&#8592; Previous</button>' +
            '<div class="gls-slider-count">' +
                '<span class="gls-current">1</span>' +
                '<span class="gls-divider"> / </span>' +
                '<span class="gls-total">1</span>' +
            '</div>' +
            '<button type="button" class="gls-nav-btn gls-next">Next &#8594;</button>' +
            '<button type="button" class="gls-nav-btn gls-new-term">&#43; New Term</button>' +
        '</div>';

    /* ── Inject JSON data into fixed card ─────────────────── */
    function fillCard(container, d) {
        var set = function(id, val) {
            var el = container.querySelector('#' + id);
            if (!el) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val || '';
            else el.textContent = val || '—';
        };

        set('gls-name-en',    d.name_en);
        set('gls-name-ar',    d.name_ar);
        set('gls-code',       d.code);
        set('gls-termref',    d.term_ref);
        set('gls-parentref',  d.parent_ref);
        set('gls-dataset-en', d.dataset_en);
        set('gls-dataset-ar', d.dataset_ar);
        set('gls-def-en',     d.def_en);
        set('gls-def-ar',     d.def_ar);
        set('gls-source',     d.source);

        /* counter + nav state */
        var elC = container.querySelector('.gls-current');
        var elT = container.querySelector('.gls-total');
        if (elC) elC.textContent = d.seq;
        if (elT) elT.textContent = d.total;

        var prev = container.querySelector('.gls-prev');
        var next = container.querySelector('.gls-next');
        if (prev) prev.disabled = (d.seq <= 1);
        if (next) next.disabled = (d.seq >= d.total);

        curSeq   = d.seq;
        curTotal = d.total;
    }

    /* ── Load term by seq ──────────────────────────────────── */
    function loadTerm(topic, theme, seq) {
        var container = document.getElementById('gls-right-content');
        if (!container) return;

        var cacheKey = topic + '||' + theme + '||' + seq;
        curTopic = topic;
        curTheme = theme;
        curSeq   = seq;

        /* show spinner only on first load of this theme */
        if (!termCache[topic + '||' + theme + '||1']) {
            container.innerHTML =
                '<div class="gls-loading">' +
                    '<div class="gls-spinner"></div>' +
                    '<div class="gls-loading-text">Loading...</div>' +
                '</div>';
        }

        /* from cache */
        if (termCache[cacheKey]) {
            container.innerHTML = '<div class="gls-theme-panel is-active">' + CARD_HTML + '</div>';
            fillCard(container, termCache[cacheKey]);
            return;
        }

        /* Ajax */
        apex.server.process(
            'GET_THEME_TERMS',
            { x01: topic, x02: theme, x03: String(seq) },
            {
                dataType: 'text',
                success: function (raw) {
                    var d;
                    try { d = JSON.parse(raw); } catch(e) {
                        container.innerHTML =
                            '<div class="gls-placeholder">' +
                            '<div class="gls-placeholder-text" style="color:#ef4444">Parse error: ' + raw.substring(0,200) + '</div></div>';
                        return;
                    }
                    termCache[cacheKey] = d;
                    container.innerHTML = '<div class="gls-theme-panel is-active">' + CARD_HTML + '</div>';
                    fillCard(container, d);
                },
                error: function (xhr) {
                    container.innerHTML =
                        '<div class="gls-placeholder">' +
                        '<div class="gls-placeholder-text" style="color:#ef4444">' +
                        (xhr.responseText || 'Failed to load') + '</div></div>';
                }
            }
        );
    }

    /* ── Blank new term card ──────────────────────────────── */
    var NEW_CARD_HTML =
        '<div class="gls-theme-panel is-active gls-new-mode">' +
            '<div class="gls-term-card">' +
                '<div class="gls-term-head">' +
                    '<div class="gls-names-grid">' +
                        '<div class="gls-name-block">' +
                            '<label class="gls-label">Term Name (EN)</label>' +
                            '<input id="gls-name-en" type="text" class="gls-input" name="f02" placeholder="Enter term name...">' +
                        '</div>' +
                        '<div class="gls-name-block">' +
                            '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1575;&#1604;&#1605;&#1589;&#1591;&#1604;&#1581;</label>' +
                            '<input id="gls-name-ar" type="text" class="gls-input gls-rtl" name="f03" dir="rtl" placeholder="&#1575;&#1603;&#1578;&#1576; &#1575;&#1587;&#1605; &#1575;&#1604;&#1605;&#1589;&#1591;&#1604;&#1581;...">' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="gls-term-body">' +
                    '<div class="gls-two-col">' +
                        '<div class="gls-field-group"><label class="gls-label">Code</label><input id="gls-code" type="text" class="gls-input" name="f04"></div>' +
                        '<div class="gls-field-group"><label class="gls-label">Term Ref</label><input id="gls-termref" type="text" class="gls-input" name="f05"></div>' +
                        '<div class="gls-field-group"><label class="gls-label">Parent Ref</label><input id="gls-parentref" type="text" class="gls-input" name="f06"></div>' +
                        '<div class="gls-field-group"><label class="gls-label">Source</label><input id="gls-source" type="text" class="gls-input" name="f11"></div>' +
                    '</div>' +
                    '<div class="gls-two-col" style="margin-top:12px">' +
                        '<div class="gls-field-group">' +
                            '<label class="gls-label">Dataset (EN)</label>' +
                            '<input id="gls-dataset-en" type="text" class="gls-input" name="f07">' +
                        '</div>' +
                        '<div class="gls-field-group">' +
                            '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                            '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl" name="f08" dir="rtl">' +
                        '</div>' +
                        '<div class="gls-field-group">' +
                            '<label class="gls-label">Definition (EN)</label>' +
                            '<textarea id="gls-def-en" class="gls-textarea" name="f09"></textarea>' +
                        '</div>' +
                        '<div class="gls-field-group">' +
                            '<label class="gls-label gls-lbl-ar">&#1575;&#1604;&#1578;&#1593;&#1585;&#1610;&#1601;</label>' +
                            '<textarea id="gls-def-ar" class="gls-textarea gls-rtl" name="f10" dir="rtl"></textarea>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="gls-slider-nav">' +
                '<button type="button" class="gls-nav-btn gls-cancel-new">&#8592; Cancel</button>' +
                '<div class="gls-new-term-label">New Term &mdash; ' +
                    '<span class="gls-new-topic"></span> &rsaquo; <span class="gls-new-theme"></span>' +
                '</div>' +
                '<button type="button" class="gls-nav-btn gls-save-new gls-btn-save">Save Term</button>' +
            '</div>' +
        '</div>';

    /* ── Event delegation on right panel ──────────────────── */
    function bindRightPanel() {
        var container = document.getElementById('gls-right-content');
        if (!container || container.dataset.navBound === 'Y') return;
        container.dataset.navBound = 'Y';

        container.addEventListener('click', function (e) {
            var t = e.target;

            if (t.classList.contains('gls-prev') && !t.disabled && curSeq > 1) {
                loadTerm(curTopic, curTheme, curSeq - 1);
                return;
            }
            if (t.classList.contains('gls-next') && !t.disabled && curSeq < curTotal) {
                loadTerm(curTopic, curTheme, curSeq + 1);
                return;
            }

            /* open blank new term card */
            if (t.classList.contains('gls-new-term')) {
                container.innerHTML = NEW_CARD_HTML;
                var nt = container.querySelector('.gls-new-topic');
                var nth = container.querySelector('.gls-new-theme');
                if (nt)  nt.textContent  = curTopic;
                if (nth) nth.textContent = curTheme;
                return;
            }

            /* cancel — go back to current term */
            if (t.classList.contains('gls-cancel-new')) {
                loadTerm(curTopic, curTheme, curSeq);
                return;
            }
        });
    }

    /* ── Topics ────────────────────────────────────────────── */
    function bindTopics(root) {
        root.querySelectorAll('.gls-topic-btn').forEach(function (btn) {
            if (btn.dataset.bound === 'Y') return;
            btn.dataset.bound = 'Y';
            var list = root.querySelector('#' + btn.getAttribute('data-target'));
            btn.addEventListener('click', function () {
                var isOpen = btn.classList.contains('is-open');
                root.querySelectorAll('.gls-topic-btn.is-open').forEach(function (ob) {
                    ob.classList.remove('is-open');
                    var ol = root.querySelector('#' + ob.getAttribute('data-target'));
                    if (ol) ol.classList.remove('is-open');
                });
                if (!isOpen && list) {
                    btn.classList.add('is-open');
                    list.classList.add('is-open');
                }
            });
        });
    }

    /* ── Themes ────────────────────────────────────────────── */
    function bindThemes(root) {
        root.querySelectorAll('.gls-theme-btn').forEach(function (btn) {
            if (btn.dataset.bound === 'Y') return;
            btn.dataset.bound = 'Y';
            btn.addEventListener('click', function () {
                root.querySelectorAll('.gls-theme-btn').forEach(function (b) { b.classList.remove('is-active'); });
                btn.classList.add('is-active');
                loadTerm(btn.getAttribute('data-topic'), btn.getAttribute('data-theme'), 1);
            });
        });
    }

    /* ── Open first topic ──────────────────────────────────── */
    function openFirstTopic(root) {
        var btn  = root.querySelector('.gls-topic-btn');
        var list = btn ? root.querySelector('#' + btn.getAttribute('data-target')) : null;
        if (btn)  btn.classList.add('is-open');
        if (list) list.classList.add('is-open');
    }

    /* ── Init ──────────────────────────────────────────────── */
    function init(context) {
        var root = context || document;
        if (!root.querySelector('.gls-tree-wrap')) return;
        bindTopics(root);
        bindThemes(root);
        bindRightPanel();
        openFirstTopic(root);
    }

    return {
        init      : init,
        clearCache: function () { termCache = {}; }
    };

}());
