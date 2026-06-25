<?php
// /public_html/api/events_home/queryEvents.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";

ma_api_require_auth();

$ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId = trim((string)($_SESSION["SessionClubID"] ?? ""));

if ($ghinId === "" || $clubId === "") {
  ma_respond(401, ["ok" => false, "error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
}

$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;

$mode = strtolower(trim((string)($payload["mode"] ?? "current")));
if (!in_array($mode, ["current", "past", "all"], true)) $mode = "current";

$_SESSION["EH_FILTER_MODE"] = $mode;

try {
  $res = ServiceDbEvents::queryEvents([
    "clubId" => $clubId,
    "adminGHIN" => $ghinId,
    "mode" => $mode,
    "includeCounts" => true
  ]);

  ma_respond(200, [
    "ok" => true,
    "payload" => $res
  ]);
} catch (Throwable $e) {
  error_log("[events_home/queryEvents] EX " . $e->getMessage());
  ma_respond(500, ["ok" => false, "message" => "Server error loading events."]);
}
