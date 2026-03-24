<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>
<main class="maPage scoreEntryShell" id="scoreEntryRoot">

  <section class="maCard scoreLaunchCard" id="scoreLaunchCard">
    <div class="maCard__hdr">
      <h1 class="maCardTitle">Score Entry</h1>
      <p class="maCardSubTitle">Enter the ScoreCard ID to launch the scoring group.</p>
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
          <button id="scoreEntryLaunchBtn" class="btn btnSecondary" type="button">Launch</button>
        </div>
      </div>
      <div id="scoreEntryStatus" class="scoreEntryStatus" aria-live="polite"></div>
    </div>
  </section>

  <section class="maCard scoreContextCard isHidden" id="scoreContextCard">
    <div class="maCard__body">
      <div class="scoreContextGrid">
        <div class="maField">
          <label class="maLabel">Game</label>
          <span id="ctxGameTitle" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">Course</label>
          <span id="ctxCourseName" class="scoreMetaValue"></span>
        </div>
        <div class="maField">
          <label class="maLabel">ScoreCard ID</label>
          <span id="ctxPlayerKey" class="scoreMetaValue"></span>
        </div>
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
      <h2 class="maCardTitle">Choose Scorekeeper</h2>
    </div>
    <div class="maCard__body">
      <div id="scoreKeeperChips" class="maChoiceChips"></div>
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
