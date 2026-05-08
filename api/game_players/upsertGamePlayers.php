<?php
declare(strict_types=1);
// /api/game_players/upsertGamePlayers.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessPlayers.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

// Auth — token needed for GHIN API calls inside the workflow
$auth  = ma_api_require_auth();
$token = $auth["adminToken"] !== "" ? $auth["adminToken"] : $auth["userToken"];

$in          = ma_json_in();
$playerInput = is_array($in["player"]      ?? null) ? $in["player"]      : [];
$selectedTee = is_array($in["selectedTee"] ?? null) ? $in["selectedTee"] : [];

// Basic input validation before hitting the workflow
$ghin   = trim((string)($playerInput["ghin"]   ?? ""));
$gender = trim((string)($playerInput["gender"] ?? ""));

if ($ghin === "" || $gender === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "Missing player ghin or gender."]);
  exit;
}

try {
  // Game context always from session
  $gc   = ServiceContextGame::getGameContext();
  $ggid = (string)($gc["ggid"] ?? "");
  $game = $gc["game"] ?? [];

  // Creator identity from session
  $creatorGHIN = (string)($_SESSION["SessionGHINLogonID"] ?? "");
  $creatorName = (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? "");

  // Delegate all business logic to workflow
  $saved = WorkflowProcessPlayers::upsertPlayer(
    $playerInput,
    $selectedTee,
    $game,
    $ggid,
    $token,
    $creatorGHIN,
    $creatorName
  );

  echo json_encode(["ok" => true, "payload" => ["player" => $saved]]);

} catch (RuntimeException $e) {
  // Known workflow errors (e.g. tee no longer available) — return as 400
  Logger::error("GAMEPLAYERS_UPSERT_FAIL", ["err" => $e->getMessage()]);
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => $e->getMessage()]);

} catch (Throwable $e) {
  // Unexpected errors — return as 500
  Logger::error("GAMEPLAYERS_UPSERT_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to save player."]);
}