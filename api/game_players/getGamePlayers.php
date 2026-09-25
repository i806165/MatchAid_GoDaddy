<?php
declare(strict_types=1);
// /api/game_players/getGamePlayers.php

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/roster/service_GameRosterViews.php";

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

  $payload = [
    "ggid" => $ggid,
    "game" => $game,
    "context" => [
      "userGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
      "userState" => (string)($_SESSION["SessionUserState"] ?? ""),
      "userName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    ],
    "players" => $rows,
  ];

  // Opt-in (roster modal, game_players_display.js): the shared roster-
  // service views, so the modal renders the SAME sort/grouping as the Game
  // Summary page and "Send Tee Sheet" instead of re-deriving its own.
  // Game Players page posts {} and gets the payload above, unchanged.
  $in = ma_json_in();
  if (!empty($in["includeViews"])) {
    // isDimensionActive()'s 3rd param must be the db_Events row (or null).
    $eid           = (int)($game["dbGames_EID"] ?? 0);
    $eventRow      = $eid > 0 ? ServiceDbEvents::getEventByEID($eid) : null;
    $teamsActive   = ServiceDbEvents::isDimensionActive("team",   $game, $eventRow);
    $flightsActive = ServiceDbEvents::isDimensionActive("flight", $game, $eventRow);

    $displayNames = [];
    foreach ($rows as $p) {
      $displayNames[(string)($p["dbPlayers_PlayerGHIN"] ?? "")] = ServiceGameRosterViews::formatPlayerNameLastFirst($p);
    }

    $payload["status"] = ma_getGameAdministrationStatus($rows);
    $payload["displayNames"] = $displayNames;   // GHIN => "Last, First"
    $payload["views"] = [
      "byPlayer"       => ServiceGameRosterViews::buildByPlayerView($rows),
      "byPairing"      => ServiceGameRosterViews::buildByPairingView($rows, $game, $teamsActive, $flightsActive),
      "byPlayingGroup" => ServiceGameRosterViews::buildByPlayingGroupView($rows, $game, $teamsActive, $flightsActive),
    ];
  }

  echo json_encode([
    "ok" => true,
    "payload" => $payload,
  ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_GET_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to load game players."]);
}
