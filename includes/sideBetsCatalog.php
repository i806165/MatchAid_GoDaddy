<?php
// /includes/sideBetsCatalog.php
// Bet catalog for module_setGameSideBets.js.
//
// Same split as gameSettingsMenuRows.php: names, order, grouping, and
// defaults live here as plain markup. The module reads this DOM at render
// time (querySelectorAll('[data-bet]')) — it does not own bet content, only
// behavior (status toggle, payout editing, save).
//
// ── Attributes ────────────────────────────────────────────────────────
//   data-group   (on the group wrapper) id used only for grouping.
//   data-label   (on the group wrapper) section header text.
//   data-bet     PERMANENT key. Claims and stored games reference it.
//                Never rename it, never reuse it for a different bet.
//   data-label   Display name. Blank on custom slots (user supplies it).
//   data-desc    Rule text shown in the row. Blank on custom slots.
//   data-type    "achievement" (per-player toggle) or
//                "competitive" (single winner per hole).
//   data-unit    Default payout unit: "points" or "dollars".
//   data-value   Default payout value.
//   data-measure Optional, competitive bets only: the distance score entry asks
//                for when the bet is claimed — "ftin" (feet + inches) or "yd"
//                (yards). Omit for bets with no distance (custom slots).
//   data-sort    Optional, only with data-measure: the order entries are listed on the
//                results page — "ascending" (smallest distance first, e.g. closest to
//                the pin) or "descending" (largest first, e.g. longest drive). Display
//                only. When omitted, feet-inches lists ascending and yards descending.
//   data-custom  "true" = user-editable slot (name, description, type).
//                Omit for fixed template bets.
//   data-retired "true" = hide from games that don't already have it
//                active. Use this instead of deleting a bet.
//
// Order in this file is display order. Add a bet by adding a div; every
// game picks it up as disabled the next time its settings open.
//
// No CSS classes below — this container is never displayed directly
// (hidden), so it needs no styling of its own.
//
// Include this anywhere module_setGameSideBets.js may be opened from —
// same requirement as gameSettingsMenuRows.php.
?>
<div id="sideBetsCatalog" hidden>

  <div data-group="parsave" data-label="Par Saves">
    <div data-bet="sandy"   data-label="Sandy"   data-type="achievement" data-unit="points"  data-value="1" data-desc="Par or better after a bunker shot"></div>
    <div data-bet="arnie"   data-label="Arnie"   data-type="achievement" data-unit="points"  data-value="1" data-desc="Par or better without hitting the fairway"></div>
    <div data-bet="barkie"  data-label="Barkie"  data-type="achievement" data-unit="points"  data-value="1" data-desc="Par or better after hitting a tree"></div>
    <div data-bet="chippy"  data-label="Chippy"  data-type="achievement" data-unit="points"  data-value="1" data-desc="Par or better after holing a chip from off the green"></div>
  </div>

  <div data-group="score" data-label="Score-Based">
    <div data-bet="birdie"  data-label="Birdie"  data-type="achievement" data-unit="points"  data-value="1" data-desc="Birdie or better"></div>
    <div data-bet="eagle"   data-label="Eagle"   data-type="achievement" data-unit="points"  data-value="2" data-desc="Eagle or better"></div>
    <div data-bet="ace"     data-label="Ace"           data-type="achievement" data-unit="points"  data-value="5" data-desc="Hole in one"></div>
    <div data-bet="deuce"   data-label="Deuce"         data-type="achievement" data-unit="points"  data-value="1" data-desc="Score of 2 on the hole"></div>
  </div>

  <div data-group="shots" data-label="Shots">
    <div data-bet="greenie" data-label="Greenie" data-type="achievement" data-unit="points"  data-value="1" data-desc="On the green from the tee and par or better on a par 3"></div>
    <div data-bet="polie"   data-label="Polie"   data-type="achievement" data-unit="points"  data-value="1" data-desc="Holing a putt longer than the flagstick"></div>
    <div data-bet="snake"   data-label="Snake (3-Putt)" data-type="achievement" data-unit="points"  data-value="1" data-desc="Three-putt on the hole. The last player to three-putt holds the snake."></div>
  </div>

  <div data-group="dist" data-label="Distance Contests">
    <div data-bet="ctp" data-label="Closest to the Pin" data-type="competitive" data-unit="dollars" data-value="5" data-measure="ftin" data-sort="ascending" data-desc="Nearest to the hole on a par 3, on the green"></div>
    <div data-bet="ld"  data-label="Longest Drive"      data-type="competitive" data-unit="dollars" data-value="5" data-measure="yd" data-sort="descending" data-desc="Farthest tee shot in the fairway on the designated hole"></div>
    <div data-bet="ctwo"     data-label="Closest in Two" data-type="competitive" data-unit="dollars" data-value="5" data-measure="ftin" data-sort="ascending" data-desc="Nearest to the hole in two shots on the designated par 5"></div>
    <div data-bet="longputt" data-label="Longest Putt"   data-type="competitive" data-unit="dollars" data-value="5" data-measure="ftin" data-sort="descending" data-desc="Longest putt made on the designated hole"></div>
  </div>

  <div data-group="winner" data-label="Hole Winners">
    <div data-bet="prox"     data-label="Prox"      data-type="competitive" data-unit="points" data-value="1" data-desc="Closest to the pin on the green"></div>
    <div data-bet="bingo" data-label="Bingo" data-type="competitive" data-unit="points" data-value="1" data-desc="First ball on the green"></div>
    <div data-bet="bango" data-label="Bango" data-type="competitive" data-unit="points" data-value="1" data-desc="Closest to the pin once all balls are on the green"></div>
    <div data-bet="bongo" data-label="Bongo" data-type="competitive" data-unit="points" data-value="1" data-desc="First to hole out"></div>
    <div data-bet="lowball"  data-label="Low Ball"  data-type="competitive" data-unit="points" data-value="2" data-desc="Lowest individual score on the hole. Tap the player who made it."></div>
    <div data-bet="lowtotal" data-label="Low Total" data-type="competitive" data-unit="points" data-value="2" data-desc="Lowest combined team score on the hole. Tap either player on that team."></div>
  </div>

  <div data-group="cust" data-label="Custom Games">
    <div data-bet="custom1" data-custom="true" data-label="" data-desc="" data-type="achievement" data-unit="points" data-value="1"></div>
    <div data-bet="custom2" data-custom="true" data-label="" data-desc="" data-type="achievement" data-unit="points" data-value="1"></div>
    <div data-bet="custom3" data-custom="true" data-label="" data-desc="" data-type="achievement" data-unit="points" data-value="1"></div>
    <div data-bet="custom4" data-custom="true" data-label="" data-desc="" data-type="achievement" data-unit="points" data-value="1"></div>
    <div data-bet="custom5" data-custom="true" data-label="" data-desc="" data-type="achievement" data-unit="points" data-value="1"></div>
  </div>

</div>
