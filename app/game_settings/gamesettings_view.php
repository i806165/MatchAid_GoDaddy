<?php
// /public_html/app/game_settings/gamesettings_view.php
?>

<div class="maControlArea">

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

</div>

<!-- ================================================================
     WIZARD CONTAINER
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
           <!-- Game format hint — populated by wizSelectGame() -->
          <div id="gsWizGameHint" class="gsWizHint"></div>
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

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring Basis &nbsp;<span id="gsWizBasisVal" class="gsWizBasisInline">Strokes</span></div>
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
            <select class="maTextInput gsWizSelect" id="gsWizSystemList"></select>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizGroupBB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Best Ball Count</div>
            <div class="wizChips" id="gsWizBBChips"></div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizGroupHoleDecl">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Scores Per Hole</div>
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
            <div class="gsWizFieldLabel">Stableford Points</div>
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

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">HC Method</div>
            <div class="wizChips" id="gsWizHCMethodChips">
              <button class="wizChip" data-val="CH" onclick="window.gsWiz.selectHCMethod('CH')">CH with Allowance</button>
              <button class="wizChip" data-val="SO" onclick="window.gsWiz.selectHCMethod('SO')">Shots-Off</button>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Allowance</div>
            <div class="gsWizSelectWrap">
              <select class="maTextInput gsWizSelect" id="gsWizAllowanceSelect" onchange="window.gsWiz.selectAllowance(this.value)"></select>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Stroke Distribution</div>
            <div class="wizChips" id="gsWizStrokeDistChips"></div>
            <div class="gsWizHint" id="gsWizStrokeDistNote"></div>
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
        <button class="gsWizNavBtn"                     id="gsWizBtnBack" disabled>&#8592; Back</button>
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
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">HC Eff.</span>     <span class="wizSummary__val empty" id="gsWizSvHCEff">—</span></div>

        </div>
      </div>
    </div><!-- /gsWizAside -->

  </div><!-- /gsWizLayout -->
</div><!-- /gsWizardContainer -->
