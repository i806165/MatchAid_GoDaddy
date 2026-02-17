<?php
// /public_html/app/game_summary/gamesummary_view.php
?>

<!-- CONTROLS BAND (peer to body standard) -->
<div class="maControlArea" id="gsControls" aria-label="Game Summary Controls">

  <!-- Collapsible: Game Configuration -->
  <button type="button"
          class="gsCfgToggle"
          id="gsCfgToggle"
          aria-expanded="false">
    <span class="gsCfgTitle">Game Configuration</span>
    <span class="gsCfgChevron" aria-hidden="true">▾</span>
  </button>

  <div class="gsCfgPanel" id="gsCfgPanel" hidden>
    <div class="gsConfigGrid" id="configGrid"></div>
  </div>

  <!-- Scope + Meta pills row -->
  <div class="gsControlsRow">
    <div class="maSeg gsScopeSeg" role="tablist" aria-label="Roster Scope">
      <button type="button" class="maSegBtn is-active" id="scopeByPlayer" aria-selected="true">By Player</button>
      <button type="button" class="maSegBtn" id="scopeByGroup" aria-selected="false">By Group</button>
    </div>

    <div class="maPills gsMetaPills" aria-label="Game quick stats">
      <div class="maPill maPillKV" role="group" aria-label="Players">
        <div class="maPillLabel">Players</div>
        <div class="maPillValue" id="gsMetaPlayers">—</div>
      </div>

      <div class="maPill maPillKV" role="group" aria-label="Holes">
        <div class="maPillLabel">Holes</div>
        <div class="maPillValue" id="gsMetaHoles">—</div>
      </div>

      <div class="maPill maPillKV" role="group" aria-label="HC Method">
        <div class="maPillLabel">HC</div>
        <div class="maPillValue" id="gsMetaHC">—</div>
      </div>
    </div>
  </div>
</div>

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
