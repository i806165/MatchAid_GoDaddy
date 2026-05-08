<?php
// /public_html/api/admin_games/setGameSession.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

// Require authenticated session
$who = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
if ($who === "") {
  ma_respond(401, ["ok" => false, "error" => "Not logged in."]);
}

$in = ma_json_in();
if (!isset($in["payload"]) || !is_array($in["payload"])) {
  ma_respond(400, ["ok" => false, "error" => "Missing payload wrapper."]);
}

$ggid = (int)($in["payload"]["ggid"] ?? 0);

// Allow clearing the selection — no auth check needed for a clear
if ($ggid <= 0) {
  unset($_SESSION["SessionStoredGGID"]);
  ma_respond(200, ["ok" => true, "payload" => ["ggid" => null]]);
}

// Verify the caller has a relationship to this game before storing it.
// userFacilityId comes from session (trusted), never from the request.
$userFacilityId = trim((string)($_SESSION["SessionFacilityID"] ?? ""));

$auth = ServiceContextGame::computeGameAuthorizations([
  "userGHIN"       => $who,
  "ggid"           => $ggid,
  "userFacilityId" => $userFacilityId,
  "action"         => "view"
]);

if ($auth["status"] !== "Authorized") {
  ma_respond(403, ["ok" => false, "error" => "Not authorized for this game."]);
}

// Safe to store — user has a verified relationship to this game
$_SESSION["SessionStoredGGID"] = $ggid;

ma_respond(200, ["ok" => true, "payload" => ["ggid" => $ggid]]);