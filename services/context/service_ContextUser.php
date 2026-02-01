<?php // /public_html/services/context/service_ContextUser.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";

final class ServiceUserContext {

    /**
     * Mirrors Wix initializeUserContext()
     * - reads SessionGHINLogonID + SessionLoginTime from $_SESSION
     * - enforces 360 minute expiry
     * - loads db_Users row and returns { adminToken, userProfile, userToken }
     */
    public static function initializeUserContext(): ?array {
        $ghinId =trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
        $loginTime =trim((string)($_SESSION["SessionLoginTime"] ?? ""));

        if ($ghinId ==="" || $loginTime ==="") return null;

        $loginTs =strtotime($loginTime);
        if ($loginTs ===false) return null;

        $elapsedMinutes =(int)floor((time() - $loginTs) / 60);
        if ($elapsedMinutes > 360) return null;

        $userData = self::retrieveGHINUser($ghinId);
        if ( !$userData) return null;

        $userToken =$userData["dbUser_UserToken"] ?? null;
        $adminToken =$userData["dbUser_AdminToken"] ?? null;
        $userProfile =$userData["dbUser_Profile"] ?? null; // full profile blob (json)

        if ( !$adminToken || !$userProfile) return null;

        return [ "adminToken"=>$adminToken,
        "userProfile"=>self::decodeJsonIfNeeded($userProfile),
            "userToken"=> $userToken ];
    }

    /**
     * Mirrors Wix storeGHINUser(ghinId, name, profileJson, adminToken, userToken=null)
     * Upsert into db_Users by dbUser_GHIN
     */
    public static function storeGHINUser(string $ghinId,
        string $name,
        $profileJson,
        string $adminToken,
        ?string $userToken): bool {
        $ghinId =trim($ghinId);
        if ($ghinId ==="") return false;

        $pdo = Db::pdo();

        $existing =self::retrieveGHINUser($ghinId);

        $profileStored =is_string($profileJson) ? $profileJson : json_encode($profileJson);

if ($existing) {
    $sql = "UPDATE db_Users
            SET dbUser_Name = :name,
                dbUser_Profile = :profile,
                dbUser_UserToken = :utok,
                dbUser_AdminToken = :atok
            WHERE dbUser_GHIN = :ghin
            LIMIT 1";
} else {
    $sql = "INSERT INTO db_Users
            (dbUser_GHIN, dbUser_Name, dbUser_Profile, dbUser_UserToken, dbUser_AdminToken)
            VALUES
            (:ghin, :name, :profile, :utok, :atok)";
}


        $st =$pdo->prepare($sql);
        return $st->execute([":ghin"=> $ghinId,
            ":name"=> $name,
            ":profile"=> $profileStored,
            ":utok"=> $userToken,
            ":atok"=> $adminToken ]);
    }

    /**
     * getUserContext()
     * Purpose: Load the CURRENT logged-in user context (from session GHIN),
     * derive club_id/club_name from stored profile, and cache frequently-used
     * values in $_SESSION for reuse by all pages/APIs.
     * Returns a normalized context array or null if session is not valid.
     */
public static function getUserContext(): ?array {
    $ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
    if ($ghinId === "") return null;

    // Optional: enforce the same 360-minute policy if SessionLoginTime is present
    $loginTime = trim((string)($_SESSION["SessionLoginTime"] ?? ""));
    if ($loginTime !== "") {
        $loginTs = strtotime($loginTime);
        if ($loginTs !== false) {
            $elapsedMinutes = (int)floor((time() - $loginTs) / 60);
            if ($elapsedMinutes > 360) return null;
        }
    }

    // No config param needed anymore
    $userRow = self::retrieveGHINUser($ghinId);
    if (!$userRow) return null;

    $adminToken = (string)($userRow["dbUser_AdminToken"] ?? "");
    $userToken  = (string)($userRow["dbUser_UserToken"] ?? "");
    $userName   = trim((string)($userRow["dbUser_Name"] ?? ""));

    // Decode profile JSON if needed
    $profile = self::decodeJsonIfNeeded($userRow["dbUser_Profile"] ?? null);

    // Derive clubId / clubName safely
    $clubId = "";
    $clubName = "";

    if (is_array($profile)) {
        // direct keys (cover multiple shapes)
        $clubId   = (string)($profile["club_id"] ?? $profile["clubId"] ?? $profile["clubID"] ?? $profile["ClubID"] ?? "");
        $clubName = (string)($profile["club_name"] ?? $profile["clubName"] ?? $profile["ClubName"] ?? "");

        // nested GHIN-ish shape (if present)
        if ($clubId === "" && isset($profile["profileJson"]["golfers"][0]) && is_array($profile["profileJson"]["golfers"][0])) {
            $g0 = $profile["profileJson"]["golfers"][0];
            $clubId   = (string)($g0["club_id"] ?? "");
            $clubName = (string)($g0["club_name"] ?? "");
        }
    }

    // Cache frequently used values in session (no client trust)
    $_SESSION["SessionUserToken"]  = $userToken;
    $_SESSION["SessionAdminToken"] = $adminToken;
    if ($userName !== "") $_SESSION["SessionUserName"] = $userName;
    if ($clubId !== "")   $_SESSION["SessionClubID"]   = $clubId;
    if ($clubName !== "") $_SESSION["SessionClubName"] = $clubName;

    return [
        "ok" => true,
        "adminToken" => $adminToken,
        "userToken"  => $userToken,
        "profile"    => $profile,
    ];
}


        /**
     * Mirrors Wix retrieveGHINUser(ghinId)
     * Returns associative array row or null
     */
public static function retrieveGHINUser(string $ghinId): ?array {
    $ghinId = trim($ghinId);
    if ($ghinId === "") return null;

    $pdo = Db::pdo();

    $sql = "SELECT * FROM db_Users WHERE dbUser_GHIN = :ghin LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([":ghin" => $ghinId]);
    $row = $st->fetch();
    return $row ?: null;
}



    /**
     * Mirrors Wix clearGHINUser(ghinId)
     * Deletes the row from db_Users for that GHIN
     */
    public static function clearGHINUser(string $ghinId): bool {
        $ghinId =trim($ghinId);
        if ($ghinId ==="") return false;

        $pdo = Db::pdo();

        $sql ="DELETE FROM db_Users WHERE dbUser_GHIN=:ghin LIMIT 1";

        $st =$pdo->prepare($sql);
        return $st->execute([":ghin"=> $ghinId]);
    }

    // -----------------------------------------------------------------------------------------
    // Helper: if dbUser_Profile is stored as JSON text in MySQL, decode to array for callers
    // -----------------------------------------------------------------------------------------
    private static function decodeJsonIfNeeded($val) {
        if ( !is_string($val)) return $val;

        $trim =trim($val);
        if ($trim ==="") return $val;

        $decoded =json_decode($trim, true);
        return (json_last_error()===JSON_ERROR_NONE) ? $decoded : $val;
    }
}