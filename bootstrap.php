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
define('MA_INCLUDES',  MA_ROOT . '/includes');

// Help system
define('MA_HELP_INCLUDES', MA_INCLUDES . '/help');
define('MA_SVC_HELP',      MA_SERVICES . '/help');

define('MA_API_SESSION', MA_API . '/session');
define('MA_ROUTE_LOGIN', '/app/login/login.php');
define('MA_ROUTE_API_LOGIN',  '/api/auth/processLogin.php');
define('MA_ROUTE_API_LOGOUT', '/api/auth/logout.php');

define('MA_ROUTE_HOME',  '/');
define('MA_ROUTE_API_ADMIN_GAMES', '/api/admin_games');
define('MA_ROUTE_ADMIN_GAMES',     '/app/admin_games/adminhome.php');
define('MA_ROUTE_EVENTS_HOME', '/app/events_home/eventshome.php');
define('MA_ROUTE_API_EVENTS_HOME', '/api/events_home');
define('MA_ROUTE_PLAYER_HOME',    '/app/player_home/playerhome.php');
define('MA_ROUTE_API_SESSION',     '/api/session');
define('MA_ROUTE_API_ROUTER',      '/api/session/pageRouter.php');
define('MA_ROUTE_API_GHIN',          '/api/GHIN');
define('MA_ROUTE_API_GAME_MAINT',    '/api/game_maintenance');
define('MA_ROUTE_API_GAME_PAIRINGS', '/api/game_pairings');
define('MA_ROUTE_API_GAME_SETTINGS', '/api/game_settings');
define('MA_ROUTE_API_GAME_PLAYERS',  '/api/game_players');
define('MA_ROUTE_API_ROSTER_VIEW',   '/api/game_players/getGamePlayers.php');
define('MA_ROUTE_API_GAME_TIMES',  '/api/game_times');
define('MA_ROUTE_API_GAME_SUMMARY', '/api/game_summary');
define('MA_ROUTE_GAME_SLOTTING',    '/app/game_slotting/gameslotting.php');
define('MA_ROUTE_API_FAVORITE_PLAYERS', '/api/favorite_players');
define('MA_ROUTE_API_GAME_SCORECARD', '/api/game_scorecard');
define('MA_ROUTE_SCORE_HOME', '/app/score_home/scorehome.php');
define('MA_ROUTE_API_SCORE_ENTRY', '/api/score_entry');
define('MA_ROUTE_API_SCORE_HOME', '/api/score_home');
define('MA_ROUTE_SCORE_ENTRY', '/app/score_entry/scoreentry.php');
define('MA_ROUTE_SCORE_SKINS', '/app/score_skins/scoreskins.php');
define('MA_ROUTE_API_SCORE_SUMMARY', '/api/score_summary');
define('MA_ROUTE_SCORE_SUMMARY', '/app/score_summary/scoresummary.php');
define('MA_ROUTE_API_USER_SETTINGS', '/api/user_settings');
define('MA_ROUTE_USER_SETTINGS',     '/app/user_settings/usersettings.php');
define('MA_ROUTE_CLUB_DEMAND', '/app/club_demand/clubdemand.php');
define('MA_ROUTE_CLUB_USERS', '/app/club_users/clubusers.php');
define('MA_ROUTE_CLUB_HOME', '/app/club_home/clubhome.php');
define('MA_ROUTE_API_MESSAGING', '/api/messaging/initPlayerNotifications.php');
define('MA_ROUTE_API_EXTERNAL', '/api/external');
define("MA_ROUTE_CLUB_MARKETING", "/app/home/clubmarketing.php");

function ma_asset(string $relativePath): string {
    $full = MA_ROOT . $relativePath;
    $v = file_exists($full) ? filemtime($full) : '1';
    return $relativePath . '?v=' . $v;
}


// Global testing flag: Set to true to bypass game-day score entry gating
define('MA_TESTING_MODE', true);
// MatchAid session policy
define('MA_SESSION_IDLE_SECONDS', 21600); // 6 hours
define('MA_AUTH_TTL_MINUTES', 360);       // 6 hours

ini_set("log_errors", "1");
ini_set("error_log", MA_ROOT . "/logs/matchaid.log");

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

$sessionPath = MA_ROOT . '/sessions';
if (!is_dir($sessionPath)) {
  mkdir($sessionPath, 0700, true);
}
ini_set('session.save_path', $sessionPath);

if (session_status() !== PHP_SESSION_ACTIVE) {
  ini_set('session.gc_maxlifetime', (string)MA_SESSION_IDLE_SECONDS);
  session_set_cookie_params([
    'lifetime' => MA_SESSION_IDLE_SECONDS,   // 6-hour cookie, survives app backgrounding
    'path'     => '/',
    'secure'   => true,                      // always; your site is full HTTPS
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  /* OLD SETUP
  session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  */

  session_start();
}

// MatchAid inactivity timeout.
// This controls your app's session variables, independent of PHP's garbage collection timing.
$now = time();
$lastActivity = (int)($_SESSION['SessionLastActivity'] ?? 0);

if ($lastActivity > 0 && ($now - $lastActivity) > MA_SESSION_IDLE_SECONDS) {
  $_SESSION = [];

  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
      session_name(),
      '',
      time() - 42000,
      $params['path'],
      $params['domain'] ?? '',
      (bool)$params['secure'],
      (bool)$params['httponly']
    );
  }

  session_destroy();
  session_start();
}

$_SESSION['SessionLastActivity'] = $now;


// Load config once (your config is /public_html/api/config.php)
$MA_CONFIG = require MA_API . '/config.php';
// Expose config via a function (keeps global namespace clean)
function ma_config(): array {
  global $MA_CONFIG;
  return is_array($MA_CONFIG) ? $MA_CONFIG : [];
}
define('MA_SITE_URL', ma_config()['app']['site_url'] ?? 'https://www.matchaid.org');

require_once MA_API_LIB . '/Db.php';
require_once MA_API_LIB . '/Logger.php';
Db::init(ma_config()['db'] ?? []);

/* 
Logger::info("SESSION_CONFIG", [
  "save_path"       => session_save_path(),
  "gc_maxlifetime"  => ini_get("session.gc_maxlifetime"),
  "gc_probability"  => ini_get("session.gc_probability"),
  "gc_divisor"      => ini_get("session.gc_divisor"),
  "cookie_lifetime" => ini_get("session.cookie_lifetime"),
  "session_path"    => $sessionPath,
  "path_exists"     => is_dir($sessionPath)      ? "yes" : "no",
  "path_writable"   => is_writable($sessionPath) ? "yes" : "no",
]);
*/

// Help service — available globally on all pages
require_once MA_SVC_HELP . '/service_PageHelp.php';

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
function ma_api_require_auth(int $ttlMinutes = MA_AUTH_TTL_MINUTES): array
{
  $ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
  if ($ghinId === "") {
    ma_respond(401, ["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }

  $loginTs = (int)($_SESSION["SessionLoginTime"] ?? 0);
  if ($loginTs > 0) {
    $elapsedMinutes = (int)floor((time() - $loginTs) / 60);
    if ($elapsedMinutes > $ttlMinutes) {
      ma_respond(401, ["ok" => false, "error" => "AUTH_EXPIRED"]);
      exit;
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
    "ghinId"     => $ghinId,
    "adminToken" => $adminToken,
    "userToken"  => $userToken,
    "clubId"     => $clubId,
    "clubName"   => $clubName
  ];
}