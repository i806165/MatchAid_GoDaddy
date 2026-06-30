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
$config   = ma_config();
$siteUrl  = $config["app"]["site_url"];

// ── Carrier gateway map ───────────────────────────────────────────────────────
$carrierPath = MA_INCLUDES . "/mobile_carriers.php";
if (!is_file($carrierPath)) {
    throw new RuntimeException("Mobile carrier include not found: " . $carrierPath);
}
$carriers = require $carrierPath;
if (!is_array($carriers)) {
    throw new RuntimeException("Mobile carrier include did not return an array.");
}

// ── Contact resolver ──────────────────────────────────────────────────────────
//
// Priority:
//   1. db_Users row exists → use dbUser_ContactMethod (SMS gateway or Email)
//   2. No db_Users row    → Population B — use db_FavPlayers contact info:
//        a. Has email     → Email delivery (email preferred for Population B)
//        b. Has mobile + carrier but no email → SMS delivery
//        c. Neither       → deliveryMethod = null (unreachable)
//
// Returns:
//   deliveryEmail        — the address that goes into the mailto: BCC
//   deliveryEmailAddress — raw email address (for badge/display/override)
//   deliverySmsAddress   — SMS gateway address (for badge/display/override)
//   deliveryMethod       — "Email" | "SMS" | null
//   email                — display email
//   mobile               — display mobile
//
$resolveContact = function (
    ?array $userRow,
    string $favEmail,
    string $favMobile,
    string $favCarrier,
    string $ghin = "",
    string $name = ""
) use ($carriers): array {

    // ── Population A — db_Users profile exists ────────────────────────────
    if ($userRow !== null) {
        $method  = trim((string)($userRow["dbUser_ContactMethod"]  ?? ""));
        $mobile  = trim((string)($userRow["dbUser_MobilePhone"]    ?? ""));
        $carrier = trim((string)($userRow["dbUser_MobileCarrier"]  ?? ""));
        $email   = trim((string)($userRow["dbUser_EMail"]          ?? ""));

        // Build both delivery addresses for badge switching
        $smsAddress   = "";
        $emailAddress = $email;

        if ($mobile !== "" && $carrier !== "") {
            if (isset($carriers[$carrier])) {
                $digits     = preg_replace('/\D/', '', $mobile);
                $smsAddress = $digits . $carriers[$carrier];
            } else {
                error_log(sprintf(
                    "[initPlayerNotifications] Unmapped carrier (db_Users): ghin=%s name=%s carrier=%s mobile=%s",
                    $ghin !== "" ? $ghin : ($userRow["ghin"] ?? $userRow["dbUser_GHIN"] ?? "unknown"),
                    $name !== "" ? $name : ($userRow["name"] ?? "unknown"),
                    $carrier,
                    $mobile
                ));
            }
        }

        // Auto-detect preferred method if field is blank
        if ($method === "") {
            $method = ($smsAddress !== "") ? "SMS" : "Email";
        }

        // Primary delivery address uses preferred method
        if ($method === "SMS" && $smsAddress !== "") {
            return [
                "deliveryEmail"        => $smsAddress,
                "deliveryEmailAddress" => $emailAddress,
                "deliverySmsAddress"   => $smsAddress,
                "deliveryMethod"       => "SMS",
                "email"                => $email,
                "mobile"               => $mobile,
            ];
        }

        if ($emailAddress !== "") {
            return [
                "deliveryEmail"        => $emailAddress,
                "deliveryEmailAddress" => $emailAddress,
                "deliverySmsAddress"   => $smsAddress,
                "deliveryMethod"       => "Email",
                "email"                => $email,
                "mobile"               => $mobile,
            ];
        }
    }

    // ── Population B — no db_Users profile, use db_FavPlayers ────────────

    // Build SMS gateway address from fav mobile + carrier if available
    $favSmsAddress = "";
    if ($favMobile !== "" && $favCarrier !== "") {
        if (isset($carriers[$favCarrier])) {
            $digits        = preg_replace('/\D/', '', $favMobile);
            $favSmsAddress = $digits . $carriers[$favCarrier];
        } else {
            error_log(sprintf(
                "[initPlayerNotifications] Unmapped carrier (db_FavPlayers): ghin=%s name=%s carrier=%s mobile=%s",
                $ghin !== "" ? $ghin : "unknown",
                $name !== "" ? $name : "unknown",
                $favCarrier,
                $favMobile
            ));
        }
    }

    // Email preferred when available
    if ($favEmail !== "") {
        return [
            "deliveryEmail"        => $favEmail,
            "deliveryEmailAddress" => $favEmail,
            "deliverySmsAddress"   => $favSmsAddress,
            "deliveryMethod"       => "Email",
            "email"                => $favEmail,
            "mobile"               => $favMobile,
        ];
    }

    // SMS only — no email on file
    if ($favSmsAddress !== "") {
        return [
            "deliveryEmail"        => $favSmsAddress,
            "deliveryEmailAddress" => "",
            "deliverySmsAddress"   => $favSmsAddress,
            "deliveryMethod"       => "SMS",
            "email"                => "",
            "mobile"               => $favMobile,
        ];
    }

    // Unreachable — no contact info in any source
    return [
        "deliveryEmail"        => "",
        "deliveryEmailAddress" => "",
        "deliverySmsAddress"   => "",
        "deliveryMethod"       => null,
        "email"                => "",
        "mobile"               => "",
    ];
};

try {

    // ── Game context ──────────────────────────────────────────────────────────
    $game        = null;
    $gamePlayers = null;

    if ($ggid > 0) {
        $game = ServiceDbGames::getGameByGGID($ggid);

        if ($game) {
            $pdo = Db::pdo();

            // ← Added dbFav_PlayerMobile and dbFav_PlayerCarrier to the join
            $sql = "SELECT
                        p.dbPlayers_PlayerGHIN  AS ghin,
                        p.dbPlayers_Name        AS name,
                        p.dbPlayers_LName       AS lname,
                        u.dbUser_EMail          AS dbUser_EMail,
                        u.dbUser_MobilePhone    AS dbUser_MobilePhone,
                        u.dbUser_MobileCarrier  AS dbUser_MobileCarrier,
                        u.dbUser_ContactMethod  AS dbUser_ContactMethod,
                        f.dbFav_PlayerEMail     AS favEmail,
                        f.dbFav_PlayerMobile    AS favMobile,
                        f.dbFav_PlayerCarrier   AS favCarrier
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
                $hasUserRow = (
                    $r["dbUser_EMail"]         !== null ||
                    $r["dbUser_MobilePhone"]   !== null ||
                    $r["dbUser_ContactMethod"] !== null
                );
                $userRow   = $hasUserRow ? $r : null;
                $favEmail  = (string)($r["favEmail"]  ?? "");
                $favMobile = (string)($r["favMobile"] ?? "");
                $favCarrier= (string)($r["favCarrier"] ?? "");
                $contact   = $resolveContact(
                    $userRow, $favEmail, $favMobile, $favCarrier,
                    (string)$r["ghin"], (string)$r["name"]
                );

                return [
                    "ghin"                 => (string)$r["ghin"],
                    "name"                 => (string)$r["name"],
                    "lname"                => (string)$r["lname"],
                    "email"                => $contact["email"],
                    "mobile"               => $contact["mobile"],
                    "deliveryEmail"        => $contact["deliveryEmail"],
                    "deliveryEmailAddress" => $contact["deliveryEmailAddress"],
                    "deliverySmsAddress"   => $contact["deliverySmsAddress"],
                    "deliveryMethod"       => $contact["deliveryMethod"],
                ];
            }, $rows);
        }
    }

    // ── Favorites ─────────────────────────────────────────────────────────────
    $favRows   = service_dbFavPlayers::getFavoritesForUser($userGhin);
    $favGroups = service_dbFavPlayers::getGroupsForUser($userGhin);

    // Bulk-fetch db_Users contact rows for all favorite GHINs in one query
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
        $ghin       = (string)($f["playerGHIN"] ?? "");
        $userRow    = $userMap[$ghin] ?? null;
        $favEmail   = (string)($f["email"]   ?? "");
        $favMobile  = (string)($f["mobile"]  ?? "");
        $favCarrier = (string)($f["carrier"] ?? "");
        $contact    = $resolveContact(
            $userRow, $favEmail, $favMobile, $favCarrier,
            $ghin, (string)($f["name"] ?? "")
        );

        return [
            "ghin"                 => $ghin,
            "name"                 => (string)($f["name"]  ?? ""),
            "lname"                => (string)($f["lname"] ?? ""),
            "groups"               => $f["groups"],
            "email"                => $contact["email"],
            "mobile"               => $contact["mobile"],
            "deliveryEmail"        => $contact["deliveryEmail"],
            "deliveryEmailAddress" => $contact["deliveryEmailAddress"],
            "deliverySmsAddress"   => $contact["deliverySmsAddress"],
            "deliveryMethod"       => $contact["deliveryMethod"],
        ];
    }, $favRows);

    // ── Response ──────────────────────────────────────────────────────────────
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
        "gamePlayers"    => $gamePlayers,
        "favorites"      => $favorites,
        "favGroups"      => $favGroups,
    ]);

} catch (Throwable $e) {
    error_log("[initPlayerNotifications] " . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error."]);
}