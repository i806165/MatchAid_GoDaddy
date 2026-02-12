<?php
// /public_html/api/game_settings/saveGameSettings.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

// 1) Auth check
$auth = ma_api_require_auth();

// 2) Parse JSON input
$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : [];
$patch   = is_array($payload["patch"] ?? null) ? $payload["patch"] : [];

// 3) Determine GGID (prefer patch, fallback to session)
$ggid = (int)($patch["dbGames_GGID"] ?? 0);
if ($ggid <= 0) {
    $ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);
}

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No Game ID provided.");
    }

    // 4) Delegate to service
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    // 5) Success response
    ma_respond(200, ["ok" => true, "payload" => $result]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_SETTINGS_FAIL", ["ggid" => $ggid, "error" => $e->getMessage()]);
    ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}