<?php
declare(strict_types=1);
// /api/game_players/getGamePlayers.php

require_once __DIR__ . "/../../bootstrap.php";
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  http_response_code(401);
  echo json_encode(["ok" => false, "message" => "Session expired."]);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"] ?? [];
  $ggid = (string)($gc["ggid"] ?? "");

  $rows = ServiceDbPlayers::getGamePlayers($ggid);
  echo json_encode([
    "ok" => true,
    "payload" => [
      "ggid" => $ggid,
      "game" => $game,
      "context" => [
        "userGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
        "userState" => (string)($_SESSION["SessionUserState"] ?? ""),
        "userName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
      ],
      "players" => $rows,
    ]
  ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_GET_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to load game players."]);
}
