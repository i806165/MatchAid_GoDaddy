<?php
// /public_html/app/game_scorecards/scorecards_view.php
?>
<section class="maControlArea" id="scControls" aria-label="Scorecard controls">
  <div class="maControlArea__left">
    <button type="button" class="btn btnSecondary" id="scPrintBtn">Print</button>
  </div>

  <div class="maControlArea__right">
    <div class="maPills" id="scMetaPills" aria-label="Game meta">
      <span class="maPill" id="scPillPlayers">Players: —</span>
      <span class="maPill" id="scPillHoles">Holes: —</span>
      <span class="maPill" id="scPillHC">HC: —</span>
    </div>
  </div>
</section>

<div class="maCards" id="scCards">
  <section class="maCard" id="scHostCard" aria-label="Scorecards">
    <header class="maCard__hdr">
      <div class="maCard__title">SCORECARDS</div>
      <div class="maCard__actions">
        <span class="maHint" id="scHint">Preview below. Print for best results.</span>
      </div>
    </header>
    <div class="maCard__body">
      <div id="scHost" class="scHost" aria-label="Scorecard pages"></div>
      <div id="scEmpty" class="maEmpty" style="display:none;">No scorecards available.</div>
    </div>
  </section>
</div>
