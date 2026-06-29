<?php
declare(strict_types=1);
// /public_html/api/event_roster/initEventRoster.php
//
// Called by event_roster.php controller at page load.
// Returns full init payload for the Event Roster page.
//
// Output:
//   { ok, eid, event, roster, context }

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
        http_response_code(400);
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
