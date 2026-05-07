<?php
declare(strict_types=1);
// /public_html/api/messaging/initPlayerNotifications.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

$auth     = ma_api_require_auth();
$userGhin = $auth["ghinId"];
$body     = ma_json_in();
$ggid     = isset($body["ggid"]) ? (int)$body["ggid"] : 0;
$config  = ma_config();
$siteUrl = $config["app"]["site_url"];

// ── Carrier gateway map ───────────────────────────────────────────────────────
// Resolves dbUser_MobileCarrier → SMS-to-email gateway domain.
// Source of truth: ServiceUserContext::USER_SETTINGS_CARRIERS
$carrierPath = MA_INCLUDES . "/mobile_carriers.php";
if (!is_file($carrierPath)) {
    throw new RuntimeException("Mobile carrier include not found: " . $carrierPath);
}

$carriers = require $carrierPath;

if (!is_array($carriers)) {
    throw new RuntimeException("Mobile carrier include did not return an array.");
}

// ── Contact resolver ──────────────────────────────────────────────────────────
// Priority:
//   1. db_Users row exists → use dbUser_ContactMethod (SMS gateway or Email)
//   2. No db_Users row    → fall back to dbFav_PlayerEMail (Email only, guest players)
//   3. Neither            → deliveryMethod = null (unreachable — shown grayed in UI)
//
// NOTE: NH-prefixed GHINs are non-rated guests; they never have a db_Users row.
// The LEFT JOIN will return nulls for them and the favEmail fallback applies.
$resolveContact = function (
    ?array $userRow,
    string $favEmail
) use ($carriers): array {
    if ($userRow !== null) {
        $method  = trim((string)($userRow["dbUser_ContactMethod"]  ?? ""));
        $mobile  = trim((string)($userRow["dbUser_MobilePhone"]    ?? ""));
        $carrier = trim((string)($userRow["dbUser_MobileCarrier"]  ?? ""));
        $email   = trim((string)($userRow["dbUser_EMail"]          ?? ""));

        // Auto-detect preferred method if field is blank
        if ($method === "") {
            $method = ($mobile !== "" && $carrier !== "") ? "SMS" : "Email";
        }

        if ($method === "SMS" && $mobile !== "" && isset($carriers[$carrier])) {
            $digits = preg_replace('/\D/', '', $mobile);
            return [
                "deliveryEmail"  => $digits . $carriers[$carrier],
                "deliveryMethod" => "SMS",
                "email"          => $email,
                "mobile"         => $mobile,
            ];
        }

        if ($email !== "") {
            return [
                "deliveryEmail"  => $email,
                "deliveryMethod" => "Email",
                "email"          => $email,
                "mobile"         => $mobile,
            ];
        }
    }

    // Fallback: favorites address book email (guest players or missing db_Users contact)
    if ($favEmail !== "") {
        return [
            "deliveryEmail"  => $favEmail,
            "deliveryMethod" => "Email",
            "email"          => $favEmail,
            "mobile"         => "",
        ];
    }

    // Unreachable — no contact info in any source
    return [
        "deliveryEmail"  => "",
        "deliveryMethod" => null,
        "email"          => "",
        "mobile"         => "",
    ];
};

try {

    // ── Game context ──────────────────────────────────────────────────────────
    $game        = null;
    $gamePlayers = null;

    if ($ggid > 0) {
        $game = ServiceDbGames::getGameByGGID($ggid);

        if ($game) {
            // Single query: db_Players LEFT JOIN db_Users LEFT JOIN db_FavPlayers
            // db_FavPlayers join is scoped to the calling user's address book so
            // favEmail is only populated when the admin has this player as a favorite.
            $pdo = Db::pdo();
            $sql = "SELECT
                        p.dbPlayers_PlayerGHIN  AS ghin,
                        p.dbPlayers_Name        AS name,
                        p.dbPlayers_LName       AS lname,
                        u.dbUser_EMail          AS dbUser_EMail,
                        u.dbUser_MobilePhone    AS dbUser_MobilePhone,
                        u.dbUser_MobileCarrier  AS dbUser_MobileCarrier,
                        u.dbUser_ContactMethod  AS dbUser_ContactMethod,
                        f.dbFav_PlayerEMail     AS favEmail
                    FROM db_Players p
                    LEFT JOIN db_Users u
                        ON  u.dbUser_GHIN       = p.dbPlayers_PlayerGHIN
                    LEFT JOIN db_FavPlayers f
                        ON  f.dbFav_UserGHIN    = :userGhin
                        AND f.dbFav_PlayerGHIN  = p.dbPlayers_PlayerGHIN
                    WHERE p.dbPlayers_GGID = :ggid
                    ORDER BY p.dbPlayers_LName ASC, p.dbPlayers_Name ASC";

            $st = $pdo->prepare($sql);
            $st->execute([":ggid" => $ggid, ":userGhin" => $userGhin]);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

            $gamePlayers = array_map(function (array $r) use ($resolveContact): array {
                // Treat row as having a db_Users record only if at least one
                // db_Users column came back non-null from the LEFT JOIN
                $hasUserRow = (
                    $r["dbUser_EMail"]         !== null ||
                    $r["dbUser_MobilePhone"]   !== null ||
                    $r["dbUser_ContactMethod"] !== null
                );
                $userRow = $hasUserRow ? $r : null;
                $contact = $resolveContact($userRow, (string)($r["favEmail"] ?? ""));

                return [
                    "ghin"           => (string)$r["ghin"],
                    "name"           => (string)$r["name"],
                    "lname"          => (string)$r["lname"],
                    "email"          => $contact["email"],
                    "mobile"         => $contact["mobile"],
                    "deliveryEmail"  => $contact["deliveryEmail"],
                    "deliveryMethod" => $contact["deliveryMethod"],
                ];
            }, $rows);
        }
    }

    // ── Favorites ─────────────────────────────────────────────────────────────
    // getFavoritesForUser already decodes dbFav_PlayerTags → groups array.
    // getGroupsForUser returns distinct group names, excluding "_default".
    $favRows   = service_dbFavPlayers::getFavoritesForUser($userGhin);
    $favGroups = service_dbFavPlayers::getGroupsForUser($userGhin);

    // Bulk-fetch db_Users contact rows for all favorite GHINs in one query.
    // NH-prefix GHINs (non-rated guests) are excluded — they never have a db_Users row.
    $favGhins = array_values(array_filter(
        array_column($favRows, "playerGHIN"),
        fn($g) => $g !== "" && !str_starts_with((string)$g, "NH")
    ));

    $userMap = [];
    if (!empty($favGhins)) {
        $pdo = Db::pdo();
        $in  = implode(",", array_fill(0, count($favGhins), "?"));
        $st  = $pdo->prepare(
            "SELECT dbUser_GHIN, dbUser_EMail, dbUser_MobilePhone,
                    dbUser_MobileCarrier, dbUser_ContactMethod
             FROM db_Users
             WHERE dbUser_GHIN IN ($in)"
        );
        $st->execute(array_values($favGhins));
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $u) {
            $userMap[(string)$u["dbUser_GHIN"]] = $u;
        }
    }

    $favorites = array_map(function (array $f) use ($resolveContact, $userMap): array {
        $ghin    = (string)($f["playerGHIN"] ?? "");
        $userRow = $userMap[$ghin] ?? null;
        $contact = $resolveContact($userRow, (string)($f["email"] ?? ""));

        return [
            "ghin"           => $ghin,
            "name"           => (string)($f["name"]  ?? ""),
            "lname"          => (string)($f["lname"] ?? ""),
            "groups"         => $f["groups"],   // already decoded string[] by getFavoritesForUser
            "email"          => $contact["email"],
            "mobile"         => $contact["mobile"],
            "deliveryEmail"  => $contact["deliveryEmail"],
            "deliveryMethod" => $contact["deliveryMethod"],
        ];
    }, $favRows);

    // ── Response ──────────────────────────────────────────────────────────────
    // hasGameContext drives tab visibility in player_notifications.js:
    //   true  → both "Game players" and "Favorites" tabs rendered
    //   false → "Game players" tab suppressed entirely
    ma_respond(200, [
        "ok"             => true,
        "siteUrl"        => $siteUrl, 
        "hasGameContext" => $game !== null,
        "game"           => $game !== null ? [
            "ggid"         => (int)($game["dbGames_GGID"]        ?? 0),
            "title"        => (string)($game["dbGames_Title"]        ?? ""),
            "playDate"     => (string)($game["dbGames_PlayDate"]     ?? ""),
            "playTime"     => substr((string)($game["dbGames_PlayTime"] ?? ""), 0, 5),
            "facilityName" => (string)($game["dbGames_FacilityName"] ?? ""),
            "courseName"   => (string)($game["dbGames_CourseName"]   ?? ""),
        ] : null,
        "gamePlayers"    => $gamePlayers,   // null when no ggid supplied
        "favorites"      => $favorites,
        "favGroups"      => $favGroups,     // sorted distinct group names, _default excluded
    ]);

} catch (Throwable $e) {
    error_log("[initPlayerNotifications] " . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error."]);
}