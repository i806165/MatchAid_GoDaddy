<?php
declare(strict_types=1);
// /public_html/app/score_entry/scoreentry_view.php
?>
<div class="scoreEntryShell" id="scoreEntryRoot">
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

</div>
