<?php
declare(strict_types=1);
// /public_html/api/event_roster/getEventRoster.php
//
// Returns the current event roster as a JSON array.
// Called by event_roster.js after enrollment or deletion
// to refresh the canvas without a full page reload.
//
// Output: { ok, payload: { eid, roster } }

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";

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

try {
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);

    if ($eid <= 0) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    $roster = ServiceDbEventPlayers::getEventRoster($eid);

    echo json_encode([
        "ok"      => true,
        "payload" => [
            "eid"    => $eid,
            "roster" => $roster,
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("GET_EVENT_ROSTER_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to load event roster."]);
}
