<?php
// /public_html/api/admin_games/setGameSession.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

// Require authenticated session
$who = (string)($_SESSION["SessionGHINLogonID"] ?? "");
if (trim($who) === "") {
  ma_respond(401, ["ok" => false, "error" => "Not logged in."]);
}

$in = ma_json_in();
if (!isset($in["payload"]) || !is_array($in["payload"])) {
  ma_respond(400, ["ok" => false, "error" => "Missing payload wrapper."]);
}

$ggid = trim((string)($in["payload"]["ggid"] ?? ""));

// Allow clearing the selection
if ($ggid === "") {
  unset($_SESSION["SessionStoredGGID"]);
  ma_respond(200, ["ok" => true, "payload" => ["ggid" => null]]);
}

// Minimal: just set the session variable (as you requested)
$_SESSION["SessionStoredGGID"] = $ggid;

ma_respond(200, ["ok" => true, "payload" => ["ggid" => $ggid]]);
