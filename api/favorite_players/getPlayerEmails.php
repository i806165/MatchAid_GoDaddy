<?php
// /public_html/api/favorite_players/getPlayerEmails.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

$auth     = ma_api_require_auth();
$body     = ma_json_in();
$favGhin  = trim((string)($body["playerGHIN"] ?? ""));

if ($favGhin === "") {
    ma_respond(400, ["ok" => false, "message" => "playerGHIN required."]);
    exit;
}

$config  = ma_config();
$carrierPath = MA_INCLUDES . "/mobile_carriers.php";
if (!is_file($carrierPath)) {
    ma_respond(500, ["ok" => false, "message" => "Carrier config missing."]);
    exit;
}

try {
    $pdo = Db::pdo();

    // ── 1. db_Users — self-registered profile (highest priority) ─────────────
    $stUser = $pdo->prepare(
        "SELECT dbUser_EMail, dbUser_MobilePhone, dbUser_MobileCarrier, dbUser_ContactMethod
         FROM db_Users
         WHERE dbUser_GHIN = :ghin
         LIMIT 1"
    );
    $stUser->execute([":ghin" => $favGhin]);
    $userRow = $stUser->fetch(PDO::FETCH_ASSOC) ?: null;

    $sources = [];

    if ($userRow) {
        $email = trim((string)($userRow["dbUser_EMail"] ?? ""));
        if ($email !== "") {
            $sources[] = [
                "email"    => $email,
                "source"   => "matchaid",
                "label"    => "MatchAid profile",
                "masked"   => false,
                "priority" => 1,
            ];
        }
    }

    // ── 2. db_FavPlayers — all admins' address book entries for this GHIN ────
    $stFavs = $pdo->prepare(
        "SELECT dbFav_PlayerEMail AS email, _updatedDate AS updatedAt
         FROM db_FavPlayers
         WHERE dbFav_PlayerGHIN = :ghin
           AND dbFav_PlayerEMail IS NOT NULL
           AND dbFav_PlayerEMail != ''
         ORDER BY _updatedDate DESC"
    );
    $stFavs->execute([":ghin" => $favGhin]);
    $favRows = $stFavs->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $seen = [];
    // Exclude email already added from db_Users
    if ($userRow) {
        $seen[strtolower(trim((string)($userRow["dbUser_EMail"] ?? "")))] = true;
    }

    foreach ($favRows as $r) {
        $email   = trim((string)($r["email"] ?? ""));
        $key     = strtolower($email);
        $masked  = str_contains($email, "*");
        if ($email === "" || isset($seen[$key])) continue;
        $seen[$key] = true;

        $updatedAt = $r["updatedAt"] ?? null;
        $dateLabel = "";
        if ($updatedAt) {
            $ts = strtotime((string)$updatedAt);
            if ($ts) $dateLabel = date("M Y", $ts);
        }

        $sources[] = [
            "email"    => $email,
            "source"   => "addressbook",
            "label"    => "Address book" . ($dateLabel ? " · $dateLabel" : ""),
            "masked"   => $masked,
            "priority" => $masked ? 99 : 2,
        ];
    }

    // Sort: priority ascending (masked always last within their group)
    usort($sources, fn($a, $b) => $a["priority"] <=> $b["priority"]);

    ma_respond(200, [
        "ok"      => true,
        "sources" => $sources,
    ]);

} catch (Throwable $e) {
    error_log("[getPlayerEmails] " . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error."]);
}
