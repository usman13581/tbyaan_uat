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
    var isDirty   = false;

    /* ── Fixed card HTML — rendered once, values injected ── */
    var CARD_HTML =
        '<div class="gls-term-card">' +
            '<div class="gls-term-head">' +
                '<div class="gls-names-grid">' +
                    '<div class="gls-name-block">' +
                        '<label class="gls-label">Term Name (EN)</label>' +
                        '<input id="gls-name-en" type="text" class="gls-input gls-user-field" name="f02" readonly>' +
                    '</div>' +
                    '<div class="gls-name-block">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1575;&#1604;&#1605;&#1589;&#1591;&#1604;&#1581;</label>' +
                        '<input id="gls-name-ar" type="text" class="gls-input gls-rtl gls-user-field" name="f03" dir="rtl" readonly>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="gls-term-body">' +
                '<div class="gls-two-col">' +
                    '<div class="gls-field-group"><label class="gls-label">Code</label><input id="gls-code" type="text" class="gls-input gls-readonly" name="f04" readonly></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Term Ref</label><input id="gls-termref" type="text" class="gls-input gls-readonly" name="f05" readonly></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Parent Ref</label><input id="gls-parentref" type="text" class="gls-input gls-user-field" name="f06" readonly></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Source</label><input id="gls-source" type="text" class="gls-input gls-user-field" name="f11" readonly></div>' +
                '</div>' +
                '<div class="gls-two-col">' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label">Dataset (EN)</label>' +
                        '<input id="gls-dataset-en" type="text" class="gls-input gls-user-field" name="f07" readonly>' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                        '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl gls-user-field" name="f08" dir="rtl" readonly>' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label">Definition (EN)</label>' +
                        '<textarea id="gls-def-en" class="gls-textarea gls-user-field" name="f09" readonly></textarea>' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1604;&#1578;&#1593;&#1585;&#1610;&#1601;</label>' +
                        '<textarea id="gls-def-ar" class="gls-textarea gls-rtl gls-user-field" name="f10" dir="rtl" readonly></textarea>' +
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

        /* reset to view mode on fresh term load */
        container.querySelectorAll('.gls-user-field').forEach(function (f) { f.readOnly = true; });
        var hdrEdit   = document.getElementById('gls-hdr-edit');
        var hdrSubmit = document.getElementById('gls-hdr-submit');
        if (hdrEdit)   { hdrEdit.style.display = '';       hdrEdit.disabled = false; }
        if (hdrSubmit) { hdrSubmit.style.display = 'none'; hdrSubmit.disabled = true; }
        isDirty = false;
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

    /* ── Load new term card (fetches code + parents async) ─── */
    function loadNewTermCard(container) {
        /* render shell immediately */
        container.innerHTML =
            '<div class="gls-theme-panel is-active gls-new-mode">' +
                '<div class="gls-term-card">' +
                    '<div class="gls-term-head">' +
                        '<div class="gls-names-grid">' +
                            '<div class="gls-name-block">' +
                                '<label class="gls-label">Term Name (EN) <span class="gls-req">*</span></label>' +
                                '<input id="gls-name-en" type="text" class="gls-input" placeholder="Enter term name...">' +
                            '</div>' +
                            '<div class="gls-name-block">' +
                                '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1575;&#1604;&#1605;&#1589;&#1591;&#1604;&#1581;</label>' +
                                '<input id="gls-name-ar" type="text" class="gls-input gls-rtl" dir="rtl">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="gls-term-body">' +
                        '<div class="gls-two-col">' +
                            '<div class="gls-field-group"><label class="gls-label">Code</label>' +
                                '<input id="gls-code" type="text" class="gls-input gls-readonly" readonly placeholder="Auto-generated..."></div>' +
                            '<div class="gls-field-group"><label class="gls-label">Term Ref</label>' +
                                '<input id="gls-termref" type="text" class="gls-input gls-readonly" readonly placeholder="Auto-generated..."></div>' +
                            '<div class="gls-field-group"><label class="gls-label">Parent Ref <span class="gls-req">*</span></label>' +
                                '<select id="gls-parentref" class="gls-input"><option value="">Loading...</option></select></div>' +
                            '<div class="gls-field-group"><label class="gls-label">Source</label>' +
                                '<input id="gls-source" type="text" class="gls-input"></div>' +
                        '</div>' +
                        '<div class="gls-two-col" style="margin-top:12px">' +
                            '<div class="gls-field-group"><label class="gls-label">Dataset (EN)</label>' +
                                '<input id="gls-dataset-en" type="text" class="gls-input"></div>' +
                            '<div class="gls-field-group"><label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                                '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl" dir="rtl"></div>' +
                            '<div class="gls-field-group"><label class="gls-label">Definition (EN) <span class="gls-req">*</span></label>' +
                                '<textarea id="gls-def-en" class="gls-textarea"></textarea></div>' +
                            '<div class="gls-field-group"><label class="gls-label gls-lbl-ar">&#1575;&#1604;&#1578;&#1593;&#1585;&#1610;&#1601;</label>' +
                                '<textarea id="gls-def-ar" class="gls-textarea gls-rtl" dir="rtl"></textarea></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="gls-slider-nav">' +
                    '<button type="button" class="gls-nav-btn gls-cancel-new">&#8592; Cancel</button>' +
                    '<div class="gls-new-term-label">New Term &mdash; ' +
                        '<span class="gls-new-topic"></span> &rsaquo; <span class="gls-new-theme"></span>' +
                    '</div>' +
                    '<button type="button" class="gls-nav-btn gls-submit-changes gls-btn-submit" disabled>&#10003; Submit for Approval</button>' +
                '</div>' +
            '</div>';

        /* hide edit/submit header buttons while in new-term mode */
        var hdrEdit   = document.getElementById('gls-hdr-edit');
        var hdrSubmit = document.getElementById('gls-hdr-submit');
        if (hdrEdit)   hdrEdit.style.display   = 'none';
        if (hdrSubmit) hdrSubmit.style.display = 'none';

        /* set topic / theme labels */
        var nt  = container.querySelector('.gls-new-topic');
        var nth = container.querySelector('.gls-new-theme');
        if (nt)  nt.textContent  = curTopic;
        if (nth) nth.textContent = curTheme;

        /* fetch next code */
        apex.server.process('GET_NEW_TERM_CODE', {}, {
            dataType: 'text',
            success: function (raw) {
                var d;
                try { d = JSON.parse(raw); } catch (e) { return; }
                var codeEl = container.querySelector('#gls-code');
                var refEl  = container.querySelector('#gls-termref');
                if (codeEl) codeEl.value = d.code;
                if (refEl)  refEl.value  = d.term_ref;
            }
        });

        /* fetch parent terms */
        apex.server.process('GET_PARENT_TERMS', {}, {
            dataType: 'text',
            success: function (raw) {
                var parents;
                try { parents = JSON.parse(raw); } catch (e) { return; }
                var sel = container.querySelector('#gls-parentref');
                if (!sel) return;
                sel.innerHTML = '<option value="">-- Select Parent --</option>';
                parents.forEach(function (p) {
                    var opt = document.createElement('option');
                    opt.value = p.ref;
                    opt.textContent = p.label;
                    /* pre-select if label contains current topic + theme */
                    if (curTopic && curTheme &&
                        p.label.indexOf(curTopic) !== -1 &&
                        p.label.indexOf(curTheme) !== -1) {
                        opt.selected = true;
                    }
                    sel.appendChild(opt);
                });
            }
        });
    }

    /* ── Collect card field values ─────────────────────────── */
    function collectCardData(container) {
        function val(id) {
            var el = container.querySelector('#' + id);
            return el ? el.value.trim() : '';
        }
        return {
            name_en:    val('gls-name-en'),
            name_ar:    val('gls-name-ar'),
            code:       val('gls-code'),
            term_ref:   val('gls-termref'),
            parent_ref: val('gls-parentref'),
            dataset_en: val('gls-dataset-en'),
            dataset_ar: val('gls-dataset-ar'),
            def_en:     val('gls-def-en'),
            def_ar:     val('gls-def-ar'),
            source:     val('gls-source')
        };
    }

    /* ── Validate card ─────────────────────────────────────── */
    function validateCard(data, isNew) {
        var errors = [];
        if (!data.name_en)    errors.push('Term Name (EN) is required.');
        if (!data.def_en)     errors.push('Definition (EN) is required.');
        if (isNew && !data.parent_ref) errors.push('Parent Ref is required.');
        return errors;
    }

    /* ── Save draft via Ajax ───────────────────────────────── */
    function saveDraft(container, isNew) {
        var data   = collectCardData(container);
        var errors = validateCard(data, isNew);

        /* remove previous error block */
        var prev = container.querySelector('.gls-val-errors');
        if (prev) prev.parentNode.removeChild(prev);

        if (errors.length) {
            var errDiv = document.createElement('div');
            errDiv.className = 'gls-val-errors';
            errDiv.innerHTML = errors.map(function (e) { return '&#8226; ' + e; }).join('<br>');
            var nav = container.querySelector('.gls-slider-nav');
            if (nav) nav.parentNode.insertBefore(errDiv, nav);
            return;
        }

        var submitBtn = container.querySelector('.gls-submit-changes');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
        var hdrEdit   = document.getElementById('gls-hdr-edit');
        var hdrSubmit = document.getElementById('gls-hdr-submit');
        if (hdrSubmit) { hdrSubmit.disabled = true; hdrSubmit.textContent = '\u2713 Saving...'; }

        var payload = {
            type:       isNew ? 'NEW' : 'UPDATE',
            term_id:    isNew ? null  : String(curSeq),
            code:       data.code,
            term_ref:   data.term_ref,
            parent_ref: data.parent_ref,
            name_en:    data.name_en,
            name_ar:    data.name_ar,
            dataset_en: data.dataset_en,
            dataset_ar: data.dataset_ar,
            def_en:     data.def_en,
            def_ar:     data.def_ar,
            source:     data.source,
            topic:      curTopic,
            theme:      curTheme
        };

        apex.server.process(
            'SAVE_DRAFT_TERM',
            { x01: JSON.stringify(payload) },
            {
                dataType: 'text',
                success: function (raw) {
                    var result;
                    try { result = JSON.parse(raw); } catch (e) { result = { status: 'error' }; }
                    if (result.status === 'ok') {
                        if (hdrSubmit) hdrSubmit.textContent = '\u2713 Saved';
                        container.innerHTML =
                            '<div class="gls-success-msg">' +
                                '<div class="gls-success-icon">&#10003;</div>' +
                                '<div class="gls-success-title">Submitted for Review</div>' +
                                '<div class="gls-success-text">' +
                                    'Your term has been saved with status <strong>Pending Review</strong> and sent to the Methodology Team.<br><br>' +
                                    'It will appear in the glossary once set to <strong>Active</strong>.<br>' +
                                    'You can check your request status on the home page.' +
                                '</div>' +
                            '</div>';
                    } else {
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '&#10003; Submit for Approval'; }
                        if (hdrSubmit) { hdrSubmit.disabled = false; hdrSubmit.textContent = '\u2713 Submit Changes'; }
                        var errDiv = document.createElement('div');
                        errDiv.className = 'gls-val-errors';
                        errDiv.textContent = result.message || 'Save failed. Please try again.';
                        var nav = container.querySelector('.gls-slider-nav');
                        if (nav) nav.parentNode.insertBefore(errDiv, nav);
                    }
                },
                error: function (xhr) {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '&#10003; Submit for Approval'; }
                    if (hdrSubmit) { hdrSubmit.disabled = false; hdrSubmit.textContent = '\u2713 Submit Changes'; }
                    if (hdrEdit)   { /* stays hidden — user is still in edit mode */ }
                    var errDiv = document.createElement('div');
                    errDiv.className = 'gls-val-errors';
                    errDiv.textContent = xhr.responseText || 'Network error. Please try again.';
                    var nav = container.querySelector('.gls-slider-nav');
                    if (nav) nav.parentNode.insertBefore(errDiv, nav);
                }
            }
        );
    }

    /* ── Event delegation on right panel ──────────────────── */
    function bindRightPanel() {
        var container = document.getElementById('gls-right-content');
        if (!container || container.dataset.navBound === 'Y') return;
        container.dataset.navBound = 'Y';

        /* enable Submit Changes button when any editable field changes */
        container.addEventListener('input', function (e) {
            var t = e.target;
            if ((t.classList.contains('gls-input') || t.classList.contains('gls-textarea')) &&
                !t.readOnly) {
                var submitBtn = container.querySelector('.gls-submit-changes');
                if (submitBtn) submitBtn.disabled = false;
                isDirty = true;
            }
        });
        container.addEventListener('change', function (e) {
            var t = e.target;
            if (t.tagName === 'SELECT' && t.id === 'gls-parentref') {
                var submitBtn = container.querySelector('.gls-submit-changes');
                if (submitBtn) submitBtn.disabled = false;
                isDirty = true;
            }
        });

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
                loadNewTermCard(container);
                return;
            }

            /* submit draft (new or edit) */
            if (t.classList.contains('gls-submit-changes') && !t.disabled) {
                var isNew = !!container.querySelector('.gls-new-mode');
                saveDraft(container, isNew);
                return;
            }

            /* cancel — go back to current term */
            if (t.classList.contains('gls-cancel-new')) {
                isDirty = false;
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

    /* ── Search helpers ────────────────────────────────────── */
    function escHtml(s) {
        return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function escAttr(s) {
        return (s || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    /* ── Search init ───────────────────────────────────────── */
    function initSearch() {
        var searchInput = document.getElementById('gls-search-input');
        var searchBtn   = document.getElementById('gls-search-btn');
        var clearBtn    = document.getElementById('gls-search-clear');

        if (!searchInput) return;

        function doSearch() {
            var txt = searchInput.value.trim();
            if (!txt) return;

            var container = document.getElementById('gls-right-content');
            if (!container) return;

            container.innerHTML =
                '<div class="gls-loading">' +
                    '<div class="gls-spinner"></div>' +
                    '<div class="gls-loading-text">Searching...</div>' +
                '</div>';

            if (clearBtn) clearBtn.style.display = '';

            apex.server.process(
                'SEARCH_GLOSSARY_TERMS',
                { x01: txt },
                {
                    dataType: 'text',
                    success: function (raw) {
                        var results;
                        try { results = JSON.parse(raw); } catch (e) {
                            container.innerHTML =
                                '<div class="gls-placeholder">' +
                                '<div class="gls-placeholder-text" style="color:#ef4444;text-align:left">' +
                                'Parse error &mdash; server returned:<br>' +
                                '<pre style="font-size:11px;white-space:pre-wrap;margin-top:8px">' +
                                escHtml(raw.substring(0, 600)) + '</pre></div></div>';
                            return;
                        }
                        showSearchResults(container, results);
                    },
                    error: function (xhr) {
                        container.innerHTML =
                            '<div class="gls-placeholder">' +
                            '<div class="gls-placeholder-text" style="color:#ef4444">' +
                            (xhr.responseText || 'Search failed') + '</div></div>';
                    }
                }
            );
        }

        function showSearchResults(container, results) {
            if (!results.length) {
                container.innerHTML =
                    '<div class="gls-placeholder">' +
                    '<div class="gls-placeholder-icon">&#128269;</div>' +
                    '<div class="gls-placeholder-text">No terms found.</div></div>';
                return;
            }

            var html = '<div class="gls-search-results">';
            results.forEach(function (r) {
                html +=
                    '<div class="gls-result-item"' +
                        ' data-topic="' + escAttr(r.topic) + '"' +
                        ' data-theme="' + escAttr(r.theme) + '">' +
                        '<div class="gls-result-names">' +
                            '<span class="gls-result-en">' + escHtml(r.name_en) + '</span>' +
                            (r.name_ar
                                ? '<span class="gls-result-ar" dir="rtl">' + escHtml(r.name_ar) + '</span>'
                                : '') +
                        '</div>' +
                        '<div class="gls-result-meta">' +
                            (r.code ? '<span class="gls-result-code">' + escHtml(r.code) + '</span>' : '') +
                            '<span class="gls-result-path">' +
                                escHtml(r.topic || '') + ' &rsaquo; ' + escHtml(r.theme || '') +
                            '</span>' +
                        '</div>' +
                        (r.def ? '<div class="gls-result-def">' + escHtml(r.def) + '&hellip;</div>' : '') +
                    '</div>';
            });
            html += '</div>';
            container.innerHTML = html;

            /* click result → load that theme */
            container.querySelectorAll('.gls-result-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    var topic = item.getAttribute('data-topic');
                    var theme = item.getAttribute('data-theme');
                    var root  = document.querySelector('.gls-tree-wrap') || document;

                    /* deactivate all themes */
                    root.querySelectorAll('.gls-theme-btn').forEach(function (b) {
                        b.classList.remove('is-active');
                    });

                    /* find and activate matching theme button */
                    root.querySelectorAll('.gls-theme-btn').forEach(function (b) {
                        if (b.getAttribute('data-topic') === topic &&
                            b.getAttribute('data-theme') === theme) {
                            b.classList.add('is-active');
                            /* expand parent topic */
                            var tList = b.closest('.gls-theme-list');
                            if (tList) {
                                tList.classList.add('is-open');
                                var topicBtn = root.querySelector(
                                    '[data-target="' + tList.id + '"]');
                                if (topicBtn) topicBtn.classList.add('is-open');
                            }
                        }
                    });

                    loadTerm(topic, theme, 1);
                });
            });
        }

        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                var container = document.getElementById('gls-right-content');
                if (container) {
                    container.innerHTML =
                        '<div class="gls-placeholder">' +
                        '<div class="gls-placeholder-icon">&#8594;</div>' +
                        '<div class="gls-placeholder-text">Select a theme from the left panel</div>' +
                        '</div>';
                }
            });
        }
    }

    /* ── Header action buttons (search bar) ────────────────── */
    function initHeaderBtns() {
        var hdrEdit    = document.getElementById('gls-hdr-edit');
        var hdrSubmit  = document.getElementById('gls-hdr-submit');
        var hdrNewTerm = document.getElementById('gls-hdr-new-term');
        var container  = document.getElementById('gls-right-content');
        if (!container) return;

        /* Edit: unlock fields and swap to Submit */
        if (hdrEdit) {
            hdrEdit.addEventListener('click', function () {
                if (hdrEdit.disabled) return;
                container.querySelectorAll('.gls-user-field').forEach(function (f) {
                    f.readOnly = false;
                });
                hdrEdit.style.display = 'none';
                if (hdrSubmit) { hdrSubmit.style.display = ''; hdrSubmit.disabled = false; }
                /* focus first editable field */
                var first = container.querySelector('.gls-user-field');
                if (first) first.focus();
            });
        }

        /* Submit Changes */
        if (hdrSubmit) {
            hdrSubmit.addEventListener('click', function () {
                if (hdrSubmit.disabled) return;
                var isNew = !!container.querySelector('.gls-new-mode');
                saveDraft(container, isNew);
            });
        }

        /* New Term */
        if (hdrNewTerm) {
            hdrNewTerm.addEventListener('click', function () {
                loadNewTermCard(container);
            });
        }
    }

    /* ── Init ──────────────────────────────────────────────── */
    function init(context) {
        var root = context || document;
        if (!root.querySelector('.gls-tree-wrap')) return;
        bindTopics(root);
        bindThemes(root);
        bindRightPanel();
        initSearch();
        initHeaderBtns();
    }

    return {
        init      : init,
        clearCache: function () { termCache = {}; }
    };

}());
