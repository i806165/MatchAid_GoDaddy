<?php
// /public_html/app/event_scorecard/eventscorecard_view.php
// Pure markup only — no business logic.
//
// #esControls (page-owned, in .maControlArea above <main>) gets the round
// selector, inserted client-side by event_scorecard.js.
//
// This .maPanel is the module's own shell — controls (KPI pills +
// expand/collapse) / body (scrollable cards) / footer (hint text) — per
// the CONTRACT in ma_shared.css Section 9: .maPanel__body is the ONLY
// scrollable region. No outer wrapping card — module renders directly
// into #esModuleHost.
?>
<section class="maPanel" id="esScorecardPanel" aria-label="Event Scorecards">
  <div class="maPanel__controls" id="esModuleControls"></div>
  <div class="maPanel__body"     id="esModuleHost"></div>
  <div class="maPanel__ftr"      id="esModuleFooter"></div>
</section>
