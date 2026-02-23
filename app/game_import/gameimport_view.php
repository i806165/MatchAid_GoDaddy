<?php
// /public_html/app/game_import/import_games_view.php
?>
<div class="maCards" id="igCards">

  <!-- CARD — IMPORT -->
  <section class="maCard" aria-label="Import Games">
    <header class="maCard__hdr">
      <div class="maCard__title">IMPORT GAMES</div>
      <div class="maCard__actions"></div>
    </header>

    <div class="maCard__body">

      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="igTitle">Title (applied to all imported games)</label>
          <input id="igTitle" class="maTextInput" type="text" maxlength="120" autocomplete="off" />
        </div>

        <div class="maField" style="flex:0 0 320px;">
          <label class="maLabel" for="igAdminSel">Administrator</label>
          <select id="igAdminSel" class="maTextInput" aria-label="Administrator"></select>
        </div>
      </div>

      <div class="maField" style="margin-top:12px;">
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
