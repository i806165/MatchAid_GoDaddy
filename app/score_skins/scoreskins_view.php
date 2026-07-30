<?php
// /public_html/app/score_skins/scoreskins_view.php
// Pure markup only — no business logic.
//
// .maPanels wrapper required — same pattern established across every
// other retrofit in this project: ma_shared.css's CONTRACT for
// .maPanel__body being the only scrollable region only holds when
// .maPanel sits inside .maPanels, which supplies the bounded height.
?>
<div class="maPanels">
  <section class="maPanel" id="scSkinsPanel" aria-label="Hole Champions">
    <div class="maPanel__controls" id="scModuleControls"></div>
    <div class="maPanel__body"     id="scModuleHost"></div>
    <div class="maPanel__ftr"      id="scModuleFooter"></div>
  </section>
</div>
