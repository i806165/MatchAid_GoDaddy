<?php
declare(strict_types=1);
// /api/event_roster/getImportSourceEvents.php
//
// Lists past events for the Existing Event import picker (State-1 body).
// No new query logic — service_dbEvents::queryEvents() already supports
// mode:"past" + includeCounts:true, returning rosterCount/gameCount per
// event via its existing eventVm() mapping. This endpoint is a thin
// wrapper, same role as /api/game_players/getImportSourceGames.php one
// level up (events instead of games).

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";

try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        http_response_code(405);
        echo json_encode(["ok" => false, "message" => "Method not allowed."]);
        exit;
    }

    // ── Query — clamped to the signed-in admin, past events only ────────────
    $adminGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));

    $result = ServiceDbEvents::queryEvents([
        "adminGHIN"     => $adminGHIN,
        "mode"          => "past",
        "includeCounts" => true,
    ]);

    $events = $result["events"]["vm"] ?? [];

    echo json_encode([
        "ok" => true,
        "payload" => [
            "events" => $events,
        ]
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("EVENT_ROSTER_GET_IMPORT_SOURCE_EVENTS_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "message" => "Unable to load past events."
    ]);
}
