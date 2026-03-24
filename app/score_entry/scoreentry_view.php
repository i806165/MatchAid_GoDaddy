<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>
<main class="maPage scoreEntryShell" id="scoreEntryRoot">

  <section class="maCard scoreLaunchCard" id="scoreLaunchCard">
    <div class="maCard__hdr">
      <div class="maCard__title">Scoring Launchpad</div>
    </div>
    <div class="maCard__body">
      <div class="maField">
        <label class="maLabel" for="scoreEntryPlayerKey">ScoreCard ID</label>
        <div class="scoreLaunchRow">
          <input
            id="scoreEntryPlayerKey"
            class="maTextInput"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="32"
          >
          <button id="scoreEntryLaunchBtn" class="btn btnPrimary" type="button">Launch</button>
        </div>
      </div>

      <div class="scoreLaunchHelp">
        Enter the ScoreCard ID to launch the scoring group.
      </div>
    </div>
  </section>

  <section class="maCard scoreContextCard isHidden" id="scoreContextCard">
    <div class="maCard__hdr">
      <div class="maCard__title">Scoring Conditions</div>
    </div>
    <div class="maCard__body">
      <div class="scoreContextGrid">
        <div class="maField">
          <label class="maLabel">Tee Time</label>
          <span id="ctxTeeTime" class="scoreMetaValue"></span>
        </div>

        <div class="maField">
          <label class="maLabel">Flight</label>
          <span id="ctxFlightId" class="scoreMetaValue"></span>
        </div>

        <div class="maField">
          <label class="maLabel">Pairing</label>
          <span id="ctxPairingId" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Play Time</label>
          <span id="ctxPlayTime" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Holes</label>
          <span id="ctxHoles" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Game Format</label>
          <span id="ctxGameFormat" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Segments + Rotation</label>
          <span id="ctxSegmentsRotation" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Scoring Method</label>
          <span id="ctxScoringMethod" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">HC Method / Allocation / Effectivity</label>
          <span id="ctxHCSettings" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Stroke Distribution</label>
          <span id="ctxStrokeDistribution" class="scoreMetaValue"></span>
        </div>
      </div>
    </div>
  </section>

  <section class="maCard scoreCartCard isHidden" id="scoreCartCard">
    <div class="maCard__hdr">
      <h2 class="maCardTitle">Cart Configuration</h2>
    </div>
    <div class="maCard__body">
      <div class="scoreCartGrid">
        <div class="maField">
          <label class="maLabel" for="cart1Driver">Cart 1 Driver</label>
          <select id="cart1Driver" class="maTextInput"></select>
        </div>
        <div class="maField">
          <label class="maLabel" for="cart1Passenger">Cart 1 Passenger</label>
          <select id="cart1Passenger" class="maTextInput"></select>
        </div>
        <div class="maField">
          <label class="maLabel" for="cart2Driver">Cart 2 Driver</label>
          <select id="cart2Driver" class="maTextInput"></select>
        </div>
        <div class="maField">
          <label class="maLabel" for="cart2Passenger">Cart 2 Passenger</label>
          <select id="cart2Passenger" class="maTextInput"></select>
        </div>
      </div>
      <div class="scoreCartActions" style="margin-top:12px;">
        <button id="scoreCartConfirmBtn" class="btn btnSecondary" type="button">Confirm</button>
      </div>
    </div>
  </section>

  <section class="maCard scoreKeeperCard isHidden" id="scoreKeeperCard">
    <div class="maCard__hdr">
      <div class="maCard__title">Scorekeeper</div>
    </div>
    <div class="maCard__body">
      <div id="scoreKeeperChips" class="maChoiceChips scoreKeeperChips"></div>
      <div id="scoreKeeperWelcome" class="scoreKeeperWelcome"></div>
    </div>
  </section>

  <section class="scoreEntryWork isHidden" id="scoreEntryWork">
    <div class="maCard scoreHoleNav">
      <div class="maCard__body scoreHoleNavBody">
        <div class="scoreHoleNavInner">
          <button id="scorePrevHoleBtn" class="btn btnSecondary" type="button">Prev</button>
          <select id="scoreHoleSelect" class="maTextInput scoreHoleSelect" aria-label="Hole"></select>
          <button id="scoreNextHoleBtn" class="btn btnSecondary" type="button">Next</button>
        </div>
      </div>
    </div>

    <section class="maCard scoreCollectorCard">
      <div class="maCard__body scoreCollectorBody">
        <div id="scoreRowsContainer" class="scoreRows"></div>
      </div>
    </section>
  </section>

  <dialog id="scoreDirtyDialog" class="scoreDirtyDialog">
    <form method="dialog" class="scoreDirtyDialogForm">
      <h3>Unsaved score changes</h3>
      <p>You have unsaved score changes. What would you like to do?</p>
      <div class="scoreDirtyActions">
        <button value="save" class="btn btnPrimary">Save &amp; Continue</button>
        <button value="discard" class="btn">Discard &amp; Leave</button>
        <button value="cancel" class="btn">Cancel</button>
      </div>
    </form>
  </dialog>

</main>
