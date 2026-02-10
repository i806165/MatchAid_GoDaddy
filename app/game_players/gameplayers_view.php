<?php declare(strict_types=1); ?>
<section id="gpBody" class="gpBody" aria-live="polite"></section>

<div id="gpTeeOverlay" class="maModalOverlay" aria-hidden="true">
  <div class="maModal" role="dialog" aria-modal="true" aria-labelledby="gpTeeTitle">
    <div class="maModal__hdr">
      <div id="gpTeeTitle" class="maModal__title">Select Tee</div>
      <div id="gpTeeSubTitle" class="gpTeeSubTitle"></div>
    </div>
    <div class="maModal__body">
      <div id="gpTeeStatus" class="maInlineAlert" style="display:none;"></div>
      <div id="gpTeeRows"></div>
    </div>
    <div class="maModal__ftr">
      <button type="button" id="gpTeeCancel" class="maBtn maBtn--ghost">Cancel</button>
      <button type="button" id="gpTeeSave" class="maBtn">Save</button>
    </div>
  </div>
</div>
