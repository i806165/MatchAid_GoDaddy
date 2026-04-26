<?php
// /public_html/app/game_settings/gamesettings_view.php
?>

<!-- ================================================================
     WIZARD CONTAINER
     ================================================================ -->
<div id="gsWizardContainer" class="gsWizardContainer hidden">
  <div class="gsWizLayout">

    <!-- ── MAIN STEP AREA ── -->
    <div class="gsWizMain">

      <!-- ============================================================
           STEP 1: Format — Pairing Strategy + Game Carousel
                   + Segments + Rotation (PairPair only)
           ============================================================ -->
      <div id="gsWizStep1" class="gsWizStepPanel maCard">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 1 OF 3 &nbsp;·&nbsp; GAME FORMAT</div>
        </header>
        <div class="maCard__body">

          <!-- Pairing Strategy -->
          <div class="gsWizFieldGroup">
            <div class="gsWizEyebrow">How are players paired?</div>
            <div class="wizChips" id="gsWizPairingChips">
              <button class="wizChip" data-val="PairField" onclick="window.gsWiz.selectPairing('PairField')">Pair vs. Field</button>
              <button class="wizChip" data-val="PairPair"  onclick="window.gsWiz.selectPairing('PairPair')">Pair vs. Pair</button>
            </div>
            <div class="gsWizHint" id="gsWizPairingHint"></div>
          </div>

          <div class="gsWizDivider"></div>

          <!-- Game Format Carousel -->
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

          <!-- Segments — PairPair only -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupSegments">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Segments</div>
            <div class="wizChips" id="gsWizSegChips"></div>
            <div class="gsWizHint">Segments split the round into independent scoring periods. 3's play three 3-hole segments (9-hole games only). 6's plays three 6-hole segments and 9's plays as two 9-hole segments (18 hole games).</div>
          </div>

          <!-- Rotation Method — PairPair only -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupRotation">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Rotation Method</div>
            <div class="wizChips" id="gsWizRotChips"></div>
            <div class="gsWizCascadeNote" id="gsWizRotNote"></div>
          </div>

        </div>
      </div>

      <!-- ============================================================
           STEP 2: Scoring — Method, System, Best Ball, Points Strategy
           ============================================================ -->
      <div id="gsWizStep2" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 2 OF 3 &nbsp;·&nbsp; SCORING</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">How is the game scored?</div>

          <!-- Scoring Method -->
          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring Method</div>
            <div class="wizChips" id="gsWizMethodChips">
              <button class="wizChip" data-val="NET"       onclick="window.gsWiz.selectMethod('NET')">NET</button>
              <button class="wizChip" data-val="ADJ GROSS" onclick="window.gsWiz.selectMethod('ADJ GROSS')">ADJ GROSS</button>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <!-- Scoring System -->
          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring System</div>
            <select class="maTextInput gsWizSelect" id="gsWizSystemList"></select>
          </div>

          <!-- Best Ball Count — conditional -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupBB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Best Ball Count</div>
            <div class="wizChips" id="gsWizBBChips"></div>
          </div>

          <!-- Hole Declaration — conditional -->
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

          <!-- ── Points Strategy — conditional on basis === 'Points' ── -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupPoints">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Strategy</div>
            <div class="wizChips" id="gsWizPointsStrategyChips"></div>
            <div class="gsWizHint" id="gsWizPointsStrategyHint"></div>
          </div>

          <!-- Stableford points grid — shown when strategy === 'Stableford' or 'Chicago' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupStableford">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel" id="gsWizStablefordLabel">Points per Score</div>
            <div class="gsWizStableford">
              <div class="gsWizStableford__hdr">Points awarded per score relative to par — click any value to edit</div>
              <div class="gsWizStableford__grid" id="gsWizStablefordGrid"></div>
            </div>
            <!-- Chicago quota note — shown only when strategy === 'Chicago' -->
            <div class="gsWizCascadeNote hidden" id="gsWizChicagoNote">
              Each player's quota = 36 minus their course handicap. The player who most exceeds their quota wins.
            </div>
          </div>

          <!-- Nines distribution — shown when strategy === 'Nines' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupNines">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Nines Distribution</div>
            <div class="gsWizHint">Points awarded per finish position each hole. Set values for both group sizes — the calculator will apply the correct distribution automatically.</div>
            <div class="gsWizNinesTable" id="gsWizNinesTable"></div>
          </div>

          <!-- LowBall / LowTotal config — shown when strategy === 'LowBallLowTotal' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupLBLT">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Per Category</div>
            <div class="gsWizHint">Each hole has two independent point opportunities.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Ball — lowest individual score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBLT_LowBall" min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Total — lowest combined team score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBLT_LowTotal" min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

          <!-- LowBall / HighBall config — shown when strategy === 'LowBallHighBall' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupLBHB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Per Category</div>
            <div class="gsWizHint">Each hole has two independent point opportunities.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Ball — lowest individual score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBHB_LowBall" min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">High Ball — lower of the two high scores</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBHB_HighBall" min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

          <!-- Vegas config — shown when strategy === 'Vegas' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupVegas">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Vegas Points</div>
            <div class="gsWizHint">Each side combines their two scores into a two-digit number (low score first). The difference between the two numbers is multiplied by the points-per-unit value.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Points per unit of difference</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizVegas_PointsPerUnit" min="1" max="99" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ============================================================
           STEP 3: Handicaps — unchanged from prior Step 4
           ============================================================ -->
      <div id="gsWizStep3" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 3 OF 3 &nbsp;·&nbsp; HANDICAPS</div>
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
        <button class="btn"             id="gsWizBtnBack" disabled>&#8592; Back</button>
        <button class="btn btnSecondary" id="gsWizBtnNext" disabled>Next &#8594;</button>
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
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Game Label</span>   <span class="wizSummary__val empty" id="gsWizSvLabel">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Game Format</span>  <span class="wizSummary__val empty" id="gsWizSvFormat">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Competition</span>  <span class="wizSummary__val empty" id="gsWizSvCompetition">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Segments</span>     <span class="wizSummary__val empty" id="gsWizSvSegments">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Rotation</span>     <span class="wizSummary__val empty" id="gsWizSvRotation">—</span></div>

          <div class="gsWizSummary__section">Scoring</div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Basis</span>        <span class="wizSummary__val empty" id="gsWizSvBasis">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Method</span>       <span class="wizSummary__val empty" id="gsWizSvMethod">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">System</span>       <span class="wizSummary__val empty" id="gsWizSvSystem">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Best Ball</span>    <span class="wizSummary__val empty" id="gsWizSvBB">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Pts Strategy</span> <span class="wizSummary__val empty" id="gsWizSvPointsStrategy">—</span></div>

          <div class="gsWizSummary__section">Handicaps</div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">HC Method</span>    <span class="wizSummary__val empty" id="gsWizSvHCMethod">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Allowance</span>    <span class="wizSummary__val empty" id="gsWizSvAllowance">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Stroke Dist</span>  <span class="wizSummary__val empty" id="gsWizSvStrokeDist">—</span></div>
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">HC Eff.</span>      <span class="wizSummary__val empty" id="gsWizSvHCEff">—</span></div>

        </div>
      </div>
    </div><!-- /gsWizAside -->

  </div><!-- /gsWizLayout -->
</div><!-- /gsWizardContainer -->