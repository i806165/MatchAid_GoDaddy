<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>
<main class="maPageShell scoreEntryShell" id="scoreEntryRoot">
  <section class="maCard scoreLaunchCard" id="scoreLaunchCard">
    <div class="maCardHeader">
      <h1 class="maCardTitle">Score Entry</h1>
      <p class="maCardSubTitle">Enter the ScoreCard ID to launch the scoring group.</p>
    </div>
    <div class="maCardBody scoreLaunchBody">
      <label class="maLabel" for="scoreEntryPlayerKey">ScoreCard ID</label>
      <div class="scoreLaunchRow">
        <input id="scoreEntryPlayerKey" class="maTextInput" type="text" autocomplete="off" spellcheck="false" maxlength="32">
        <button id="scoreEntryLaunchBtn" class="maBtn maBtnPrimary" type="button">Launch</button>
      </div>
      <div id="scoreEntryStatus" class="scoreEntryStatus" aria-live="polite"></div>
    </div>
  </section>

  <section class="maCard scoreContextCard isHidden" id="scoreContextCard">
    <div class="scoreContextGrid">
      <div><span class="scoreMetaLabel">Game</span><span id="ctxGameTitle" class="scoreMetaValue"></span></div>
      <div><span class="scoreMetaLabel">Course</span><span id="ctxCourseName" class="scoreMetaValue"></span></div>
      <div><span class="scoreMetaLabel">ScoreCard ID</span><span id="ctxPlayerKey" class="scoreMetaValue"></span></div>
      <div><span class="scoreMetaLabel">Tee Time</span><span id="ctxTeeTime" class="scoreMetaValue"></span></div>
      <div><span class="scoreMetaLabel">Flight</span><span id="ctxFlightId" class="scoreMetaValue"></span></div>
      <div><span class="scoreMetaLabel">Pairing</span><span id="ctxPairingId" class="scoreMetaValue"></span></div>
    </div>
  </section>

  <section class="maCard scoreCartCard isHidden" id="scoreCartCard">
    <div class="maCardHeader"><h2 class="maCardTitle">Cart Configuration</h2></div>
    <div class="maCardBody scoreCartGrid">
      <label class="maLabel">Cart 1 Driver<select id="cart1Driver" class="maSelect"></select></label>
      <label class="maLabel">Cart 1 Passenger<select id="cart1Passenger" class="maSelect"></select></label>
      <label class="maLabel">Cart 2 Driver<select id="cart2Driver" class="maSelect"></select></label>
      <label class="maLabel">Cart 2 Passenger<select id="cart2Passenger" class="maSelect"></select></label>
      <div class="scoreCartActions"><button id="scoreCartConfirmBtn" class="maBtn maBtnPrimary" type="button">Confirm</button></div>
    </div>
  </section>

  <section class="maCard scoreKeeperCard isHidden" id="scoreKeeperCard">
    <div class="maCardHeader"><h2 class="maCardTitle">Choose Scorekeeper</h2></div>
    <div class="maCardBody">
      <div id="scoreKeeperChips" class="scoreKeeperChips"></div>
      <div id="scoreKeeperWelcome" class="scoreKeeperWelcome"></div>
    </div>
  </section>

  <section class="scoreEntryWork isHidden" id="scoreEntryWork">
    <div class="scoreHoleNav maCard">
      <div class="scoreHoleNavInner">
        <button id="scorePrevHoleBtn" class="maBtn maBtnSecondary" type="button">Prev</button>
        <select id="scoreHoleSelect" class="maSelect scoreHoleSelect"></select>
        <button id="scoreNextHoleBtn" class="maBtn maBtnSecondary" type="button">Next</button>
      </div>
    </div>

    <section class="maCard scoreCollectorCard">
      <div class="maCardHeader"><h2 class="maCardTitle">Collect Scores</h2></div>
      <div class="maCardBody" id="scoreRowsContainer"></div>
    </section>
  </section>

  <dialog id="scoreDirtyDialog" class="scoreDirtyDialog">
    <form method="dialog" class="scoreDirtyDialogForm">
      <h3>Unsaved score changes</h3>
      <p>You have unsaved score changes. What would you like to do?</p>
      <div class="scoreDirtyActions">
        <button value="save" class="maBtn maBtnPrimary">Save &amp; Continue</button>
        <button value="discard" class="maBtn maBtnSecondary">Discard &amp; Leave</button>
        <button value="cancel" class="maBtn maBtnSecondary">Cancel</button>
      </div>
    </form>
  </dialog>
</main>
