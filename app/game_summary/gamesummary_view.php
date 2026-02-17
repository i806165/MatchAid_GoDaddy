<?php
// /public_html/app/game_summary/gamesummary_view.php
?>

<div class="maCards" id="gsCards">

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
