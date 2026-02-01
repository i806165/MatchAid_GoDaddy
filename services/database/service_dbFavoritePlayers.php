<?php
// /public_html/services/database/service_FavoritePlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/HttpClient.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

final class ServiceFavoritePlayers
{
    // CHANGE THIS if your PK column is different
    private const PK_COL = "dbFav_ID"; // <-- PK COLUMN

    /**
     * Mirrors Wix checkFavoritePlayer(parmUserGHIN, parmFavGHIN)
     * Returns: ["status"=>"FOUND|NOT FOUND", "recID"=><id|0>]
     */
    public static function checkFavoritePlayer(string $userGHIN, string $favGHIN, array $config): array
    {
        $userGHIN = trim($userGHIN);
        $favGHIN  = trim($favGHIN);

        if ($userGHIN === "" || $favGHIN === "") {
            return ["status" => "NOT FOUND", "recID" => 0];
        }

        $pdo = Db::pdo($config["db"]);

        $sql = "SELECT " . self::PK_COL . " AS recID
                FROM db_FavPlayers
                WHERE dbFav_UserGHIN = :u
                  AND dbFav_PlayerGHIN = :p
                LIMIT 1";

        $st = $pdo->prepare($sql);
        $st->execute(["u" => $userGHIN, "p" => $favGHIN]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if ($row && isset($row["recID"])) {
            return ["status" => "FOUND", "recID" => (int)$row["recID"]];
        }

        return ["status" => "NOT FOUND", "recID" => 0];
    }

    /**
     * Mirrors Wix addFavoritePlayer(parmUserGHIN, parmFavGHIN, parmTag, parmToken)
     * Returns: "ADDED" | "FAIL" | "FOUND"
     */
    public static function addFavoritePlayer(
        string $userGHIN,
        string $favGHIN,
        $tag,                // string|array|null (Wix allowed tags array)
        ?string $token,
        array $config
    ): string {
        try {
            $userGHIN = trim($userGHIN);
            $favGHIN  = trim($favGHIN);

            if ($userGHIN === "" || $favGHIN === "") return "FAIL";

            // Avoid duplicates (Wix behavior)
            $chk = self::checkFavoritePlayer($userGHIN, $favGHIN, $config);
            if (($chk["status"] ?? "") === "FOUND") return "FOUND";

            // GHIN enrich
            $playerGHINData = be_getPlayersByID($favGHIN, $token);
            $golfer = $playerGHINData["golfers"][0] ?? null;
            if (!$golfer) return "FAIL";

            $first  = trim((string)($golfer["first_name"] ?? ""));
            $last   = trim((string)($golfer["last_name"] ?? ""));
            $name   = trim($first . " " . $last);

            $tags = self::normalizeTags($tag);

            $pdo = Db::pdo($config["db"]);

            // dbFav_PlayerTags stored as JSON text (recommended) to mirror Wix array behavior
            $sql = "INSERT INTO db_FavPlayers
                    (dbFav_UserGHIN,
                     dbFav_PlayerGHIN,
                     dbFav_PlayerName,
                     dbFav_PlayerLName,
                     dbFav_PlayerMemberID,
                     dbFav_PlayerMobile,
                     dbFav_PlayerEMail,
                     dbFav_PlayerHI,
                     dbFav_PlayerGender,
                     dbFav_PlayerTags)
                    VALUES
                    (:u, :p, :n, :ln, :mid, :mob, :em, :hi, :g, :tags)";

            $st = $pdo->prepare($sql);
            $ok = $st->execute([
                "u"    => $userGHIN,
                "p"    => $favGHIN,
                "n"    => $name,
                "ln"   => $last,
                "mid"  => $golfer["local_number"]   ?? null,
                "mob"  => $golfer["phone_number"]   ?? null,
                "em"   => $golfer["email"]          ?? null,
                "hi"   => $golfer["handicap_index"] ?? null,
                "g"    => $golfer["gender"]         ?? null,
                "tags" => json_encode($tags),
            ]);

            return $ok ? "ADDED" : "FAIL";

        } catch (Throwable $e) {
            error_log("[ServiceFavoritePlayers::addFavoritePlayer] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    /**
     * Mirrors Wix addFavoriteNonGHIN(parmUserGHIN, parmPlayer, parmTag, parmToken)
     * Here parmPlayer is an object/array containing:
     *   ghin, player_name, last_name, handicap_index, gender
     * Returns: "ADDED" | "FAIL" | "FOUND"
     */
    public static function addFavoriteNonGHIN(
        string $userGHIN,
        $golferObj,          // array|object
        $tag,                // string|array|null
        array $config
    ): string {
        try {
            $userGHIN = trim($userGHIN);
            if ($userGHIN === "") return "FAIL";

            $g = self::toArray($golferObj);
            $favGHIN = trim((string)($g["ghin"] ?? ""));
            if ($favGHIN === "") return "FAIL";

            // Avoid duplicates
            $chk = self::checkFavoritePlayer($userGHIN, $favGHIN, $config);
            if (($chk["status"] ?? "") === "FOUND") return "FOUND";

            $tags = self::normalizeTags($tag);

            $pdo = Db::pdo($config["db"]);

            $sql = "INSERT INTO db_FavPlayers
                    (dbFav_UserGHIN,
                     dbFav_PlayerGHIN,
                     dbFav_PlayerName,
                     dbFav_PlayerLName,
                     dbFav_PlayerMemberID,
                     dbFav_PlayerMobile,
                     dbFav_PlayerEMail,
                     dbFav_PlayerHI,
                     dbFav_PlayerGender,
                     dbFav_PlayerTags)
                    VALUES
                    (:u, :p, :n, :ln, :mid, :mob, :em, :hi, :g, :tags)";

            $st = $pdo->prepare($sql);
            $ok = $st->execute([
                "u"    => $userGHIN,
                "p"    => $favGHIN,
                "n"    => $g["player_name"]    ?? null,
                "ln"   => $g["last_name"]      ?? null,
                "mid"  => null,
                "mob"  => null,
                "em"   => null,
                "hi"   => $g["handicap_index"] ?? null,
                "g"    => $g["gender"]         ?? null,
                "tags" => json_encode($tags),
            ]);

            return $ok ? "ADDED" : "FAIL";

        } catch (Throwable $e) {
            error_log("[ServiceFavoritePlayers::addFavoriteNonGHIN] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    /**
     * Mirrors Wix deleteFavoritePlayer(parmRecID)
     * Returns: "DELETED" | "FAIL"
     */
    public static function deleteFavoritePlayer(int $recId, array $config): string
    {
        try {
            if ($recId <= 0) return "FAIL";

            $pdo = Db::pdo($config["db"]);

            $sql = "DELETE FROM db_FavPlayers WHERE " . self::PK_COL . " = :id LIMIT 1";
            $st = $pdo->prepare($sql);
            $ok = $st->execute(["id" => $recId]);

            return $ok ? "DELETED" : "FAIL";

        } catch (Throwable $e) {
            error_log("[ServiceFavoritePlayers::deleteFavoritePlayer] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    // -------------------------
    // Helpers
    // -------------------------

    private static function normalizeTags($tag): array
    {
        if (is_array($tag) && count($tag) > 0) return array_values($tag);
        if (is_string($tag) && trim($tag) !== "") return [trim($tag)];
        return ["_default"]; // matches Wix default
    }

    private static function toArray($obj): array
    {
        if (is_array($obj)) return $obj;
        if (is_object($obj)) return json_decode(json_encode($obj), true) ?: [];
        if (is_string($obj)) {
            $d = json_decode($obj, true);
            return is_array($d) ? $d : [];
        }
        return [];
    }
}
