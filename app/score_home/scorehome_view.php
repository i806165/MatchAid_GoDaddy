<?php // /public_html/app/score_home/scorehome_view.php ?>
<div class="maCards">
  <section class="maCard" id="shLaunchCard">
    <header class="maCard__hdr"><div class="maCard__title">SCORECARD ID</div></header>
    <div class="maCard__body">
      <div class="maField">
        <label class="maLabel" for="shPlayerKey">Enter 6-digit ID from printed card</label>
        <div class="maInputWrap">
          <input type="text" id="shPlayerKey" class="maTextInput" placeholder="e.g. ABC-123" value="<?= htmlspecialchars($urlKey) ?>">
          <button id="shBtnLaunch" class="btn btnSecondary" type="button">Launch</button>
        </div>
      </div>
    </div>
  </section>

  <section class="maCard isHidden" id="shCartCard">
    <header class="maCard__hdr"><div class="maCard__title">CART CONFIGURATION</div></header>
    <div class="maCard__body">
      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="shCart1Driver">Cart 1 Driver</label>
          <select id="shCart1Driver" class="maTextInput"></select>
        </div>
        <div class="maField">
          <label class="maLabel" for="shCart1Passenger">Cart 1 Passenger</label>
          <select id="shCart1Passenger" class="maTextInput"></select>
        </div>
      </div>
      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="shCart2Driver">Cart 2 Driver</label>
          <select id="shCart2Driver" class="maTextInput"></select>
        </div>
        <div class="maField">
          <label class="maLabel" for="shCart2Passenger">Cart 2 Passenger</label>
          <select id="shCart2Passenger" class="maTextInput"></select>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; justify-content:flex-end;">
        <button id="shBtnCartConfirm" class="btn btnSecondary" type="button">Confirm</button>
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