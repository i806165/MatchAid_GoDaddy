<?php
// /public_html/app/club_home/clubhome_view.php
// Pure structure — no logic. JS hydrates all IDs from window.MA.paths.
?>

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

  <!-- Tool tiles -->
  <div class="chTileGrid">

    <button type="button" class="chTile" id="chTileDemand">
      <div class="chTile__icon" aria-hidden="true">📊</div>
      <div class="chTile__body">
        <div class="chTile__title">Demand Report</div>
        <div class="chTile__sub">Game participation and player activity by date range.</div>
      </div>
      <div class="chTile__arrow" aria-hidden="true">›</div>
    </button>

    <!-- Placeholder tiles — enable as features are built -->
    <div class="chTile chTile--disabled" aria-disabled="true">
      <div class="chTile__icon" aria-hidden="true">📅</div>
      <div class="chTile__body">
        <div class="chTile__title">Tee-Time Utilization</div>
        <div class="chTile__sub">Coming soon.</div>
      </div>
    </div>

    <div class="chTile chTile--disabled" aria-disabled="true">
      <div class="chTile__icon" aria-hidden="true">👥</div>
      <div class="chTile__body">
        <div class="chTile__title">Member Engagement</div>
        <div class="chTile__sub">Coming soon.</div>
      </div>
    </div>

  </div>

</main>