<?php
// /public_html/api/game_settings/saveGameSettings.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_API_LIB . '/Http.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SVC_DB . '/service_dbGames.php';

header('Content-Type: application/json; charset=utf-8');

$input = [];
try {
  // 1. Auth check
  $userCtx = ServiceUserContext::getUserContext();
  if (!$userCtx || empty($userCtx["ok"])) {
    throw new Exception("Authentication required.", 401);
  }

  // 2. Get Game Context (ensures a game is selected)
  $gameCtx = ServiceContextGame::getGameContext();
  $ggid = $gameCtx["ggid"];

  // 3. Get input from request body
  $input = Http::getJsonInput();
  $patch = $input['patch'] ?? null;
  if (!$patch || !is_array($patch)) {
    throw new Exception("Invalid input: patch data is missing.", 400);
  }

  // 4. TODO: Server-side validation of the patch data

  // 5. Save to database
  $success = ServiceDbGames::updateGame($ggid, $patch);
  if (!$success) {
    throw new Exception("Database update failed.");
  }

  // 6. Return updated game object
  $updatedGame = ServiceDbGames::getGameByGGID($ggid);

  $payload = [
    "ggid" => $ggid,
    "game" => ServiceContextGame::hydrateForUi($updatedGame),
  ];

  echo json_encode(["ok" => true, "payload" => $payload], JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
  $code = $e->getCode() > 0 ? $e->getCode() : 500;
  http_response_code($code);
  Logger::error("API_SAVE_GAMESETTINGS_FAIL", ["err" => $e->getMessage(), "input" => $input]);
  echo json_encode(["ok" => false, "message" => $e->getMessage()]);
}