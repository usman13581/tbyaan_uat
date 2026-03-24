/* ============================================================
   BUSINESS GLOSSARY TREE  –  Lazy Load + Fixed Card Layout
   Backend returns JSON, JS fills fixed HTML template
   ============================================================ */

var GlossaryApp = (function () {
    'use strict';

    var termCache = {};
    var curTopic   = '';
    var curTheme   = '';
    var curDataset = '';   /* empty string = direct terms under theme */
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
                    '<div class="gls-field-group"><label class="gls-label">Parent Ref</label><select id="gls-parentref" class="gls-input gls-user-field" name="f06" disabled></select></div>' +
                    '<div class="gls-field-group"><label class="gls-label">Source</label><input id="gls-source" type="text" class="gls-input gls-user-field" name="f11" readonly></div>' +
                '</div>' +
                '<div class="gls-two-col" style="margin-top:12px">' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label">Dataset (EN)</label>' +
                        '<input id="gls-dataset-en" type="text" class="gls-input gls-user-field" name="f07" readonly list="gls-ds-list-edit" autocomplete="off">' +
                        '<datalist id="gls-ds-list-edit"></datalist>' +
                    '</div>' +
                    '<div class="gls-field-group">' +
                        '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                        '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl gls-user-field" name="f08" dir="rtl" readonly>' +
                    '</div>' +
                '</div>' +
                '<div class="gls-two-col" style="margin-top:12px">' +
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
            '<div class="gls-two-col gls-submit-fields" style="margin-top:12px;display:none">' +
                '<div class="gls-field-group">' +
                    '<label class="gls-label">Justification <span class="gls-req">*</span></label>' +
                    '<textarea id="gls-justification" class="gls-textarea gls-user-field" name="f12" readonly></textarea>' +
                '</div>' +
                '<div class="gls-field-group">' +
                    '<label class="gls-label">Use <span class="gls-req">*</span></label>' +
                    '<select id="gls-use" class="gls-input" name="f13">' +
                        '<option value="">-- Select Use --</option>' +
                        '<option value="Data Collection">Data Collection</option>' +
                        '<option value="Data Analysis and Dissemination">Data Analysis and Dissemination</option>' +
                        '<option value="Policy and Regulation">Policy and Regulation</option>' +
                        '<option value="Other">Other</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="gls-slider-nav">' +
            '<button type="button" class="gls-nav-btn gls-delete-term">&#128465; Delete</button>' +
            '<button type="button" class="gls-nav-btn gls-prev">&#8592; Previous</button>' +
            '<div class="gls-slider-count">' +
                '<span class="gls-current">1</span>' +
                '<span class="gls-divider"> / </span>' +
                '<span class="gls-total">1</span>' +
            '</div>' +
            '<button type="button" class="gls-nav-btn gls-next">Next &#8594;</button>' +
            '<button type="button" class="gls-nav-btn gls-last">Last &#8649;</button>' +
        '</div>';

    /* ── Populate dataset datalist from left-panel tree ─── */
    function populateDsDatalistFromTree(dl, topic, theme) {
        if (!dl) return;
        dl.innerHTML = '';
        var root = document.querySelector('.gls-tree-wrap') || document;
        root.querySelectorAll('.gls-dataset-btn').forEach(function (btn) {
            if (btn.getAttribute('data-topic') === topic &&
                btn.getAttribute('data-theme') === theme) {
                var opt = document.createElement('option');
                opt.value = btn.getAttribute('data-dataset');
                dl.appendChild(opt);
            }
        });
    }

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

        /* parentref is a select — show current value as a single option in view mode */
        var prEl = container.querySelector('#gls-parentref');
        if (prEl) {
            prEl.innerHTML = '<option value="' + (d.parent_ref || '') + '">' +
                             (d.parent_ref || '—') + '</option>';
            prEl.value    = d.parent_ref || '';
            prEl.disabled = true;
        }

        set('gls-dataset-en', d.dataset_en);
        var arVal = d.dataset_ar;
        if (!arVal && d.dataset_en) {
            var dsBtn = document.querySelector('.gls-dataset-btn[data-dataset="' + (d.dataset_en || '').replace(/"/g, '\\"') + '"]');
            if (dsBtn) { var arSpan = dsBtn.querySelector('.gls-dataset-ar'); if (arSpan) arVal = arSpan.textContent; }
        }
        set('gls-dataset-ar', arVal);
        set('gls-def-en',     d.def_en);
        set('gls-def-ar',     d.def_ar);
        set('gls-source',     d.source);

        /* pre-populate submit fields so they show saved values in edit mode */
        var jEl = container.querySelector('#gls-justification');
        if (jEl) jEl.value = d.justification || '';
        var uEl = container.querySelector('#gls-use');
        if (uEl) uEl.value = d.use || '';

        /* counter + nav state */
        var elC = container.querySelector('.gls-current');
        var elT = container.querySelector('.gls-total');
        if (elC) elC.textContent = d.seq;
        if (elT) elT.textContent = d.total;

        var prev = container.querySelector('.gls-prev');
        var next = container.querySelector('.gls-next');
        var last = container.querySelector('.gls-last');
        if (prev) prev.disabled = (d.seq <= 1);
        if (next) next.disabled = (d.seq >= d.total);
        if (last) last.disabled = (d.seq >= d.total);

        curSeq   = d.seq;
        curTotal = d.total;

        /* reset to view mode on fresh term load */
        container.querySelectorAll('.gls-user-field').forEach(function (f) { f.readOnly = true; });
        var hdrEdit      = document.getElementById('gls-hdr-edit');
        var hdrSubmit    = document.getElementById('gls-hdr-submit');
        var hdrSaveAdmin = document.getElementById('gls-hdr-save-admin');
        if (hdrEdit)      { hdrEdit.style.display = '';       hdrEdit.disabled = false; }
        if (hdrSubmit)    { hdrSubmit.style.display = 'none'; hdrSubmit.disabled = true; }
        if (hdrSaveAdmin) { hdrSaveAdmin.style.display = 'none'; hdrSaveAdmin.disabled = true; }
        /* show delete button only for admin users */
        var delBtn = container.querySelector('.gls-delete-term');
        if (delBtn) delBtn.style.display = isAdminUser() ? '' : 'none';
        isDirty = false;
    }

    /* ── Load term by seq ──────────────────────────────────── */
    function loadTerm(topic, theme, dataset, seq) {
        var container = document.getElementById('gls-right-content');
        if (!container) return;

        dataset = dataset || '';
        var cacheKey = topic + '||' + theme + '||' + dataset + '||' + seq;
        curTopic   = topic;
        curTheme   = theme;
        curDataset = dataset;
        curSeq     = seq;

        /* show spinner only on first load of this group */
        if (!termCache[topic + '||' + theme + '||' + dataset + '||1']) {
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

        /* Ajax — x04 carries dataset name (empty = direct terms) */
        apex.server.process(
            'GET_THEME_TERMS',
            { x01: topic, x02: theme, x03: String(seq), x04: dataset },
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
                            '<div class="gls-field-group">' +
                                '<label class="gls-label">Dataset (EN)</label>' +
                                '<input id="gls-dataset-en" type="text" class="gls-input" list="gls-ds-list-new" autocomplete="off" placeholder="Select or type dataset...">' +
                                '<datalist id="gls-ds-list-new"></datalist>' +
                            '</div>' +
                            '<div class="gls-field-group">' +
                                '<label class="gls-label gls-lbl-ar">&#1575;&#1587;&#1605; &#1605;&#1580;&#1605;&#1608;&#1593;&#1577; &#1575;&#1604;&#1576;&#1610;&#1575;&#1606;&#1575;&#1578;</label>' +
                                '<input id="gls-dataset-ar" type="text" class="gls-input gls-rtl" dir="rtl">' +
                            '</div>' +
                        '</div>' +
                        '<div class="gls-two-col" style="margin-top:12px">' +
                            '<div class="gls-field-group"><label class="gls-label">Definition (EN) <span class="gls-req">*</span></label>' +
                                '<textarea id="gls-def-en" class="gls-textarea"></textarea></div>' +
                            '<div class="gls-field-group"><label class="gls-label gls-lbl-ar">&#1575;&#1604;&#1578;&#1593;&#1585;&#1610;&#1601;</label>' +
                                '<textarea id="gls-def-ar" class="gls-textarea gls-rtl" dir="rtl"></textarea></div>' +
                        '</div>' +
                        '<div class="gls-two-col" style="margin-top:12px">' +
                            '<div class="gls-field-group"><label class="gls-label">Justification <span class="gls-req">*</span></label>' +
                                '<textarea id="gls-justification" class="gls-textarea" placeholder="Why is this term needed?"></textarea></div>' +
                            '<div class="gls-field-group"><label class="gls-label">Use <span class="gls-req">*</span></label>' +
                                '<select id="gls-use" class="gls-input">' +
                                    '<option value="">-- Select Use --</option>' +
                                    '<option value="Data Collection">Data Collection</option>' +
                                    '<option value="Data Analysis and Dissemination">Data Analysis and Dissemination</option>' +
                                    '<option value="Policy and Regulation">Policy and Regulation</option>' +
                                    '<option value="Other">Other</option>' +
                                '</select></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="gls-slider-nav">' +
                    '<button type="button" class="gls-nav-btn gls-cancel-new">&#8592; Cancel</button>' +
                    '<div class="gls-new-term-label">New Term &mdash; ' +
                        '<span class="gls-new-topic"></span> &rsaquo; <span class="gls-new-theme"></span>' +
                    '</div>' +
                    '<button type="button" class="gls-nav-btn gls-submit-changes gls-btn-submit" disabled>&#10003; Submit for Approval</button>' +
                    (isAdminUser() ? '<button type="button" class="gls-nav-btn gls-save-admin-new gls-btn-admin">&#128274; Save as Admin</button>' : '') +
                '</div>' +
            '</div>';

        /* hide edit/submit header buttons while in new-term mode */
        var hdrEdit      = document.getElementById('gls-hdr-edit');
        var hdrSubmit    = document.getElementById('gls-hdr-submit');
        var hdrSaveAdmin = document.getElementById('gls-hdr-save-admin');
        if (hdrEdit)      hdrEdit.style.display      = 'none';
        if (hdrSubmit)    hdrSubmit.style.display    = 'none';
        if (hdrSaveAdmin) hdrSaveAdmin.style.display = 'none';

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

        /* fetch parent terms, then wire dataset datalist on parent change */
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

                /* populate dataset datalist from current topic/theme */
                populateDsDatalistFromTree(container.querySelector('#gls-ds-list-new'), curTopic, curTheme);

                /* auto-fill Arabic dataset name when EN is changed */
                var newDsEn = container.querySelector('#gls-dataset-en');
                var newDsAr = container.querySelector('#gls-dataset-ar');
                if (newDsEn && newDsAr) {
                    newDsEn.addEventListener('change', function () {
                        var btn = document.querySelector('.gls-dataset-btn[data-dataset="' + (this.value || '').replace(/"/g, '\\"') + '"]');
                        var sp  = btn ? btn.querySelector('.gls-dataset-ar') : null;
                        newDsAr.value = sp ? sp.textContent : '';
                    });
                }

                /* reload datasets if user picks a different theme parent */
                sel.addEventListener('change', function () {
                    var dl  = container.querySelector('#gls-ds-list-new');
                    var opt = sel.options[sel.selectedIndex];
                    if (!opt || !sel.value) { if (dl) dl.innerHTML = ''; return; }
                    var parts = opt.textContent.split(' › ');
                    if (parts.length >= 2) {
                        populateDsDatalistFromTree(dl, parts[0].trim(), parts[1].trim());
                    }
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
            def_en:        val('gls-def-en'),
            def_ar:        val('gls-def-ar'),
            source:        val('gls-source'),
            justification: val('gls-justification'),
            use:           val('gls-use')
        };
    }

    /* ── Validate card ─────────────────────────────────────── */
    function validateCard(data, isNew) {
        var errors = [];
        if (!data.name_en)        errors.push('Term Name (EN) is required.');
        if (!data.def_en)         errors.push('Definition (EN) is required.');
        if (isNew && !data.parent_ref)  errors.push('Parent Ref is required.');
        if (!data.justification)  errors.push('Justification is required.');
        if (!data.use)            errors.push('Use is required.');
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

        var submitBtn    = container.querySelector('.gls-submit-changes');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
        var hdrEdit      = document.getElementById('gls-hdr-edit');
        var hdrSubmit    = document.getElementById('gls-hdr-submit');
        var hdrSaveAdmin = document.getElementById('gls-hdr-save-admin');
        if (hdrSubmit)    { hdrSubmit.disabled = true;    hdrSubmit.textContent    = '\u2713 Saving...'; }
        if (hdrSaveAdmin) { hdrSaveAdmin.disabled = true; hdrSaveAdmin.textContent = '\u2713 Saving...'; }

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
            source:        data.source,
            justification: data.justification,
            use:           data.use,
            topic:         curTopic,
            theme:         curTheme
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
                        if (submitBtn)    { submitBtn.disabled = false;    submitBtn.textContent    = '&#10003; Submit for Approval'; }
                        if (hdrSubmit)    { hdrSubmit.disabled = false;    hdrSubmit.textContent    = '\u2713 Submit Changes'; }
                        if (hdrSaveAdmin) { hdrSaveAdmin.disabled = false; hdrSaveAdmin.textContent = '\uD83D\uDD12 Save as Admin'; }
                        var errDiv = document.createElement('div');
                        errDiv.className = 'gls-val-errors';
                        errDiv.textContent = result.message || 'Save failed. Please try again.';
                        var nav = container.querySelector('.gls-slider-nav');
                        if (nav) nav.parentNode.insertBefore(errDiv, nav);
                    }
                },
                error: function (xhr) {
                    if (submitBtn)    { submitBtn.disabled = false;    submitBtn.textContent    = '&#10003; Submit for Approval'; }
                    if (hdrSubmit)    { hdrSubmit.disabled = false;    hdrSubmit.textContent    = '\u2713 Submit Changes'; }
                    if (hdrSaveAdmin) { hdrSaveAdmin.disabled = false; hdrSaveAdmin.textContent = '\uD83D\uDD12 Save as Admin'; }
                    var errDiv = document.createElement('div');
                    errDiv.className = 'gls-val-errors';
                    errDiv.textContent = xhr.responseText || 'Network error. Please try again.';
                    var nav = container.querySelector('.gls-slider-nav');
                    if (nav) nav.parentNode.insertBefore(errDiv, nav);
                }
            }
        );
    }

    /* ── Save as Admin (direct save, no workflow) ─────────── */
    function saveAsAdmin(container) {
        var isNew  = !!container.querySelector('.gls-new-mode');
        var data   = collectCardData(container);
        var errors = validateCard(data, isNew);

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

        var hdrSubmit       = document.getElementById('gls-hdr-submit');
        var hdrSaveAdmin    = document.getElementById('gls-hdr-save-admin');
        var inlineAdminBtn  = container.querySelector('.gls-save-admin-new');
        if (hdrSubmit)      { hdrSubmit.disabled = true;      hdrSubmit.textContent      = '\u2713 Saving...'; }
        if (hdrSaveAdmin)   { hdrSaveAdmin.disabled = true;   hdrSaveAdmin.textContent   = '\u2713 Saving...'; }
        if (inlineAdminBtn) { inlineAdminBtn.disabled = true; inlineAdminBtn.textContent = '\u2713 Saving...'; }

        var payload = {
            type:          isNew ? 'NEW' : 'UPDATE',
            term_id:       isNew ? null  : String(curSeq),
            code:          data.code,
            term_ref:      data.term_ref,
            parent_ref:    data.parent_ref,
            name_en:       data.name_en,
            name_ar:       data.name_ar,
            dataset_en:    data.dataset_en,
            dataset_ar:    data.dataset_ar,
            def_en:        data.def_en,
            def_ar:        data.def_ar,
            source:        data.source,
            justification: data.justification,
            use:           data.use,
            topic:         curTopic,
            theme:         curTheme
        };

        apex.server.process(
            'SAVE_ADMIN_TERM',
            { x01: JSON.stringify(payload) },
            {
                dataType: 'text',
                success: function (raw) {
                    var result;
                    try { result = JSON.parse(raw); } catch (e) { result = { status: 'error' }; }
                    if (result.status === 'ok') {
                        if (isNew) {
                            /* show success message then reload so the tree reflects the new dataset */
                            container.innerHTML =
                                '<div class="gls-success-msg">' +
                                    '<div class="gls-success-icon">&#10003;</div>' +
                                    '<div class="gls-success-title">Term Added Successfully</div>' +
                                    '<div class="gls-success-text">The term has been added directly to the glossary by an administrator. Refreshing...</div>' +
                                '</div>';
                            var hdrEditBtn = document.getElementById('gls-hdr-edit');
                            if (hdrEditBtn) { hdrEditBtn.style.display = ''; hdrEditBtn.disabled = true; }
                            setTimeout(function () { window.location.reload(); }, 1500);
                        } else {
                            /* hide both action buttons, restore Edit */
                            if (hdrSubmit)    { hdrSubmit.style.display    = 'none'; hdrSubmit.disabled    = true; }
                            if (hdrSaveAdmin) { hdrSaveAdmin.style.display = 'none'; hdrSaveAdmin.disabled = true; }
                            var hdrEditBtn = document.getElementById('gls-hdr-edit');
                            if (hdrEditBtn) { hdrEditBtn.style.display = ''; hdrEditBtn.disabled = false; hdrEditBtn.textContent = '\u270E Edit'; }
                            /* lock fields back to view mode */
                            container.querySelectorAll('.gls-user-field').forEach(function (f) { f.readOnly = true; });
                            container.querySelectorAll('.gls-submit-fields').forEach(function (el) { el.style.display = 'none'; });
                            /* clear any previous validation errors */
                            var prevErr = container.querySelector('.gls-val-errors');
                            if (prevErr) prevErr.parentNode.removeChild(prevErr);
                        }
                    } else {
                        if (hdrSubmit)      { hdrSubmit.disabled = false;      hdrSubmit.textContent      = '\u2713 Submit Changes'; }
                        if (hdrSaveAdmin)   { hdrSaveAdmin.disabled = false;   hdrSaveAdmin.textContent   = '\uD83D\uDD12 Save as Admin'; }
                        if (inlineAdminBtn) { inlineAdminBtn.disabled = false; inlineAdminBtn.textContent = '\uD83D\uDD12 Save as Admin'; }
                        var errDiv = document.createElement('div');
                        errDiv.className = 'gls-val-errors';
                        errDiv.textContent = result.message || 'Save failed. Please try again.';
                        var nav = container.querySelector('.gls-slider-nav');
                        if (nav) nav.parentNode.insertBefore(errDiv, nav);
                    }
                },
                error: function (xhr) {
                    if (hdrSubmit)      { hdrSubmit.disabled = false;      hdrSubmit.textContent      = '\u2713 Submit Changes'; }
                    if (hdrSaveAdmin)   { hdrSaveAdmin.disabled = false;   hdrSaveAdmin.textContent   = '\uD83D\uDD12 Save as Admin'; }
                    if (inlineAdminBtn) { inlineAdminBtn.disabled = false; inlineAdminBtn.textContent = '\uD83D\uDD12 Save as Admin'; }
                    var errDiv = document.createElement('div');
                    errDiv.className = 'gls-val-errors';
                    errDiv.textContent = xhr.responseText || 'Network error. Please try again.';
                    var nav = container.querySelector('.gls-slider-nav');
                    if (nav) nav.parentNode.insertBefore(errDiv, nav);
                }
            }
        );
    }

    /* ── Custom delete confirmation modal ─────────────────── */
    function showDeleteConfirm(termName, onConfirm) {
        /* remove any existing modal */
        var old = document.getElementById('gls-del-modal');
        if (old) old.parentNode.removeChild(old);

        var overlay = document.createElement('div');
        overlay.id        = 'gls-del-modal';
        overlay.className = 'gls-del-overlay';
        overlay.innerHTML =
            '<div class="gls-del-dialog">' +
                '<div class="gls-del-icon">&#128465;</div>' +
                '<div class="gls-del-title">Delete Term</div>' +
                '<div class="gls-del-msg">Are you sure you want to delete<br><strong>' +
                    termName.replace(/</g,'&lt;').replace(/>/g,'&gt;') +
                '</strong>?<br><span class="gls-del-warn">This action cannot be undone.</span></div>' +
                '<div class="gls-del-actions">' +
                    '<button type="button" class="gls-del-btn-cancel">Cancel</button>' +
                    '<button type="button" class="gls-del-btn-confirm">Delete</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

        overlay.querySelector('.gls-del-btn-cancel').addEventListener('click', close);
        overlay.querySelector('.gls-del-btn-confirm').addEventListener('click', function () {
            close();
            onConfirm();
        });
        /* close on backdrop click */
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
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
            if (t.tagName === 'SELECT' && (t.id === 'gls-parentref' || t.id === 'gls-use')) {
                var submitBtn = container.querySelector('.gls-submit-changes');
                if (submitBtn) submitBtn.disabled = false;
                isDirty = true;
            }
        });

        container.addEventListener('click', function (e) {
            var t = e.target;

            if (t.classList.contains('gls-prev') && !t.disabled && curSeq > 1) {
                loadTerm(curTopic, curTheme, curDataset, curSeq - 1);
                return;
            }
            if (t.classList.contains('gls-next') && !t.disabled && curSeq < curTotal) {
                loadTerm(curTopic, curTheme, curDataset, curSeq + 1);
                return;
            }
            if (t.classList.contains('gls-last') && !t.disabled && curSeq < curTotal) {
                loadTerm(curTopic, curTheme, curDataset, curTotal);
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

            /* save as admin (new term — direct insert, no workflow) */
            if (t.classList.contains('gls-save-admin-new') && !t.disabled) {
                saveAsAdmin(container);
                return;
            }

            /* delete current term */
            if (t.classList.contains('gls-delete-term')) {
                var termNameEl = container.querySelector('#gls-name-en');
                var termName   = termNameEl ? termNameEl.value : 'this term';
                var termRefEl  = container.querySelector('#gls-termref');
                var termRef    = termRefEl ? termRefEl.value : '';
                var delBtn     = t;
                var snapTopic  = curTopic, snapTheme = curTheme, snapDataset = curDataset;

                showDeleteConfirm(termName, function () {
                    delBtn.disabled    = true;
                    delBtn.textContent = 'Deleting\u2026';

                    apex.server.process(
                        'DELETE_TERM',
                        { x01: termRef, x02: snapTopic, x03: snapTheme, x04: snapDataset },
                        {
                            dataType: 'text',
                            success: function (raw) {
                                var result;
                                try { result = JSON.parse(raw); } catch (e) { result = { status: 'error' }; }
                                if (result.status === 'ok') {
                                    /* 1. Clear cache for this group */
                                    var prefix = snapTopic + '||' + snapTheme + '||' + snapDataset + '||';
                                    Object.keys(termCache).forEach(function (k) {
                                        if (k.indexOf(prefix) === 0) delete termCache[k];
                                    });

                                    /* 2. Remove term from left-panel tree */
                                    var activeNavBtn = document.querySelector('.gls-term-nav-btn.is-active');
                                    if (activeNavBtn) activeNavBtn.parentNode.removeChild(activeNavBtn);

                                    /* 3. Decrement topic term count */
                                    var treeRoot = document.querySelector('.gls-tree-wrap');
                                    if (treeRoot) {
                                        treeRoot.querySelectorAll('.gls-topic-btn').forEach(function (tb) {
                                            var en = tb.querySelector('.gls-topic-en');
                                            if (en && en.textContent.trim() === snapTopic) {
                                                var cntEl = tb.querySelector('.gls-topic-count');
                                                if (cntEl) {
                                                    var n = parseInt(cntEl.textContent.replace(/[()]/g,''), 10) || 0;
                                                    if (n > 0) cntEl.textContent = '(' + (n - 1) + ')';
                                                }
                                            }
                                        });
                                    }

                                    /* 4. Show success in right panel */
                                    container.innerHTML =
                                        '<div class="gls-success-msg">' +
                                            '<div class="gls-success-icon">&#10003;</div>' +
                                            '<div class="gls-success-title">Term Deleted</div>' +
                                            '<div class="gls-success-text">"' + termName + '" has been deleted from the glossary.</div>' +
                                        '</div>';
                                } else {
                                    delBtn.disabled    = false;
                                    delBtn.textContent = '\uD83D\uDDD1 Delete';
                                    showDeleteConfirm.__error = true;
                                    var old = document.getElementById('gls-del-modal');
                                    if (old) old.parentNode.removeChild(old);
                                    /* show inline error */
                                    var prev2 = container.querySelector('.gls-val-errors');
                                    if (prev2) prev2.parentNode.removeChild(prev2);
                                    var errDiv = document.createElement('div');
                                    errDiv.className = 'gls-val-errors';
                                    errDiv.textContent = result.message || 'Delete failed. Please try again.';
                                    var nav2 = container.querySelector('.gls-slider-nav');
                                    if (nav2) nav2.parentNode.insertBefore(errDiv, nav2);
                                }
                            },
                            error: function (xhr) {
                                delBtn.disabled    = false;
                                delBtn.textContent = '\uD83D\uDDD1 Delete';
                                var prev3 = container.querySelector('.gls-val-errors');
                                if (prev3) prev3.parentNode.removeChild(prev3);
                                var errDiv2 = document.createElement('div');
                                errDiv2.className = 'gls-val-errors';
                                errDiv2.textContent = xhr.responseText || 'Network error. Please try again.';
                                var nav3 = container.querySelector('.gls-slider-nav');
                                if (nav3) nav3.parentNode.insertBefore(errDiv2, nav3);
                            }
                        }
                    );
                });
                return;
            }

            /* cancel — go back to current term */
            if (t.classList.contains('gls-cancel-new')) {
                isDirty = false;
                loadTerm(curTopic, curTheme, curDataset, curSeq);
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

    /* ── Themes + Datasets ─────────────────────────────────── */
    function bindThemes(root) {
        var wrap = root.querySelector('.gls-tree-wrap') || root;
        if (wrap.dataset.themesBound === 'Y') return;
        wrap.dataset.themesBound = 'Y';

        wrap.addEventListener('click', function (e) {

            /* ── 1. Term nav button inside expanded dataset ── */
            var termBtn = e.target.closest('.gls-term-nav-btn');
            if (termBtn) {
                wrap.querySelectorAll('.gls-term-nav-btn.is-active')
                    .forEach(function (b) { b.classList.remove('is-active'); });
                termBtn.classList.add('is-active');
                var tl = termBtn.closest('.gls-term-list');
                loadTerm(
                    tl.getAttribute('data-topic'),
                    tl.getAttribute('data-theme'),
                    tl.getAttribute('data-dataset') || '',
                    parseInt(termBtn.getAttribute('data-seq'), 10)
                );
                return;
            }

            /* ── 2. Dataset button — toggle term list expansion ── */
            var dsBtn = e.target.closest('.gls-dataset-btn');
            if (dsBtn) {
                var item  = dsBtn.closest('.gls-dataset-item');
                var tList = item ? item.querySelector('.gls-term-list') : null;
                if (tList) {
                    if (dsBtn.classList.contains('is-open')) {
                        dsBtn.classList.remove('is-open');
                        tList.style.display = 'none';
                    } else {
                        dsBtn.classList.add('is-open');
                        tList.style.display = 'block';
                        if (!tList.dataset.loaded) { loadTreeTerms(dsBtn, tList); }
                    }
                }
                return;
            }

            /* ── 3. Theme button — load direct terms in right panel ── */
            var btn = e.target.closest('.gls-theme-btn');
            if (!btn) return;
            wrap.querySelectorAll('.gls-theme-btn.is-active, .gls-dataset-btn.is-active')
                .forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
            loadTerm(btn.getAttribute('data-topic'), btn.getAttribute('data-theme'), '', 1);
        });
    }

    /* ── Lazy-load terms into dataset expansion list ────────── */
    function loadTreeTerms(dsBtn, tList) {
        tList.innerHTML = '<div class="gls-term-loading">Loading\u2026</div>';
        apex.server.process('GET_TREE_TERMS', {
            x01: dsBtn.getAttribute('data-topic'),
            x02: dsBtn.getAttribute('data-theme'),
            x03: dsBtn.getAttribute('data-dataset') || ''
        }, {
            dataType: 'text',
            success: function (raw) {
                var terms = [];
                try { terms = JSON.parse(raw); } catch (ex) {}
                if (!terms.length) {
                    tList.innerHTML = '<div class="gls-term-empty">No terms</div>';
                } else {
                    var html = '';
                    terms.forEach(function (t) {
                        html += '<button type="button" class="gls-term-nav-btn"'
                              + ' data-seq="' + t.seq + '">'
                              + escHtml(t.name_en)
                              + '</button>';
                    });
                    tList.innerHTML = html;
                }
                tList.dataset.loaded = 'Y';
            },
            error: function () {
                tList.innerHTML = '<div class="gls-term-empty" style="color:#ef4444">Error loading</div>';
            }
        });
    }

    /* ── Open first topic ──────────────────────────────────── */
    function openFirstTopic(root) {
        var btn  = root.querySelector('.gls-topic-btn');
        var list = btn ? root.querySelector('#' + btn.getAttribute('data-target')) : null;
        if (btn)  btn.classList.add('is-open');
        if (list) list.classList.add('is-open');
    }

    /* ── Admin user check ──────────────────────────────────── */
    function isAdminUser() {
        return !!document.getElementById('gls-is-admin');
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
                /* build breadcrumb: topic > theme [ > dataset ] */
                var path = escHtml(r.topic || '') + ' &rsaquo; ' + escHtml(r.theme || '');
                if (r.dataset) { path += ' &rsaquo; ' + escHtml(r.dataset); }

                html +=
                    '<div class="gls-result-item"' +
                        ' data-topic="'   + escAttr(r.topic)   + '"' +
                        ' data-theme="'   + escAttr(r.theme)   + '"' +
                        ' data-dataset="' + escAttr(r.dataset || '') + '"' +
                        ' data-seq="'     + (r.seq || 1)       + '">' +
                        '<div class="gls-result-names">' +
                            '<span class="gls-result-en">' + escHtml(r.name_en) + '</span>' +
                            (r.name_ar
                                ? '<span class="gls-result-ar" dir="rtl">' + escHtml(r.name_ar) + '</span>'
                                : '') +
                        '</div>' +
                        '<div class="gls-result-meta">' +
                            (r.code ? '<span class="gls-result-code">' + escHtml(r.code) + '</span>' : '') +
                            '<span class="gls-result-path">' + path + '</span>' +
                        '</div>' +
                        (r.def ? '<div class="gls-result-def">' + escHtml(r.def) + '&hellip;</div>' : '') +
                    '</div>';
            });
            html += '</div>';
            container.innerHTML = html;

            /* click result → navigate to that term */
            container.querySelectorAll('.gls-result-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    var topic   = item.getAttribute('data-topic');
                    var theme   = item.getAttribute('data-theme');
                    var dataset = item.getAttribute('data-dataset') || '';
                    var seq     = parseInt(item.getAttribute('data-seq'), 10) || 1;
                    var root    = document.querySelector('.gls-tree-wrap') || document;

                    /* deactivate all nav buttons */
                    root.querySelectorAll('.gls-theme-btn.is-active, .gls-dataset-btn.is-active')
                        .forEach(function (b) { b.classList.remove('is-active'); });

                    if (dataset) {
                        /* activate matching dataset button */
                        root.querySelectorAll('.gls-dataset-btn').forEach(function (b) {
                            if (b.getAttribute('data-topic')   === topic &&
                                b.getAttribute('data-theme')   === theme &&
                                b.getAttribute('data-dataset') === dataset) {
                                b.classList.add('is-active');
                                /* expand parent topic */
                                var tList = b.closest('.gls-theme-list');
                                if (tList) {
                                    tList.classList.add('is-open');
                                    var topicBtn = root.querySelector('[data-target="' + tList.id + '"]');
                                    if (topicBtn) topicBtn.classList.add('is-open');
                                }
                            }
                        });
                    } else {
                        /* activate matching theme button (direct terms) */
                        root.querySelectorAll('.gls-theme-btn').forEach(function (b) {
                            if (b.getAttribute('data-topic') === topic &&
                                b.getAttribute('data-theme') === theme) {
                                b.classList.add('is-active');
                                var tList = b.closest('.gls-theme-list');
                                if (tList) {
                                    tList.classList.add('is-open');
                                    var topicBtn = root.querySelector('[data-target="' + tList.id + '"]');
                                    if (topicBtn) topicBtn.classList.add('is-open');
                                }
                            }
                        });
                    }

                    loadTerm(topic, theme, dataset, seq);
                });
            });
        }

        searchBtn.addEventListener('click', doSearch);
        /* capture=true ensures we run before APEX's page-submit handler */
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopImmediatePropagation();
                doSearch();
            }
        }, true);

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
        var hdrEdit      = document.getElementById('gls-hdr-edit');
        var hdrSubmit    = document.getElementById('gls-hdr-submit');
        var hdrSaveAdmin = document.getElementById('gls-hdr-save-admin');
        var hdrNewTerm   = document.getElementById('gls-hdr-new-term');
        var container    = document.getElementById('gls-right-content');
        if (!container) return;

        /* Edit: unlock fields and show Submit Changes + Save as Admin */
        if (hdrEdit) {
            hdrEdit.addEventListener('click', function () {
                if (hdrEdit.disabled) return;
                container.querySelectorAll('.gls-user-field').forEach(function (f) {
                    f.readOnly = false;
                });
                hdrEdit.style.display = 'none';
                if (hdrSubmit)    { hdrSubmit.style.display    = ''; hdrSubmit.disabled    = false; }
                if (hdrSaveAdmin && isAdminUser()) { hdrSaveAdmin.style.display = ''; hdrSaveAdmin.disabled = false; }
                /* show justification + use fields */
                container.querySelectorAll('.gls-submit-fields').forEach(function (el) {
                    el.style.display = '';
                });

                /* populate parent ref dropdown */
                var prEl = container.querySelector('#gls-parentref');
                if (prEl && prEl.tagName === 'SELECT') {
                    var currentRef = prEl.value;
                    prEl.innerHTML = '<option value="">-- Select Parent --</option>';
                    prEl.disabled  = false;
                    apex.server.process('GET_PARENT_TERMS', {}, {
                        dataType: 'text',
                        success: function (raw) {
                            var parents;
                            try { parents = JSON.parse(raw); } catch (e) { return; }
                            parents.forEach(function (p) {
                                var opt = document.createElement('option');
                                opt.value = p.ref;
                                opt.textContent = p.label;
                                if (p.ref === currentRef) opt.selected = true;
                                prEl.appendChild(opt);
                            });

                            /* populate dataset datalist from current topic/theme */
                            var dl = container.querySelector('#gls-ds-list-edit');
                            populateDsDatalistFromTree(dl, curTopic, curTheme);

                            /* auto-fill Arabic dataset name when EN is changed */
                            var dsEnInput = container.querySelector('#gls-dataset-en');
                            var dsArInput = container.querySelector('#gls-dataset-ar');
                            if (dsEnInput && dsArInput) {
                                dsEnInput.addEventListener('change', function () {
                                    var btn = document.querySelector('.gls-dataset-btn[data-dataset="' + (this.value || '').replace(/"/g, '\\"') + '"]');
                                    var sp  = btn ? btn.querySelector('.gls-dataset-ar') : null;
                                    dsArInput.value = sp ? sp.textContent : '';
                                });
                            }

                            /* reload datasets if user picks a different theme parent */
                            prEl.addEventListener('change', function () {
                                var dl2  = container.querySelector('#gls-ds-list-edit');
                                var opt2 = prEl.options[prEl.selectedIndex];
                                if (!opt2 || !prEl.value) { if (dl2) dl2.innerHTML = ''; return; }
                                var parts = opt2.textContent.split(' › ');
                                if (parts.length >= 2) {
                                    populateDsDatalistFromTree(dl2, parts[0].trim(), parts[1].trim());
                                }
                            });
                        }
                    });
                }

                /* focus first editable field */
                var first = container.querySelector('.gls-user-field:not([disabled])');
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

        /* Save as Admin (direct save, no workflow) */
        if (hdrSaveAdmin) {
            hdrSaveAdmin.addEventListener('click', function () {
                if (hdrSaveAdmin.disabled) return;
                saveAsAdmin(container);
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


/* ============================================================
   GLOSSARY WORKFLOW REVIEW CARD  –  GlossaryWFApp
   Renders a term-request card on APEX workflow pages.
   Reads JSON_VAL from SEC_T_PROCESSES_LANDING and lets the
   reviewer Edit → Save Changes (updates landing table + glossary).

   APEX page setup:
     1. Add a Static HTML region with source from
        glossary_workflow_region.html (set data-landing-id to
        your page item, e.g. data-landing-id="&P_LANDING_ID.")
     2. Upload/include glossary.js (this file) on the page
     3. Paste glossary_workflow.css into the page CSS
     4. Register APEX callbacks: GET_WF_TERM_JSON, SAVE_WF_TERM_JSON
     5. In "Execute when Page Loads": GlossaryWFApp.init();
   ============================================================ */

var GlossaryWFApp = (function () {
    'use strict';

    var _workflowId = null;  // P76_WORKFLOW_PROCESS_ID (passed to GET callback)
    var _landingId  = null;  // PROCESSES_LANDING_ID resolved by GET callback
    var _data       = null;  // last loaded data object

    /* ── HTML template for the review card ─────────────────── */
    var WF_CARD_HTML =
        '<div class="gls-wf-card">' +

            /* header: title left, Edit button right */
            '<div class="gls-wf-header">' +
                '<h2 class="gls-wf-title" id="gls-wf-title">Loading&hellip;</h2>' +
                '<button type="button" class="gls-wf-btn gls-wf-edit-btn" id="gls-wf-edit">Edit</button>' +
            '</div>' +

            /* names row */
            '<div class="gls-wf-body">' +
                '<div class="gls-wf-row">' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Term Name (EN)</label>' +
                        '<input id="gwf-name-en" type="text" class="gls-wf-input gwf-editable" readonly>' +
                    '</div>' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label gls-wf-lbl-ar">\u0627\u0633\u0645 \u0627\u0644\u0645\u0635\u0637\u0644\u062d</label>' +
                        '<input id="gwf-name-ar" type="text" class="gls-wf-input gls-wf-rtl gwf-editable" dir="rtl" readonly>' +
                    '</div>' +
                '</div>' +

                /* meta row: read-only identifiers */
                '<div class="gls-wf-row gls-wf-row-3">' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Term Ref</label>' +
                        '<input id="gwf-termref" type="text" class="gls-wf-input gls-wf-readonly" readonly>' +
                    '</div>' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Parent Ref</label>' +
                        '<select id="gwf-parentref" class="gls-wf-input gwf-editable-select" disabled>' +
                            '<option value="">Loading...</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Source</label>' +
                        '<input id="gwf-source" type="text" class="gls-wf-input gwf-editable" readonly>' +
                    '</div>' +
                '</div>' +

                /* definitions */
                '<div class="gls-wf-row">' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Definition (EN)</label>' +
                        '<textarea id="gwf-def-en" class="gls-wf-textarea gwf-editable" readonly></textarea>' +
                    '</div>' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label gls-wf-lbl-ar">\u0627\u0644\u062a\u0639\u0631\u064a\u0641</label>' +
                        '<textarea id="gwf-def-ar" class="gls-wf-textarea gls-wf-rtl gwf-editable" dir="rtl" readonly></textarea>' +
                    '</div>' +
                '</div>' +

                /* justification + use */
                '<div class="gls-wf-row">' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Justification</label>' +
                        '<textarea id="gwf-justification" class="gls-wf-textarea gwf-editable" readonly></textarea>' +
                    '</div>' +
                    '<div class="gls-wf-field">' +
                        '<label class="gls-wf-label">Use</label>' +
                        '<select id="gwf-use" class="gls-wf-input gwf-editable-select" disabled>' +
                            '<option value="">-- Select Use --</option>' +
                            '<option value="Data Collection">Data Collection</option>' +
                            '<option value="Data Analysis and Dissemination">Data Analysis and Dissemination</option>' +
                            '<option value="Policy and Regulation">Policy and Regulation</option>' +
                            '<option value="Other">Other</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
            '</div>' +


            /* error / success message area */
            '<div id="gls-wf-msg" class="gls-wf-msg" style="display:none"></div>' +

        '</div>';

    /* ── Fill card fields from data object ──────────────────── */
    function fillCard(wrap, d) {
        function set(id, val) {
            var el = wrap.querySelector('#' + id);
            if (!el) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.value = val || '';
            } else {
                el.textContent = val || '';
            }
        }

        /* heading */
        var title = wrap.querySelector('#gls-wf-title');
        if (title) {
            title.textContent = (d.request_type === 'UPDATE')
                ? 'Update Requested in Glossary'
                : 'New Term Requested in Glossary';
        }

        set('gwf-name-en',   d.name_en);
        set('gwf-name-ar',   d.name_ar);
        set('gwf-termref',   d.term_ref);
        /* gwf-parentref is a select — value set after GET_PARENT_TERMS loads options */
        set('gwf-source',        d.source);
        set('gwf-def-en',        d.def_en);
        set('gwf-def-ar',        d.def_ar);
        set('gwf-justification', d.justification);
        set('gwf-use',           d.use);
        set('gwf-subby',     d.submitted_by);
        set('gwf-subon',     d.submitted_on);
    }

    /* ── Collect editable field values from card ────────────── */
    function collectCardData(wrap) {
        function val(id) {
            var el = wrap.querySelector('#' + id);
            return el ? el.value.trim() : '';
        }
        return {
            landing_id:  _landingId,
            glossary_id: _data ? _data.glossary_id : null,
            term_ref:    _data ? _data.term_ref    : '',
            parent_ref:  val('gwf-parentref'),
            name_en:     val('gwf-name-en'),
            name_ar:     val('gwf-name-ar'),
            def_en:        val('gwf-def-en'),
            def_ar:        val('gwf-def-ar'),
            source:        val('gwf-source'),
            justification: val('gwf-justification'),
            use:           val('gwf-use')
        };
    }

    /* ── Show inline message ────────────────────────────────── */
    function showMsg(wrap, type, text) {
        var el = wrap.querySelector('#gls-wf-msg');
        if (!el) return;
        el.className  = 'gls-wf-msg gls-wf-msg-' + type;
        el.textContent = text;
        el.style.display = '';
    }

    function hideMsg(wrap) {
        var el = wrap.querySelector('#gls-wf-msg');
        if (el) el.style.display = 'none';
    }

    /* ── Switch to EDIT mode ────────────────────────────────── */
    function enterEditMode(wrap) {
        wrap.querySelectorAll('.gwf-editable').forEach(function (f) {
            f.readOnly = false;
        });
        var btn = wrap.querySelector('#gls-wf-edit');
        if (btn) {
            btn.textContent = 'Save Changes';
            btn.classList.remove('gls-wf-edit-btn');
            btn.classList.add('gls-wf-save-btn');
            btn.dataset.mode = 'save';
        }
        wrap.querySelectorAll('.gwf-editable-select').forEach(function (f) { f.disabled = false; });
        wrap.classList.add('gls-wf-editing');
        hideMsg(wrap);
        /* focus first editable */
        var first = wrap.querySelector('.gwf-editable');
        if (first) first.focus();
    }

    /* ── Switch back to VIEW mode ───────────────────────────── */
    function enterViewMode(wrap) {
        wrap.querySelectorAll('.gwf-editable').forEach(function (f) {
            f.readOnly = true;
        });
        var btn = wrap.querySelector('#gls-wf-edit');
        if (btn) {
            btn.textContent = 'Edit';
            btn.classList.remove('gls-wf-save-btn');
            btn.classList.add('gls-wf-edit-btn');
            btn.dataset.mode = 'edit';
            btn.disabled = false;
        }
        wrap.querySelectorAll('.gwf-editable-select').forEach(function (f) { f.disabled = true; });
        wrap.classList.remove('gls-wf-editing');
    }

    /* ── Save changes via Ajax ──────────────────────────────── */
    function saveChanges(wrap) {
        var payload = collectCardData(wrap);

        if (!payload.name_en) {
            showMsg(wrap, 'error', 'Term Name (EN) is required.');
            return;
        }

        var btn = wrap.querySelector('#gls-wf-edit');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

        apex.server.process(
            'SAVE_WF_TERM_JSON',
            { x01: JSON.stringify(payload) },
            {
                dataType: 'text',
                success: function (raw) {
                    var result;
                    try { result = JSON.parse(raw); } catch (e) { result = { status: 'error' }; }

                    if (result.status === 'ok') {
                        /* update local cache so re-entering edit shows saved values */
                        _data.parent_ref    = payload.parent_ref;
                        _data.name_en       = payload.name_en;
                        _data.name_ar       = payload.name_ar;
                        _data.def_en        = payload.def_en;
                        _data.def_ar        = payload.def_ar;
                        _data.source        = payload.source;
                        _data.justification = payload.justification;
                        _data.use           = payload.use;

                        enterViewMode(wrap);
                        showMsg(wrap, 'success', '\u2713 Changes saved successfully.');
                    } else {
                        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
                        showMsg(wrap, 'error', result.message || 'Save failed. Please try again.');
                    }
                },
                error: function (xhr) {
                    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
                    showMsg(wrap, 'error', xhr.responseText || 'Network error. Please try again.');
                }
            }
        );
    }

    /* ── Load & render the card ─────────────────────────────── */
    function loadCard(wrap, workflowProcessId) {
        _workflowId = workflowProcessId;

        /* show loading state */
        wrap.innerHTML =
            '<div class="gls-wf-loading">' +
                '<div class="gls-wf-spinner"></div>' +
                '<span>Loading request details\u2026</span>' +
            '</div>';

        apex.server.process(
            'GET_WF_TERM_JSON',
            { x01: String(workflowProcessId) },
            {
                dataType: 'text',
                success: function (raw) {
                    var d;
                    try { d = JSON.parse(raw); } catch (e) {
                        wrap.innerHTML =
                            '<div class="gls-wf-error">Failed to parse server response.</div>';
                        return;
                    }

                    if (d.status === 'error') {
                        wrap.innerHTML =
                            '<div class="gls-wf-error">' + (d.message || 'Error loading data.') + '</div>';
                        return;
                    }

                    /* store resolved landing_id returned by callback */
                    _landingId = d.landing_id;
                    _data = d;

                    /* render card */
                    wrap.innerHTML = WF_CARD_HTML;
                    fillCard(wrap, d);

                    /* populate parent ref dropdown */
                    apex.server.process('GET_PARENT_TERMS', {}, {
                        dataType: 'text',
                        success: function (raw) {
                            var parents;
                            try { parents = JSON.parse(raw); } catch (e) { return; }
                            var sel = wrap.querySelector('#gwf-parentref');
                            if (!sel) return;
                            sel.innerHTML = '<option value="">-- Select Parent --</option>';
                            parents.forEach(function (p) {
                                var opt = document.createElement('option');
                                opt.value = p.ref;
                                opt.textContent = p.label;
                                if (p.ref === d.parent_ref) opt.selected = true;
                                sel.appendChild(opt);
                            });
                        }
                    });

                    /* bind Edit / Save button */
                    var btn = wrap.querySelector('#gls-wf-edit');
                    if (btn) {
                        btn.dataset.mode = 'edit';
                        btn.addEventListener('click', function () {
                            if (btn.dataset.mode === 'edit') {
                                enterEditMode(wrap);
                            } else {
                                saveChanges(wrap);
                            }
                        });
                    }
                },
                error: function (xhr) {
                    wrap.innerHTML =
                        '<div class="gls-wf-error">' +
                        (xhr.responseText || 'Failed to load request details.') +
                        '</div>';
                }
            }
        );
    }

    /* ── Public init — call from "Execute when Page Loads" ───── */
    function init() {
        var wrap = document.getElementById('gls-wf-content');
        if (!wrap) return;

        /* reads P76_WORKFLOW_PROCESS_ID substituted into data-workflow-id */
        var wfProcessId = wrap.getAttribute('data-workflow-id');
        if (!wfProcessId || wfProcessId === '0' || wfProcessId === '') {
            wrap.innerHTML =
                '<div class="gls-wf-error">No workflow process ID found. ' +
                'Ensure data-workflow-id is set to &amp;P76_WORKFLOW_PROCESS_ID. ' +
                'on #gls-wf-content.</div>';
            return;
        }

        loadCard(wrap, wfProcessId);
    }

    return { init: init };

}());
