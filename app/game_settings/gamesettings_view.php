<?php
// /public_html/app/game_settings/gamesettings_view.php
?>

<div class="maControlArea">

  <!-- View toggle -->
  <div class="maSeg gsViewToggle" id="gsViewToggle" role="tablist" aria-label="Settings View">
    <button type="button" class="maSegBtn is-active" data-view="guided"   role="tab" aria-selected="true">Guided</button>
    <button type="button" class="maSegBtn"           data-view="advanced" role="tab" aria-selected="false">Advanced</button>
  </div>

  <!-- Wizard progress strip -->
  <div class="gsWizProgress hidden" id="gsWizProgress">
    <div class="gsWizStep active" onclick="window.gsWiz && window.gsWiz.goToStep(1)">
      <div class="gsWizDot" id="gsWizDot1"></div>
      <div class="gsWizStepLabel">Format</div>
    </div>
    <div class="gsWizStep" onclick="window.gsWiz && window.gsWiz.goToStep(2)">
      <div class="gsWizDot" id="gsWizDot2"></div>
      <div class="gsWizStepLabel">Structure</div>
    </div>
    <div class="gsWizStep" onclick="window.gsWiz && window.gsWiz.goToStep(3)">
      <div class="gsWizDot" id="gsWizDot3"></div>
      <div class="gsWizStepLabel">Scoring</div>
    </div>
    <div class="gsWizStep" onclick="window.gsWiz && window.gsWiz.goToStep(4)">
      <div class="gsWizDot" id="gsWizDot4"></div>
      <div class="gsWizStepLabel">Handicaps</div>
    </div>
  </div>

  <!-- Advanced tab bar -->
  <div class="maSeg hidden" id="gsTabs" role="tablist" aria-label="Game Settings Tabs">
    <button type="button" class="maSegBtn is-active" data-tab="general"      role="tab" aria-selected="true">General</button>
    <button type="button" class="maSegBtn"           data-tab="scoring"      role="tab" aria-selected="false">Scoring</button>
    <button type="button" class="maSegBtn"           data-tab="handicaps"    role="tab" aria-selected="false">Handicaps</button>
    <button type="button" class="maSegBtn"           data-tab="customPoints" role="tab" aria-selected="false">Custom Points</button>
  </div>

</div>

<!-- ================================================================
     WIZARD CONTAINER — Guided view
     Shown when view toggle = Guided, hidden when Advanced
     ================================================================ -->
<div id="gsWizardContainer" class="gsWizardContainer hidden">
  <div class="gsWizLayout">

    <!-- ── MAIN STEP AREA ── -->
    <div class="gsWizMain">

      <!-- STEP 1: Game Format -->
      <div id="gsWizStep1" class="gsWizStepPanel maCard">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 1 OF 4 &nbsp;·&nbsp; GAME FORMAT</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">What kind of game are you running?</div>
          <div class="gsWizCarouselHeader">
            <span class="gsWizCarouselHint">Scroll or swipe to see all formats</span>
            <div class="gsWizCarouselArrows">
              <button class="gsWizCarouselArrow" id="gsWizCarouselLeft"  aria-label="Scroll left">&#8592;</button>
              <button class="gsWizCarouselArrow" id="gsWizCarouselRight" aria-label="Scroll right">&#8594;</button>
            </div>
          </div>
          <div class="gsWizCarouselWrap">
            <div class="wizCarousel" id="gsWizCarousel"></div>
          </div>

        </div>
      </div>

      <!-- STEP 2: Competition Structure -->
      <div id="gsWizStep2" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 2 OF 4 &nbsp;·&nbsp; COMPETITION STRUCTURE</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">How is your game structured?</div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Competition</div>
            <div class="wizChips" id="gsWizCompChips">
              <button class="wizChip" data-val="PairPair"  onclick="window.gsWiz.selectCompetition('PairPair')">Pair vs. Pair</button>
              <button class="wizChip" data-val="PairField" onclick="window.gsWiz.selectCompetition('PairField')">Pair vs. the Field</button>
            </div>
            <div class="gsWizHint">Pair vs. Pair pits a pair directly against another pair in a head to head match. Pair vs. the Field pits each pair against the field of all paired players.</div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Segments</div>
            <div class="wizChips" id="gsWizSegChips"></div>
            <div class="gsWizHint">Segments split the round into independent scoring periods. 3's play three 3-hole segments (9-hole games only). 6's plays three 6-hole segments and 9's plays as two 9-hole segments (18 hole games).</div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Rotation Method</div>
            <div class="wizChips" id="gsWizRotChips"></div>
            <div class="gsWizCascadeNote" id="gsWizRotNote"></div>
          </div>
        </div>
      </div>

      <!-- STEP 3: Scoring -->
      <div id="gsWizStep3" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 3 OF 4 &nbsp;·&nbsp; SCORING</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">How is the game scored?</div>
          <div class="gsWizHint">Scoring basis is set by your format. Choose method and how scores are counted.</div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring Basis <span class="gsWizBadge gsWizBadge--forced">forced by format</span></div>
            <div class="gsWizBasisStrip">
              <span id="gsWizBasisVal">Strokes</span>
              <span class="gsWizBasisNote" id="gsWizBasisNote">— set by format</span>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring Method</div>
            <div class="wizChips" id="gsWizMethodChips">
              <button class="wizChip" data-val="NET"       onclick="window.gsWiz.selectMethod('NET')">NET</button>
              <button class="wizChip" data-val="ADJ GROSS" onclick="window.gsWiz.selectMethod('ADJ GROSS')">ADJ GROSS</button>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring System</div>
            <div class="gsWizOptList" id="gsWizSystemList"></div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizGroupBB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Best Ball Count <span class="gsWizBadge gsWizBadge--derived">select how many scores count</span></div>
            <div class="wizChips" id="gsWizBBChips"></div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizGroupHoleDecl">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Scores Per Hole <span class="gsWizBadge gsWizBadge--derived">set count for each hole</span></div>
            <div class="gsWizHoleDeclHint">Set how many scores count per hole. Use Set All to apply one value, then adjust individually.</div>
            <div class="gsWizSetAllRow">
              <span class="gsWizSetAllLabel">Set all holes to:</span>
              <div class="gsWizSetAllBtns">
                <button class="gsWizSetAllBtn" onclick="window.gsWiz.setAllHoles('0')">0</button>
                <button class="gsWizSetAllBtn" onclick="window.gsWiz.setAllHoles('1')">1</button>
                <button class="gsWizSetAllBtn" onclick="window.gsWiz.setAllHoles('2')">2</button>
                <button class="gsWizSetAllBtn" onclick="window.gsWiz.setAllHoles('3')">3</button>
                <button class="gsWizSetAllBtn" onclick="window.gsWiz.setAllHoles('4')">4</button>
              </div>
            </div>
            <div class="gsWizHoleDeclGrid" id="gsWizHoleDeclGrid"></div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizGroupStableford">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Stableford Points <span class="gsWizBadge gsWizBadge--derived">default template · adjustable after save</span></div>
            <div class="gsWizStableford">
              <div class="gsWizStableford__hdr">Points per score relative to par</div>
              <div class="gsWizStableford__grid" id="gsWizStablefordGrid"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 4: Handicaps -->
      <div id="gsWizStep4" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 4 OF 4 &nbsp;·&nbsp; HANDICAPS</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">How are handicaps applied?</div>
          <div class="gsWizHint">Configure handicap calculation and when the index takes effect.</div>

          <div class="gsWizAdjBanner hidden" id="gsWizAdjBanner">
            <strong>ADJ GROSS selected on Step 3</strong> — HC Method is forced to CH with Allowance and allowance is fixed at 100%.
          </div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">HC Method <span class="gsWizBadge gsWizBadge--adj hidden" id="gsWizHCMethodBadge">forced by ADJ GROSS</span></div>
            <div class="wizChips" id="gsWizHCMethodChips">
              <button class="wizChip" data-val="CH" onclick="window.gsWiz.selectHCMethod('CH')">CH with Allowance</button>
              <button class="wizChip" data-val="SO" onclick="window.gsWiz.selectHCMethod('SO')">Shots-Off</button>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Allowance <span class="gsWizBadge gsWizBadge--adj hidden" id="gsWizAllowanceBadge">forced by ADJ GROSS</span></div>
            <div class="gsWizSelectWrap">
              <select class="maTextInput gsWizSelect" id="gsWizAllowanceSelect" onchange="window.gsWiz.selectAllowance(this.value)"></select>
            </div>
            <div class="gsWizLockedNote hidden" id="gsWizAllowanceLocked">&#128274; Forced to 100% — ADJ GROSS method</div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Stroke Distribution <span class="gsWizBadge gsWizBadge--derived">derived from rotation + method</span></div>
            <div class="wizChips" id="gsWizStrokeDistChips"></div>
            <div class="gsWizCascadeNote" id="gsWizStrokeDistNote"></div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">HC Effectivity</div>
            <div class="gsWizSelectWrap">
              <select class="maTextInput gsWizSelect" id="gsWizEffSelect" onchange="window.gsWiz.selectEffectivity(this.value)"></select>
            </div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizEffDateWrap">
            <div class="gsWizFieldLabel">Effectivity Date</div>
            <input type="date" class="maTextInput" id="gsWizEffDateInput" onchange="window.gsWiz.onEffDateChange(this.value)">
          </div>

        </div>
      </div>

      <!-- Wizard nav buttons -->
      <div class="gsWizNav">
        <button class="gsWizNavBtn"                  id="gsWizBtnBack" disabled>&#8592; Back</button>
        <button class="gsWizNavBtn gsWizNavBtn--primary" id="gsWizBtnNext" disabled>Next &#8594;</button>
      </div>

    </div><!-- /gsWizMain -->

    <!-- ── SUMMARY ASIDE ── -->
    <div class="gsWizAside">
      <div class="maCard gsWizSummary">
        <header class="maCard__hdr">
          <div class="maCard__title">CURRENT SETTINGS</div>
        </header>
        <div class="maCard__body gsWizSummary__body">

          <div class="gsWizSummary__section">General</div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Game Label</span>  <span class="wizSummary__val empty" id="gsWizSvLabel">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Game Format</span> <span class="wizSummary__val empty" id="gsWizSvFormat">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Competition</span> <span class="wizSummary__val empty" id="gsWizSvCompetition">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Segments</span>    <span class="wizSummary__val empty" id="gsWizSvSegments">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Rotation</span>    <span class="wizSummary__val empty" id="gsWizSvRotation">—</span></div>

          <div class="gsWizSummary__section">Scoring</div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Basis</span>       <span class="wizSummary__val empty" id="gsWizSvBasis">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Method</span>      <span class="wizSummary__val empty" id="gsWizSvMethod">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">System</span>      <span class="wizSummary__val empty" id="gsWizSvSystem">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Best Ball</span>   <span class="wizSummary__val empty" id="gsWizSvBB">—</span></div>

          <div class="gsWizSummary__section">Handicaps</div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">HC Method</span>   <span class="wizSummary__val empty" id="gsWizSvHCMethod">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Allowance</span>   <span class="wizSummary__val empty" id="gsWizSvAllowance">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Stroke Dist</span> <span class="wizSummary__val empty" id="gsWizSvStrokeDist">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Effectivity</span> <span class="wizSummary__val empty" id="gsWizSvHCEff">—</span></div>

        </div>
      </div>
    </div><!-- /gsWizAside -->

  </div><!-- /gsWizLayout -->
</div><!-- /gsWizardContainer -->

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
              <select id="gsTOMethod" class="maTextInput" disabled></select>
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
