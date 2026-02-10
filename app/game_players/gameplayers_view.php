<?php declare(strict_types=1); ?>
<section id="gpBody" class="gpBody" aria-live="polite"></section>

<div id="gpTeeOverlay" class="maModalOverlay" aria-hidden="true">
  <div class="maModal" role="dialog" aria-modal="true" aria-labelledby="gpTeeTitle">
    <div class="maModal__hdr">
      <div class="gpTeeHdrText">
        <div id="gpTeeTitle" class="maModal__title">Select Tee</div>
        <div id="gpTeeSubTitle" class="gpTeeSubTitle"></div>
      </div>
      <button type="button" id="gpTeeCancel" class="btn btnSecondary gpTeeCancelBtn">Cancel</button>
    </div>
    <div class="maModal__body">
      <div id="gpTeeStatus" class="maInlineAlert" style="display:none;"></div>
      <div id="gpTeeRows"></div>
    </div>
  </div>
</div>
