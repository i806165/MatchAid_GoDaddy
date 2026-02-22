<?php
// /public_html/services/database/service_dbFavPlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

final class service_dbFavPlayers
{
    /**
     * Mirrors legacy "checkFavoritePlayer(userGHIN, favGHIN)"
     * Returns: ["status"=>"FOUND|NOT FOUND"]
     */
    public static function checkFavoritePlayer(string $userGHIN, string $favGHIN): array
    {
        $userGHIN = trim($userGHIN);
        $favGHIN  = trim($favGHIN);

        if ($userGHIN === "" || $favGHIN === "") {
            return ["status" => "NOT FOUND"];
        }

        $pdo = Db::pdo();

        $sql = "SELECT 1
                FROM db_FavPlayers
                WHERE dbFav_UserGHIN = :u
                  AND dbFav_PlayerGHIN = :p
                LIMIT 1";

        $st = $pdo->prepare($sql);
        $st->execute(["u" => $userGHIN, "p" => $favGHIN]);

        return ($st->fetchColumn() !== false)
            ? ["status" => "FOUND"]
            : ["status" => "NOT FOUND"];
    }

    public static function getFavoritesForUser(string $userGHIN, string $courseId = "", string $targetGhin = ""): array
{
    $userGHIN = trim($userGHIN);
    if ($userGHIN === "") return [];

    $pdo = Db::pdo();
    $params = ["u" => $userGHIN];
    $where = "WHERE dbFav_UserGHIN = :u";
    
    if ($targetGhin !== "") {
        $where .= " AND dbFav_PlayerGHIN = :tg";
        $params["tg"] = $targetGhin;
    }

    // SELECT * as requested
    $sql = "SELECT * 
            FROM db_FavPlayers
            $where
            ORDER BY dbFav_PlayerLName ASC, dbFav_PlayerName ASC";

    $st = $pdo->prepare($sql);
    $st->execute($params);

    $favorites = [];
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
        $groups = [];
        $gj = $r["dbFav_PlayerTags"] ?? "";

        if (is_string($gj) && trim($gj) !== "") {
            $decoded = json_decode($gj, true);
            if (is_array($decoded)) $groups = $decoded;
            else $groups = array_map("trim", explode(",", $gj));
        }

        $favorites[] = [
            "playerGHIN" => (string)($r["dbFav_PlayerGHIN"] ?? ""),
            "name"       => (string)($r["dbFav_PlayerName"] ?? ""),
            "email"      => (string)($r["dbFav_PlayerEMail"] ?? ""),
            "mobile"     => (string)($r["dbFav_PlayerMobile"] ?? ""),
            "memberId"   => (string)($r["dbFav_PlayerMemberID"] ?? ""),
            "gender"     => (string)($r["dbFav_PlayerGender"] ?? ""),
            "lname"      => (string)($r["dbFav_PlayerLName"] ?? ""),
            "hi"         => (string)($r["dbFav_PlayerHI"] ?? ""),
            "hi"         => (string)($r["dbFav_PlayerHI"] ?? ""),
            "groups"     => array_values(array_filter(array_map("strval", $groups))),
            "lastCourse" => null,
        ];
    }

    $courseId = trim($courseId);
    if ($courseId === "" || !$favorites) return $favorites;

    foreach ($favorites as &$f) {
        $ghin = trim((string)($f["playerGHIN"] ?? ""));
        if ($ghin === "") continue;

        $sqlLast = "SELECT dbPlayers_GGID, dbPlayers_TeeSetID, dbPlayers_TeeSetName, _createdDate
                    FROM db_Players
                    WHERE dbPlayers_PlayerGHIN = :ghin
                      AND dbPlayers_CourseID = :course
                    ORDER BY _createdDate DESC
                    LIMIT 1";
        $stLast = $pdo->prepare($sqlLast);
        $stLast->execute([":ghin" => $ghin, ":course" => $courseId]);
        $last = $stLast->fetch(PDO::FETCH_ASSOC);

        if (is_array($last)) {
            $f["lastCourse"] = [
                "ggid" => $last["dbPlayers_GGID"] ?? null,
                "teeSetId" => $last["dbPlayers_TeeSetID"] ?? null,
                "teeSetName" => (string)($last["dbPlayers_TeeSetName"] ?? ""),
                "when" => $last["_createdDate"] ?? null,
            ];
        }
    }
    unset($f);

    return $favorites;
}

    /**
     * getContactsForGame
     * Returns map of playerGHIN => { email, mobile } for a list of players,
     * looked up from the user's favorites (address book).
     */
    public static function getContactsForGame(string $userGHIN, array $playerGHINs): array
    {
        $userGHIN = trim($userGHIN);
        if ($userGHIN === "" || empty($playerGHINs)) return [];

        $ghins = array_values(array_unique(array_filter(array_map("strval", $playerGHINs))));
        if (empty($ghins)) return [];

        $pdo = Db::pdo();
        $in = implode(",", array_fill(0, count($ghins), "?"));
        
        $sql = "SELECT dbFav_PlayerGHIN, dbFav_PlayerEMail, dbFav_PlayerMobile
                FROM db_FavPlayers
                WHERE dbFav_UserGHIN = ?
                  AND dbFav_PlayerGHIN IN ($in)";
        
        $params = array_merge([$userGHIN], $ghins);
        $st = $pdo->prepare($sql);
        $st->execute($params);

        $map = [];
        while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
            $g = (string)($r["dbFav_PlayerGHIN"] ?? "");
            $map[$g] = [
                "email" => (string)($r["dbFav_PlayerEMail"] ?? ""),
                "mobile" => (string)($r["dbFav_PlayerMobile"] ?? "")
            ];
        }
        return $map;
    }

    public static function isFavorite(string $userGHIN, string $favGHIN): bool
    {
        $chk = self::checkFavoritePlayer($userGHIN, $favGHIN);
        return (string)($chk["status"] ?? "") === "FOUND";
    }

    /**
     * Mirrors legacy "addFavoritePlayer(userGHIN, favGHIN, tag, token)"
     * Returns: "ADDED" | "FAIL" | "FOUND"
     */
    public static function addFavoritePlayer(
        string $userGHIN,
        string $favGHIN,
        $tag,                // string|array|null
        ?string $token
    ): string {
        try {
            $userGHIN = trim($userGHIN);
            $favGHIN  = trim($favGHIN);

            if ($userGHIN === "" || $favGHIN === "") return "FAIL";

            // Avoid duplicates
            if (self::isFavorite($userGHIN, $favGHIN)) return "FOUND";

            // GHIN enrich
            $playerGHINData = be_getPlayersByID($favGHIN, $token);
            $golfer = $playerGHINData["golfers"][0] ?? null;
            if (!$golfer) return "FAIL";

            $first  = trim((string)($golfer["first_name"] ?? ""));
            $last   = trim((string)($golfer["last_name"] ?? ""));
            $name   = trim($first . " " . $last);

            $tags = self::normalizeTags($tag);

            $pdo = Db::pdo();

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
            error_log("[service_dbFavPlayers::addFavoritePlayer] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    /**
     * Mirrors legacy "addFavoriteNonGHIN(userGHIN, golferObj, tag)"
     * Returns: "ADDED" | "FAIL" | "FOUND"
     */
    public static function addFavoriteNonGHIN(
        string $userGHIN,
        $golferObj,          // array|object
        $tag                 // string|array|null
    ): string {
        try {
            $userGHIN = trim($userGHIN);
            if ($userGHIN === "") return "FAIL";

            $g = self::toArray($golferObj);
            $favGHIN = trim((string)($g["ghin"] ?? ""));
            if ($favGHIN === "") return "FAIL";

            if (self::isFavorite($userGHIN, $favGHIN)) return "FOUND";

            $tags = self::normalizeTags($tag);

            $pdo = Db::pdo();

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
                "n"    => $g["player_name"]    ?? "",
                "ln"   => $g["last_name"]      ?? "",
                "mid"  => null,
                "mob"  => null,
                "em"   => null,
                "hi"   => $g["handicap_index"] ?? null,
                "g"    => $g["gender"]         ?? null,
                "tags" => json_encode($tags),
            ]);

            return $ok ? "ADDED" : "FAIL";
        } catch (Throwable $e) {
            error_log("[service_dbFavPlayers::addFavoriteNonGHIN] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    /**
     * Delete by compound key (userGHIN + favGHIN)
     * Returns: "DELETED" | "FAIL"
     */
    public static function deleteFavoritePlayer(string $userGHIN, string $favGHIN): string
    {
        try {
            $userGHIN = trim($userGHIN);
            $favGHIN  = trim($favGHIN);
            if ($userGHIN === "" || $favGHIN === "") return "FAIL";

            $pdo = Db::pdo();

            $sql = "DELETE FROM db_FavPlayers
                    WHERE dbFav_UserGHIN = :u
                      AND dbFav_PlayerGHIN = :p
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            $ok = $st->execute(["u" => $userGHIN, "p" => $favGHIN]);

            return $ok ? "DELETED" : "FAIL";
        } catch (Throwable $e) {
            error_log("[service_dbFavPlayers::deleteFavoritePlayer] EX=" . $e->getMessage());
            return "FAIL";
        }
    }

    /**
     * Distinct tag/group names for this user's favorites.
     * - dbFav_PlayerTags stored as JSON array text OR single string.
     * - Returns unique, sorted list.
     */
    public static function getGroupsForUser(string $userGHIN): array
    {
        $userGHIN = trim($userGHIN);
        if ($userGHIN === "") return [];

        $pdo = Db::pdo();

        $sql = "SELECT dbFav_PlayerTags AS tags
                FROM db_FavPlayers
                WHERE dbFav_UserGHIN = :u";

        $st = $pdo->prepare($sql);
        $st->execute(["u" => $userGHIN]);

        $set = [];
        while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
            $raw = $row["tags"] ?? null;
            $tags = [];

            if (is_string($raw) && trim($raw) !== "") {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) $tags = $decoded;
                else $tags = [trim($raw)];
            }

            foreach ($tags as $t) {
                $t = preg_replace("/\s+/", " ", trim((string)$t));
                if ($t === "") continue;
                if ($t === "_default") continue;
                $set[strtolower($t)] = $t;
            }
        }

        $out = array_values($set);
        usort($out, fn($a, $b) => strcasecmp($a, $b));
        return $out;
    }

    /**
     * Upsert editable fields + tags/groups (no config passing).
     * Returns: "ADDED" | "UPDATED" | "FAIL"
     */
    public static function upsertFavorite(
        string $userGHIN,
        string $favGHIN,
        ?string $email,
        ?string $mobile,
        ?string $memberId,
        array $groups,
        ?string $playerName = null,
        ?string $playerLName = null,
        ?string $playerHI = null,
        ?string $playerGender = null
    ): string {
        try {
            $userGHIN = trim($userGHIN);
            $favGHIN  = trim($favGHIN);
            if ($userGHIN === "" || $favGHIN === "") return "FAIL";

            $pdo = Db::pdo();

            $tags = self::normalizeTags($groups);
            $tagsJson = json_encode($tags);

            if (self::isFavorite($userGHIN, $favGHIN)) {
                $sql = "UPDATE db_FavPlayers
                        SET dbFav_PlayerEMail    = :em,
                            dbFav_PlayerMobile   = :mob,
                            dbFav_PlayerMemberID = :mid,
                            dbFav_PlayerTags     = :tags
                        WHERE dbFav_UserGHIN = :u
                          AND dbFav_PlayerGHIN = :p
                        LIMIT 1";

                $st = $pdo->prepare($sql);
                $ok = $st->execute([
                    "em"   => ($email !== null ? $email : null),
                    "mob"  => ($mobile !== null ? $mobile : null),
                    "mid"  => ($memberId !== null ? $memberId : null),
                    "tags" => $tagsJson,
                    "u"    => $userGHIN,
                    "p"    => $favGHIN,
                ]);

                return $ok ? "UPDATED" : "FAIL";
            }

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
                "n"    => ($playerName !== null ? $playerName : ""),
                "ln"   => ($playerLName !== null ? $playerLName : ""),
                "mid"  => ($memberId !== null ? $memberId : null),
                "mob"  => ($mobile !== null ? $mobile : null),
                "em"   => ($email !== null ? $email : null),
                "hi"   => ($playerHI !== null ? $playerHI : null),
                "g"    => ($playerGender !== null ? $playerGender : null),
                "tags" => $tagsJson,
            ]);

            return $ok ? "ADDED" : "FAIL";
        } catch (Throwable $e) {
            error_log("[service_dbFavPlayers::upsertFavorite] " . $e->getMessage());
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
        return ["_default"];
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
