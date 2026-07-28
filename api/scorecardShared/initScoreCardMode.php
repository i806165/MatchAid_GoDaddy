<?php
declare(strict_types=1);
// /public_html/api/scorecardShared/initScoreCardMode.php
//
// Called by module_renderScoreCards.js's self-fetch path when the
// Player/Group/Game .maSeg tab changes on the consolidated
// scorecardShared.php page. NOT called on first paint — scorecardShared.php
// bakes the default mode's payload server-side and hands it to mount() as
// initialData; this endpoint only fires after that, on a tab switch.
//
// Security note, same principle as initEventScorecard.php: ggid is
// resolved server-side from session (ServiceContextGame::getStoredGGID()),
// never trusted from the client — there's no per-request ggid parameter
// at all, since this page only ever has one game in play (no round
// selector, unlike Event Scorecards). For group/player mode, scope is
// likewise always the caller's OWN effective GHIN
// (ServiceScoreEntry::getEffectivePlayerGHIN()), resolved server-side —
// the client sends mode only, never a scope value, so there's no way to
// request another player's Group/Player scorecard by passing a different
// scope.
//
// Status code convention matches initEventScorecard.php: expected
// business outcomes (no game selected, no player context for group/player
// mode) return HTTP 200 with {ok:false, error}, since MA.postJson() throws
// on any non-2xx status. Only 405/401/500 use real non-2xx codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
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
    $in   = ma_json_in();
    $mode = strtolower(trim((string)($in["mode"] ?? "game")));
    if (!in_array($mode, ["game", "group", "player"], true)) {
        $mode = "game";
    }

    // ggid from session, not from the client — see file header.
    $ggid = ServiceContextGame::getStoredGGID();
    if (!$ggid) {
        echo json_encode(["ok" => false, "error" => "no_game_selected"]);
        exit;
    }

    $scope = "";
    if ($mode === "group" || $mode === "player") {
        // Own GHIN only — see file header. Never accept a scope value
        // from the request body.
        $ghin = ServiceScoreEntry::getEffectivePlayerGHIN();
        if (!$ghin) {
            echo json_encode(["ok" => false, "error" => "no_player_context"]);
            exit;
        }
        $scope = $ghin;
    }

    // Same shared hydration path the page controller uses for the
    // default mode — one function, two entry points.
    $out = initSharedScoreCard((string)$ggid, $mode, $scope);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    Logger::error("INIT_SCORECARD_MODE_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
}
