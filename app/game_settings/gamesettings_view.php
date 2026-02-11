<?php
// /public_html/app/game_settings/gamesettings_view.php
?>
<div class="gsTabPanels">

  <!-- ======================================================================
       GENERAL TAB
       ====================================================================== -->
  <div class="maTabPanel is-active" id="gsPanelGeneral" data-tab-panel="general">
    <div class="maCards">
      <!-- CARD 1 — COMPETITION -->
      <section class="maCard" aria-label="Competition">
        <header class="maCard__hdr">
          <div class="maCard__title">COMPETITION</div>
        </header>
        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel">Competition Type</label>
              <div class="maChoiceChips" id="gsCompetitionType" role="radiogroup">
                <button type="button" class="maChoiceChip" data-value="PairField">Team</button>
                <button type="button" class="maChoiceChip" data-value="Individual">Individual</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CARD 2 — FORMAT -->
      <section class="maCard" aria-label="Format">
        <header class="maCard__hdr">
          <div class="maCard__title">FORMAT</div>
        </header>
        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsGameFormat">Game Format</label>
              <select id="gsGameFormat" class="maTextInput">
                <option value="StrokePlay">Stroke Play</option>
                <option value="MatchPlay">Match Play</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- ======================================================================
       SCORING TAB
       ====================================================================== -->
  <div class="maTabPanel" id="gsPanelScoring" data-tab-panel="scoring">
    <!-- Placeholder for Scoring cards -->
  </div>

  <!-- ======================================================================
       HANDICAPS TAB
       ====================================================================== -->
  <div class="maTabPanel" id="gsPanelHandicaps" data-tab-panel="handicaps">
    <!-- Placeholder for Handicaps cards -->
  </div>

</div>