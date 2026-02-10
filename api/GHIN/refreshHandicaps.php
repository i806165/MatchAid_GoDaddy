<?php
declare(strict_types=1);

// /public_html/api/GHIN/refreshHandicaps.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

// Your workflow file is function-based (not a class)
require_once MA_SERVICES . "/workflows/WorkFlow_Handicaps.php";

$auth = ma_api_require_auth();

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = (string)($gc["ggid"] ?? "");

  if (!function_exists("be_recalculateGameHandicaps")) {
    ma_respond(200, ["ok" => true, "status" => "ok", "message" => "Workflow not wired yet (PASS-2)."]);
    exit;
  }

  $out = be_recalculateGameHandicaps($ggid, "allPlayers", $game, $auth["adminToken"]);

  ma_respond(200, ["ok" => true, "result" => $out]);
} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
