<?php
declare(strict_types=1);
// /public_html/api/event_roster/initEventHandicapSettings.php
//
// Called by module_setHandicapsGameEvent.js's _fetchContext() for
// target: "event". Not something I was given in this chat — reproduced
// from the module's own confirmed CONTEXT_ENDPOINTS reference, modeled
// directly on initEventRoster.php's real, already-confirmed pattern
// (same auth flow, same ServiceContextEvent::getEventContext() call,
// same response-status convention), NOT invented from scratch.
//
// Two real differences from initEventRoster.php, both traced against the
// module's own _hydrateState()/_renderControls() code before writing this,
// not assumed:
//   - Wrapped response: { ok, payload: { eid, event } }, not
//     initEventRoster.php's flat { ok, eid, event, roster, context }.
//     _fetchContext() reads res.payload — an unwrapped response here
//     would silently hydrate everything to defaults, no error thrown.
//   - No roster. Nothing in this module ever reads ctx.roster for the
//     event target — Handicaps operates on the event record itself, not
//     individual players — so it's omitted rather than fetched and
//     ignored.
//
// Status code convention matches initEventRoster.php: expected business
// outcomes (no event selected) return HTTP 200 with {ok:false, message},
// since MA.postJson() throws on any non-2xx status. Only 405/401/500 use
// real non-2xx codes.

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
    Logger::error("INIT_EVENT_HANDICAP_SETTINGS_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to load event handicap settings."]);
}
