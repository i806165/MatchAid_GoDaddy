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

  <div data-setting="format" data-label="Setup the Game Format" data-category="setup">
    <img src="/assets/images/nav-format.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="segments" data-label="Segmenting Play (6's) & Partner Rotation " data-category="setup">
    <img src="/assets/images/nav-segments.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="handicaps" data-label="Setup Handicapping" data-category="setup">
      <img src="/assets/images/nav-handicaps.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="scoring" data-label="Methods for Scoring" data-category="setup">
    <img src="/assets/images/nav-bullseye.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="placementPoints" data-label="Place Winning and Awards" data-category="setup">
      <img src="/assets/images/nav-event.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="blindPlayer" data-label="Setup Blind Player" data-category="roster">
    <img src="/assets/images/nav-eye.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="teams" data-label="Divide Roster into Teams" data-category="roster">
    <img src="/assets/images/nav-players.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="flights" data-label="Separate Roster into Flights" data-category="roster">
    <img src="/assets/images/nav-flights.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

</div>
