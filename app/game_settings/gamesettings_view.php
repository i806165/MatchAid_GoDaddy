<?php
// /public_html/app/game_settings/gamesettings_view.php
?>
<div class="gsTabPanels">

  <!-- ======================================================================
       GENERAL TAB
       ====================================================================== -->
  <div class="maTabPanel is-active" id="gsPanelGeneral" data-tab-panel="general">
    <div class="maCards">
      <!-- SINGLE CARD — ALL GENERAL FIELDS -->
      <section class="maCard" aria-label="Game Options">
        <header class="maCard__hdr">
          <div class="maCard__title">GAME OPTIONS</div>
        </header>

        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsGameFormat">Game Format</label>
              <select id="gsGameFormat" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsTOMethod">Teeing Method</label>
              <select id="gsTOMethod" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsScoringBasis">Scoring Basis</label>
              <select id="gsScoringBasis" class="maTextInput" disabled></select>
            </div>
          </div>

          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsCompetition">Competition</label>
              <select id="gsCompetition" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsSegments">Holes / Segments</label>
              <div class="maInputWrap">
                <input id="gsHoles" class="maTextInput" type="text" disabled style="width:80px;" />
                <select id="gsSegments" class="maTextInput" style="flex:1;"></select>
              </div>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsRotationMethod">Rotation</label>
              <select id="gsRotationMethod" class="maTextInput"></select>
            </div>
          </div>

          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel">Blind Player</label>
              <div class="maInputWrap">
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" id="gsUseBlindPlayer" style="width:20px; height:20px;">
                  <label for="gsUseBlindPlayer" style="margin:0; font-weight:normal; font-size:13px;">Use Blind Player</label>
                </div>
                <select id="gsBlindPlayer" class="maTextInput" style="flex:1;"></select>
              </div>
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
    <div class="maCards">
      <!-- CARD 1 — SCORING RULES -->
      <section class="maCard" aria-label="Scoring Rules">
        <header class="maCard__hdr">
          <div class="maCard__title">SCORING RULES</div>
        </header>

        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsScoringMethod">Scoring Method</label>
              <select id="gsScoringMethod" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsScoringSystem">Scoring System</label>
              <select id="gsScoringSystem" class="maTextInput"></select>
            </div>
          </div>

          <div class="maFieldRow">
            <div class="maField" id="divBestBall">
              <label class="maLabel" for="gsBestBallCnt">Best Ball Count</label>
              <select id="gsBestBallCnt" class="maTextInput"></select>
            </div>

            <div class="maField" id="divPlayerDecl">
              <label class="maLabel" for="gsPlayerDeclaration">Player Declaration</label>
              <select id="gsPlayerDeclaration" class="maTextInput"></select>
            </div>
          </div>
        </div>
      </section>

      <!-- CARD 2 — HOLE DECLARATIONS (Dynamic) -->
      <section class="maCard" id="gsCardHoleDecl" style="display:none;">
        <header class="maCard__hdr">
          <div class="maCard__title">HOLE DECLARATIONS</div>
        </header>
        <div class="maCard__body">
          <div id="gsListHoleDecl" class="gsGridList"></div>
        </div>
      </section>

      <!-- CARD 3 — STABLEFORD POINTS (Dynamic) -->
      <section class="maCard" id="gsCardStableford" style="display:none;">
        <header class="maCard__hdr">
          <div class="maCard__title">STABLEFORD POINTS</div>
          <div class="maCard__actions">
            <button type="button" class="btn btn--ghost" id="gsResetStableford">Reset</button>
          </div>
        </header>
        <div class="maCard__body">
          <div id="gsListStableford" class="gsList"></div>
        </div>
      </section>
    </div>
  </div>

  <!-- ======================================================================
       HANDICAPS TAB
       ====================================================================== -->
  <div class="maTabPanel" id="gsPanelHandicaps" data-tab-panel="handicaps">
    <div class="maCards">
      <section class="maCard" aria-label="Handicaps">
        <header class="maCard__hdr">
          <div class="maCard__title">HANDICAPS</div>
        </header>

        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsHCMethod">HC Method</label>
              <select id="gsHCMethod" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsAllowance">Allowance</label>
              <select id="gsAllowance" class="maTextInput"></select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsStrokeDistribution">Stroke Distribution</label>
              <select id="gsStrokeDistribution" class="maTextInput"></select>
            </div>
          </div>

          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsHCEffectivity">HC Effectivity</label>
              <select id="gsHCEffectivity" class="maTextInput"></select>
            </div>

            <div class="maField" id="divHCEffDate">
              <label class="maLabel" for="gsHCEffectivityDate">Effectivity Date</label>
              <input type="date" id="gsHCEffectivityDate" class="maTextInput">
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

</div>
