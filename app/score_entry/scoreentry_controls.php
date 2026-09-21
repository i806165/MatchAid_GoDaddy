<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_controls.php
// Pinned control area: hole navigation, plus the Scores | Side Bets switch.
// The switch host stays hidden until score_entry.js / MA.scoreSideBets finds
// side bets turned on for the game (it is a plain wrapper so [hidden] wins —
// .maSeg sets display:flex and would override [hidden] on itself).
?>
<div class="scoreHoleNavInner">
  <button id="scorePrevHoleBtn" class="btn btnSecondary" type="button">Prev</button>
  <select id="scoreHoleSelect" class="maTextInput scoreHoleSelect" aria-label="Hole"></select>
  <button id="scoreNextHoleBtn" class="btn btnSecondary" type="button">Next</button>
</div>
<div id="scoreViewTabsHost" class="scoreViewTabs" hidden>
  <div class="maSeg" id="scoreViewTabs" role="tablist" aria-label="Score entry view">
    <button class="maSegBtn is-active" type="button" role="tab" aria-selected="true" data-view="scores" id="scoreTabScores">Scores</button>
    <button class="maSegBtn" type="button" role="tab" aria-selected="false" data-view="sidebets" id="scoreTabSideBets">Side Bets</button>
  </div>
</div>
