<?php
// /public_html/app/club_home/clubhome_view.php
// Pure structure — no logic. JS hydrates all IDs from window.__INIT__.
?>

<!-- ============================================================
     CONTROLS BAND — Facility picker
     JS shows exactly one of:
       #chFacilityChip     (single facility — read-only)
       #chFacilityDropdown (multiple facilities — select)
       #chFacilitySearch   (site admin 00000 — search)
       #chFacilityNone     (no roles — unauthorized message)
     All start hidden; JS reveals the correct one on boot.
     ============================================================ -->
<div class="maControlArea" id="chControls" aria-label="Club Admin Controls">

  <!-- Single facility chip (read-only) -->
  <div class="chFacilityWrap" id="chFacilityChip" hidden>
    <span class="chFacilityLabel">Facility</span>
    <div class="chFacilityChip" id="chFacilityChipName"></div>
  </div>

  <!-- Multiple facilities dropdown -->
  <div class="chFacilityWrap" id="chFacilityDropdown" hidden>
    <span class="chFacilityLabel">Select facility</span>
    <select class="maTextInput chFacilitySelect" id="chFacilitySelect"></select>
  </div>

  <!-- Site admin search picker -->
  <div class="chFacilityWrap" id="chFacilitySearch" hidden>
    <span class="chFacilityLabel">Search for a facility</span>
    <div class="chSearchWrap">
      <input type="text" id="chFacilitySearchInput" class="maTextInput chSearchInput"
             placeholder="Type facility name…" autocomplete="off" />
      <button id="chFacilitySearchClear" class="clearBtn isHidden" type="button" aria-label="Clear">×</button>
    </div>
    <div class="chSearchResults" id="chSearchResults" hidden></div>
    <div class="chSelectedBanner" id="chSelectedBanner" hidden>
      <span id="chSelectedBannerName"></span>
    </div>
  </div>

  <!-- No roles — unauthorized -->
  <div class="chFacilityWrap" id="chFacilityNone" hidden>
    <div class="chNoAccess">
      No facility access is configured for your account. Contact your administrator.
    </div>
  </div>

</div><!-- /maControlArea -->


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

  <!-- Tool tiles — disabled until facility is confirmed -->
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

    <!-- Placeholder tile -->
    <div class="chTile chTile--disabled" aria-disabled="true">
      <div class="chTile__icon" aria-hidden="true">📅</div>
      <div class="chTile__body">
        <div class="chTile__title">Tee-Time Utilization</div>
        <div class="chTile__sub">Coming soon.</div>
      </div>
    </div>

  </div>

</main>
