<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveEventRosterPlayer.php
//
// Enrolls a single player into the event roster.
// Called from onSelect() and onSelectMany() callbacks on the Event Roster page.
// EID always from session — never trust request body for event identity.
//
// Input:  { player: normalizedPlayerObject }
// Output: { ok, payload: { player: savedRow } }
//
// 409 if player is already enrolled.

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

$in     = ma_json_in();
$player = is_array($in["player"] ?? null) ? $in["player"] : [];

$ghin = trim((string)($player["ghin"] ?? ""));
if ($ghin === "") {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Missing player GHIN."]);
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

    // 409 if already enrolled
    if (ServiceDbEventPlayers::isEnrolled($eid, $ghin)) {
        http_response_code(409);
        echo json_encode([
            "ok"      => false,
            "message" => "Player is already enrolled in this event.",
        ]);
        exit;
    }

    // Build fields from normalized player object
    $firstName = trim((string)($player["first_name"] ?? ""));
    $lastName  = trim((string)($player["last_name"]  ?? ""));
    $fullName  = trim($firstName . " " . $lastName);
    if ($fullName === "") $fullName = $ghin;

    $creatorGHIN = (string)($_SESSION["SessionGHINLogonID"] ?? "");
    $creatorName = (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? "");

    $fields = [
        "dbEventPlayers_Name"        => $fullName,
        "dbEventPlayers_LName"       => $lastName,
        "dbEventPlayers_Gender"      => trim((string)($player["gender"]    ?? "")),
        "dbEventPlayers_HI"          => trim((string)($player["hi"]        ?? "")),
        "dbEventPlayers_ClubID"      => trim((string)($player["club_id"]   ?? "")),
        "dbEventPlayers_ClubName"    => trim((string)($player["club_name"] ?? "")),
        "dbEventPlayers_LocalID"     => trim((string)($player["local_id"]  ?? "")),
        "dbEventPlayers_CreatorID"   => $creatorGHIN,
        "dbEventPlayers_CreatorName" => $creatorName,
    ];

    $saved = ServiceDbEventPlayers::upsertEventPlayer($eid, $ghin, $fields);

    echo json_encode([
        "ok"      => true,
        "payload" => ["player" => $saved],
    ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_ROSTER_PLAYER_FAIL", [
        "err"  => $e->getMessage(),
        "ghin" => $ghin,
    ]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Unable to enroll player."]);
}
