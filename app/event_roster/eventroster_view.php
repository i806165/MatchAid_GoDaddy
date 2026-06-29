<?php
// /public_html/app/event_roster/event_roster_view.php
// Pure markup only — no business logic.
// Two-panel layout per spec §10.4.
?>

<div class="erPage">

  <!-- LEFT: Tray — enrollment sources -->
  <section class="erTrayPanel maPanel" aria-label="Add players tray">

    <header class="maPanel__hdr">
      <div class="maPanel__title">Add Players</div>
      <span class="maPanel__count" id="erTrayCount"></span>
    </header>

    <!-- Tab strip — separate element so module mount() never wipes it -->
    <div id="erTrayTabs" class="erTrayTabs"></div>

    <div class="maPanel__controls" id="erTrayControls"></div>
    <div class="maPanel__body"     id="erTrayBody"></div>
    <div class="maPanel__ftr"      id="erTrayFtr"></div>

  </section>

  <!-- RIGHT: Canvas — enrolled event roster -->
  <section class="erCanvasPanel maPanel" aria-label="Event roster">

    <header class="maPanel__hdr">
      <div class="maPanel__title">Event Roster</div>
      <span class="maPanel__count" id="erRosterCount"></span>
    </header>

    <div class="maPanel__controls" id="erCanvasControls"></div>
    <div class="maPanel__body"     id="erRosterBody"></div>
    <div class="maPanel__ftr"      id="erRosterFooter"></div>

  </section>

</div>
