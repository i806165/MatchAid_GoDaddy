<?php
declare(strict_types=1);
// /public_html/api/event_roster/initEventRoster.php
//
// Called by event_roster.php controller at page load.
// Returns full init payload for the Event Roster page.
//
// Output:
//   { ok, eid, event, roster, context }
//
// Status code convention: matches the rest of the app (admin_games) —
// expected business outcomes (no event selected) always return HTTP 200
// with {ok:false, message}, since MA.postJson() throws on any non-2xx
// status. Only 405 (bad method), 401 (auth), and 500 (genuine server
// fault) use real non-2xx status codes.

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
    $ec    = ServiceContextEvent::getEventContext();
    $event = $ec["event"] ?? [];
    $eid   = (int)($ec["eid"] ?? 0);

    if ($eid <= 0) {
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    $roster = ServiceDbEventPlayers::getEventRoster($eid);

    echo json_encode([
        "ok"     => true,
        "eid"    => $eid,
        "event"  => $event,
        "roster" => $roster,
        "context" => [
            "userGHIN"   => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
            "userName"   => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
            "userGender" => (string)($_SESSION["SessionUserGender"] ?? "M"),
            "userState"  => (string)($_SESSION["SessionUserState"]  ?? ""),
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("INIT_EVENT_ROSTER_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to load event roster."]);
}
