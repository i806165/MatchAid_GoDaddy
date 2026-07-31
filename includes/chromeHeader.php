<?php
// /includes/chromeHeader.php
// Chrome header: brand + left/right action slots + 3 header lines (collapsible)
// is-event-context class is added when SessionStoredEID is set in session —
// drives the navy brand color cascade via ma_shared.css without any JS.
$_maIsEventContext = !empty($_SESSION['SessionStoredEID']);

// is-player-context class is added when SessionPortal === 'PLAYER PORTAL'
// (set unconditionally by playerhome.php on every load) — drives the
// burgundy brand color cascade the same way. Both classes can be present
// at once (a player viewing a game that belongs to an event); the CSS in
// ma_shared.css gives Player deterministic priority in that case, matching
// game_players.js / game_summary.js's setBottomNav priority (isPlayer
// checked before isEvent).
$_maIsPlayerContext = (($_SESSION['SessionPortal'] ?? '') === 'PLAYER PORTAL');

$_maChromeContextClasses = trim(
  ($_maIsEventContext ? ' is-event-context' : '') .
  ($_maIsPlayerContext ? ' is-player-context' : '')
);
?>
<script>
document.documentElement.classList.toggle('is-event-context', <?= $_maIsEventContext ? 'true' : 'false' ?>);
document.documentElement.classList.toggle('is-player-context', <?= $_maIsPlayerContext ? 'true' : 'false' ?>);
</script>
<header class="maChrome__hdr<?= $_maChromeContextClasses ? ' ' . $_maChromeContextClasses : '' ?>" role="banner">
  <div class="maChrome__hdrRow">

    <div id="chromeBrandSlot" class="maChrome__brand" aria-label="MatchAid Brand">
      <img src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
    </div>

    <!-- Left page action -->
    <div class="maChrome__hdrLeft">
      <button id="chromeBtnLeft" type="button" class="maChrome__hdrBtn" style="display:none;"></button>
    </div>

    <!-- 3-line centered header text -->
    <div class="maChrome__titles" aria-label="Page header">
      <div id="chromeHdrLine1" class="maChrome__title" style="display:none;"></div>
      <div id="chromeHdrLine2" class="maChrome__subtitle" style="display:none;"></div>
      <div id="chromeHdrLine3" class="maChrome__subtitle2" style="display:none;"></div>
    </div>

    <!-- Right page action -->
    <div class="maChrome__hdrRight">
      <?php if (!empty($pageHelpKey) && ServicePageHelp::hasHelp($pageHelpKey)): ?>
        <button
          type="button"
          class="maHelpBtn"
          data-help-open
          aria-label="Open page help"
          title="Help"
        >
          <img src="/assets/images/question_mark.png" alt="Help" width="26" height="26" />
        </button>
      <?php endif; ?>
      <button id="chromeBtnRight" type="button" class="maChrome__hdrBtn" style="display:none;"></button>
    </div>

  </div>
</header>