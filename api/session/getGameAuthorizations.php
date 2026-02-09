<?php
// /public_html/api/session/getGameAuthorizations.php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

header('Content-Type: application/json; charset=utf-8');

try {
  $config = ma_config();
  $pdo = Db::pdo($config["db"]);

  $body = json_decode(file_get_contents("php://input"), true) ?: [];
  $payload = $body["payload"] ?? [];

  $ggid = (int)($payload["ggid"] ?? 0);
  $action = (string)($payload["action"] ?? "");

  if ($ggid <= 0) {
    echo json_encode([
      "ok" => true,
      "payload" => [
        "status" => "Error",
        "role" => "Error",
        "message" => "Missing or invalid GGID.",
      ]
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Logged-in user identity (match your existing session conventions)
  $userGHIN = (string)($_SESSION["SessionGHINLogonID"] ?? "");
  if ($userGHIN === "") {
    http_response_code(401);
    echo json_encode([
      "ok" => false,
      "error" => "NOT_LOGGED_IN",
      "payload" => [
        "status" => "Error",
        "role" => "Error",
        "message" => "Not logged in."
      ]
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Used by the “Open game at same facility” rule (Wix SessionGHINFacilityID)
  $userFacilityId = (string)($_SESSION["SessionGHINFacilityID"] ?? "");

  $auth = ServiceContextGame::computeGameAuthorizations($pdo, [
    "userGHIN" => $userGHIN,
    "ggid" => $ggid,
    "action" => $action,
    "userFacilityId" => $userFacilityId,
  ]);

  echo json_encode([
    "ok" => true,
    "payload" => $auth
  ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  error_log("[MA][getGameAuthorizations] EX " . $e->getMessage());
  http_response_code(500);
  echo json_encode([
    "ok" => false,
    "error" => "SERVER_ERROR",
    "payload" => [
      "status" => "Error",
      "role" => "Error",
      "message" => "Server error."
    ]
  ], JSON_UNESCAPED_SLASHES);
}
