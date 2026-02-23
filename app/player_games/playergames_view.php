<!-- /app/player_games/playergames_view.php -->
<!-- Player Portal games list view (Wix HTML ID parity where practical) -->

<div id="emptyState" class="maEmptyState" style="display:none;">
  No games match your current filters.
</div>

<div id="cards" class="maCards"></div>

<!-- Filters Modal -->
<div id="overlay" class="maModalOverlay" aria-hidden="true">
  <section class="maModal" role="dialog" aria-modal="true" aria-label="Filters">
    <header class="maModal__hdr">
      <div class="maModal__title">Filters</div>
      <button id="btnCloseModal" class="btn btnPrimary" type="button">Close</button>
    </header>

    <div class="maModal__body">
      <div class="maSeg" role="tablist" aria-label="Filter panels">
        <button id="segDate" class="maSegBtn is-active" type="button" role="tab" aria-selected="true">Date</button>
        <button id="segAdmin" class="maSegBtn" type="button" role="tab" aria-selected="false">Admin</button>
      </div>

      <div id="panelDate" class="maTabPanel is-active">
        <div class="maFieldRow">
          <div class="maField maField--inlineLabel">
            <label class="maLabel">From</label>
            <div class="maInputWrap">
              <input id="dateFrom" class="maTextInput" type="date" />
              <button id="btnPickFrom" class="iconBtn" type="button" aria-label="Pick from date">📅</button>
            </div>
          </div>

          <div class="maField maField--inlineLabel">
            <label class="maLabel">To</label>
            <div class="maInputWrap">
              <input id="dateTo" class="maTextInput" type="date" />
              <button id="btnPickTo" class="iconBtn" type="button" aria-label="Pick to date">📅</button>
            </div>
          </div>
        </div>

        <!-- Placeholder calendar shell (IDs preserved for parity/future port) -->
        <div id="calWrap" class="maCalWrap" aria-label="Calendar" aria-hidden="true" style="display:none;">
          <div class="maCalHeader">
            <div id="calHint" class="maCalHint">Select Date</div>
            <div class="maCalLeft">
              <button id="calPrev" class="btn btnPrimary maCalNavBtn" type="button">‹</button>
              <div id="calMonthLabel" class="maCalMonthLabel">Month YYYY</div>
              <button id="calNext" class="btn btnPrimary maCalNavBtn" type="button">›</button>
              <button id="calToday" class="btn btnPrimary maCalMiniBtn" type="button">Today</button>
            </div>
            <div class="maCalRight">
              <button id="calTargetFrom" class="maCalTargetPill is-active" type="button">Set From</button>
              <button id="calTargetTo" class="maCalTargetPill" type="button">Set To</button>
            </div>
          </div>
          <div class="maCalDow"><div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div></div>
          <div id="calGrid" class="maCalGrid"></div>
        </div>
      </div>

      <div id="panelAdmin" class="maTabPanel">
        <div class="maAdminPick__top">
          <input id="adminSearch" class="maTextInput maAdminPick__search" type="text" placeholder="Search admins by name…" />
        </div>

        <div id="adminList" class="maAdminPick">
          <div class="maAdminPick__hdr">
            <button id="btnAdminToggleAll" class="maAdminPick__hdrBtn" type="button" aria-label="Select all / none">☐</button>
            <div class="maAdminPick__hdrName">Name</div>
            <button id="btnAdminToggleFavs" class="maAdminPick__hdrBtn" type="button" aria-label="Select favorites / clear favorites">♥</button>
          </div>
          <div id="adminRows" class="maAdminPick__rows"></div>
        </div>
      </div>
    </div>

    <footer class="maModal__ftr">
      <div class="maModal__ftrActions">
        <button id="btnCancelFilters" class="btn btnPrimary" type="button">Cancel</button>
        <button id="btnApplyFilters" class="btn btnSecondary" type="button">Apply</button>
      </div>
    </footer>
  </section>
</div>

<!-- Action menu overlay host -->
<div id="menuOverlay" class="actionMenuOverlay" aria-hidden="true">
  <div id="menuHost"></div>
</div>
