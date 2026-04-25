<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/workflows/workflow_Handicaps.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = (string)($gc["ggid"] ?? "");

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
