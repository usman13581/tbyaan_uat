-- ============================================================
-- Access Matrix Groups - Single Dynamic Content Region
-- Region Type : Dynamic Content
-- Source Type : PL/SQL Function Body
-- Static ID   : amg-main-region
--
-- Renders all 4 lists in one go.
-- Departments and Sections are ALL pre-loaded with data-parent-id
-- so JavaScript filters them client-side — no page items needed.
-- ============================================================
DECLARE
  l_html VARCHAR2(32767) := '';
BEGIN

  -- ── Outer wrapper ──────────────────────────────────────────
  l_html := l_html || '<div class="amg-wrapper">';


  -- ════════════════════════════════════════════════════════════
  -- REGION 1 : Sector  (LEVEL_ID = 1)
  -- ════════════════════════════════════════════════════════════
  l_html := l_html || '<div class="amg-region" id="amg-sector-region">';
  l_html := l_html || '  <div class="amg-region-header"><span>Sector</span><span class="amg-badge">1</span></div>';
  l_html := l_html || '  <div class="amg-list-container">';
  l_html := l_html || '    <ul class="amg-list" id="amg-sector-list">';

  FOR r IN (
    SELECT RESPONSIBLE_ID,
           RESPONSIBLE_AR,
           RESPONSIBLE_EN
      FROM sc_sv_metadata.SV_LK_RESPONSIBLE
     WHERE LEVEL_ID = 1
       AND IS_ACTIVE = 1
     ORDER BY RESPONSIBLE_EN
  ) LOOP
    l_html := l_html
      || '<li class="amg-item"'
      || ' data-id="'        || r.RESPONSIBLE_ID                    || '"'
      || ' data-region="sector">'
      || '<span class="amg-item-en">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_EN) || '</span>'
      || '<span class="amg-item-ar">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_AR) || '</span>'
      || '</li>';
  END LOOP;

  l_html := l_html || '    </ul>';
  l_html := l_html || '  </div>'; -- list-container
  l_html := l_html || '</div>';   -- amg-region


  -- ════════════════════════════════════════════════════════════
  -- REGION 2 : Department  (LEVEL_ID = 2)
  -- All departments pre-loaded; JS shows/hides by data-parent-id
  -- ════════════════════════════════════════════════════════════
  l_html := l_html || '<div class="amg-region" id="amg-department-region">';
  l_html := l_html || '  <div class="amg-region-header"><span>Department</span><span class="amg-badge">2</span></div>';
  l_html := l_html || '  <div class="amg-lock-msg">&#128274; Select a Sector first</div>';
  l_html := l_html || '  <div class="amg-list-container">';
  l_html := l_html || '    <ul class="amg-list" id="amg-department-list">';

  -- Fixed "No Department" option — always available regardless of sector
  l_html := l_html
    || '<li class="amg-item amg-no-assign" style="display:none;"'
    || ' data-id="0"'
    || ' data-parent-id="*"'
    || ' data-region="department">'
    || '<span class="amg-item-en">No Department Assigned</span>'
    || '<span class="amg-item-ar"></span>'
    || '</li>';

  FOR r IN (
    SELECT RESPONSIBLE_ID,
           RESPONSIBLE_AR,
           RESPONSIBLE_EN,
           PARENT_ID
      FROM sc_sv_metadata.SV_LK_RESPONSIBLE
     WHERE LEVEL_ID = 2
       AND IS_ACTIVE = 1
     ORDER BY PARENT_ID, RESPONSIBLE_EN
  ) LOOP
    l_html := l_html
      || '<li class="amg-item" style="display:none;"'
      || ' data-id="'        || r.RESPONSIBLE_ID                    || '"'
      || ' data-parent-id="' || r.PARENT_ID                         || '"'
      || ' data-region="department">'
      || '<span class="amg-item-en">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_EN) || '</span>'
      || '<span class="amg-item-ar">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_AR) || '</span>'
      || '</li>';
  END LOOP;

  l_html := l_html || '    </ul>';
  l_html := l_html || '  </div>'; -- list-container
  l_html := l_html || '</div>';   -- amg-region


  -- ════════════════════════════════════════════════════════════
  -- REGION 3 : Section  (LEVEL_ID = 3, RESPONSIBLE_CODE <> 0)
  -- All sections pre-loaded; JS shows/hides by data-parent-id
  -- ════════════════════════════════════════════════════════════
  l_html := l_html || '<div class="amg-region" id="amg-section-region">';
  l_html := l_html || '  <div class="amg-region-header"><span>Section</span><span class="amg-badge">3</span></div>';
  l_html := l_html || '  <div class="amg-lock-msg">&#128274; Select a Department first</div>';
  l_html := l_html || '  <div class="amg-list-container">';
  l_html := l_html || '    <ul class="amg-list" id="amg-section-list">';

  -- Fixed "No Section" option
  l_html := l_html
    || '<li class="amg-item amg-no-assign" style="display:none;"'
    || ' data-id="0"'
    || ' data-parent-id="*"'
    || ' data-region="section">'
    || '<span class="amg-item-en">No Section Assigned</span>'
    || '<span class="amg-item-ar"></span>'
    || '</li>';

  FOR r IN (
    SELECT RESPONSIBLE_ID,
           RESPONSIBLE_AR,
           RESPONSIBLE_EN,
           PARENT_ID
      FROM sc_sv_metadata.SV_LK_RESPONSIBLE
     WHERE LEVEL_ID          = 3
       AND IS_ACTIVE          = 1
       AND RESPONSIBLE_CODE  <> 0
     ORDER BY PARENT_ID, RESPONSIBLE_EN
  ) LOOP
    l_html := l_html
      || '<li class="amg-item" style="display:none;"'
      || ' data-id="'        || r.RESPONSIBLE_ID                    || '"'
      || ' data-parent-id="' || r.PARENT_ID                         || '"'
      || ' data-region="section">'
      || '<span class="amg-item-en">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_EN) || '</span>'
      || '<span class="amg-item-ar">' || APEX_ESCAPE.HTML(r.RESPONSIBLE_AR) || '</span>'
      || '</li>';
  END LOOP;

  l_html := l_html || '    </ul>';
  l_html := l_html || '  </div>'; -- list-container
  l_html := l_html || '</div>';   -- amg-region


  -- ════════════════════════════════════════════════════════════
  -- REGION 4 : Group Type  (AM_LK_GROUP_COMMON, LOOKUP_CODE='AMGT')
  -- ════════════════════════════════════════════════════════════
  l_html := l_html || '<div class="amg-region" id="amg-grouptype-region">';
  l_html := l_html || '  <div class="amg-region-header"><span>Group Type</span><span class="amg-badge">4</span></div>';
  l_html := l_html || '  <div class="amg-list-container">';
  l_html := l_html || '    <ul class="amg-list" id="amg-grouptype-list">';

  FOR r IN (
    SELECT LK_COMMON_ID,
           LOOKUP_NAME_EN
      FROM SC_EDP.AM_LK_GROUP_COMMON
     WHERE LOOKUP_CODE = 'AMGT'
     ORDER BY LOOKUP_NAME_EN
  ) LOOP
    l_html := l_html
      || '<li class="amg-item"'
      || ' data-id="'     || r.LK_COMMON_ID                        || '"'
      || ' data-region="grouptype">'
      || '<span class="amg-item-en">' || APEX_ESCAPE.HTML(r.LOOKUP_NAME_EN) || '</span>'
      || '</li>';
  END LOOP;

  l_html := l_html || '    </ul>';
  l_html := l_html || '  </div>'; -- list-container
  l_html := l_html || '</div>';   -- amg-region


  -- ── Close outer wrapper ────────────────────────────────────
  l_html := l_html || '</div>'; -- amg-wrapper


  -- ── Group Code Output Bar ──────────────────────────────────
  l_html := l_html
    || '<div class="amg-code-bar">'
    || '  <span class="amg-code-label">Group Code:</span>'
    || '  <span class="amg-code-value is-empty" id="amg-code-value">Select all 4 nodes to generate code...</span>'
    || '</div>';


  -- ── Action Buttons ─────────────────────────────────────────
  l_html := l_html
    || '<div class="amg-actions">'
    || '  <button class="amg-btn amg-btn-primary" id="amg-save-btn" disabled onclick="AMG.save()">Save Group</button>'
    || '  <button class="amg-btn amg-btn-secondary" onclick="AMG.resetAll()">Reset</button>'
    || '</div>';

  RETURN l_html;
END;
