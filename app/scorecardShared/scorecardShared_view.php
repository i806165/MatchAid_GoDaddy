<?php
// shared view for Player / Group / Game Scorecards
?>
<div class="maCards" id="scCards">
  <section class="maCard" id="scHostCard" aria-label="<?= htmlspecialchars($pageCardTitle ?? 'Scorecards') ?>">
    <header class="maCard__hdr">
      <div class="maCard__title"><?= htmlspecialchars(strtoupper($pageCardTitle ?? 'Scorecards')) ?></div>
      <div class="maCard__actions">
        <span class="maHint" id="scHint">Toggle values and expand details below.</span>
      </div>
    </header>
    <div class="maCard__body">
      <div id="scControls" class="maControlArea"></div>
      <div id="scHost" class="scHost scHost--browser" aria-label="Scorecard pages"></div>
      <div id="scEmpty" class="maEmpty" style="display:none;">No scorecards available.</div>
    </div>
  </section>
</div>
