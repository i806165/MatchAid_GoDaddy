<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_Handicaps.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = (string)($gc["ggid"] ?? "");

  // Gross-scored games don't use handicaps at all — be_recalculateGameHandicaps()
  // already produces an all-zero result for them today, but only after a real
  // GHIN course-handicap call per rated player to get there. Short-circuit here
  // instead: same end state (HI/CH/PH/SO all "0"), zero GHIN calls, and
  // workflow_Handicaps.php itself is untouched — this never calls into it.
  if ((string)($game["dbGames_ScoringMethod"] ?? "") === "ADJ GROSS") {
    foreach (ServiceDbPlayers::getGamePlayers($ggid) as $p) {
      $ghin = (string)($p["dbPlayers_PlayerGHIN"] ?? "");
      if ($ghin === "" || str_starts_with($ghin, "NH")) continue; // same rated-only filter the workflow uses
      ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, [
        "dbPlayers_HI" => "0",
        "dbPlayers_CH" => "0",
        "dbPlayers_PH" => "0",
        "dbPlayers_SO" => "0",
      ]);
    }
    ma_respond(200, [
      "ok" => true,
      "skipped" => true,
      "message" => "Handicaps reset — this game uses gross scoring.",
    ]);
    exit;
  }

  // Optional: specific player GHIN (for single-player refresh)
  // If missing or "all", defaults to "allPlayers"
  $targetGhin = trim((string)($payload["ghin"] ?? ""));
  if ($targetGhin === "" || $targetGhin === "all") $targetGhin = "allPlayers";

  if (!function_exists("be_recalculateGameHandicaps")) {
    ma_respond(200, ["ok" => true, "status" => "ok", "message" => "Workflow not wired yet (PASS-2)."]);
    exit;
  }

  $out = be_recalculateGameHandicaps($ggid, $targetGhin, $game, $auth["adminToken"]);

  ma_respond(200, ["ok" => true, "result" => $out]);
} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
