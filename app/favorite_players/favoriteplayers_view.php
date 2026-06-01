<?php
// /app/favorite_players/favoriteplayers_view.php
// Markup-only view fragment (rendered inside chrome).
?>
<!-- List screen -->
<section id="fpList">
  <div id="fpEmpty" class="maEmptyState" style="display:none;">
    No favorites found.
  </div>
  <div id="fpListRows" class="maListRows"></div>
</section>

<!-- Entry Form screen (dual-route; list is hidden when form active) -->
<section id="fpForm" class="maCard" style="display:none;">
  <div class="maCard__hdr">
    <div class="maCard__title" id="fpFormTitle">Edit Favorite</div>
    <div id="fpFormSub" class="maListRow__col maListRow__col--muted" style="margin-top:4px;"></div>
  </div>

  <div class="maCard__body">
    <div class="maFieldRow">

      <!-- Email field with source picker -->
      <div class="maField">
        <label class="maLabel" for="fpEmail">Email</label>
        <div class="maInputWrap fp-email-wrap">
          <input id="fpEmail" class="maTextInput" type="text" readonly />
          <button type="button" class="fp-email-pick" id="fpEmailPickBtn" aria-label="Choose email source">
            <i class="ti ti-chevrons-up-down" aria-hidden="true"></i>
          </button>
        </div>
        <span class="fp-email-badge" id="fpEmailBadge" style="display:none;"></span>
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

    <!-- Groups header with Add Group button -->
    <div class="fp-groups-header" style="margin-top:12px;">
      <span class="fp-groups-label maPillLabel">Groups</span>
      <button type="button" class="btn btnSecondary fp-btn-add-group" id="fpBtnAddGroup">
        <i class="ti ti-plus" aria-hidden="true"></i>
        Add Group
      </button>
    </div>
    <div class="maChoiceChips" id="fpGroupChips"></div>

  </div>
</section>