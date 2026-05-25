<?php
// /public_html/app/game_settings/gamesettings_view.php
?>

<!-- Progress strip — fixed peer to maPage, outside the scroll container -->
<div class="maControlArea" id="gsControlArea">
  <div class="gsWizProgress hidden" id="gsWizProgress">
    <div class="gsWizStep active" onclick="window.gsWiz && window.gsWiz.goToStep(1)">
      <div class="gsWizDot" id="gsWizDot1"></div>
      <div class="gsWizStepLabel">Format</div>
    </div>
    <div class="gsWizStep" onclick="window.gsWiz && window.gsWiz.goToStep(2)">
      <div class="gsWizDot" id="gsWizDot2"></div>
      <div class="gsWizStepLabel">Setup</div>
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

      <!-- ============================================================
           STEP 1: Format — Pairing Strategy + Game Carousel
           ============================================================ -->
      <div id="gsWizStep1" class="gsWizStepPanel maCard">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 1 OF 4 &nbsp;·&nbsp; GAME FORMAT</div>
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
          <div id="gsWizGameHint" class="gsWizHint"></div>

        </div>
      </div>

      <!-- ============================================================
           STEP 2: Setup — Segments + Rotation + Blind Player
           ============================================================ -->
      <div id="gsWizStep2" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 2 OF 4 &nbsp;·&nbsp; SETUP</div>
        </header>
        <div class="maCard__body">

          <!-- Segments — PairPair only -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupSegments">
            <div class="gsWizEyebrow">How is the round segmented?</div>
            <div class="gsWizFieldLabel">Segments</div>
            <div class="wizChips" id="gsWizSegChips"></div>
            <div class="gsWizHint">Segments split the round into independent scoring periods. 3's play three 3-hole segments (9-hole games only). 6's plays three 6-hole segments and 9's plays as two 9-hole segments (18 hole games).</div>
          </div>

          <!-- Rotation Method — PairPair only -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupRotation">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Rotation Method</div>
            <div class="wizChips" id="gsWizRotChips"></div>
            <div class="gsWizHint" id="gsWizRotNote"></div>
          </div>

          <!-- Blind Player — PairField only -->
          <div class="gsWizFieldGroup" id="gsWizGroupBlind">
            <div class="gsWizDivider"></div>
            <div class="gsWizEyebrow">Does this game need a blind player?</div>
            <div class="gsWizToggleRow">
              <label class="gsWizToggleLabel" for="gsWizUseBlind">Use a blind player</label>
              <input type="checkbox" id="gsWizUseBlind" class="gsWizToggle"
                     onchange="window.gsWiz.toggleBlind(this.checked)">
            </div>

            <!-- Revealed when checkbox is on -->
            <div id="gsWizBlindConfig" class="hidden">

              <div class="gsWizFieldGroup">
                <div class="gsWizFieldLabel">Who selects the blind player?</div>
                <div class="maListRow gsWizBlindModeOption" data-mode="group"
                     onclick="window.gsWiz.selectBlindMode('group')">
                  <div class="gsWizBlindModeRadio"></div>
                  <div class="maListRow__col">
                    <div>Scorer selects on game day</div>
                    <div class="maListRow__col--muted" style="font-size:11px;white-space:normal;margin-top:2px">Each group draws from a hat. The scorer picks from the full roster in the scoring portal.</div>
                  </div>
                </div>
                <div class="maListRow gsWizBlindModeOption" data-mode="game"
                     onclick="window.gsWiz.selectBlindMode('game')">
                  <div class="gsWizBlindModeRadio"></div>
                  <div class="maListRow__col">
                    <div>Pre-assign a player now</div>
                    <div class="maListRow__col--muted" style="font-size:11px;white-space:normal;margin-top:2px">The same player's scores are used as the blind for all short groups.</div>
                  </div>
                </div>
              </div>

              <!-- Player select — shown only when mode is game (pre-assigned) -->
              <div class="gsWizFieldGroup hidden" id="gsWizBlindPlayerWrap">
                <div class="gsWizFieldLabel">Blind Player</div>
                <select class="maTextInput gsWizSelect" id="gsWizBlindSelect"
                        onchange="window.gsWiz.selectBlind(this.value)">
                  <option value="">Select player…</option>
                </select>
              </div>

              <div class="gsWizFieldGroup">
                <div class="gsWizFieldLabel">Target Group Size</div>
                <div class="gsWizHint">The total number of scoring players the blind fills up to.</div>
                <div class="wizChips" id="gsWizBlindTargetChips">
                  <button class="wizChip" data-val="2" onclick="window.gsWiz.selectBlindTarget(2)">2</button>
                  <button class="wizChip" data-val="3" onclick="window.gsWiz.selectBlindTarget(3)">3</button>
                  <button class="wizChip" data-val="4" onclick="window.gsWiz.selectBlindTarget(4)">4</button>
                </div>
              </div>

            </div><!-- /gsWizBlindConfig -->
          </div>

        </div>
      </div>

      <!-- ============================================================
           STEP 3: Scoring — Method, System, Best Ball, Points Strategy
           ============================================================ -->
      <div id="gsWizStep3" class="gsWizStepPanel maCard hidden">
        <header class="maCard__hdr">
          <div class="maCard__title">STEP 3 OF 4 &nbsp;·&nbsp; SCORING</div>
        </header>
        <div class="maCard__body">
          <div class="gsWizEyebrow">How is the game scored?</div>

          <!-- Scoring Method -->
          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring Method</div>
            <div class="wizChips" id="gsWizMethodChips">
              <button class="wizChip" data-val="NET"       onclick="window.gsWiz.selectMethod('NET')">NET</button>
              <button class="wizChip" data-val="ADJ GROSS" onclick="window.gsWiz.selectMethod('ADJ GROSS')">GROSS</button>
            </div>
          </div>

          <div class="gsWizDivider"></div>

          <!-- Scoring System -->
          <div class="gsWizFieldGroup">
            <div class="gsWizFieldLabel">Scoring System</div>
            <select class="maTextInput gsWizSelect" id="gsWizSystemList"></select>
            <div class="gsWizHint" id="gsWizSystemHint"></div>
          </div>

          <!-- Best Ball Count — conditional -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupBB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Best Ball Count</div>
            <div class="wizChips" id="gsWizBBChips"></div>
          </div>

          <!-- Hole Declaration -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupHoleDecl">
            <div class="gsWizDivider"></div>
            <button class="gsWizHoleDeclEditBtn" id="gsWizHoleDeclEditBtn"
                    onclick="window.gsWiz.openHoleDeclModal()" aria-label="Edit hole declarations">
              <img src="/assets/images/nav-edit.png" alt="" width="18" height="18">
              <span>Edit scores per hole</span>
            </button>
          </div>

          <!-- Points Strategy — conditional on basis === 'Points' -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupPoints">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Strategy</div>
            <div class="wizChips" id="gsWizPointsStrategyChips"></div>
            <div class="gsWizHint" id="gsWizPointsStrategyHint"></div>
          </div>

          <!-- Stableford points grid -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupStableford">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel" id="gsWizStablefordLabel">Points per Score</div>
            <div class="gsWizStableford">
              <div class="gsWizStableford__hdr">Points awarded per score relative to par — click any value to edit</div>
              <div class="gsWizStableford__grid" id="gsWizStablefordGrid"></div>
            </div>
            <div class="gsWizHint hidden" id="gsWizChicagoNote">
              Each player's quota = 36 minus their course handicap. The player who most exceeds their quota wins.
            </div>
          </div>

          <!-- Nines distribution -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupNines">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Nines Distribution</div>
            <div class="gsWizHint">Points awarded per finish position each hole. Set values for both group sizes — the calculator will apply the correct distribution automatically.</div>
            <div class="gsWizNinesTable" id="gsWizNinesTable"></div>
          </div>

          <!-- LowBall / LowTotal -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupLBLT">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Per Category</div>
            <div class="gsWizHint">Each hole has two independent point opportunities.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Ball — lowest individual score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBLT_LowBall"
                       min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Total — lowest combined team score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBLT_LowTotal"
                       min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

          <!-- LowBall / HighBall -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupLBHB">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Points Per Category</div>
            <div class="gsWizHint">Each hole has two independent point opportunities.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Low Ball — lowest individual score</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBHB_LowBall"
                       min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">High Ball — lower of the two high scores</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizLBHB_HighBall"
                       min="0" max="9" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

          <!-- Vegas -->
          <div class="gsWizFieldGroup hidden" id="gsWizGroupVegas">
            <div class="gsWizDivider"></div>
            <div class="gsWizFieldLabel">Vegas Points</div>
            <div class="gsWizHint">Each side combines their two scores into a two-digit number (low score first). The difference between the two numbers is multiplied by the points-per-unit value.</div>
            <div class="gsWizPointsInputGrid">
              <div class="gsWizPointsInputRow">
                <span class="gsWizPointsInputLabel">Points per unit of difference</span>
                <input class="gsWizPointsInput maTextInput" type="number" id="gsWizVegas_PointsPerUnit"
                       min="1" max="99" step="1" value="1" onchange="window.gsWiz.onPointsInputChange()">
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ============================================================
           STEP 4: Handicaps
           ============================================================ -->
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
              <select class="maTextInput gsWizSelect" id="gsWizAllowanceSelect"
                      onchange="window.gsWiz.selectAllowance(this.value)"></select>
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
              <select class="maTextInput gsWizSelect" id="gsWizEffSelect"
                      onchange="window.gsWiz.selectEffectivity(this.value)"></select>
            </div>
          </div>

          <div class="gsWizFieldGroup hidden" id="gsWizEffDateWrap">
            <div class="gsWizFieldLabel">Effectivity Date</div>
            <input type="date" class="maTextInput" id="gsWizEffDateInput"
                   onchange="window.gsWiz.onEffDateChange(this.value)">
          </div>

        </div>
      </div>

      <!-- Wizard nav buttons -->
      <div class="gsWizNav">
        <button class="btn btnSecondary" id="gsWizBtnBack" disabled>&#8592; Back</button>
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
          <div class="gsWizSummary__row"><span class="gsWizSummary__key">Blind Player</span> <span class="wizSummary__val empty" id="gsWizSvBlind">—</span></div>

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

<!-- ================================================================
     HOLE DECLARATION MODAL
     ================================================================ -->
<div class="maModalOverlay" id="gsHoleDeclOverlay" aria-hidden="true">
  <section class="maModal gsHoleDeclModal" role="dialog" aria-modal="true" aria-labelledby="gsHoleDeclModalTitle">

    <header class="maModal__hdr">
      <div>
        <div class="maModal__title" id="gsHoleDeclModalTitle">Scores Per Hole</div>
        <div class="maModal__subtitle">Declare how many scores count on each hole</div>
      </div>
    </header>

    <div class="maModal__controls">
      <div class="gsWizHint" style="margin-bottom:10px;">Set how many scores count per hole. Use Set All to apply one value, then adjust individually.</div>
      <div class="gsWizSetAllRow">
        <span class="gsWizSetAllLabel">Set all holes to:</span>
        <div class="gsWizSetAllBtns">
          <button class="gsWizSetAllBtn" onclick="window.gsWiz.modalSetAllHoles('0')">0</button>
          <button class="gsWizSetAllBtn" onclick="window.gsWiz.modalSetAllHoles('1')">1</button>
          <button class="gsWizSetAllBtn" onclick="window.gsWiz.modalSetAllHoles('2')">2</button>
          <button class="gsWizSetAllBtn" onclick="window.gsWiz.modalSetAllHoles('3')">3</button>
          <button class="gsWizSetAllBtn" onclick="window.gsWiz.modalSetAllHoles('4')">4</button>
        </div>
      </div>
    </div>

    <div class="maModal__body gsHoleDeclModal__body" id="gsHoleDeclModalBody">
      <div class="gsHoleDeclCols">
        <div class="gsHoleDeclCol">
          <div class="gsHoleDeclColHdr">Front 9</div>
          <div id="gsHoleDeclFront"></div>
        </div>
        <div class="gsHoleDeclDivider"></div>
        <div class="gsHoleDeclCol">
          <div class="gsHoleDeclColHdr">Back 9</div>
          <div id="gsHoleDeclBack"></div>
        </div>
      </div>
    </div>

    <footer class="maModal__ftr">
      <div class="maModal__ftrActions">
        <button class="btn btnSecondary" id="gsHoleDeclCancel" onclick="window.gsWiz.closeHoleDeclModal(false)">Cancel</button>
        <button class="btn btnPrimary"   id="gsHoleDeclSave"   onclick="window.gsWiz.closeHoleDeclModal(true)">Apply</button>
      </div>
    </footer>

  </section>
</div>