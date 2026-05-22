<?php // /public_html/app/score_home/scorehome_view.php ?>

<div class="sh-page">

  <!-- ── Key Entry Card ───────────────────────────────────────────────── -->
  <div class="maCard" id="shLaunchCard">
    <div class="maCard__hdr">
      <div class="maCard__title">Scorecard ID</div>
    </div>
    <div class="maCard__body">
      <div class="maField">
        <label class="maLabel" for="shPlayerKey">Enter 6-digit ID from printed card</label>
        <div class="maInputWrap">
          <input type="text" id="shPlayerKey" class="maTextInput"
                 placeholder="e.g. ABC-123"
                 value="<?= htmlspecialchars($initPayload['urlKey'] ?? '') ?>"
                 autocomplete="off" autocapitalize="characters" spellcheck="false" />
          <button id="shBtnLaunch" class="btn btnSecondary" type="button">Launch</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Playing Group Card ───────────────────────────────────────────── -->
  <div class="maCard isHidden" id="shGroupCard">

    <div class="maCard__hdr">
      <div class="maCard__title">Playing group</div>
      <div id="shGroupKey" class="maListRow__col--muted" style="font-size:12px"></div>
    </div>

    <!-- Group context strip: tee time / start hole / match (rendered by JS) -->
    <div id="shGroupContext" class="isHidden"></div>

    <!-- Player rows (rendered by JS) -->
    <div id="shPlayerRows"></div>

    <!-- Card footer: setup buttons (rendered by JS, hidden when not needed) -->
    <div id="shCardFooter" class="maPanel__ftr isHidden" style="display:none"></div>

  </div>

  <!-- ── Game Day Gating Message ──────────────────────────────────────── -->
  <div id="shGatingMsg" class="maEmptyState isHidden"
       style="border-color:var(--warn);color:var(--ink);">
    Score entry is only available on the day of play.
    <br><small>Bypassed in Testing Mode.</small>
  </div>

  <!-- ── Action Bar ───────────────────────────────────────────────────── -->
  <div id="shActionBar" class="isHidden">
    <div class="maChrome__ftrActions" style="display:flex; padding:10px 0;">
      <button id="shBtnEnterScores" class="maFtrBtn maFtrBtn--save" type="button" disabled>
        Enter scores
      </button>
      <button id="shBtnSummary" class="maFtrBtn maFtrBtn--cancel" type="button">
        Summary
      </button>
    </div>

    <!-- Secondary actions: change buttons in ready mode -->
    <div id="shSecondaryActions" class="sh-secondaryActions isHidden"></div>
  </div>

</div>

<!-- ── Cart Configuration Drawer ──────────────────────────────────────── -->
<div class="maDrawerOverlay" id="shCartOverlay">
  <section class="maDrawer">

    <div class="maPanel__hdr" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <strong id="shCartDrawerTitle" style="font-size:14px">Cart configuration</strong>
      <button type="button" class="iconBtn btnPrimary" id="shCartClose" aria-label="Close">&#x2715;</button>
    </div>

    <div class="maPanel__body" style="padding:0; overflow-y:auto">
      <!-- Instruction -->
      <div class="maListRow__group" id="shCartInstruction">
        Tap players to assign to Cart 1 — rest go to Cart 2
      </div>

      <!-- Player assignment list -->
      <div id="shCartPlayerList"></div>

      <!-- Cart preview (shown once Cart 1 has ≥1 player) -->
      <div id="shCartPreview" class="isHidden" style="padding:8px 10px 4px"></div>
    </div>

    <div class="maPanel__ftr" style="display:flex;gap:8px">
      <button type="button" class="btn btnPrimary" id="shCartCancel">Cancel</button>
      <button type="button" class="btn btnSecondary" id="shCartConfirm" disabled>Confirm</button>
    </div>

  </section>
</div>

<!-- ── Scorer Selection Drawer ────────────────────────────────────────── -->
<div class="maDrawerOverlay" id="shScorerOverlay">
  <section class="maDrawer">

    <div class="maPanel__hdr" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <strong id="shScorerDrawerTitle" style="font-size:14px">Set scorer</strong>
      <button type="button" class="iconBtn btnPrimary" id="shScorerClose" aria-label="Close">&#x2715;</button>
    </div>

    <div class="maPanel__body" style="padding:0; overflow-y:auto">
      <div class="maListRow__group">Group players</div>
      <div id="shScorerPlayerList"></div>
      <!-- Admin section injected by JS when portal === ADMIN PORTAL -->
      <div id="shScorerAdminSection" class="isHidden">
        <div class="maListRow__group">Admin</div>
        <div id="shScorerAdminRow"></div>
      </div>
    </div>

    <div class="maPanel__ftr" style="display:flex;gap:8px">
      <button type="button" class="btn btnPrimary" id="shScorerCancel">Cancel</button>
      <button type="button" class="btn btnSecondary" id="shScorerConfirm" disabled>Confirm</button>
    </div>

  </section>
</div>