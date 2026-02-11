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
    <div class="maCards">
      <!-- CARD 1 — SCORING SYSTEM -->
      <section class="maCard" aria-label="Scoring System">
        <header class="maCard__hdr">
          <div class="maCard__title">SCORING SYSTEM</div>
        </header>
        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsScoringSystem">Style</label>
              <select id="gsScoringSystem" class="maTextInput">
                <option value="BestBall">Best Ball</option>
                <option value="Scramble">Scramble</option>
                <option value="AltShot">Alternate Shot</option>
                <option value="Shamble">Shamble</option>
                <option value="Aggregate">Aggregate</option>
              </select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsScoringMethod">Method</label>
              <select id="gsScoringMethod" class="maTextInput">
                <option value="GROSS">Gross</option>
                <option value="NET">Net</option>
              </select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsScoringBasis">Basis</label>
              <select id="gsScoringBasis" class="maTextInput">
                <option value="Strokes">Strokes</option>
                <option value="Points">Points (Stableford)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- CARD 2 — POINTS (Stableford) -->
      <section class="maCard" id="gsCardPoints" aria-label="Points">
        <header class="maCard__hdr">
          <div class="maCard__title">POINTS</div>
        </header>
        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsPointsBogey">Bogey</label>
              <input type="number" id="gsPointsBogey" class="maTextInput" value="1">
            </div>
            <div class="maField">
              <label class="maLabel" for="gsPointsPar">Par</label>
              <input type="number" id="gsPointsPar" class="maTextInput" value="2">
            </div>
            <div class="maField">
              <label class="maLabel" for="gsPointsBirdie">Birdie</label>
              <input type="number" id="gsPointsBirdie" class="maTextInput" value="3">
            </div>
            <div class="maField">
              <label class="maLabel" for="gsPointsEagle">Eagle</label>
              <input type="number" id="gsPointsEagle" class="maTextInput" value="4">
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- ======================================================================
       HANDICAPS TAB
       ====================================================================== -->
  <div class="maTabPanel" id="gsPanelHandicaps" data-tab-panel="handicaps">
    <div class="maCards">
      <!-- CARD 1 — HANDICAP METHOD -->
      <section class="maCard" aria-label="Handicap Method">
        <header class="maCard__hdr">
          <div class="maCard__title">HANDICAP METHOD</div>
        </header>
        <div class="maCard__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsHCMethod">Method</label>
              <select id="gsHCMethod" class="maTextInput">
                <option value="CH">Course Handicap (CH)</option>
                <option value="PH">Playing Handicap (PH)</option>
                <option value="None">None (0)</option>
              </select>
            </div>
            <div class="maField">
              <label class="maLabel" for="gsAllowance">Allowance %</label>
              <input type="number" id="gsAllowance" class="maTextInput" min="0" max="100" step="5">
            </div>
            <div class="maField">
              <label class="maLabel" for="gsStrokeDistribution">Allocation</label>
              <select id="gsStrokeDistribution" class="maTextInput">
                <option value="Standard">Standard (Odds/Evens)</option>
                <option value="Sequential">Sequential (1-18)</option>
              </select>
            </div>
          </div>
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel" for="gsBlindPlayer">Blind Player</label>
              <select id="gsBlindPlayer" class="maTextInput">
                <option value="">(None)</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

</div>