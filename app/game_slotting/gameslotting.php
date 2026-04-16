<?php
// /app/game_slotting/gameslotting.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

Logger::info("GAMESLOTTING_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
]);

try {
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc['ok'])) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
  }

  // Ensure GGID context
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    header("Location: /app/admin_games/gameslist.php");
    exit;
  }

  $ctx = ServiceContextGame::getGameContext();
  $players = ServiceDbPlayers::getGamePlayers((string)$ggid);

  // Hydrate UI state
  $init = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $ctx['game'],
    "players" => $players,
    "meta" => [
      "toMethod" => $ctx['game']['dbGames_TOMethod'] ?? 'TeeTimes',
      "teeTimeInterval" => (int)($ctx['game']['dbGames_TeeTimeInterval'] ?? 9),
      "availableSuffixes" => ["A", "B", "C", "D"]
    ],
    "returnTo" => "/app/admin_games/gameslist.php",
    "header" => [
      "subtitle" => (string)($ctx['game']["dbGames_Title"] ?? "") . " - GGID " . (string)$ggid
    ]
  ];

  // Provide path constants to JS (no hard-coded paths in JS)
  $paths = [
    "apiSession"    => MA_ROUTE_API_SESSION,
    "routerApi"     => MA_ROUTE_API_ROUTER,
    "apiGHIN"       => MA_ROUTE_API_GHIN,
    "apiSave"       => "/api/game_pairings/savePairings.php",
  ];

  // Chrome values (picked up by chromeHeader.php)
  $maChromeTitle = "Game Slotting";
  $maChromeSubtitle = $init["header"]["subtitle"] ?? "";

  require_once __DIR__ . "/gameslotting_view.php";

} catch (Throwable $e) {
  die("Error loading Game Slotting: " . $e->getMessage());
}