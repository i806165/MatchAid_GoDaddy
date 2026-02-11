<?php
// /public_html/api/game_settings/initGameSettings.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';

header('Content-Type: application/json; charset=utf-8');

try {
  // 1. Auth check
  $userCtx = ServiceUserContext::getUserContext();
  if (!$userCtx || empty($userCtx["ok"])) {
    throw new Exception("Authentication required.", 401);
  }

  // 2. Get Game Context (ensures a game is selected)
  $gameCtx = ServiceContextGame::getGameContext();
  $ggid = $gameCtx["ggid"];
  $game = $gameCtx["game"];

  // 3. Get Roster
  $pdo = Db::pdo();
  $roster = ServiceDbPlayers::getPlayersByGGID($pdo, $ggid);

  // 4. Get Course Pars (placeholder)
  $coursePars = []; // TODO: Implement course par fetching

  // 5. Build payload
  $payload = [
    "ggid" => $ggid,
    "game" => $game,
    "roster" => $roster,
    "coursePars" => $coursePars,
  ];

  echo json_encode(["ok" => true, "payload" => $payload], JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
  $code = $e->getCode() > 0 ? $e->getCode() : 500;
  http_response_code($code);
  Logger::error("API_INIT_GAMESETTINGS_FAIL", ["err" => $e->getMessage()]);
  echo json_encode(["ok" => false, "message" => $e->getMessage()]);
}