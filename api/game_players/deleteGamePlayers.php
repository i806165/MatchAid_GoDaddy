<?php
declare(strict_types=1);
// /api/game_players/deleteGamePlayers.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

// Login guard
$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  http_response_code(401);
  echo json_encode(["ok" => false, "message" => "Session expired."]);
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
  // Single getGameContext() call — reused for both blind guard and delete
  $gc      = ServiceContextGame::getGameContext();
  $ggid    = (string)($gc["ggid"] ?? "");
  $gameRow = $gc["game"] ?? [];

  // Blind player guard — prevent deletion of player designated as blind
  $rawBlind   = $gameRow["dbGames_BlindPlayers"] ?? "[]";
  $blindArr   = is_string($rawBlind) ? json_decode($rawBlind, true) : $rawBlind;
  $blindGHINs = array_column(
    array_filter(is_array($blindArr) ? $blindArr : [], fn($b) => isset($b["ghin"])),
    "ghin"
  );

  if (in_array($playerGHIN, $blindGHINs, true)) {
    http_response_code(409);
    echo json_encode([
      "ok"      => false,
      "message" => "This player is designated as the blind player for this game. "
                 . "Remove the blind player assignment in Game Settings before deleting."
    ]);
    exit;
  }

  // Score audit — log deletion of a player who had recorded scores.
  // The JS confirms with the user first; this is a server-side paper trail only.
  $playerRow = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $playerGHIN);
  if ($playerRow) {
    $rawScores = $playerRow["dbPlayers_Scores"] ?? "";
    if ($rawScores && $rawScores !== "" && $rawScores !== "null") {
      $decoded = json_decode((string)$rawScores, true);
      $hasScores = false;
      foreach (($decoded["Scores"] ?? []) as $score) {
        foreach (($score["hole_details"] ?? []) as $hole) {
          if (($hole["adjusted_gross_score"] ?? 0) > 0) {
            $hasScores = true;
            break 2;
          }
        }
      }
      if ($hasScores) {
        Logger::warn("GAMEPLAYERS_DELETE_WITH_SCORES", [
          "ggid"       => $ggid,
          "playerGHIN" => $playerGHIN,
          "playerName" => $playerRow["dbPlayers_Name"] ?? "",
          "deletedBy"  => $_SESSION["SessionGHINLogonID"] ?? "",
        ]);
      }
    }
  }

  $ok = ServiceDbPlayers::deleteGamePlayer($ggid, $playerGHIN);
  echo json_encode(["ok" => $ok]);

} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_DELETE_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to delete player."]);
}