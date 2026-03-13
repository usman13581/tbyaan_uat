/**
 * Access Matrix Groups - Page Level JavaScript
 * Page: P275
 *
 * No APEX page items used.
 * All state is managed client-side.
 * Departments and Sections are pre-rendered and filtered by JS.
 */

var AMG = (function () {

  // Internal state — one entry per region
  var _state = {
    sector    : { id: null },
    department: { id: null },
    section   : { id: null },
    grouptype : { id: null }
  };

  /* ──────────────────────────────────────────────────────────
     selectItem(el)
     Called by onclick on every <li>.
  ────────────────────────────────────────────────────────── */
  function selectItem(el) {
    var region = el.getAttribute('data-region');
    var id     = el.getAttribute('data-id');

    // Deselect siblings in the same list
    var list = el.closest('.amg-list');
    if (list) {
      list.querySelectorAll('.amg-item.selected').forEach(function (item) {
        item.classList.remove('selected');
      });
    }

    el.classList.add('selected');
    _state[region].id = id;

    // Cascade on sector selection → filter departments, reset section
    if (region === 'sector') {
      _filterChildren('department', id);
      _clearRegion('section');
      _clearRegion('department');
    }

    // Cascade on department selection → filter sections, reset section selection
    if (region === 'department') {
      _filterChildren('section', id);
      _clearRegion('section');
    }

    _buildGroupCode();
  }

  /* ──────────────────────────────────────────────────────────
     _filterChildren(region, parentId)
     Shows only items whose data-parent-id matches parentId.
     Items with data-parent-id="*" are always shown (no-assign rows).
     Unlocks the region panel.
  ────────────────────────────────────────────────────────── */
  function _filterChildren(region, parentId) {
    var list = document.getElementById('amg-' + region + '-list');
    if (!list) return;

    list.querySelectorAll('.amg-item').forEach(function (item) {
      var pid = item.getAttribute('data-parent-id');
      if (pid === '*' || pid === String(parentId)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });

    // Unlock the region
    var region_el = document.getElementById('amg-' + region + '-region');
    if (region_el) {
      region_el.classList.remove('is-locked');
    }
  }

  /* ──────────────────────────────────────────────────────────
     _clearRegion(region)
     Removes selection highlight and resets state.
     Does NOT hide the items (that is done by _filterChildren).
  ────────────────────────────────────────────────────────── */
  function _clearRegion(region) {
    _state[region].id = null;

    var list = document.getElementById('amg-' + region + '-list');
    if (list) {
      list.querySelectorAll('.amg-item.selected').forEach(function (item) {
        item.classList.remove('selected');
      });
    }
  }

  /* ──────────────────────────────────────────────────────────
     _lockRegion(region)
     Hides all items and re-locks the panel.
  ────────────────────────────────────────────────────────── */
  function _lockRegion(region) {
    _clearRegion(region);

    var list = document.getElementById('amg-' + region + '-list');
    if (list) {
      list.querySelectorAll('.amg-item').forEach(function (item) {
        item.style.display = 'none';
      });
    }

    var region_el = document.getElementById('amg-' + region + '-region');
    if (region_el) {
      region_el.classList.add('is-locked');
    }
  }

  /* ──────────────────────────────────────────────────────────
     _buildGroupCode()
     Combines 4 IDs: SECTOR-DEPARTMENT-SECTION-GROUPTYPE
  ────────────────────────────────────────────────────────── */
  function _buildGroupCode() {
    var s  = _state.sector.id;
    var d  = _state.department.id;
    var sc = _state.section.id;
    var g  = _state.grouptype.id;

    var codeEl = document.getElementById('amg-code-value');
    var saveBtn = document.getElementById('amg-save-btn');

    if (s && d !== null && sc !== null && g) {
      var code = s + '-' + d + '-' + sc + '-' + g;

      if (codeEl) {
        codeEl.textContent = code;
        codeEl.classList.remove('is-empty');
      }
      if (saveBtn) saveBtn.disabled = false;

    } else {
      if (codeEl) {
        codeEl.textContent = 'Select all 4 nodes to generate code...';
        codeEl.classList.add('is-empty');
      }
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  /* ──────────────────────────────────────────────────────────
     resetAll()
     Resets all selections and re-locks dependent regions.
  ────────────────────────────────────────────────────────── */
  function resetAll() {
    _clearRegion('sector');
    _lockRegion('department');
    _lockRegion('section');
    _clearRegion('grouptype');
    _buildGroupCode();
  }

  /* ──────────────────────────────────────────────────────────
     save()
     Placeholder — wire this to your APEX process or DA.
  ────────────────────────────────────────────────────────── */
  function save() {
    var codeEl = document.getElementById('amg-code-value');
    if (!codeEl || codeEl.classList.contains('is-empty')) return;

    var code = codeEl.textContent.trim();
    console.log('AMG: Saving group code →', code);

    // Example: call an APEX process via ajax
    // apex.server.process('SAVE_GROUP', { x01: code }, {
    //   success: function(data) { apex.message.showPageSuccess('Group saved: ' + code); },
    //   error:   function(err)  { apex.message.showErrors([{ type: 'error', message: 'Save failed.' }]); }
    // });
  }

  /* ──────────────────────────────────────────────────────────
     init()
     Bind click events and lock dependent regions on load.
  ────────────────────────────────────────────────────────── */
  function init() {
    // Delegate clicks on all list items
    document.addEventListener('click', function (e) {
      var item = e.target.closest('.amg-item');
      if (item) selectItem(item);
    });

    // Lock regions 2 and 3 at start
    _lockRegion('department');
    _lockRegion('section');

    _buildGroupCode();
    console.log('AMG: Initialized.');
  }

  /* ──────────────────────────────────────────────────────────
     Public API
  ────────────────────────────────────────────────────────── */
  return {
    selectItem: selectItem,
    resetAll  : resetAll,
    save      : save,
    init      : init,
    getState  : function () { return _state; },
    getCode   : function () {
      var el = document.getElementById('amg-code-value');
      return el && !el.classList.contains('is-empty') ? el.textContent.trim() : null;
    }
  };

})();

// Auto-initialize
apex.jQuery(document).on('apexreadyend', function () {
  AMG.init();
});
