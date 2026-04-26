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
        string $adminToken, ?string $userToken): bool {
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

    // enforce the same 360-minute policy if SessionLoginTime is present
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
    $assocId = "";
    $assocName = "";
    $userState = "";

    if (is_array($profile)) {
        // direct keys (cover multiple shapes)
        $userState   = (string)($profile["state"] ?? $profile["state"] ?? $profile["state"] ?? $profile["state"] ?? "");
        $clubId   = (string)($profile["club_id"] ?? $profile["clubId"] ?? $profile["clubID"] ?? $profile["ClubID"] ?? "");
        $clubName = (string)($profile["club_name"] ?? $profile["clubName"] ?? $profile["ClubName"] ?? "");
        $assocId   = (string)($profile["assoc_id"] ?? $profile["assocId"] ?? $profile["assocID"] ?? $profile["AssociationID"] ?? $profile["AssociationId"] ?? "");
        $assocName = (string)($profile["assoc_name"] ?? $profile["assocName"] ?? $profile["AssociationName"] ?? "");

        // nested GHIN-ish shape (if present)
        if ($clubId === "" && isset($profile["profileJson"]["golfers"][0]) && is_array($profile["profileJson"]["golfers"][0])) {
            $g0 = $profile["profileJson"]["golfers"][0];
            $userState   = (string)($g0["state"] ?? "");
            $clubId   = (string)($g0["club_id"] ?? "");
            $clubName = (string)($g0["club_name"] ?? "");
            $assocId   = (string)($g0["association_id"] ?? $g0["assoc_id"] ?? $assocId);
            $assocName = (string)($g0["association_name"] ?? $g0["assoc_name"] ?? $assocName);
        }
    }

    // Cache frequently used values in session (no client trust)
    $_SESSION["SessionUserToken"]  = $userToken;
    $_SESSION["SessionAdminToken"] = $adminToken;
    if ($userState !== "") $_SESSION["SessionUserState"] = $userState;
    if ($userName !== "") $_SESSION["SessionUserName"] = $userName;
    if ($clubId !== "")   $_SESSION["SessionClubID"]   = $clubId;
    if ($clubName !== "") $_SESSION["SessionClubName"] = $clubName;
    if ($assocId !== "")   $_SESSION["SessionAdminAssocID"]   = $assocId;
    if ($assocName !== "") $_SESSION["SessionAdminAssocName"] = $assocName;
    if ($clubId !== "")    $_SESSION["SessionAdminClubID"]    = $clubId;
    if ($clubName !== "")  $_SESSION["SessionAdminClubName"]  = $clubName;
    $prefYards = self::decodePreferenceYards($userRow["dbUser_PreferenceYards"] ?? null);
    if ($prefYards !== null) $_SESSION["SessionPreferenceYards"] = $prefYards;
    else unset($_SESSION["SessionPreferenceYards"]);


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

    public const USER_SETTINGS_CARRIERS = [
    "AT&T"    => "@txt.att.net",
    "Verizon" => "@vtext.com",
    "T-Mobile"=> "@tmomail.net",
];

public static function buildUserSettingsPayload(string $ghinId): array {
    $row = self::retrieveGHINUser($ghinId);
    if (!$row) {
        throw new RuntimeException("User record not found.");
    }

    $profile = self::decodeJsonIfNeeded($row["dbUser_Profile"] ?? null);
    $g0 = self::extractPrimaryGolfer($profile);

    $ghinFName = trim((string)($g0["first_name"] ?? $g0["firstName"] ?? ""));
    $ghinLName = trim((string)($g0["last_name"] ?? $g0["lastName"] ?? ""));
    $ghinEmail = trim((string)($g0["email"] ?? $g0["email_address"] ?? ""));
    $ghinPhone = self::normalizePhone((string)($g0["phone_number"] ?? $g0["phone"] ?? $g0["mobile_phone"] ?? ""));
    $ghinName  = trim((string)($row["dbUser_Name"] ?? ""));
    $storedPreferenceYards = self::decodePreferenceYards($row["dbUser_PreferenceYards"] ?? null);

    $effectiveEmail = trim((string)($row["dbUser_EMail"] ?? "")) ?: $ghinEmail;
    $effectivePhone = trim((string)($row["dbUser_MobilePhone"] ?? "")) ?: $ghinPhone;
    $effectiveCarrier = trim((string)($row["dbUser_MobileCarrier"] ?? ""));
    $storedMethod = trim((string)($row["dbUser_ContactMethod"] ?? ""));

    $effectiveMethod = $storedMethod;
    if ($effectiveMethod === "") {
        $effectiveMethod = ($effectivePhone !== "" && $effectiveCarrier !== "") ? "SMS" : "Email";
    }

    return [
        "ghin" => (string)($row["dbUser_GHIN"] ?? $ghinId),
        "fields" => [
            "dbUser_FName" => trim((string)($row["dbUser_FName"] ?? "")) ?: $ghinFName,
            "dbUser_LName" => trim((string)($row["dbUser_LName"] ?? "")) ?: $ghinLName,
            "dbUser_EMail" => $effectiveEmail,
            "dbUser_MobilePhone" => $effectivePhone,
            "dbUser_MobileCarrier" => $effectiveCarrier,
            "dbUser_ContactMethod" => $effectiveMethod,
            "dbUser_PreferenceYards" => $storedPreferenceYards,
        ],
        "sourceProfile" => [
            "ghinName" => $ghinName,
            "ghinFName" => $ghinFName,
            "ghinLName" => $ghinLName,
            "profile"   => $profile,
        ],
        "carrierOptions" => array_map(
            static fn(string $gateway, string $name): array => [
                "value" => $name,
                "label" => $name,
                "gateway" => $gateway,
            ],
            self::USER_SETTINGS_CARRIERS,
            array_keys(self::USER_SETTINGS_CARRIERS)
        ),
        "contactMethodOptions" => [
            [ "value" => "Email", "label" => "Email" ],
            [ "value" => "SMS",   "label" => "SMS" ],
        ],
    ];
}

// ADD after buildUserSettingsPayload()
public static function hasCompletedSettings(string $ghinId): bool {
    $row = self::retrieveGHINUser($ghinId);
    if (!$row) return false;

    $fName         = trim((string)($row["dbUser_FName"]         ?? ""));
    $lName         = trim((string)($row["dbUser_LName"]         ?? ""));
    $contactMethod = trim((string)($row["dbUser_ContactMethod"] ?? ""));
    $email         = trim((string)($row["dbUser_EMail"]         ?? ""));
    $phone         = trim((string)($row["dbUser_MobilePhone"]   ?? ""));
    $carrier       = trim((string)($row["dbUser_MobileCarrier"] ?? ""));

    if ($fName === "" || $lName === "" || $contactMethod === "") return false;

    if ($contactMethod === "Email") return $email !== "";
    if ($contactMethod === "SMS")   return $phone !== "" && $carrier !== "";

    return false;
}

public static function saveUserSettings(string $ghinId, array $patch): array {
    $ghinId = trim($ghinId);
    if ($ghinId === "") {
        throw new RuntimeException("Missing GHIN.");
    }

    $existing = self::retrieveGHINUser($ghinId);
    if (!$existing) {
        throw new RuntimeException("User record not found.");
    }

    $fName = trim((string)($patch["dbUser_FName"] ?? ""));
    $lName = trim((string)($patch["dbUser_LName"] ?? ""));
    $email = trim((string)($patch["dbUser_EMail"] ?? ""));
    $phone = self::normalizePhone((string)($patch["dbUser_MobilePhone"] ?? ""));
    $carrier = trim((string)($patch["dbUser_MobileCarrier"] ?? ""));
    $contactMethod = trim((string)($patch["dbUser_ContactMethod"] ?? ""));
    $preferenceYardsPatch = $patch["dbUser_PreferenceYards"] ?? null;
    $preferenceYards = null;

    if ($fName === "") throw new RuntimeException("First name is required.");
    if ($lName === "") throw new RuntimeException("Last name is required.");

    if ($email !== "" && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException("Email address is invalid.");
    }

    if ($phone !== "" && strlen($phone) !== 10) {
        throw new RuntimeException("Mobile phone must contain 10 digits.");
    }

    if ($phone !== "" && $carrier === "") {
        throw new RuntimeException("Select a mobile carrier.");
    }

    if ($carrier !== "" && !array_key_exists($carrier, self::USER_SETTINGS_CARRIERS)) {
        throw new RuntimeException("Invalid mobile carrier.");
    }

    if ($contactMethod !== "Email" && $contactMethod !== "SMS") {
        throw new RuntimeException("Select a preferred contact method.");
    }

    if ($contactMethod === "Email" && $email === "") {
        throw new RuntimeException("Email is required when contact method is Email.");
    }

    if ($contactMethod === "SMS") {
        if ($phone === "") {
            throw new RuntimeException("Mobile phone is required when contact method is SMS.");
        }
        if ($carrier === "") {
            throw new RuntimeException("Mobile carrier is required when contact method is SMS.");
        }
    }

    if ($preferenceYardsPatch !== null && $preferenceYardsPatch !== "") {
        if (!is_array($preferenceYardsPatch)) {
            throw new RuntimeException("Preferred playing yardage range is invalid.");
        }

        $min = isset($preferenceYardsPatch["min"]) ? (int)$preferenceYardsPatch["min"] : 0;
        $max = isset($preferenceYardsPatch["max"]) ? (int)$preferenceYardsPatch["max"] : 0;

        if ($min <= 0 || $max <= 0) {
            throw new RuntimeException("Preferred playing yardage range is invalid.");
        }

        if ($min < 3400 || $max > 7200) {
            throw new RuntimeException("Preferred playing yardage range must be between 3400 and 7200.");
        }

        if ($min >= $max) {
            throw new RuntimeException("Preferred playing yardage range is invalid.");
        }

        $preferenceYards = json_encode([
            "min" => $min,
            "max" => $max,
        ], JSON_UNESCAPED_SLASHES);
    }

    $pdo = Db::pdo();
    $sql = "UPDATE db_Users
            SET dbUser_FName = :fname,
                dbUser_LName = :lname,
                dbUser_EMail = :email,
                dbUser_MobilePhone = :phone,
                dbUser_MobileCarrier = :carrier,
                dbUser_ContactMethod = :contactMethod,
                dbUser_PreferenceYards = :preferenceYards
            WHERE dbUser_GHIN = :ghin
            LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([
        ":ghin" => $ghinId,
        ":fname" => $fName,
        ":lname" => $lName,
        ":email" => $email,
        ":phone" => $phone,
        ":carrier" => $carrier,
        ":contactMethod" => $contactMethod,
        ":preferenceYards" => $preferenceYards,
    ]);

    return self::buildUserSettingsPayload($ghinId);
}

private static function decodePreferenceYards($val): ?array {
    if (!is_string($val)) return null;

    $trim = trim($val);
    if ($trim === "") return null;

    $decoded = json_decode($trim, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) return null;

    $min = isset($decoded["min"]) ? (int)$decoded["min"] : 0;
    $max = isset($decoded["max"]) ? (int)$decoded["max"] : 0;

    if ($min <= 0 || $max <= 0 || $min >= $max) return null;

    return [
        "min" => $min,
        "max" => $max,
    ];
}

private static function extractPrimaryGolfer($profile): array {
    if (!is_array($profile)) return [];

    if (isset($profile["profileJson"]["golfers"][0]) && is_array($profile["profileJson"]["golfers"][0])) {
        return $profile["profileJson"]["golfers"][0];
    }

    if (isset($profile["golfers"][0]) && is_array($profile["golfers"][0])) {
        return $profile["golfers"][0];
    }

    return $profile;
}

private static function normalizePhone(string $raw): string {
    return preg_replace('/\D+/', '', trim($raw)) ?? "";
}
}