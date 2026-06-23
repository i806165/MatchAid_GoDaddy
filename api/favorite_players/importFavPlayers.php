<?php
// /api/favorite_players/importFavPlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_SERVICES . "/database/service_dbFavPlayers.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

const IMPORT_LIMIT     = 200;
const IMPORT_BATCH_MAX = 100;

// ── Auth ──────────────────────────────────────────────────────────────────
$userGHIN  = (string)($_SESSION["SessionGHINLogonID"] ?? "");
$userState = (string)($_SESSION["SessionUserState"]   ?? "");
$userToken = (string)($_SESSION["SessionGHINToken"]   ?? "");

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

// ── Email resolution helper ───────────────────────────────────────────────
//
// Resolution order (users table is source of truth):
//   1. Worksheet email — admin explicitly provided it
//   2. db_Users        — player has a self-registered profile
//   3. GHIN API        — fallback; skip masked addresses (contain "*")
//   4. null            — leave blank
//
function resolveImportEmail(string $worksheetEmail, string $playerGHIN, string $userToken): ?string
{
    // 1. Worksheet wins if provided
    if ($worksheetEmail !== "") return $worksheetEmail;

    // 2. db_Users — self-registered profile
    try {
        $pdo = Db::pdo();
        $st  = $pdo->prepare(
            "SELECT dbUser_EMail
             FROM   db_Users
             WHERE  dbUser_GHIN = :ghin
               AND  dbUser_EMail IS NOT NULL
               AND  dbUser_EMail <> ''
             LIMIT 1"
        );
        $st->execute([":ghin" => $playerGHIN]);
        $email = (string)($st->fetchColumn() ?: "");
        if ($email !== "") return $email;
    } catch (Throwable $e) {
        error_log("[importFavPlayers] db_Users email lookup failed for GHIN {$playerGHIN}: " . $e->getMessage());
    }

    // 3. GHIN API fallback — skip masked addresses
    try {
        $data      = be_getPlayersByID($playerGHIN, $userToken);
        $golfer    = $data["golfers"][0] ?? null;
        $ghinEmail = trim((string)($golfer["email"] ?? ""));
        if ($ghinEmail !== "" && !str_contains($ghinEmail, "*")) {
            return $ghinEmail;
        }
    } catch (Throwable $e) {
        error_log("[importFavPlayers] GHIN email fallback failed for GHIN {$playerGHIN}: " . $e->getMessage());
    }

    return null;
}

// ── Process rows ──────────────────────────────────────────────────────────
$results  = [];
$imported = 0;
$merged   = 0;
$skipped  = 0;

foreach ($rows as $row) {
    $playerGHIN   = trim((string)($row["ghin"]       ?? ""));
    $status       = trim((string)($row["status"]     ?? ""));
    $firstName    = trim((string)($row["firstName"]  ?? ""));
    $playerLName  = trim((string)($row["lastName"]   ?? ""));
    $playerName   = trim($firstName . " " . $playerLName);
    $playerGender = trim((string)($row["gender"]     ?? ""));
    $memberId     = trim((string)($row["memberId"]   ?? ""));

    // Mobile — digits only
    $mobile  = preg_replace('/\D/', '', (string)($row["mobile"]  ?? ""));

    // Carrier — Twilio-resolved client-side; drop if no mobile
    $carrier = trim((string)($row["carrier"] ?? ""));
    if ($mobile === "") $carrier = "";

    // Skip rows flagged as errors by client-side validator
    if ($playerGHIN === "" || $status === "error") {
        $skipped++;
        $results[] = ["ghin" => $playerGHIN, "ok" => false, "reason" => "skipped"];
        continue;
    }

    // Email resolution
    $worksheetEmail = trim((string)($row["email"] ?? ""));
    $email = resolveImportEmail($worksheetEmail, $playerGHIN, $userToken);

    try {
        service_dbFavPlayers::upsertFavorite(
            $userGHIN,
            $playerGHIN,
            $email,
            $mobile      !== "" ? $mobile      : null,
            $memberId    !== "" ? $memberId    : null,
            is_array($row["groups"] ?? null) ? $row["groups"] : [],
            $playerName  !== "" ? $playerName  : null,
            $playerLName !== "" ? $playerLName : null,
            null,                                        // HI — not imported
            $playerGender !== "" ? $playerGender : null,
            $carrier     !== "" ? $carrier     : null    // ← carrier added
        );

        $results[] = ["ghin" => $playerGHIN, "ok" => true, "status" => $status];

        if ($status === "merge") $merged++;
        else                     $imported++;

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