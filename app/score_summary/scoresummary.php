<?php
declare(strict_types=1);
// /public_html/app/score_summary/scoresummary.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API . "/score_summary/initScoreSummary.php";

Logger::info("SCORESUMMARY_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
]);

try {
    $gc = ServiceContextGame::getGameContext();
    $game = $gc["game"] ?? null;
    $ggid = $gc["ggid"] ?? null;

    if (!$game || !$ggid) {
      throw new RuntimeException("Missing game context.");
    }

    $gameRow = ServiceDbGames::getGameByGGID((int)$ggid) ?? $game;
    if (!$gameRow) {
      throw new RuntimeException("Game not found.");
    }

    $gc["game"] = $gameRow;
    $gc["ggid"] = (string)$ggid;

    $initPayload = buildScoreSummaryInit([], $gc);
    if (empty($initPayload["ok"])) {
      throw new RuntimeException((string)($initPayload["message"] ?? "Unable to initialize score summary."));
    }

    $initPayload["ggid"] = (string)$ggid;
  } catch (Throwable $e) {
    Logger::error("SCORESUMMARY_INIT_FAIL", ["err" => $e->getMessage()]);
    header("Location: /app/admin_games/gameslist.php");
    exit;
}

$maChromeTitle = "Score Summary";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
?>
<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Score Summary</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
<link rel="stylesheet" href="/assets/css/score_summary.css?v=1" />
</head><body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>
<div id="ssControls" class="maControlArea"></div>
<main class="maPage"><?php require __DIR__ . '/scoresummary_view.php'; ?></main>
<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>
<script>
  window.MA = window.MA || {};
  window.MA.paths = { routerApi: "/api/session/pageRouter.php" };
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = { router: window.MA.paths.routerApi };
</script>
<script src="/assets/js/ma_shared.js?v=1"></script>
<script src="/assets/pages/score_summary.js?v=1"></script>
</body></html>