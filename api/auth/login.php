
text/x-generic login.php ( PHP script, ASCII text, with CRLF line terminators )
<?php
// /public_html/api/auth/login.php
declare(strict_types=1);

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
  'lifetime' => 0,
  'path'     => '/',
  'secure'   => $secure,
  'httponly' => true,
  'samesite' => 'Lax',
]);

session_start();
header("Content-Type: application/json");

// config lives at /public_html/api/config.php
require_once __DIR__ . "/../../bootstrap.php";
$config = ma_config();
require_once MA_API_LIB . "/HttpClient.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Login.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Users.php";



function json_in(): array {
  $raw = file_get_contents("php://input");
  $data = json_decode($raw ?: "{}", true);
  return is_array($data) ? $data : [];
}

function respond(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body);
  exit;
}

function ghin_get_json(string $url, array $headers = []): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPGET => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_TIMEOUT => 30
  ]);

  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);

  if ($raw === false) throw new RuntimeException("Network error: " . $err);
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = ["raw" => $raw];

  if ($code < 200 || $code >= 300) {
    $msg = $data["message"] ?? $data["error"] ?? "GHIN request failed ($code)";
    throw new RuntimeException($msg);
  }
  return $data;
}

$in = json_in();
$userId = trim((string)($in["userId"] ?? ""));
$pass   = (string)($in["password"] ?? "");

if ($userId === "" || $pass === "") {
  respond(200, ["ok" => false, "message" => "Please enter Email/GHIN and Password."]);
}

$pdo = Db::pdo($config["db"]);

$errInd = "000";

try {
  // Step 1: Login as user (via GHIN_API_Login.php)
$errInd = "100";
$login = be_loginGHIN($userId, $pass);
//error_log("[login.php] Step120 userLogin=" . json_encode($login));

// Extract fields (keep your existing keys, but add fallbacks)
$userToken = (string)($login["golfer_user"]["golfer_user_token"] ?? "");
$ghinId    = (string)(
  $login["golfer_user"]["golfer_id"]
  ?? ($login["golfer_user"]["golfers"][0]["ghin"] ?? "")
);
$first  = (string)($login["golfer_user"]["golfers"][0]["first_name"] ?? "");
$last   = (string)($login["golfer_user"]["golfers"][0]["last_name"] ?? "");
$clubId = (string)($login["golfer_user"]["golfers"][0]["club_id"] ?? "");

if ($ghinId === "" || $userToken === "") throw new RuntimeException("Invalid login response.");
if ($clubId === "") respond(200, ["ok" => false, "message" => "101 Login Failed: GHIN Club Null"]);

$userName = trim($first . " " . $last);

// Step 2: get admin creds by club (via GHIN_API_Login.php)
$errInd = "200";
$adminToken = $userToken;

$adminCreds = be_getAdminCredentialsByClub($clubId);
if ($adminCreds) {
  $adminLogin = be_loginGHIN($adminCreds["ghin"], $adminCreds["password"]);
  $adminToken = (string)($adminLogin["golfer_user"]["golfer_user_token"] ?? $adminToken);
}

  // Step 3: store session immediately (equivalent to storeGHINUser initial save)
  session_regenerate_id(true);
  $errInd = "300";
  $_SESSION["SessionGHINLogonID"] = $ghinId;
  $_SESSION["SessionUSERToken"]   = $userToken;
  $_SESSION["SessionGHINToken"]   = $adminToken;
  $_SESSION["SessionLoginTime"]   = gmdate("c");
  $_SESSION["SessionUserName"]    = $userName;
  $_SESSION["SessionClubID"]      = $clubId;

  ServiceUserContext::storeGHINUser(
  $ghinId,
  $userName,
  ["loginTime" => $_SESSION["SessionLoginTime"]], // minimal, but non-empty
  $adminToken,
  $userToken,
  $config
);

  // Step 4: secure GHIN calls (profile + facility) using admin token
  $errInd = "400";

  $profile = be_getPlayersByID($ghinId, $adminToken);
  $facility = be_getUserFacility($ghinId, $adminToken);

  ServiceUserContext::storeGHINUser(
  $ghinId,
  $userName,
  [
    "loginTime"    => $_SESSION["SessionLoginTime"],
    "profileJson"  => $profile,
    "facilityJson" => $facility
  ],
  $adminToken,
  $userToken,
  $config
);

  // Step 5: persist to session (or DB later)
  $errInd = "500";
  //$_SESSION["profileJson"]  = $profile;
  //$_SESSION["facilityJson"] = $facility;

  // Choose landing page after login
  respond(200, ["ok" => true, "nextUrl" => "/matchaid/index.html"]);

} catch (Throwable $e) {
    error_log("[login.php] errInd={$errInd} EX=" . $e->getMessage());
  error_log("[login.php] TRACE=" . $e->getTraceAsString());
  respond(200, ["ok" => false, "message" => "{$errInd} Invalid GHIN Credentials"]);
}