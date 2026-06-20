<?php
// /public_html/app/game_import/gameimport_view.php
?>

<!-- Control Area: Title, Administrator, Confirmation toggle -->
<div class="maControlArea">
  <div class="maFieldRow" style="margin-top:0;">

    <div class="maField igField--title">
      <label class="maLabel" for="igTitle">Title (applied to all imported games)</label>
      <input id="igTitle" class="maTextInput" type="text" maxlength="120" autocomplete="off" />
    </div>

    <div class="maField igField--admin">
      <label class="maLabel" for="igAdminSel">Administrator</label>
      <select id="igAdminSel" class="maTextInput" aria-label="Administrator"></select>
    </div>

    <div class="maField igField--confirmed">
      <label class="maLabel">Imported games are</label>
      <div class="igChoiceRow" id="igConfirmedRow" role="group" aria-label="Course Confirmation">
        <button type="button" class="igChoiceBtn is-on" data-value="1">Confirmed</button>
        <button type="button" class="igChoiceBtn" data-value="0">Tentative</button>
      </div>
    </div>

  </div>
</div>

<!-- Cards -->
<div class="maCards" id="igCards">

  <!-- CARD — PASTE (shown on load) -->
  <section class="maCard" id="igPasteCard" aria-label="Game Meta Data">
    <header class="maCard__hdr igCard__hdr--tall">
      <div class="igCard__hdrLeft">
        <div class="maCard__title">GAME META DATA</div>
        <div class="igCard__hint">MM/DD/YYYY, HH:MM AM, Course Name, No. of Tee Times &mdash; one line per game, comma separated</div>
      </div>
      <div class="maCard__actions">
        <button type="button" class="btn btnSecondary" id="igBtnEvaluate">Evaluate</button>
      </div>
    </header>

    <div class="maCard__body">
      <textarea id="igRows" class="maTextArea" rows="8" placeholder="02/15/2026, 08:00 AM, Bethpage Black, 18"></textarea>
    </div>
  </section>

  <!-- CARD — REVIEW (shown after Evaluate) -->
  <section class="maCard" id="igReviewCard" aria-label="Review and Import" style="display:none;">
    <header class="maCard__hdr">
      <div class="maCard__title">REVIEW &amp; IMPORT</div>
      <div class="maCard__actions">
        <button type="button" class="btn btnPrimary" id="igBtnRetry">Go Back</button>
        <button type="button" class="btn btnSecondary" id="igBtnImport">Import</button>
      </div>
    </header>

    <div class="maCard__body">
      <div class="maListRows" style="border:1px solid var(--cardBorder); border-radius:12px; overflow:hidden;">
        <div style="display:grid; grid-template-columns:56px 120px 100px 1fr 90px 90px; gap:10px;
                    padding:10px 12px; background:var(--cardHdrBg); font-weight:600; font-size:12px;">
          <div>#</div><div>Date</div><div>Time</div><div>Course</div><div>Tee Cnt</div><div>Status</div>
        </div>
        <div id="igPreviewRows"></div>
      </div>

      <div class="gmHint" id="igImportHint" style="margin-top:10px;"></div>
    </div>
  </section>

</div>