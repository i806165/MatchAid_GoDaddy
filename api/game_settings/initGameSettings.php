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
require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

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

  // Fetch recall templates for the admin
  $adminGHIN = (string)($game["dbGames_AdminGHIN"] ?? "");
  $recallTemplates = ServiceDbGames::getRecallTemplates($adminGHIN);

  // 3. Get Roster
  $roster = ServiceDbPlayers::getGamePlayers((string)$ggid);

  // 4. Get Course Pars (placeholder)
  $coursePars = [];
  $courseId = (string)($game["dbGames_CourseID"] ?? "");
  if ($courseId !== "") {
      // Try admin token first, then user token
      $token = $_SESSION["SessionAdminToken"] ?? $_SESSION["SessionUserToken"] ?? null;
      if ($token) {
          try {
              $rawTeeSets = be_getCourseTeeSets($courseId, $token);
              $coursePars = flattenCoursePars($rawTeeSets);
          } catch (Throwable $e) {
              Logger::warning("API_INIT_PARS_FAIL", ["err" => $e->getMessage()]);
          }
      }
  }

  // 5. Build payload
  $payload = [
    "ggid" => $ggid,
    "game" => $game,
    "roster" => $roster,
    "coursePars" => $coursePars,
    "recallTemplates" => $recallTemplates,
  ];

  echo json_encode(["ok" => true, "payload" => $payload], JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
  $code = $e->getCode() > 0 ? $e->getCode() : 500;
  http_response_code($code);
  Logger::error("API_INIT_GAMESETTINGS_FAIL", ["err" => $e->getMessage()]);
  echo json_encode(["ok" => false, "message" => $e->getMessage()]);
}