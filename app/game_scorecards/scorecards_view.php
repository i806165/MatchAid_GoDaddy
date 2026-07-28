<?php
// /public_html/app/game_scorecards/scorecards_view.php
?>

<div class="maControlArea" id="scControls">
  <span class="maHintText maHintText--lg">Use the Actions Menu to print the scorecards.</span>
</div>

<div class="maCards" id="scCards">
  <section class="maCard" id="scHostCard" aria-label="Scorecards">
    <header class="maCard__hdr maCard__hdr--wrap">
      <div class="maCard__title">SCORECARDS</div>
      <div class="maCard__actions">
        <span class="maHintText" id="scHint">Refresh handicaps from the Actions menu for the most current results.</span>
      </div>
    </header>
    <div class="maCard__body">
      <div id="scHost" class="scHost" aria-label="Scorecard pages"></div>
      <div id="scEmpty" class="maEmpty" style="display:none;">No scorecards available.</div>
    </div>
  </section>
</div>