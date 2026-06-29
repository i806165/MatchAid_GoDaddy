<?php
// /public_html/app/event_roster/eventroster_view.php
// Pure markup only — no business logic.
// Two-panel layout mirroring gameplayers_view.php structure exactly.
?>

<div class="maPanels maPanels--2">

  <!-- LEFT: Tray — enrollment sources -->
  <section class="maPanel maPanel--secondary erTrayPanel" aria-label="Add players tray">
    <header class="maPanel__hdr">
      <div class="erPanelHdr">
        <div class="erPanelHdr__title">Add Players</div>
        <div class="erPanelHdr__actions">
          <span id="erTrayCount"></span>
        </div>
      </div>
    </header>

    <!-- Tab strip — separate element so module mount() never wipes it -->
    <div id="erTrayTabs" class="erTrayTabs"></div>
    <div class="maPanel__controls" id="erTrayControls"></div>
    <div class="maPanel__body"     id="erTrayBody"></div>
    <footer class="maPanel__ftr"   id="erTrayFtr"></footer>
  </section>

  <!-- RIGHT: Canvas — enrolled event roster -->
  <section class="maPanel maPanel--primary erCanvasPanel" aria-label="Event roster">
    <header class="maPanel__hdr">
      <div class="erPanelHdr">
        <div class="erPanelHdr__title">Event Roster</div>
        <div class="erPanelHdr__actions">
          <span id="erRosterCount"></span>
        </div>
      </div>
    </header>

    <div class="maPanel__controls" id="erCanvasControls"></div>
    <div class="maPanel__body"     id="erRosterBody"></div>
    <footer class="maPanel__ftr"   id="erRosterFooter"></footer>
  </section>

</div>
