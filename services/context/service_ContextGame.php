<?php
// /public_html/services/context/service_ContextGame.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";

final class service_ContextGame
{
    /**
     * Mirrors Wix setGameSession(parmGameID, parmUserGHIN)
     * - Looks up game by GGID
     * - Sets SessionStoredGGID
     * Returns: "OK" or error message string
     */
    public static function setGameSession(string $parmGameID, string $parmUserGHIN, array $config): string
    {
        $txtGGID = trim($parmGameID);
        $sessUserGHIN = trim($parmUserGHIN);

        if ($txtGGID === "") {
            unset($_SESSION["SessionStoredGGID"]);
            return "System Error. Game not found";
        }

        try {
            $pdo = Db::pdo($config["db"]);

            $game = self::getGameByGGID($pdo, $txtGGID);
            if ($game) {
                // Role is computed in Wix but not used; keep parity if you want later
                $txtRole = "User";
                if (trim((string)($game["dbGames_AdminGHIN"] ?? "")) === $sessUserGHIN) {
                    $txtRole = "Game Admin";
                }

                $_SESSION["SessionStoredGGID"] = $txtGGID;
                // optionally store role if you want
                // $_SESSION["SessionGameRole"] = $txtRole;

                return "OK";
            }

            unset($_SESSION["SessionStoredGGID"]);
            return "System Error. Game not found";

        } catch (Throwable $e) {
            error_log("[ServiceGames.setGameSession] " . $e->getMessage());
            return "System Error. Game session setup failed.";
        }
    }

    /**
     * Mirrors Wix getGameAuthorizations(parmUserID, parmGameID)
     * Returns: { status: "Authorized"/"Unauthorized"/"Error", role: "..." }
     */
    public static function getGameAuthorizations(string $parmUserID, string $parmGameID, array $config): array
    {
        $sessUserGHIN = trim($parmUserID);
        $txtGGID = trim($parmGameID);

        if ($sessUserGHIN === "" || $txtGGID === "") {
            return ["status" => "Error", "role" => "Error"];
        }

        try {
            $pdo = Db::pdo($config["db"]);

            // Equivalent of getStoredGameData(parmGameID)
            $storedGameData = self::getGameByGGID($pdo, $txtGGID);

            if (!$storedGameData) {
                error_log("[ServiceGames.getGameAuthorizations] Game not found: " . $txtGGID);
                return ["status" => "Error", "role" => "Error"];
            }

            $txtFacilityID = (string)($storedGameData["dbGames_FacilityID"] ?? "");
            $txtPrivacy    = (string)($storedGameData["dbGames_Privacy"] ?? "");
            $txtAdminGHIN  = (string)($storedGameData["dbGames_AdminGHIN"] ?? "");

            // 1) Site Admin (FacilityID = "00000")
            if (self::existsUserRole($pdo, $sessUserGHIN, "00000")) {
                return ["status" => "Authorized", "role" => "Site Admin"];
            }

            // 2) Facility Admin (FacilityID = game facility)
            if ($txtFacilityID !== "" && self::existsUserRole($pdo, $sessUserGHIN, $txtFacilityID)) {
                return ["status" => "Authorized", "role" => "Facility Admin"];
            }

            // 3) Game Admin
            if ($txtAdminGHIN !== "" && $sessUserGHIN === $txtAdminGHIN) {
                return ["status" => "Authorized", "role" => "Game Admin"];
            }

            // 4) Player in the game (db_Players)
            if (self::existsGamePlayer($pdo, $txtGGID, $sessUserGHIN)) {
                return ["status" => "Authorized", "role" => "Player"];
            }

            // 5) Favorite player of Game Admin (db_FavPlayers)
            if ($txtAdminGHIN !== "" && self::existsFavPlayer($pdo, $txtAdminGHIN, $sessUserGHIN)) {
                return ["status" => "Authorized", "role" => "Player"];
            }

            // 6) Open game + same facility as session (parity with Wix)
            $sessFacility = (string)($_SESSION["SessionGHINFacilityID"] ?? "");
            if ($txtFacilityID !== "" && $txtPrivacy === "Open" && $sessFacility !== "" && $txtFacilityID === $sessFacility) {
                return ["status" => "Authorized", "role" => "Player"];
            }

            return ["status" => "Unauthorized", "role" => "User"];

        } catch (Throwable $e) {
            error_log("[ServiceGames.getGameAuthorizations] " . $e->getMessage());
            return ["status" => "Error", "role" => "Error"];
        }
    }

    // -----------------------------------------------------------------------------------------
    // DB helpers (these replace queryFavorites + wixData.query)
    // -----------------------------------------------------------------------------------------

    private static function getGameByGGID(PDO $pdo, string $ggid): ?array
    {
        // Adjust table name if your MySQL table is different, but you described db_Games
        $sql = "SELECT * FROM db_Games WHERE dbGames_GGID = :ggid LIMIT 1";
        $st = $pdo->prepare($sql);
        $st->execute([":ggid" => $ggid]);
        $row = $st->fetch();
        return $row ?: null;
    }

    private static function existsUserRole(PDO $pdo, string $userGHIN, string $facilityID): bool
    {
        $sql = "SELECT 1
                FROM db_UserRoles
                WHERE dbUserRoles_UserGHIN = :u
                  AND dbUserRoles_FacilityID = :f
                LIMIT 1";
        $st = $pdo->prepare($sql);
        $st->execute([":u" => $userGHIN, ":f" => $facilityID]);
        return (bool)$st->fetchColumn();
    }

    private static function existsGamePlayer(PDO $pdo, string $ggid, string $playerGHIN): bool
    {
        $sql = "SELECT 1
                FROM db_Players
                WHERE dbPlayers_GGID = :g
                  AND dbPlayers_PlayerGHIN = :p
                LIMIT 1";
        $st = $pdo->prepare($sql);
        $st->execute([":g" => $ggid, ":p" => $playerGHIN]);
        return (bool)$st->fetchColumn();
    }

    private static function existsFavPlayer(PDO $pdo, string $userGHIN, string $playerGHIN): bool
    {
        $sql = "SELECT 1
                FROM db_FavPlayers
                WHERE dbFav_UserGHIN = :u
                  AND dbFav_PlayerGHIN = :p
                LIMIT 1";
        $st = $pdo->prepare($sql);
        $st->execute([":u" => $userGHIN, ":p" => $playerGHIN]);
        return (bool)$st->fetchColumn();
    }

    // -----------------------------------------------------------------------------------------
    // Kept from your Wix helper (if you still use it in UI text)
    // -----------------------------------------------------------------------------------------
    public static function createDateString(string $parmGameDate, string $parmTeeTimes): string
    {
        // tee times are not needed to form the string, but kept to mirror signature
        $dt = new DateTime($parmGameDate);
        $dow = $dt->format("D");
        $m   = (int)$dt->format("n");
        $d   = (int)$dt->format("j");
        $yy  = $dt->format("y");
        return "{$dow} {$m}/{$d}/{$yy}";
    }
}
