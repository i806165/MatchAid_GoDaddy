<?php
// /app/game_slotting/gameslotting.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

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
    ]
  ];

  require_once __DIR__ . "/gameslotting_view.php";

} catch (Throwable $e) {
  die("Error loading Game Slotting: " . $e->getMessage());
}