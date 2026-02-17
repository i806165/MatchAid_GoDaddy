<?php
// /public_html/app/game_summary/gamesummary_view.php
?>

<div class="maCards" id="gsCards">

  <!-- CARD 1 — GAME -->
  <section class="maCard" aria-label="Game Summary">
    <header class="maCard__hdr">
      <div class="maCard__title">GAME SUMMARY</div>
      <div class="maCard__actions">
        <button type="button" class="btn btnSecondary" id="gsActionsBtn">Actions</button>
      </div>
    </header>

    <div class="maCard__body">
      <div class="gsGameHdr">
        <div class="gsTitle" id="gameTitle">Loading…</div>
        <div class="gsSub" id="gameFacility">—</div>
        <div class="gsSub" id="gameCourseTime">—</div>
      </div>

      <div class="gsPillRow">
        <span class="maPill" id="pillPlayers">Players: 0</span>
        <span class="maPill" id="pillHoles">Holes: —</span>
        <span class="maPill" id="pillHcMethod">HC: —</span>
      </div>
    </div>
  </section>

  <!-- CARD 2 — GAME CONFIGURATION -->
  <section class="maCard" aria-label="Game Configuration">
    <header class="maCard__hdr">
      <div class="maCard__title">GAME CONFIGURATION</div>
    </header>

    <div class="maCard__body">
      <div class="gsConfigGrid" id="configGrid"></div>
    </div>
  </section>

  <!-- CARD 3 — ROSTER -->
  <section class="maCard" aria-label="Roster">
    <header class="maCard__hdr">
      <div class="maCard__title">ROSTER</div>
      <div class="maCard__actions">
        <div class="maSeg" role="tablist" aria-label="Scope">
          <button type="button" class="maSegBtn is-active" id="scopeByPlayer" aria-selected="true">By Player</button>
          <button type="button" class="maSegBtn" id="scopeByGroup" aria-selected="false">By Group</button>
        </div>
      </div>
    </header>

    <div class="maCard__body">
      <div class="gsTableWrap">
        <table class="gsTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tee</th>
              <th class="gsRight">HI</th>
              <th class="gsRight">CH</th>
              <th class="gsRight">PH</th>
              <th class="gsRight">SO</th>
              <th>Time</th>
              <th class="gsRight">Start</th>
              <th>Match</th>
              <th>Pair</th>
              <th class="gsRight">Pos</th>
              <th class="gsMono">ScoreID</th>
            </tr>
          </thead>
          <tbody id="rosterTableBody"></tbody>
        </table>
      </div>

      <div class="gsMobileList" id="mobileList"></div>

      <div class="maHint" id="gsEmptyHint" style="display:none;">No roster records found.</div>
    </div>
  </section>

</div>

<!-- Actions Modal -->
<div id="gsActionsModal" class="maModalOverlay" aria-hidden="true">
  <div class="maModal" role="dialog" aria-modal="true" aria-label="Game Summary Actions">

    <header class="maModal__hdr">
      <div class="maModal__title">Actions</div>
      <button type="button" class="btn btnTertiary" id="gsActionsCloseBtn">Close</button>
    </header>

    <div class="maModal__body">
      <div class="gsActionList">
        <button type="button" class="btn btnSecondary gsActionBtn" id="openGameSettingsButton">
          <span>Game Settings</span>
          <span class="gsActionIcon">⟳</span>
        </button>

        <button type="button" class="btn btnSecondary gsActionBtn" id="refreshHcMenuButton">
          <span>Refresh Handicaps</span>
          <span class="gsActionIcon">⟳</span>
        </button>

        <button type="button" class="btn btnSecondary gsActionBtn" id="printScorecardsButton">
          <span>Print Scorecards</span>
          <span class="gsActionIcon">🖨</span>
        </button>

        <button type="button" class="btn btnPrimary gsActionBtn" id="downloadCsvButton">
          <span>Download CSV File</span>
          <span class="gsActionIcon">↓</span>
        </button>

        <button type="button" class="btn btnSecondary gsActionBtn" id="emailCsvButton">
          <span>Email Game Summary</span>
          <span class="gsActionIcon">✉</span>
        </button>
      </div>

      <div class="maHint gsActionHint" id="gsActionHint" style="display:none;"></div>
    </div>
  </div>
</div>
