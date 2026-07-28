<?php
// /public_html/app/event_scorecard/eventscorecard_view.php
// Pure markup only — no business logic.
//
// #esControls (page-owned, in .maControlArea above <main>) gets the round
// selector, inserted client-side by event_scorecard.js.
//
// .maPanels wrapper is REQUIRED, not decorative — ma_shared.css Section 9's
// own CONTRACT comment is explicit: ".maPanel__body is the ONLY scrollable
// region... do not apply overflow directly to .maPanel." That only holds
// true when .maPanel sits inside .maPanels, which is what supplies the
// bounded height (.maPanels { height:100% }) .maPanel__body's overflow:auto
// needs to actually kick in. Without it, .maPanel just grows with its
// content and .maPage's own overflow-y:auto becomes the real (and only)
// scroll container instead — which is exactly the bug reported: only the
// page-level scrollbar worked, because that page-level scrollbar was the
// only thing actually scrolling.
//
// This .maPanel is the module's own shell — controls (KPI pills +
// expand/collapse) / body (scrollable cards) / footer (hint text). No
// outer wrapping card — module renders directly into #esModuleHost.
?>
<div class="maPanels">
  <section class="maPanel" id="esScorecardPanel" aria-label="Event Scorecards">
    <div class="maPanel__controls" id="esModuleControls"></div>
    <div class="maPanel__body"     id="esModuleHost"></div>
    <div class="maPanel__ftr"      id="esModuleFooter"></div>
  </section>
</div>
