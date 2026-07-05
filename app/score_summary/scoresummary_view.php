<?php
// /public_html/app/score_summary/scoresummary_view.php
//
// Two full panels, tab-switched (not side-by-side) — see #ssTabs in
// scoresummary.php for the outer Score Summary / Leaderboard toggle.
// Only one of .maPanel--primary / .maPanel--secondary is visible at a time,
// controlled by is-summary-only / is-leaderboard-only on <main> (score_summary.css).
//
// #ssControls (Score Summary's own Match/Gross/Net basis pills) is
// relocated here from its old page-level position, but keeps the exact
// same id — score_summary.js's existing dom.controls rendering needs zero
// changes as a result.
?>

<section class="maPanel maPanel--primary" aria-label="Score Summary">
  <div id="ssControls" class="maControlArea"></div>

  <div class="maCards" id="ssCards">
    <section class="maCard" id="ssHostCard" aria-label="Score Summary">
      <header class="maCard__hdr">
        <div class="maCard__title">SCORE SUMMARY</div>
        <div class="maCard__actions">
          <span class="maHint" id="ssHint">Toggle game, gross, or net standings below.</span>
        </div>
      </header>
      <div class="maCard__body">
        <div id="ssHost" class="ssHost ssHost--browser" aria-label="Score summary standings"></div>
        <div id="ssEmpty" class="maEmpty" style="display:none;">No score summary available.</div>
      </div>
    </section>
  </div>
</section>

<section class="maPanel maPanel--secondary" aria-label="Leaderboard" id="lbPanel">
  <header class="maPanel__hdr">
    <div class="maCard__title">LEADERBOARD</div>
  </header>

  <!-- KPI pills + Aggregate pills, rendered by score_leaderboard.js -->
  <div class="maPanel__controls" id="lbControls"></div>

  <div class="maPanel__body">
    <div id="lbHost" aria-label="Leaderboard standings"></div>
    <div id="lbEmpty" class="maEmpty" style="display:none;">No leaderboard data available.</div>
  </div>
</section>
