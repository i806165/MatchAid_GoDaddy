<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>

<!-- CONTROLS BAND (pinned while the page body scrolls; hidden until launched).
     Hole navigation, plus the Scores | Side Bets switch when the game has side
     bets on. The switch host is a plain wrapper so [hidden] wins — .maSeg sets
     display:flex and would override [hidden] on itself. -->
<div class="maControlArea isHidden" id="scoreControlArea" role="region" aria-label="Score entry controls">
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
</div>

<main class="maPage" role="main">
  <div class="scoreEntryShell" id="scoreEntryRoot">
    <section class="scoreEntryWork" id="scoreEntryWork">
      <section class="maCard scoreCollectorCard" id="scoreScoresView">
        <div class="maCard__body scoreCollectorBody">
          <div id="scoreRowsContainer" class="scoreRows"></div>
        </div>
      </section>

      <section id="scoreSideBetsView" hidden>
        <div id="scoreSideBetsBody"></div>
      </section>
    </section>
  </div>
</main>
