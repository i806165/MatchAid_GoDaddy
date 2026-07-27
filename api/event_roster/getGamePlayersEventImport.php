<?php
declare(strict_types=1);
// /api/event_roster/getGamePlayersEventImport.php
//
// Existing Game import, event destination. Pulls a chosen prior game's
// roster (db_Players) for review before enrolling into the CURRENT
// event's roster (db_EventPlayers).
//
// Deliberately not a copy of /api/game_players/getImportPlayers.php:
// that file resolves its destination via ServiceContextGame (a GGID),
// runs a full tee-matching pass (destTeeSets/resolveTier1/sameCourse),
// and returns per-row tee assignment fields. None of that applies here
// — the destination is an event (ServiceContextEvent, an EID), and
// event rosters carry no tee concept at all. This endpoint reuses only
// the two pieces that are genuinely shared: ServiceDbPlayers::getGamePlayers()
// for the source read, and the same sourceGGID-from-request-body input
// pattern getImportPlayers.php already established.

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
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
    $sourceGGID = trim((string)($in["sourceGGID"] ?? ""));
    if ($sourceGGID === "") {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Missing source game id."]);
        exit;
    }

    // ── Destination — the current EVENT, not a game ──────────────────────────
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);
    if ($eid <= 0) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    $sourceGame = ServiceDbGames::getGameByGGID((int)$sourceGGID);
    if (!$sourceGame) {
        http_response_code(404);
        echo json_encode(["ok" => false, "message" => "Source game not found."]);
        exit;
    }

    $sourcePlayers = ServiceDbPlayers::getGamePlayers($sourceGGID);
    $enrolledGHINs = array_flip(ServiceDbEventPlayers::getEnrolledGHINs($eid));

    $rows = [];
    foreach ($sourcePlayers as $p) {
        $ghin = trim((string)($p["dbPlayers_PlayerGHIN"] ?? ""));

        $rows[] = [
            "ghin"            => $ghin,
            "playerName"      => trim((string)($p["dbPlayers_Name"]   ?? "")),
            "gender"          => (string)($p["dbPlayers_Gender"] ?? ""),
            "alreadyOnRoster" => isset($enrolledGHINs[$ghin]),
        ];
    }

    echo json_encode([
        "ok" => true,
        "payload" => [
            "sourceGame" => [
                "ggid"       => (string)($sourceGame["dbGames_GGID"] ?? ""),
                "playDate"   => (string)($sourceGame["dbGames_PlayDate"] ?? ""),
                "title"      => (string)($sourceGame["dbGames_Title"] ?? ""),
                "courseName" => (string)($sourceGame["dbGames_CourseName"] ?? ""),
            ],
            "playerCount" => count($rows),
            "rows"        => $rows,
        ]
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("EVENT_ROSTER_GET_GAME_PLAYERS_IMPORT_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "message" => "Unable to load game players."
    ]);
}
