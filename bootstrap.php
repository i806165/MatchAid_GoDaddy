<?php
declare(strict_types=1);

/**
 * MatchAid bootstrap
 * - Defines absolute filesystem paths so you never use ../../
 * - Loads config
 * - Optional: common helpers
 */

// Absolute filesystem path to /public_html
define('MA_ROOT', realpath(__DIR__));

// Key directories
define('MA_API',       MA_ROOT . '/api');
define('MA_API_LIB',   MA_API  . '/lib');
define('MA_API_AUTH',  MA_API  . '/auth');
define('MA_SERVICES',  MA_ROOT . '/services');
define('MA_SVC_CTX',   MA_SERVICES . '/context');
define('MA_SVC_DB',    MA_SERVICES . '/database');
define('MA_SVC_GHIN',  MA_SERVICES . '/GHIN');
define('MA_APP',       MA_ROOT . '/app');
define('MA_API_SESSION', MA_API . '/session');
define('MA_ROUTE_LOGIN', '/app/login/login.php');
define('MA_ROUTE_HOME',  '/');
define('MA_ROUTE_API_ADMIN_GAMES', '/api/admin_games');
define('MA_ROUTE_ADMIN_GAMES',     '/app/admin_games/gameslist.php');
define('MA_ROUTE_API_SESSION',     '/api/session');
define('MA_ROUTE_API_ROUTER',      '/api/session/pageRouter.php');
define('MA_ROUTE_API_GHIN',          '/api/GHIN');
define('MA_ROUTE_API_GAME_MAINT',    '/api/game_maintenance');
define('MA_ROUTE_API_GAME_SETTINGS', '/api/game_settings');
define('MA_ROUTE_API_GAME_PLAYERS',  '/api/game_players');
define('MA_ROUTE_API_GAME_TIMES',  '/api/game_times');
define('MA_ROUTE_API_FAVORITE_PLAYERS', '/api/favorite_players');

ini_set("log_errors", "1");
ini_set("error_log", MA_ROOT . "/logs/matchaid.log");


// Load config once (your config is /public_html/api/config.php)
$MA_CONFIG = require MA_API . '/config.php';
// Expose config via a function (keeps global namespace clean)
function ma_config(): array {
  global $MA_CONFIG;
  return is_array($MA_CONFIG) ? $MA_CONFIG : [];
}
require_once MA_API_LIB . '/Db.php';
Db::init(ma_config()['db'] ?? []);

// Optional helper: JSON response
function ma_respond(int $code, array $body): void {
  http_response_code($code);
  header('Content-Type: application/json');
  echo json_encode($body);
  exit;
}

// Optional helper: read JSON body
function ma_json_in(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: '{}', true);
  return is_array($data) ? $data : [];
}

// Check Login Duration
function ma_api_require_auth(int $ttlMinutes = 360): array
{
  $ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
  if ($ghinId === "") {
    ma_respond(401, ["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }

  $loginTime = trim((string)($_SESSION["SessionLoginTime"] ?? ""));
  if ($loginTime !== "") {
    $loginTs = strtotime($loginTime);
    if ($loginTs !== false) {
      $elapsedMinutes = (int)floor((time() - $loginTs) / 60);
      if ($elapsedMinutes > $ttlMinutes) {
        ma_respond(401, ["ok" => false, "error" => "AUTH_EXPIRED"]);
        exit;
      }
    }
  }

  $adminToken = trim((string)($_SESSION["SessionAdminToken"] ?? ""));
  $userToken  = trim((string)($_SESSION["SessionUserToken"] ?? ""));
  $clubId     = trim((string)($_SESSION["SessionClubID"] ?? ""));
  $clubName   = trim((string)($_SESSION["SessionClubName"] ?? ""));

  if ($adminToken === "" && $userToken === "") {
    ma_respond(401, ["ok" => false, "error" => "AUTH_MISSING_TOKEN"]);
    exit;
  }

  return [
    "ghinId" => $ghinId,
    "adminToken" => $adminToken,
    "userToken" => $userToken,
    "clubId" => $clubId,
    "clubName" => $clubName
  ];
}
