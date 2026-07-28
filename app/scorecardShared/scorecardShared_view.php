<?php
// /public_html/app/scorecardShared/scorecardShared_view.php
// Pure markup only — no business logic.
//
// Player/Group/Game mode is a client-side .maSeg tab switch now (see
// scorecardShared.js), rendered into #scControls (.maControlArea) above
// this — not three separate pages.
//
// .maPanels wrapper is REQUIRED, not decorative — same fix Event
// Scorecards needed. ma_shared.css Section 9's own CONTRACT comment is
// explicit: ".maPanel__body is the ONLY scrollable region... do not apply
// overflow directly to .maPanel." That only holds true when .maPanel sits
// inside .maPanels, which supplies the bounded height (.maPanels {
// height:100% }) .maPanel__body's overflow:auto needs to actually kick
// in. Without it, .maPanel just grows with content and .maPage's own
// overflow-y:auto becomes the real (and only) scroll container instead.
//
// No outer wrapping card (dropped along with the old #scHostCard/
// #scHint band) — module renders directly into #scModuleHost.
?>
<div class="maPanels">
  <section class="maPanel" id="scScorecardPanel" aria-label="Scorecards">
    <div class="maPanel__controls" id="scModuleControls"></div>
    <div class="maPanel__body"     id="scModuleHost"></div>
    <div class="maPanel__ftr"      id="scModuleFooter"></div>
  </section>
</div>
