<?php
// /includes/eventSettingsMenuRows.php
// Row catalog for module_menuEventSettings.js.
// Clone of gameSettingsMenuRows.php — same relationship to
// module_menuEventSettings.js that gameSettingsMenuRows.php has to
// module_menuGameSettings.js. See that file's header for the full
// division of responsibility (this file owns names/order/icons only;
// the module owns behavior).
//
// Four rows: only "placementPoints" opens a new module
// (module_setEventPlacementPoints.js). "handicaps", "teams", and
// "flights" open the SAME modules the Game menu already uses, with
// target: "event" instead of "game" — no new modules for those three.
//
// No CSS classes below — this container is never displayed directly
// (hidden). Rows built from it use ma_shared.css's existing
// .maListRow/.maListRow__avatar/.maListRow__col/.maListRow__subline/
// .maHubRow__arrow, same as the Game version.
//
// Include this anywhere module_menuEventSettings.js may be opened from.
?>
<div id="esMenuRowCatalog" hidden>

  <div data-setting="placementPoints" data-label="Event Competition &amp; Placement Points" data-category="setup">
    <img src="/assets/images/nav-event.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="handicaps" data-label="Setup Handicapping" data-category="setup">
    <img src="/assets/images/nav-handicaps.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="teams" data-label="Divide Roster into Teams" data-category="roster">
    <img src="/assets/images/nav-players.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

  <div data-setting="flights" data-label="Separate Roster into Flights" data-category="roster">
    <img src="/assets/images/nav-flights.png" alt="" width="34" height="34" style="display:block; object-fit:contain;">
  </div>

</div>
