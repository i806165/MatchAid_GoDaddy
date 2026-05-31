<?php
// /public_html/app/club_home/clubhome_view.php
// Pure structure — no logic. JS hydrates all IDs from window.__INIT__.
?>

<!-- ============================================================
     CONTROLS BAND — Single facility element
     States managed by JS:
       - Zero/single: read-only chip (no button)
       - Multiple/00000: chip + Change button → opens modal
       - No access: lock message
     ============================================================ -->
<div class="maControlArea" id="chControls" aria-label="Club Admin Controls">
  <div class="chFacilityBar" id="chFacilityBar">

    <!-- Building icon — always visible -->
    <svg class="chFacilityIcon" viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18M3 9h6M3 15h6M15 9h6M15 15h6"/>
    </svg>

    <!-- Facility name — JS sets textContent -->
    <span class="chFacilityName" id="chFacilityName">—</span>

    <!-- Change button — JS shows/hides based on canSelectFacility -->
    <button type="button" class="btn btnSecondary chFacilityChangeBtn"
            id="chFacilityChangeBtn" style="display:none;">
      Change
    </button>

  </div>
</div>

<!-- ============================================================
     FACILITY PICKER MODAL
     ============================================================ -->
<div id="chFacilityModal" class="maModalOverlay" aria-hidden="true" style="display:none;">
  <section class="maModal" role="dialog" aria-modal="true"
           aria-label="Select Facility" style="max-width:400px;">

    <header class="maModal__hdr">
      <div class="maModal__title">Select Facility</div>
      <button type="button" class="iconBtn" id="chModalClose" aria-label="Close">✕</button>
    </header>

    <div class="maModal__body">
      <div class="maInputWrap" style="margin-bottom:10px;">
        <input type="text" class="maTextInput" id="chModalSearch"
               placeholder="Search facilities…" autocomplete="off" />
      </div>
      <div class="chModalList" id="chModalList"></div>
    </div>

    <footer class="maModal__ftr">
      <button type="button" class="btn btnSecondary" id="chModalCancel">Cancel</button>
    </footer>

  </section>
</div>

<!-- ============================================================
     MAIN PAGE BODY
     ============================================================ -->
<main class="maPage" role="main" id="chPage">

  <!-- Welcome card -->
  <section class="maCard chWelcomeCard" aria-label="Club Admin Welcome">
    <header class="maCard__hdr">
      <div class="maCard__title">CLUB ADMINISTRATION</div>
    </header>
    <div class="maCard__body">
      <p class="chWelcomeText">
        Welcome to the Club Admin portal. Use the tools below to monitor
        member participation, game demand, and tee-time utilization across
        your club.
      </p>
    </div>
  </section>

  <!-- Tool tiles — disabled until facility confirmed -->
  <div class="chTileGrid">

    <button type="button" class="chTile chTile--disabled" id="chTileDemand">
      <div class="chTile__icon" aria-hidden="true">📊</div>
      <div class="chTile__body">
        <div class="chTile__title">Demand Report</div>
        <div class="chTile__sub">Game participation and player activity by date range.</div>
      </div>
      <div class="chTile__arrow" aria-hidden="true">›</div>
    </button>

    <button type="button" class="chTile chTile--disabled" id="chTileUsers">
      <div class="chTile__icon" aria-hidden="true">👥</div>
      <div class="chTile__body">
        <div class="chTile__title">Club Users</div>
        <div class="chTile__sub">Registered users and their contact preferences.</div>
      </div>
      <div class="chTile__arrow" aria-hidden="true">›</div>
    </button>

    <div class="chTile chTile--disabled" aria-disabled="true">
      <div class="chTile__icon" aria-hidden="true">📅</div>
      <div class="chTile__body">
        <div class="chTile__title">Tee-Time Utilization</div>
        <div class="chTile__sub">Coming soon.</div>
      </div>
    </div>

  </div>

</main>