<?php // /public_html/app/score_home/scorehome_view.php ?>
<div class="maCards">
  <section class="maCard" id="shLaunchCard">
    <header class="maCard__hdr"><div class="maCard__title">SCORECARD ID</div></header>
    <div class="maCard__body">
      <div class="maField">
        <label class="maLabel" for="shPlayerKey">Enter 6-digit ID from printed card</label>
        <div class="maInputWrap">
          <input type="text" id="shPlayerKey" class="maTextInput" placeholder="e.g. ABC-123" value="<?= htmlspecialchars($urlKey) ?>">
          <button id="shBtnLaunch" class="btn btnPrimary" type="button">Launch</button>
        </div>
      </div>
    </div>
  </section>

  <section class="maCard isHidden" id="shScorerCard">
    <header class="maCard__hdr"><div class="maCard__title">WHO IS SCORING?</div></header>
    <div class="maCard__body">
      <div class="maChoiceChips" id="shScorerChips"></div>
    </div>
  </section>

  <!-- Game Day Gating Msg -->
  <div id="shGatingMsg" class="maEmptyState isHidden" style="border-color:var(--warn); color:var(--ink);">
    Score entry is only available on the day of play.
    <br><small>Bypassed in Testing Mode.</small>
  </div>
</div>