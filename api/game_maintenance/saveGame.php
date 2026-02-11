<?php
declare(strict_types=1);

// /public_html/api/game_maintenance/saveGame.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : [];

$mode = strtolower(trim((string)($payload["mode"] ?? "edit")));
if ($mode !== "add" && $mode !== "edit") $mode = "edit";

$patch = $payload["patch"] ?? [];
if (!is_array($patch)) $patch = [];

try {
  $sessionCtx = [
    "ggid" => (int)(ServiceContextGame::getStoredGGID() ?? 0),
    "adminGhin" => (string)($auth["ghinId"] ?? ""),
    "adminName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    // NEW: assoc + club from session (server-trusted)
    "adminAssocId"   => (string)($_SESSION["SessionAdminAssocID"] ?? ""),
    "adminAssocName" => (string)($_SESSION["SessionAdminAssocName"] ?? ""),
    "adminClubId"    => (string)($_SESSION["SessionAdminClubID"] ?? ""),
    "adminClubName"  => (string)($_SESSION["SessionAdminClubName"] ?? ""),
  ];

  $result = ServiceDbGames::saveGame($mode, $patch, $sessionCtx);

  // IMPORTANT RULE: only set SessionStoredGGID after ADD succeeds
  $newGGID = (int)($result["ggid"] ?? 0);
  if ($mode === "add" && $newGGID > 0) {
    $_SESSION["SessionStoredGGID"] = $newGGID;
  }

  ma_respond(200, [
    "ok" => true,
    "mode" => (string)($result["mode"] ?? "edit"),
    "ggid" => $newGGID,
    "game" => $result["game"] ?? null
  ]);
} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
