<?php
declare(strict_types=1);
// /public_html/api/event_settings/initEventSettings.php
//
// Shared self-hydration endpoint for BOTH module_menuEventSettings.js
// and module_setEventPlacementPoints.js — same relationship
// initGameSettings.php has to module_menuGameSettings.js and
// module_setGamePlacementPoints.js on the Game side (one endpoint,
// two callers, no duplication).
//
// Modeled directly on initEventHandicapSettings.php's confirmed, working
// shape (same auth flow, same ServiceContextEvent::getEventContext()
// call, same response-status convention). No roster — neither caller
// reads player-level data; this serves the event record only.
//
// Output: { ok, payload: { eid, event } }
//
// Status code convention matches initEventRoster.php /
// initEventHandicapSettings.php: expected business outcomes (no event
// selected) return HTTP 200 with {ok:false, message}, since
// MA.postJson() throws on any non-2xx status. Only 405 (bad method), 401
// (auth), and 500 (genuine server fault) use real non-2xx status codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";

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

    echo json_encode([
        "ok"      => true,
        "payload" => [
            "eid"   => $eid,
            "event" => $event,
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("INIT_EVENT_SETTINGS_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to load event settings."]);
}
