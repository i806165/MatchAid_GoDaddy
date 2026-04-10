<?php
// /public_html/app/score_summary/scoresummary_view.php
?>
<div class="maCards" id="ssCards">
  <section class="maCard" id="ssHostCard" aria-label="Score Summary">
    <header class="maCard__hdr">
      <div class="maCard__title">SCORE SUMMARY</div>
      <div class="maCard__actions">
        <span class="ssHint" id="ssHint">Live standings for the current game.</span>
      </div>
    </header>
    <div class="maCard__body">
      <div id="ssHost" class="ssHost" aria-label="Score summary standings"></div>
      <div id="ssEmpty" class="maEmptyState" style="display:none;">No score summary available.</div>
    </div>
  </section>
</div>