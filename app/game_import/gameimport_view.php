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

  <!-- CARD — IMPORT -->
  <section class="maCard" aria-label="Import Games">
    <header class="maCard__hdr">
      <div class="maCard__title">IMPORT GAMES</div>
      <div class="maCard__actions"></div>
    </header>

    <div class="maCard__body">

      <div class="maField">
        <label class="maLabel" for="igRows">
          Paste games (one per line): MM/DD/YYYY, HH:MM AM, Course Name, TeeTimeCnt
        </label>
        <textarea id="igRows" class="maTextArea" rows="8" placeholder="02/15/2026, 08:00 AM, Bethpage Black, 18"></textarea>
      </div>

      <!-- Review/Import Mode -->
      <div id="igReviewPanel" style="display:none; margin-top:16px;">
        <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div class="maLabel" style="margin:0;">Review &amp; Import</div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btnSecondary" id="igBtnRetry">Retry</button>
            <button type="button" class="btn btnPrimary" id="igBtnImport">Import</button>
          </div>
        </div>

        <div class="maListRows" style="border:1px solid var(--cardBorder); border-radius:12px; overflow:hidden;">
          <div style="display:grid; grid-template-columns:56px 120px 100px 1fr 90px 90px; gap:10px;
                      padding:10px 12px; background:var(--cardHdrBg); font-weight:600; font-size:12px;">
            <div>#</div><div>Date</div><div>Time</div><div>Course</div><div>Tee Cnt</div><div>Status</div>
          </div>
          <div id="igPreviewRows"></div>
        </div>

        <div class="gmHint" id="igImportHint" style="margin-top:10px;"></div>
      </div>

    </div>
  </section>
</div>