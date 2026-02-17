<?php
// /public_html/app/game_summary/gamesummary_view.php
?>

<!-- PAGE BODY -->
<div class="maCards" id="gsCards">

  <!-- ROSTER -->
  <section class="maCard" aria-label="Roster">
    <header class="maCard__hdr">
      <div class="maCard__title">ROSTER</div>
      <div class="maCard__actions"></div>
    </header>

    <div class="maCard__body">
      <div class="gsTableWrap">
        <table class="gsTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tee</th>
              <th class="gsCenter">HI</th>
              <th class="gsCenter">CH</th>
              <th class="gsCenter">PH</th>
              <th class="gsCenter">SO</th>
              <th class="gsCenter">Time</th>
              <th class="gsCenter">Start</th>
              <th class="gsCenter col-match">Match</th>
              <th class="gsCenter col-flightpos">Team</th>
              <th class="gsCenter">Pair</th>
              <th class="gsCenter">Pos</th>
              <th class="gsCenter gsMono">ScoreID</th>
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
