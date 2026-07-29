<?php
// /public_html/app/event_skins/eventskins_view.php
// Pure markup only — no business logic.
//
// #esControls (page-owned, in .maControlArea above <main>) gets the
// round selector, inserted client-side by event_skins.js.
//
// .maPanels wrapper required — same fix Event Scorecards/Player-Group-
// Game Scorecards both needed: ma_shared.css's CONTRACT for
// .maPanel__body being the only scrollable region only holds when
// .maPanel sits inside .maPanels, which supplies the bounded height.
?>
<div class="maPanels">
  <section class="maPanel" id="esSkinsPanel" aria-label="Hole Champions">
    <div class="maPanel__controls" id="esModuleControls"></div>
    <div class="maPanel__body"     id="esModuleHost"></div>
    <div class="maPanel__ftr"      id="esModuleFooter"></div>
  </section>
</div>
