<?php
// /public_html/app/club_demand/clubdemand_view.php
// Pure structure — no logic. JS hydrates all IDs from window.__INIT__.
?>

<!-- ============================================================
     CONTROLS BAND
     Row 1: View toggle (full-width segmented control)
     Row 2: Context pills + "Acquire Data" modal trigger
     Row 3: Front-end filter / sort / group (view-specific)
     ============================================================ -->
<div class="maControlArea" id="cdControls" aria-label="Club Demand Controls">

  <!-- Row 1: View toggle -->
  <div class="maSeg cdViewSeg" role="tablist" aria-label="Demand view">
    <button type="button" class="maSegBtn is-active" id="cdSegSummary"
            aria-selected="true" role="tab">Summary</button>
    <button type="button" class="maSegBtn" id="cdSegPlayer"
            aria-selected="false" role="tab">Player Detail</button>
    <button type="button" class="maSegBtn" id="cdSegDashboard"
            aria-selected="false" role="tab">Dashboard</button>
  </div>

  <!-- Row 2: Context pills + data acquisition trigger -->
  <div class="cdContextRow">
    <div class="maPills cdContextPills" aria-label="Active data range">
      <div class="maPill maPillKV" role="group" aria-label="From date">
        <div class="maPillLabel">FROM</div>
        <div class="maPillValue" id="cdPillFrom">—</div>
      </div>
      <div class="maPill maPillKV" role="group" aria-label="To date">
        <div class="maPillLabel">TO</div>
        <div class="maPillValue" id="cdPillTo">—</div>
      </div>
      <div class="maPill maPillKV" role="group" aria-label="Games loaded">
        <div class="maPillLabel">GAMES</div>
        <div class="maPillValue" id="cdPillGames">—</div>
      </div>
      <div class="maPill maPillKV" role="group" aria-label="Total rounds">
        <div class="maPillLabel">ROUNDS</div>
        <div class="maPillValue" id="cdPillRounds">—</div>
      </div>
    </div>
    <button type="button" class="btn btnSecondary cdAcquireBtn" id="cdBtnAcquire">
      Get Data
    </button>
  </div>

  <!-- Row 3a: Summary view controls (group + sort) -->
  <div class="cdSortRow" id="cdSortSummary" hidden>
    <div class="cdSortGroup">
      <span class="cdSortLabel">Group</span>
      <div class="maSeg cdSortSeg" role="group" aria-label="Group by">
        <button type="button" class="maSegBtn is-active" data-group="month">Month</button>
        <button type="button" class="maSegBtn"           data-group="course">Course</button>
        <button type="button" class="maSegBtn"           data-group="admin">Admin</button>
        <button type="button" class="maSegBtn"           data-group="none">None</button>
      </div>
    </div>
    <div class="cdSortGroup">
      <span class="cdSortLabel">Sort</span>
      <div class="maSeg cdSortSeg" role="group" aria-label="Sort by">
        <button type="button" class="maSegBtn is-active" data-sort="date">Date</button>
        <button type="button" class="maSegBtn"           data-sort="players">Players</button>
        <button type="button" class="maSegBtn"           data-sort="course">Course</button>
        <button type="button" class="maSegBtn"           data-sort="admin">Admin</button>
      </div>
    </div>
  </div>

  <!-- Row 3b: Player detail view controls (sort + filter) -->
  <div class="cdSortRow" id="cdSortPlayer" hidden>
    <div class="cdSortGroup">
      <span class="cdSortLabel">Sort</span>
      <div class="maSeg cdSortSeg" role="group" aria-label="Sort players by">
        <button type="button" class="maSegBtn is-active" data-psort="rounds">Rounds</button>
        <button type="button" class="maSegBtn"           data-psort="name">Name</button>
        <button type="button" class="maSegBtn"           data-psort="lastgame">Last Game</button>
      </div>
    </div>
    <div class="cdSortGroup">
      <span class="cdSortLabel">Filter</span>
      <div class="maSeg cdSortSeg" role="group" aria-label="Filter players">
        <button type="button" class="maSegBtn is-active" data-pfilter="all">All</button>
        <button type="button" class="maSegBtn"           data-pfilter="multicourse">Multi-Course</button>
        <button type="button" class="maSegBtn"           data-pfilter="singlegame">Single Game</button>
      </div>
    </div>
  </div>

</div><!-- /maControlArea -->


<!-- ============================================================
     MAIN PAGE BODY
     ============================================================ -->
<main class="maPage" role="main" id="cdPage">

  <!-- ── SUMMARY VIEW ─────────────────────────────────────────── -->
  <div id="cdViewSummary" class="cdView" role="tabpanel" aria-labelledby="cdSegSummary">

    <div class="cdMetricRow">
      <div class="cdMetric">
        <div class="cdMetricLabel">TOTAL ROUNDS</div>
        <div class="cdMetricValue" id="cdMTotalRounds">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">TOTAL GAMES</div>
        <div class="cdMetricValue" id="cdMTotalGames">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">AVG PLAYERS / GAME</div>
        <div class="cdMetricValue" id="cdMAvgPlayers">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">TOTAL SLOTS</div>
        <div class="cdMetricValue" id="cdMTotalSlots">—</div>
      </div>
    </div>

    <section class="maCard" aria-label="Game Summary">
      <header class="maCard__hdr">
        <div class="maCard__title">GAME SUMMARY</div>
        <div class="cdCardSub" id="cdSummaryCardSub"></div>
      </header>
      <div class="maCard__body">
        <div class="cdTableWrap">
          <table class="cdTable" id="cdSummaryTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Play Time</th>
                <th>Administrator</th>
                <th>Game Title</th>
                <th>Course</th>
                <th>Format</th>
                <th class="cdRight">Slots</th>
                <th class="cdRight">Registered</th>
              </tr>
            </thead>
            <tbody id="cdSummaryTbody"></tbody>
          </table>
        </div>
        <div class="maHint" id="cdSummaryEmpty" style="display:none;">
          No games found for this date range.
        </div>
      </div>
    </section>

  </div><!-- /cdViewSummary -->


  <!-- ── PLAYER DETAIL VIEW ───────────────────────────────────── -->
  <div id="cdViewPlayer" class="cdView" style="display:none;"
       role="tabpanel" aria-labelledby="cdSegPlayer">

    <div class="cdMetricRow">
      <div class="cdMetric">
        <div class="cdMetricLabel">UNIQUE PLAYERS</div>
        <div class="cdMetricValue" id="cdMUniquePlayers">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">TOTAL ROUNDS</div>
        <div class="cdMetricValue" id="cdMPlayerRounds">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">AVG ROUNDS / PLAYER</div>
        <div class="cdMetricValue" id="cdMAvgRounds">—</div>
      </div>
      <div class="cdMetric">
        <div class="cdMetricLabel">MOST ACTIVE</div>
        <div class="cdMetricValue" id="cdMMostActive">—</div>
      </div>
    </div>

    <section class="maCard" aria-label="Player Detail">
      <header class="maCard__hdr">
        <div class="maCard__title">PLAYER DETAIL</div>
        <div class="cdCardSub" id="cdPlayerCardSub"></div>
      </header>
      <div class="maCard__body">
        <div class="cdTableWrap">
          <table class="cdTable" id="cdPlayerTable">
            <thead>
              <tr>
                <th>Player</th>
                <th class="cdRight">Rounds</th>
                <th>Courses Played</th>
                <th>Administrators</th>
                <th>First Game</th>
                <th>Last Game</th>
              </tr>
            </thead>
            <tbody id="cdPlayerTbody"></tbody>
          </table>
        </div>
        <div class="maHint" id="cdPlayerEmpty" style="display:none;">
          No player records found.
        </div>
      </div>
    </section>

  </div><!-- /cdViewPlayer -->


  <!-- ── DASHBOARD VIEW ───────────────────────────────────────── -->
  <div id="cdViewDashboard" class="cdView" style="display:none;"
       role="tabpanel" aria-labelledby="cdSegDashboard">
    <div class="maEmptyState" id="cdDashboardPlaceholder">
      Dashboard — coming soon
    </div>
  </div>

</main><!-- /maPage -->


<!-- ============================================================
     ACQUIRE DATA MODAL
     Triggered by "Get Data" button.
     Only control that fires a DB call — date range change.
     ============================================================ -->
<div id="cdModalOverlay" class="maModalOverlay" aria-hidden="true">
  <section class="maModal" role="dialog" aria-modal="true"
           aria-label="Acquire Data" style="max-width:360px;">

    <header class="maModal__hdr">
      <div class="maModal__title">Acquire Data</div>
      <button type="button" class="iconBtn" id="cdModalClose" aria-label="Close">✕</button>
    </header>

    <div class="maModal__body">

      <p class="maHelpText" style="margin-bottom:14px;">
        Select a date range to load games and player data.
        Changing the date range will query the database.
        All other filtering is performed on the loaded data.
      </p>

      <div class="maFieldRow">
        <div class="maField maField--inlineLabel">
          <label class="maLabel" for="cdInputFrom">From</label>
          <div class="maInputWrap">
            <input type="date" class="maTextInput" id="cdInputFrom" />
          </div>
        </div>
        <div class="maField maField--inlineLabel">
          <label class="maLabel" for="cdInputTo">To</label>
          <div class="maInputWrap">
            <input type="date" class="maTextInput" id="cdInputTo" />
          </div>
        </div>
      </div>

    </div>

    <footer class="maModal__ftr">
      <div class="maModal__ftrActions">
        <button type="button" class="btn btnPrimary"   id="cdModalCancel">Cancel</button>
        <button type="button" class="btn btnSecondary" id="cdModalExecute">Load Data</button>
      </div>
    </footer>

  </section>
</div><!-- /cdModalOverlay -->