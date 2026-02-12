<?php
// /public_html/app/game_pairings/gamepairings_controls.php
// Controls band: primary tabs + quick actions.
?>

<div class="maSegWrap" id="gpTabs" role="tablist" aria-label="Pairings tabs">
  <button class="maSegBtn is-active" type="button" data-tab="pair" role="tab" aria-selected="true">Pair Players</button>
  <button class="maSegBtn" type="button" data-tab="match" role="tab" aria-selected="false" id="gpTabMatch">Match Pairings</button>

  <div class="gpControls__spacer"></div>

  <!-- Mobile tray toggle (opens drawer) -->
  <button class="maBtn maBtn--ghost" type="button" id="gpBtnTray">Tray</button>
</div>
