<?php
// /public_html/app/game_players/gameplayers_view.php
// Pure markup only (no business logic).
?>

<div class="maPanels maPanels--2">

  <!-- LEFT: Tray — Add Players source panel -->
  <section class="maPanel maPanel--secondary gpTrayPanel" aria-label="Add players tray">
    <header class="maPanel__hdr">
      <div class="gpPanelHdr">
        <div class="gpPanelHdr__title">Add Players</div>
        <div class="gpPanelHdr__actions">
          <span class="gpCount" id="gpTrayCount"></span>
        </div>
        <div class="gpPanelHdr__left gpMobileCloseBtn">
          <button class="iconBtn btnSecondary" type="button" aria-label="Close Tray">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>
    <div class="maPanel__controls" id="gpTrayControls"></div>
    <div class="maPanel__body" id="gpTrayBody"></div>
    <footer class="maPanel__ftr"></footer>
  </section>

  <!-- RIGHT: Canvas — Roster, always visible -->
  <section class="maPanel maPanel--primary" aria-label="Roster canvas">
    <header class="maPanel__hdr">
      <div class="gpPanelHdr">
        <div class="gpPanelHdr__title">Roster</div>
        <div class="gpPanelHdr__actions">
          <span class="gpCount" id="gpRosterCount"></span>
        </div>
      </div>
    </header>
    <div class="maPanel__controls" id="gpCanvasControls"></div>
    <div class="maPanel__body" id="gpRosterBody"></div>
    <footer class="maPanel__ftr">
      <div class="gpFooter gpFooter--canvas">
        <div class="gpFooter__left" id="gpRosterFooterLeft"></div>
        <button class="gsMobileAddPlayingGroupBtn" id="gpBtnTrayOpen" type="button">
          + Add Players
        </button>
      </div>
    </footer>
  </section>

</div>

<!-- Tee Selection Modal — untouched -->
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