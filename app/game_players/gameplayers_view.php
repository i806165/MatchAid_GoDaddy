<?php
// /public_html/app/game_players/gameplayers_view.php
// Pure markup only (no business logic).

?>

<div class="gpShell gpShell--body">
  <div id="gpBody" class="gpBody maPanel__body" style="padding:0;"></div>
</div>

<div id="maTeeOverlay" class="maModalOverlay" aria-hidden="true">
  <div class="maModal" role="dialog" aria-modal="true">
    <header class="maModal__hdr">
      <div class="maModal__titles">
        <div class="maModal__title">Select Tee</div>
        <div id="maTeeSubTitle" class="maModal__subtitle"></div>
      </div>
      <button id="maTeeCancel" class="iconBtn btnPrimary" type="button" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>
    <div class="maModal__body">
      <div id="maTeeRows" class="maCards"></div>
    </div>
  </div>
</div>