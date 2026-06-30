<?php
declare(strict_types=1);
// /public_html/api/event_roster/deleteEventRosterPlayer.php
//
// Removes a player from the event roster.
// EID always from session. GHIN from request body.
//
// Safety check: if the event has any linked games and the player exists
// in any of those games' db_Players rows, deletion is blocked.
//
// Input:  { playerGHIN: string }
// Output: { ok }
//
// Status code convention: matches the rest of the app (admin_games) —
// expected business outcomes (bad input, conflict, not found) always
// return HTTP 200 with {ok:false, message}, since MA.postJson() throws
// on any non-2xx status and these are outcomes the UI displays inline,
// not exceptional failures. Only 405 (bad method), 401 (auth), and 500
// (genuine server fault) use real non-2xx status codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    echo json_encode(["ok" => false, "message" => "Method not allowed."]);
    exit;
}

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "message" => "Session expired."]);
    exit;
}

$in   = ma_json_in();
$ghin = trim((string)($in["playerGHIN"] ?? ""));

if ($ghin === "") {
    echo json_encode(["ok" => false, "message" => "Missing playerGHIN."]);
    exit;
}

try {
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);

    if ($eid <= 0) {
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    // Safety check — block deletion if player is enrolled in any linked round
    $linkedGames = ServiceDbGames::getGamesByEID($eid);
    $conflicts   = [];

    foreach ($linkedGames as $game) {
        $ggid = (string)($game["dbGames_GGID"] ?? "");
        if ($ggid === "") continue;

        $playerRow = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);
        if ($playerRow) {
            $conflicts[] = [
                "ggid"  => $ggid,
                "title" => trim((string)($game["dbGames_Title"] ?? "")) ?: "a linked round",
            ];
        }
    }

    if (!empty($conflicts)) {
        $firstTitle  = $conflicts[0]["title"];
        $extraCount  = count($conflicts) - 1;
        $summary     = $extraCount > 0
            ? "{$firstTitle} and {$extraCount} more round" . ($extraCount === 1 ? "" : "s")
            : $firstTitle;

        // Default HTTP status (200) — business outcome carried via "ok", per
        // the app-wide convention (see header comment).
        echo json_encode([
            "ok"        => false,
            "message"   => "This player is enrolled in {$summary}. "
                         . "Remove them from all linked rounds before deleting from the event roster.",
            "conflicts" => $conflicts,
        ]);
        exit;
    }

    $deleted = ServiceDbEventPlayers::deleteEventPlayer($eid, $ghin);

    if (!$deleted) {
        echo json_encode(["ok" => false, "message" => "Player not found in event roster."]);
        exit;
    }

    echo json_encode(["ok" => true]);

} catch (Throwable $e) {
    Logger::error("DELETE_EVENT_ROSTER_PLAYER_FAIL", [
        "err"  => $e->getMessage(),
        "ghin" => $ghin,
    ]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to remove player."]);
}
