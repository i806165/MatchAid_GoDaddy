<?php
// /public_html/app/score_skins/scoreskins_view.php
// Pure markup only — no business logic.
//
// CONTROLS BAND: the Hole Champions | By Bet | By Player switch (only when
// side bets are on) and the flight selector (only when flights are active).
// Both are filled in by score_skins.js; the band stays hidden when neither
// applies. The switch host is a plain wrapper so [hidden] wins — .maSeg sets
// display:flex and would override [hidden] on itself.
//
// .maPanels wrapper required — same pattern established across every
// other retrofit in this project: ma_shared.css's CONTRACT for
// .maPanel__body being the only scrollable region only holds when
// .maPanel sits inside .maPanels, which supplies the bounded height.
?>
<div id="scControls" class="maControlArea isHidden">
  <div id="scViewTabsHost" hidden>
    <div class="maSeg" id="scViewTabs" role="tablist" aria-label="Results view">
      <button class="maSegBtn is-active" type="button" role="tab" aria-selected="true"  data-view="champ">Hole Champions</button>
      <button class="maSegBtn"           type="button" role="tab" aria-selected="false" data-view="bet">By Bet</button>
      <button class="maSegBtn"           type="button" role="tab" aria-selected="false" data-view="player">By Player</button>
    </div>
  </div>
  <div id="scFlightHost"></div>
</div>

<main class="maPage" id="scPage">
  <div class="maPanels">
    <section class="maPanel" id="scSkinsPanel" aria-label="Hole Champions">
      <div class="maPanel__body"     id="scModuleHost"></div>
      <div class="maPanel__ftr"      id="scModuleFooter"></div>
    </section>
  </div>
</main>
