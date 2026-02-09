<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

$in = ma_json_in();
$playerGHIN = trim((string)($in["playerGHIN"] ?? ""));
if ($playerGHIN === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "Missing playerGHIN."]);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $ggid = (string)($gc["ggid"] ?? "");
  $ok = ServiceDbPlayers::deleteGamePlayer($ggid, $playerGHIN);
  echo json_encode(["ok" => $ok]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to delete player."]);
}
