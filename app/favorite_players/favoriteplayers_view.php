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