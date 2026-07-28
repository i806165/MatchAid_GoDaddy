<?php
declare(strict_types=1);
// /public_html/api/event_scorecard/initEventScorecard.php
//
// Called by renderScoreCards.js's self-fetch path on every round
// switch within the Event Scorecards page. NOT called on first paint —
// eventscorecard.php bakes the default round's payload server-side and
// hands it to mount() as initialData; this endpoint only fires after
// that, when the round selector picks a different ggid.
//
// Security note (see the ggid_not_in_event check below): eid is resolved
// server-side from session (ServiceContextEvent::getEventContext()),
// never trusted from the client. The requested ggid is then validated
// against that event's own round list (ServiceDbGames::queryEventGames)
// before hydrating anything — a ggid that doesn't belong to the
// authorized event is rejected outright, rather than passed straight
// through the way the existing $_GET-based scorecardGame.php entrypoint
// does today for a session-stored ggid. Don't relax this to "any ggid
// the client sends" even for convenience — that's the exact gap this
// endpoint exists to close relative to the older pattern.
//
// Status code convention matches initEventRoster.php / getEventRoster.php:
// expected business outcomes (bad/foreign ggid, no event selected) return
// HTTP 200 with {ok:false, error}, since MA.postJson() throws on any
// non-2xx status. Only 405 (bad method), 401 (auth), and 500 (genuine
// server fault) use real non-2xx codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API . "/scorecardShared/initSharedScoreCard.php";

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
    $in    = ma_json_in();
    $ggid  = trim((string)($in["ggid"]  ?? ""));
    $mode  = strtolower(trim((string)($in["mode"]  ?? "game")));
    $scope = trim((string)($in["scope"] ?? ""));

    if ($ggid === "") {
        echo json_encode(["ok" => false, "error" => "missing_ggid"]);
        exit;
    }

    // eid from session, not from the client.
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);
    if ($eid <= 0) {
        echo json_encode(["ok" => false, "error" => "no_event_selected"]);
        exit;
    }

    // Requested ggid must belong to THIS event — see file header.
    $roundsResult = ServiceDbGames::queryEventGames($eid);
    $rounds       = $roundsResult["games"]["vm"] ?? [];
    $validGgids   = array_map(static fn($r) => (string)($r["ggid"] ?? ""), $rounds);

    if (!in_array($ggid, $validGgids, true)) {
        echo json_encode(["ok" => false, "error" => "ggid_not_in_event"]);
        exit;
    }

    // Same shared hydration path the page controller uses for the
    // default round — one function, two entry points.
    $out = initSharedScoreCard($ggid, $mode, $scope);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    Logger::error("INIT_EVENT_SCORECARD_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
}
