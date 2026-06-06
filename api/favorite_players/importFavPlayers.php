<?php
// /api/favorite_players/importFavPlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

const IMPORT_LIMIT      = 200; // max total favorites per admin
const IMPORT_BATCH_MAX  = 100; // max rows in a single import file

// ── Auth ──────────────────────────────────────────────────────────────────
$userGHIN  = (string)($_SESSION["SessionGHINLogonID"] ?? "");
$userState = (string)($_SESSION["SessionUserState"]   ?? "");

if ($userGHIN === "") {
    http_response_code(401);
    echo json_encode(["ok" => false, "message" => "Session expired or not authenticated."]);
    exit;
}

// ── Input ─────────────────────────────────────────────────────────────────
$in   = ma_json_in();
$rows = $in["rows"] ?? [];

if (!is_array($rows) || count($rows) === 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "No rows provided."]);
    exit;
}

if (count($rows) > IMPORT_BATCH_MAX) {
    http_response_code(400);
    echo json_encode([
        "ok"      => false,
        "message" => "Import exceeds maximum batch size of " . IMPORT_BATCH_MAX . " rows.",
    ]);
    exit;
}

// ── Capacity check ────────────────────────────────────────────────────────
$currentFavorites = service_dbFavPlayers::getFavoritesForUser($userGHIN);
$currentCount     = count($currentFavorites);

// Count only NEW rows (not merges) against the cap
$newGhins = array_filter($rows, fn($r) => ($r["status"] ?? "") === "new");
$newCount = count($newGhins);

if (($currentCount + $newCount) > IMPORT_LIMIT) {
    $remaining = max(0, IMPORT_LIMIT - $currentCount);
    http_response_code(400);
    echo json_encode([
        "ok"      => false,
        "message" => "Import would exceed your limit of " . IMPORT_LIMIT . " favorites. "
                   . "You have {$currentCount} and can add {$remaining} more.",
    ]);
    exit;
}

// ── Process rows ──────────────────────────────────────────────────────────
$results   = [];
$imported  = 0;
$merged    = 0;
$skipped   = 0;

foreach ($rows as $row) {
    $playerGHIN  = trim((string)($row["ghin"]       ?? ""));
    $status      = trim((string)($row["status"]     ?? ""));
    $firstName   = trim((string)($row["firstName"]  ?? ""));
    $playerLName = trim((string)($row["lastName"]   ?? ""));
    $playerName  = trim($firstName . " " . $playerLName); // "First Last" combined
    $email       = trim((string)($row["email"]      ?? ""));
    $mobile      = trim((string)($row["mobile"]     ?? ""));
    $memberId    = trim((string)($row["memberId"]   ?? ""));
    $groups      = $row["groups"] ?? [];
    $playerGender= trim((string)($row["gender"]     ?? ""));

    // Skip rows flagged as errors by the client-side validator
    if ($playerGHIN === "" || $status === "error") {
        $skipped++;
        $results[] = ["ghin" => $playerGHIN, "ok" => false, "reason" => "skipped"];
        continue;
    }

    try {
        service_dbFavPlayers::upsertFavorite(
            $userGHIN,
            $playerGHIN,
            $email       !== "" ? $email       : null,
            $mobile      !== "" ? $mobile      : null,
            $memberId    !== "" ? $memberId    : null,
            is_array($groups) ? $groups        : [],
            $playerName  !== "" ? $playerName  : null,
            $playerLName !== "" ? $playerLName : null,
            null,                                   // HI — not imported
            $playerGender !== "" ? $playerGender : null
        );

        $results[] = ["ghin" => $playerGHIN, "ok" => true, "status" => $status];

        if ($status === "merge") {
            $merged++;
        } else {
            $imported++;
        }

    } catch (Throwable $e) {
        error_log("[importFavPlayers] upsert failed for GHIN {$playerGHIN}: " . $e->getMessage());
        $skipped++;
        $results[] = ["ghin" => $playerGHIN, "ok" => false, "reason" => $e->getMessage()];
    }
}

// ── Return refreshed payload ──────────────────────────────────────────────
echo json_encode([
    "ok" => true,
    "payload" => [
        "context" => [
            "userGHIN"  => $userGHIN,
            "userState" => $userState,
        ],
        "favorites"    => service_dbFavPlayers::getFavoritesForUser($userGHIN),
        "groups"       => service_dbFavPlayers::getGroupsForUser($userGHIN),
        "returnAction" => "favoritePlayersList",
        "summary" => [
            "imported" => $imported,
            "merged"   => $merged,
            "skipped"  => $skipped,
        ],
        "results" => $results,
    ],
]);
