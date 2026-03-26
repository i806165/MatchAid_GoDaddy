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
              <label class="maLabel" for="gsBestBallCnt">Count of Best Ball(s)</label>
              <select id="gsBestBallCnt" class="maTextInput"></select>
            </div>

            <div class="maField" id="divPlayerDecl">
              <label class="maLabel" for="gsPlayerDeclaration">Balls to Declare per Player</label>
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
          <div id="gsListStableford" class="gsStablefordGrid"></div>
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

  <!-- ======================================================================
       CUSTOM POINTS TAB
       ====================================================================== -->
  <div class="maTabPanel" id="gsPanelCustomPoints" data-tab-panel="customPoints">
    <div class="maCards">
      <section class="maCard" aria-label="Custom Points Patterns">
        <header class="maCard__hdr">
          <div class="maCard__title">CUSTOM POINTS PATTERN</div>
          <div class="maCard__actions">
            <button type="button" class="maCard__actionBtn" id="gsBtnClearCustomPoints" title="Clear Custom Points" style="color:var(--danger);">
              <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </header>

        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsRecallPattern">Recall Prior Pattern</label>
              <select id="gsRecallPattern" class="maTextInput">
                <option value="">Select template...</option>
              </select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsTemplateName">Template Name</label>
              <input type="text" id="gsTemplateName" class="maTextInput" placeholder="e.g. Saturday Junk">
            </div>
          </div>

          <div style="margin-top:16px;">
            <div style="display:grid; grid-template-columns: 1fr 80px 120px; gap:8px; padding:0 4px 8px 4px; border-bottom:1px solid var(--borderSubtle); font-size:11px; font-weight:900; color:var(--mutedText);">
              <div>LABEL</div>
              <div style="text-align:center;">POINTS</div>
              <div>AWARD TO</div>
            </div>
            <div id="gsCustomPointsRows">
              <!-- 8 fixed rows generated by JS -->
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

</div>
