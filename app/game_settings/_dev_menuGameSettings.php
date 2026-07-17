<?php
// TEMPORARY — dev-only scratch controller, not wired into the router.
// Not a replacement for gamesettings.php, does not touch any live route.
// Delete once module_menuGameSettings.js can be launched from a real page.
//
// Forces session GGID to 622 for testing so ServiceContextGame's session-
// based hydration (getStoredGGID()/getGameContext()) resolves without
// needing to navigate here through the real game list first.
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// The one hardcoded piece — swap this GGID for whatever game you want to
// test against.
$_SESSION["SessionStoredGGID"] = 622;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DEV — Game Settings Menu</title>
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>">
</head>
<body style="padding:24px; font-family:sans-serif;">

  <p><strong>DEV SCRATCH PAGE</strong> — testing module_menuGameSettings.js against GGID 622. Not a real route.</p>
  <button type="button" id="devOpenMenu" class="btn btnPrimary">Open Game Settings</button>
  <div id="chromeStatusLine" class="maChrome__status status-info" aria-live="polite"></div>

  <?php include __DIR__ . "/../../includes/gameSettingsMenuRows.php"; ?>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_menuGameSettings.js') ?>"></script>
  <script>
    document.getElementById("devOpenMenu").addEventListener("click", () => MA.menuGameSettings.open());
  </script>
</body>
</html>
