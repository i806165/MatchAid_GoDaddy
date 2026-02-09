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
          <div class="maField">
            <label class="maLabel" for="fpEmail">Email</label>
            <div class="maInputWrap">
              <input id="fpEmail" class="maTextInput" type="email" autocomplete="email" />
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

        <div class="maPillLabel" style="margin-top:12px;">Groups</div>
        <div class="maChoiceChips" id="fpGroupChips"></div>

        <div class="maFieldRow" style="margin-top:10px;">
          <div class="maField">
            <div class="maInputWrap">
              <input id="fpNewGroup" class="maTextInput" type="text" placeholder="Add a group..." />
            </div>
          </div>
          <div class="maField" style="flex:0 0 auto;">
            <button id="fpBtnAddGroup" type="button" class="btn btnPrimary">Add</button>
          </div>
        </div>
      </div>
    </section>

