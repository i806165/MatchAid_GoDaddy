<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveEventHandicapSettings.php
//
// Saves handicap rules (Method/Allowance/Effectivity/Date) and cascade
// mode to db_Events. Mirrors /api/event_roster/saveFlightConfig.php's
// mode handling exactly.
//
// Request body:
//   { "method": "CH"|"SO", "allowance": 100,
//     "effectivity": "PlayDate"|"Low3"|"Low6"|"Low12"|"Date",
//     "effDate": "YYYY-MM-DD", "mode": "fixed"|"none" }
//
// Success response:
//   { "ok": true, "payload": { "handicapConfig": {...}, "mode": "fixed"|"none" } }
//
// Status code convention: matches saveFlightConfig.php — expected business
// outcomes (bad input, no event selected) return HTTP 200 with
// {ok:false, message}, since MA.postJson() throws on any non-2xx status.
// Only 405 (bad method), 401 (auth), and 500 (genuine server fault) use
// real non-2xx codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessEventCascade.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    echo json_encode(["ok" => false, "message" => "Method not allowed."]);
    exit;
}

try {
    // 1) Auth
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    // 2) EID always from session
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);
    if ($eid <= 0) {
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }
    $event = $ec["event"] ?? ServiceDbEvents::getEventByEID($eid);

    // 3) Input
    $in = ma_json_in();

    $method = trim((string)($in["method"] ?? ""));
    if (!in_array($method, ["CH", "SO"], true)) {
        echo json_encode(["ok" => false, "message" => "Invalid handicap method."]);
        exit;
    }

    $allowance = (int)($in["allowance"] ?? 100);
    if ($allowance < 0 || $allowance > 100 || $allowance % 5 !== 0) {
        echo json_encode(["ok" => false, "message" => "Invalid allowance."]);
        exit;
    }

    $validEff = ["PlayDate", "Low3", "Low6", "Low12", "Date"];
    $effectivity = trim((string)($in["effectivity"] ?? ""));
    if (!in_array($effectivity, $validEff, true)) {
        echo json_encode(["ok" => false, "message" => "Invalid handicap effectivity."]);
        exit;
    }

    $mode = trim((string)($in["mode"] ?? "none"));
    if ($mode !== "fixed") $mode = "none"; // any invalid value coerces to off

    // 4) Resolve effectivity date — same contract as
    //    ServiceDbEvents::enforceHcEffectivity(): PlayDate/Low3/Low6/Low12
    //    always mirror the event's own StartDate; "Date" uses the supplied
    //    value, clamped to not exceed StartDate. dbEvents_HCEffectivityDate
    //    is NOT NULL, so this always resolves to a real value.
    $startDate = substr((string)($event["dbEvents_StartDate"] ?? ""), 0, 10);
    if ($effectivity !== "Date") {
        $effDate = $startDate;
    } else {
        $effDate = substr((string)($in["effDate"] ?? ""), 0, 10);
        if ($effDate === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $effDate)) {
            $effDate = $startDate;
        }
        if ($startDate !== "" && $effDate > $startDate) {
            $effDate = $startDate;
        }
    }

    // 5) Persist
    $updated = ServiceDbEvents::updateEvent($eid, [
        "dbEvents_HCMethod"          => $method,
        "dbEvents_Allowance"         => $allowance,
        "dbEvents_HCEffectivity"     => $effectivity,
        "dbEvents_HCEffectivityDate" => $effDate,
        "dbEvents_HandicapMode"      => $mode,
    ]);

    if (!$updated) {
        Logger::error("SAVE_EVENT_HANDICAP_SETTINGS_FAIL", ["eid" => $eid]);
        echo json_encode(["ok" => false, "message" => "Unable to save handicap settings."]);
        exit;
    }

    // 6) Propagate — only when cascading is on. Off leaves every linked
    //    round exactly as it already is. Rule only, never a refresh — see
    //    spec §5: propagating handicap rules never triggers a recalculation.
    if ($mode === "fixed") {
        WorkflowProcessEventCascade::propagateHandicapConfig($eid, [
            "method"      => $method,
            "allowance"   => $allowance,
            "effectivity" => $effectivity,
            "effDate"     => $effDate,
        ]);
    }

    echo json_encode(["ok" => true, "payload" => [
        "handicapConfig" => [
            "method"      => $method,
            "allowance"   => $allowance,
            "effectivity" => $effectivity,
            "effDate"     => $effDate,
        ],
        "mode" => $mode,
    ]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_HANDICAP_SETTINGS_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving handicap settings."]);
}
