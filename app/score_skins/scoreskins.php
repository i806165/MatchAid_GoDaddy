<?php
declare(strict_types=1);
// /public_html/app/score_skins/scoreskins.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/score_skins/initScoreSkins.php";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    throw new RuntimeException("No game selected.");
  }

  // First-paint hydration, server-side, through the same shared function
  // initScoreSkins.php calls for its own POST entrypoint.
  $skinsPayload = buildGameHoleChampionsPayload((string)$ggid);
  if (empty($skinsPayload["ok"])) {
    throw new RuntimeException(
      "Unable to load hole champions: " . (string)($skinsPayload["error"] ?? "unknown")
    );
  }

  $initPayload = array_merge($skinsPayload, [
    "portal" => $_SESSION["SessionPortal"] ?? "",
  ]);

} catch (Throwable $e) {
  Logger::error("SCORESKINS_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_ADMIN_GAMES);
  exit;
}

$paths = [
    "routerApi"       => MA_ROUTE_API_ROUTER,
    "initScoreSkins"  => MA_ROUTE_API_SCORE_SKINS . "/initScoreSkins.php",
];

$maChromeTitle    = "Hole Champions";
$maChromeSubtitle = trim((string)($initPayload["game"]["dbGames_CourseName"] ?? ""));
?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Hole Champions</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
</head><body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>

<div id="scControls" class="maControlArea"></div>

<main class="maPage" id="scPage">
<?php require __DIR__ . '/scoreskins_view.php'; ?>
</main>

<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>
<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = Object.assign({}, window.MA.routes || {}, { router: window.MA.paths.routerApi });
</script>
<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/ghin_post_scores.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_DisplayGameFormat.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_renderHoleChampions.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/score_skins.js') ?>"></script>
</body></html>
