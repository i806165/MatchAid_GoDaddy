<!-- /app/admin_home/adminhome_view.php
     Notes:
     - Phase 3 rework: follows .maPanels/.maPanel multi-panel pattern from
       ma_shared.css. Mobile panel switching is handled by #ahTabs in
       adminhome.php (outside <main>, peer of the scrollable body) — same
       pattern as gamepairings.php's #gpTabs in .maControlArea.
     - In Event Rounds mode ($isEventMode), only the single Games panel
       markup renders — no .maPanels wrapper, no Events panel.
-->

<?php if (!$isEventMode): ?>

<div class="maPanels maPanels--2">

  <!-- PRIMARY: Games canvas -->
  <section class="maPanel maPanel--primary" aria-label="Games">
    <header class="maPanel__hdr">
      <div class="gpPanelHdr">
        <div class="gpPanelHdr__title">Games</div>
      </div>
    </header>

    <div class="maPanel__controls">
      <div class="maCanvasControls">
        <button id="btnAddGame" class="btn btnPrimary" type="button">+ Add Game</button>
        <div class="maCanvasControls__right">
          <button id="btnGamesActions" class="btn btnSecondary" type="button">Actions</button>
        </div>
      </div>
    </div>

    <div class="maPanel__body">
      <div id="emptyState" class="maEmptyState" style="display:none;">
        No games match your current filters.
      </div>
      <div id="cards" class="maCards"></div>
    </div>

    <footer class="maPanel__ftr"></footer>
  </section>

  <!-- SECONDARY: Events panel -->
  <section class="maPanel maPanel--secondary" aria-label="Events">
    <header class="maPanel__hdr">
      <div class="gpPanelHdr">
        <div class="gpPanelHdr__title">Events</div>
      </div>
    </header>

    <div class="maPanel__controls">
      <div class="maCanvasControls">
        <button id="btnAddEvent" class="btn btnPrimary" type="button">+ Add Event</button>
        <div class="maCanvasControls__right">
          <button id="btnEventsActions" class="btn btnSecondary" type="button">Actions</button>
        </div>
      </div>
    </div>

    <div class="maPanel__body">
      <div id="eventsEmptyState" class="maEmptyState" style="display:none;">
        No events match your current filters.
      </div>
      <div id="eventCards" class="maCards"></div>
    </div>

    <footer class="maPanel__ftr"></footer>
  </section>

</div>
<?php else: ?>

<!-- Event Rounds mode: single-panel, unchanged. -->
<div id="emptyState" class="maEmptyState" style="display:none;">
  No games match your current filters.
</div>
<div id="cards" class="maCards"></div>

<?php endif; ?>

<!-- Filters Modal (Games) -->
<div id="modalOverlay" class="maModalOverlay" aria-hidden="true">
  <section class="maModal" role="dialog" aria-modal="true" aria-label="Filters">
    <header class="maModal__hdr">
      <div class="maModal__title">Filters</div>
      <button id="btnCloseModal" class="btn btnPrimary" type="button">Close</button>
    </header>

    <div class="maModal__body">

      <div class="maSeg" role="tablist" aria-label="Filter panels">
        <button id="segDate" class="maSegBtn is-active" type="button" role="tab">Date</button>
        <button id="segAdmin" class="maSegBtn" type="button" role="tab">Admin</button>
      </div>

      <!-- Date panel -->
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

        <div id="calWrap" class="maCalWrap" aria-label="Calendar" aria-hidden="true">
          <div class="maCalHeader">
            <div id="calHint" class="maCalHint">Select From Date</div>
            <div class="maCalLeft">
              <button id="calPrev" class="btn btnPrimary maCalNavBtn" type="button" aria-label="Previous month">‹</button>
              <div id="calMonthLabel" class="maCalMonthLabel">Month YYYY</div>
              <button id="calNext" class="btn btnPrimary maCalNavBtn" type="button" aria-label="Next month">›</button>
              <button id="calToday" class="btn btnPrimary maCalMiniBtn" type="button">Today</button>
            </div>
            <div class="maCalRight">
              <button id="calTargetFrom" class="maCalTargetPill is-active" type="button">Set From</button>
              <button id="calTargetTo" class="maCalTargetPill" type="button">Set To</button>
            </div>
          </div>
          <div class="maCalDow">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>
          <div id="calGrid" class="maCalGrid"></div>
        </div>
      </div>

      <!-- Admin panel -->
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
