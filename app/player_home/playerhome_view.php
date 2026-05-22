<!-- /app/player_home/playerhome_view.php -->
<!-- Player Portal games list view -->
<!--
  CHANGE SUMMARY (UI refactor only — zero business logic changes):
  - Desktop (>=900px): .maPanels--playerHome two-column grid.
    Left  = .maPanel--sidebar  (uses .maPanel + .maPanel__body + .maPanel__ftr from shared CSS)
    Right = .maPanel--cards    (transparent, no chrome — just the card list)
  - Sidebar uses shared CSS classes throughout:
      layout   → .maPanel / .maPanel__body / .maPanel__ftr
      button   → .btn .btnSecondary  (Apply filters)
      links    → .btnLink            (Select all, Clear all, Favorites, Show more)
      inputs   → .maTextInput        (date From/To)
  - Modal (#overlay) PRESERVED in full — mobile uses it via Actions menu.
  - All existing IDs intact (dateFrom, dateTo, adminRows, btnApplyFilters, etc.)
  - Sidebar IDs all prefixed sb- to avoid any collision.
  - Mobile (<900px): sidebar hidden, single-column layout, modal path unchanged.
-->

<div class="maPanels maPanels--playerHome">

  <!-- ============================================================
       LEFT SIDEBAR — desktop only (display:none on mobile via CSS)
       Uses .maPanel structure from ma_shared.css
       ============================================================ -->
  <section class="maPanel maPanel--sidebar" id="phSidebar" aria-label="Filters">

    <!-- Scrollable filter body — .maPanel__body handles overflow -->
    <div class="maPanel__body">

      <!-- SHOW -------------------------------------------------- -->
      <div class="phSidebar__section">
        <div class="phSidebar__sectionTitle">Show</div>
        <div class="phSidebar__radioGroup" id="sbShowGroup">
          <div class="phSidebar__radioRow is-active" data-v="all">
            <div class="phSidebar__radioDot is-active"></div>
            <span class="phSidebar__radioLbl">All games</span>
          </div>
          <div class="phSidebar__radioRow" data-v="mine">
            <div class="phSidebar__radioDot"></div>
            <span class="phSidebar__radioLbl">My registered games</span>
          </div>
        </div>
      </div>

      <!-- DATE -------------------------------------------------- -->
      <div class="phSidebar__section">
        <div class="phSidebar__sectionTitle">Date</div>
        <div class="phSidebar__radioGroup" id="sbDateGroup">
          <div class="phSidebar__radioRow" data-d="prev30">
            <div class="phSidebar__radioDot"></div>
            <span class="phSidebar__radioLbl">Previous 30 days</span>
          </div>
          <div class="phSidebar__radioRow is-active" data-d="next30">
            <div class="phSidebar__radioDot is-active"></div>
            <span class="phSidebar__radioLbl">Next 30 days</span>
          </div>
          <div class="phSidebar__radioRow" data-d="custom">
            <div class="phSidebar__radioDot"></div>
            <span class="phSidebar__radioLbl">Custom range</span>
          </div>
        </div>
        <div class="phSidebar__dateFields">
          <div class="phSidebar__dateField">
            <span class="phSidebar__dateLbl">From</span>
            <input class="maTextInput" id="sbDateFrom" type="date" disabled />
          </div>
          <div class="phSidebar__dateField">
            <span class="phSidebar__dateLbl">To</span>
            <input class="maTextInput" id="sbDateTo" type="date" disabled />
          </div>
        </div>
      </div>

      <!-- ADMINS ------------------------------------------------ -->
      <div class="phSidebar__section">
        <div class="phSidebar__sectionTitle">Admins</div>
        <div class="phSidebar__controls">
          <button class="btnLink" id="sbAdminToggle" type="button">Select all</button>
          <span class="phSidebar__ctrlDiv">|</span>
          <button class="btnLink" id="sbAdminFavs" type="button">Favorites</button>
        </div>
        <div class="phSidebar__rows" id="sbAdminRows"></div>
        <button class="phSidebar__moreLink" id="sbAdminMore" type="button" style="display:none;"></button>
      </div>

      <!-- COURSES ----------------------------------------------- -->
      <div class="phSidebar__section">
        <div class="phSidebar__sectionTitle">Courses</div>
        <div class="phSidebar__controls">
          <button class="btnLink" id="sbCourseSelectAll" type="button">Select all</button>
          <span class="phSidebar__ctrlDiv">|</span>
          <button class="btnLink" id="sbCourseClearAll" type="button">Clear all</button>
        </div>
        <div class="phSidebar__rows" id="sbCourseRows"></div>
        <button class="phSidebar__moreLink" id="sbCourseMore" type="button" style="display:none;"></button>
      </div>

    </div><!-- /.maPanel__body -->

    <!-- Sticky Apply footer — .maPanel__ftr stays below the scroll -->
    <footer class="maPanel__ftr">
      <button class="btn btnSecondary" id="sbApplyBtn" type="button" style="width:100%;">Apply filters</button>
    </footer>

  </section><!-- /.maPanel--sidebar -->


  <!-- ============================================================
       RIGHT CARDS PANEL
       ============================================================ -->
  <div class="maPanel--cards">

    <div id="emptyState" class="maEmptyState" style="display:none;">
      No games match your current filters.
    </div>

    <div id="cards" class="maCards"></div>

  </div>

</div><!-- /.maPanels -->


<!-- ============================================================
     FILTERS MODAL — unchanged, used by mobile via Actions menu
     ============================================================ -->
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

        <!-- Calendar shell preserved for future use -->
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

<!-- Action menu overlay host — unchanged -->
<div id="menuOverlay" class="actionMenuOverlay" aria-hidden="true">
  <div id="menuHost"></div>
</div>