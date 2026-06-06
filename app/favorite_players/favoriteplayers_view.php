<?php
// /app/favorite_players/favoriteplayers_view.php
?>
<!-- List screen -->
<section id="fpList">
  <div id="fpEmpty" class="maEmptyState" style="display:none;">
    No favorites found.
  </div>
  <div id="fpListRows" class="fpCardGrid"></div>
</section>

<!-- Entry Form screen -->
<section id="fpForm" class="maCards" style="display:none;">

  <!-- CARD 1 — CONTACT INFORMATION -->
  <div class="maCard">
    <header class="maCard__hdr">
      <div class="maCard__title">CONTACT INFORMATION</div>
    </header>
    <div class="maCard__body">

      <!-- Player identity row -->
      <div class="maListRow" id="fpPlayerRow">
        <div class="maListRow__avatar fpAvatar" id="fpFormAvatar"></div>
        <div class="maListRow__col">
          <div id="fpFormSub" style="font-size:16px; font-weight:800;"></div>
          <div id="fpFormGhin" style="font-size:13px; margin-top:2px;"></div>
        </div>
      </div>

      <!-- Fields -->
      <div class="fpFormFieldRow">
        <div class="maField">
          <label class="maLabel" for="fpEmail">Email</label>
          <div class="maInputWrap maInputWrap--inner">
            <input id="fpEmail" class="maTextInput" type="text" readonly />
            <button type="button" class="maInputInnerBtn" id="fpEmailPickBtn" aria-label="Choose email source">
              <img src="/assets/images/icon_chevron_down.png" width="16" height="16" alt="" />
            </button>
          </div>
        </div>
        <div class="maField">
          <label class="maLabel" for="fpMobile">Mobile / Phone</label>
          <div class="maInputWrap">
            <input id="fpMobile" class="maTextInput" type="tel" autocomplete="tel" />
          </div>
        </div>
        <div class="maField">
          <label class="maLabel" for="fpMemberId">Local ID (Member ID)</label>
          <div class="maInputWrap">
            <input id="fpMemberId" class="maTextInput" type="text" />
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- CARD 2 — GROUP IDENTIFICATION -->
  <div class="maCard">
    <header class="maCard__hdr">
      <div class="maCard__title">GROUP IDENTIFICATION</div>
    </header>
    <div class="maCard__body">
      <div class="fp-groups-header">
        <span class="maLabel">Select all that apply or add a new one</span>
        <button type="button" class="btn btnSecondary" id="fpBtnAddGroup">
          <i class="ti ti-plus" aria-hidden="true"></i>
          Add Group
        </button>
      </div>
      <div class="maChoiceChips" id="fpGroupChips"></div>
    </div>
  </div>

</section>

<!-- ── Import screen (desktop/tablet only) ─────────────────────────────── -->
<section id="fpImport" style="display:none;">

  <!-- UPLOAD CARD -->
  <div class="maCard">
    <header class="maCard__hdr">
      <div class="maCard__title">UPLOAD FILE</div>
      <span id="fpImportCapacity" style="font-size:12px; font-weight:600; color:var(--mutedText);"></span>
    </header>
    <div class="maCard__body" style="padding:14px;">

      <!-- Drop zone -->
      <div id="fpDropZone" class="fpImport__dropZone">
        <i class="ti ti-file-upload fpImport__dropIcon" aria-hidden="true"></i>
        <div class="fpImport__dropTitle">Drop your file here</div>
        <div class="fpImport__dropSub">or tap to browse</div>
        <div class="fpImport__formatPills">
          <span class="fpImport__formatPill fpImport__formatPill--xlsx">
            <i class="ti ti-file-spreadsheet" aria-hidden="true"></i> .xlsx
          </span>
          <span class="fpImport__formatPill fpImport__formatPill--xlsx">
            <i class="ti ti-file-spreadsheet" aria-hidden="true"></i> .xls
          </span>
          <span class="fpImport__formatPill fpImport__formatPill--csv">
            <i class="ti ti-file-text" aria-hidden="true"></i> .csv
          </span>
        </div>
        <button type="button" class="btn" id="fpImportBrowseBtn">
          <i class="ti ti-upload" aria-hidden="true"></i> Choose file
        </button>
        <input
          type="file"
          id="fpImportFileInput"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style="display:none;"
          aria-label="Choose import file"
        />
      </div>

      <!-- Divider -->
      <div class="fpImport__divider">don't have a file yet?</div>

      <!-- Template download row -->
      <div class="maListRow" style="padding:10px 12px; border:1px solid var(--borderSubtle); border-radius:var(--radiusLg);">
        <i class="ti ti-table-export" style="font-size:20px; color:var(--mutedText); flex:0 0 auto;" aria-hidden="true"></i>
        <div class="maListRow__col" style="flex:1;">
          <div style="font-size:13px; font-weight:800; color:var(--ink);">Download template</div>
          <div style="font-size:12px; color:var(--mutedText); margin-top:2px;">Pre-formatted Excel file — fill it in and upload</div>
        </div>
        <button type="button" class="btn" id="fpImportTemplateBtn" style="flex:0 0 auto;">
          <i class="ti ti-download" aria-hidden="true"></i> Download
        </button>
      </div>

    </div>
  </div>

  <!-- REVIEW CARD (hidden until file is parsed + GHIN validated) -->
  <div class="maCard" id="fpImportReviewCard" style="display:none;">
    <header class="maCard__hdr">
      <div class="maCard__title">REVIEW &amp; IMPORT</div>
      <div class="maCard__actions">
        <button type="button" class="btn" id="fpImportRetryBtn">Retry</button>
        <button type="button" class="btn btnSecondary" id="fpImportCommitBtn" disabled>Import</button>
      </div>
    </header>
    <div style="overflow-x:auto;">
      <table class="fpImport__table" id="fpImportTable">
        <thead>
          <tr>
            <th style="width:32px;">#</th>
            <th>GHIN</th>
            <th>Name</th>
            <th>Email</th>
            <th>Mobile</th>
            <th>Member ID</th>
            <th>Groups</th>
            <th style="text-align:right;">Status</th>
          </tr>
        </thead>
        <tbody id="fpImportTableBody">
          <!-- Rows injected by JS -->
        </tbody>
      </table>
    </div>
    <div class="fpImport__summary" id="fpImportSummary"></div>
  </div>

</section>