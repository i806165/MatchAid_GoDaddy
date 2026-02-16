<?php
// /public_html/app/game_times/gametimes_view.php
?>
  <div class="maCards" id="gtCards">
    <!-- Cards are rendered by /assets/pages/game_times.js into #gtCards -->
  </div>
<?php
// /public_html/app/game_times/gametimes_view.php
?>

<div class="maCards" id="gtCards">

  <!-- Empty state -->
  <section class="maCard" id="gtEmptyCard" style="display:none;" aria-label="No Groups">
    <header class="maCard__hdr">
      <div class="maCard__title">TEE TIMES</div>
    </header>
    <div class="maCard__body">
      <div class="maHint">
        No matches/groups found. Create pairings/matches first, then return to assign tee times.
      </div>
    </div>
  </section>

</div>

<!-- Card Template (JS clones this for each match/group) -->
<template id="gtCardTpl">
  <section class="maCard gtCard" aria-label="Tee Time Group">

    <header class="maCard__hdr">
      <div class="gtCardHdrRow">

        <!-- LEFT: Title + Team line -->
        <div class="gtCardHdrLeft">
          <div class="maCard__titleRow">
            <div class="maCard__title gtTitle">Match 1</div>
            <div class="maCard__meta gtMeta">4 players</div>
          </div>

          <!-- One of these will be shown -->
          <div class="maCard__sub gtTeamLine" style="display:none;"></div>
          <div class="maCard__sub gtNameLine" style="display:none;"></div>
        </div>

        <!-- RIGHT: Actions -->
        <div class="gtCardActions">
          <button type="button" class="btn btnLink gtBtnTime" title="Set tee time">
            Set Time
          </button>

          <button type="button" class="btn btnLink gtBtnHole" title="Set start hole">
            Start Tee
          </button>

          <!-- Shotgun only; JS hides for TeeTimes -->
          <button type="button" class="btn btnLink gtBtnSlot" style="display:none;" title="Set shotgun slot">
            Slot A
          </button>
        </div>

      </div>
    </header>

  </section>
</template>
