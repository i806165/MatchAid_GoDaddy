<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>
<main class="maPage scoreEntryShell" id="scoreEntryRoot">
  <section class="scoreEntryWork" id="scoreEntryWork">
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

  <div id="scoreBusyOverlay" class="maModalOverlay">
    <section class="maModal" style="max-width: 240px;">
      <div class="maModal__body" style="text-align: center; padding: 30px 20px;">
        <div id="scoreBusyMessage" style="font-weight: 800; font-size: 16px;">Saving...</div>
      </div>
    </section>
  </div>

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
