<?php
declare(strict_types=1);
// /app/score_skins/scoreskins.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

Logger::info("SCORESKINS_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
]);

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = $gc["ggid"];

  // Load player rows and hydrate JSON fields (parity with scorecard initializers)
  $stmtP = Db::pdo()->prepare("
    SELECT *
      FROM db_Players
     WHERE dbPlayers_GGID = :ggid
     ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos, dbPlayers_FlightID, dbPlayers_FlightPos
  ");
  $stmtP->execute([":ggid" => (string)$ggid]);
  $players = $stmtP->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($players as &$p) {
    if (isset($p["dbPlayers_TeeSetDetails"]) && is_string($p["dbPlayers_TeeSetDetails"])) $p["dbPlayers_TeeSetDetails"] = json_decode($p["dbPlayers_TeeSetDetails"], true);
    if (isset($p["dbPlayers_Scores"]) && is_string($p["dbPlayers_Scores"])) $p["dbPlayers_Scores"] = json_decode($p["dbPlayers_Scores"], true);
  }
  unset($p);

  // Re-use the heavy-duty scorecard builder to get hole-by-hole dots and scores
  $payload = ServiceScoreCard::buildGameScorecardsPayload($game, $players);

  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "portal" => $_SESSION["SessionPortal"] ?? "",
    "game" => $game,
    "scorecards" => $payload,
    "header" => [
      "title" => "Hole Champions",
      "subtitle" => $game["dbGames_CourseName"] ?? ""
    ]
  ];
} catch (Throwable $e) {
  Logger::error("SCORESKINS_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: /app/admin_games/gameslist.php");
  exit;
}

$maChromeTitle = "Hole Champions";
$maChromeSubtitle = $initPayload["header"]["subtitle"];
?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MatchAid — Hole Champions</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
<link rel="stylesheet" href="/assets/css/scorecardShared.css?v=1" />
<link rel="stylesheet" href="/assets/css/score_skins.css?v=1" />
</head><body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>
<main class="maPage"><?php require __DIR__ . '/scoreskins_view.php'; ?></main>
<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>
<script>
  window.MA = window.MA || {};
  window.MA.paths = { routerApi: "/api/session/pageRouter.php" };
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.MA.routes = { router: window.MA.paths.routerApi };
</script>
<script src="/assets/js/ma_shared.js?v=1"></script>
<script src="/assets/pages/score_skins.js?v=1"></script>
</body></html>