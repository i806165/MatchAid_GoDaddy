<?php
declare(strict_types=1);
// /api/event_roster/getEventPlayersEventImport.php
//
// Existing Event import. Pulls a chosen prior event's full roster
// (db_EventPlayers) for review before enrolling into the CURRENT
// event's roster. No tee logic — event rosters never carry tees.
// Mirrors getGamePlayersEventImport.php's shape exactly; only the
// source table and lookup methods differ.

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";

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

    // ── Input ─────────────────────────────────────────────────────────────────
    $in         = ma_json_in();
    $sourceEID  = (int)($in["sourceEID"] ?? 0);
    if ($sourceEID <= 0) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Missing source event id."]);
        exit;
    }

    // ── Destination — the CURRENT event, distinct from the source event ─────
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);
    if ($eid <= 0) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    if ($sourceEID === $eid) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Source and destination event cannot be the same."]);
        exit;
    }

    $sourceEvent = ServiceDbEvents::getEventByEID($sourceEID);
    if (!$sourceEvent) {
        http_response_code(404);
        echo json_encode(["ok" => false, "message" => "Source event not found."]);
        exit;
    }

    $sourcePlayers = ServiceDbEventPlayers::getEventRoster($sourceEID);
    $enrolledGHINs = array_flip(ServiceDbEventPlayers::getEnrolledGHINs($eid));

    $rows = [];
    foreach ($sourcePlayers as $p) {
        $ghin = trim((string)($p["dbEventPlayers_GHIN"] ?? ""));

        $rows[] = [
            "ghin"            => $ghin,
            "playerName"      => trim((string)($p["dbEventPlayers_Name"]   ?? "")),
            "gender"          => (string)($p["dbEventPlayers_Gender"] ?? ""),
            "alreadyOnRoster" => isset($enrolledGHINs[$ghin]),
        ];
    }

    echo json_encode([
        "ok" => true,
        "payload" => [
            "sourceEvent" => [
                "eid"       => (string)($sourceEvent["dbEvents_EID"] ?? ""),
                "title"     => (string)($sourceEvent["dbEvents_Title"] ?? ""),
                "startDate" => (string)($sourceEvent["dbEvents_StartDate"] ?? ""),
            ],
            "playerCount" => count($rows),
            "rows"        => $rows,
        ]
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("EVENT_ROSTER_GET_EVENT_PLAYERS_IMPORT_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "message" => "Unable to load event players."
    ]);
}
