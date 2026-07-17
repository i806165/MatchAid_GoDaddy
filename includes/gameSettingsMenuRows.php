<?php
// /includes/gameSettingsMenuRows.php
// Row catalog for module_menuGameSettings.js.
//
// Same split as chromeFooter.php's bottom nav: names, order, and icons live
// here as plain markup. module_menuGameSettings.js reads this DOM at
// render time (querySelectorAll('[data-setting]'), read data-label and the
// icon child's outerHTML) the same way MA.chrome._buildHubRows() reads
// #chromeBottomNav — it does not own row content, only behavior (per-row
// summary computation from live game state, and which module opens).
//
// No CSS classes below — this container is never displayed directly
// (hidden), so it needs no styling of its own. The rows the module builds
// from it use ma_shared.css's existing .maListRow/.maListRow__avatar/
// .maListRow__col/.maListRow__subline/.maHubRow__arrow, same as before.
//
// Include this anywhere module_menuGameSettings.js may be opened from —
// same requirement as chromeFooter.php already has for chromeBottomNav.
?>
<div id="gsMenuRowCatalog" hidden>

  <div data-setting="format" data-label="Game Format" data-category="setup">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h14M3 10h14M3 14h9"/></svg>
  </div>

  <div data-setting="segments" data-label="Segments" data-category="setup">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="4.5" height="14" rx="1"/><rect x="8.75" y="3" width="4.5" height="14" rx="1"/><rect x="14.5" y="3" width="2.5" height="14" rx="1"/></svg>
  </div>

  <div data-setting="blindPlayer" data-label="Blind Player" data-category="setup">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10s2.8-5 8-5 8 5 8 5-2.8 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2.2"/></svg>
  </div>

  <div data-setting="scoring" data-label="Scoring" data-category="setup">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.4"/></svg>
  </div>

  <div data-setting="placementPoints" data-label="Placement Points" data-category="roster">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v3a4 4 0 0 1-8 0V3Z"/><path d="M10 10v3M7.5 16.5h5M8 16.5v-2.2h4v2.2"/></svg>
  </div>

  <div data-setting="handicaps" data-label="Handicaps" data-category="roster">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M15 5 5 15"/><circle cx="6.2" cy="6.2" r="1.6"/><circle cx="13.8" cy="13.8" r="1.6"/></svg>
  </div>

  <div data-setting="teams" data-label="Teams" data-category="roster">
    <img src="/assets/nav_users.png" alt="" width="17" height="17" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="flights" data-label="Flights" data-category="roster">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 13h14M5 13 9 5M13 5l4 8"/></svg>
  </div>

</div>
