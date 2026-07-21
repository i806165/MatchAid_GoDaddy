<?php
// /public_html/services/database/service_AdminGamesList.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Db.php';

/**
 * Admin Games List data service (MySQL)
 * - Lists games for a club with date + admin filters
 * - Provides unique admin list derived from db_Games
 * - Provides favorite admin list + toggle (db_FavAdmins)
 */
final class ServiceAdminGamesList
{
    // -----------------------------
    // Admins
    // -----------------------------

    /**
     * Unique admins for a club, derived from db_Games.
     * @return array<int,array{ghin:string,name:string}>
     */
    public static function listUniqueAdmins(string $clubId, array $config): array
    {
        $pdo = Db::pdo($config);

        $sql = "
            SELECT DISTINCT
                COALESCE(dbGames_AdminGHIN,'') AS ghin,
                COALESCE(dbGames_AdminName,'') AS name
            FROM db_Games
            WHERE dbGames_AdminClubID = :clubId
              AND dbGames_AdminGHIN IS NOT NULL
              AND dbGames_AdminName IS NOT NULL
              AND TRIM(dbGames_AdminGHIN) <> ''
              AND TRIM(dbGames_AdminName) <> ''
            LIMIT 1000
        ";

        $st = $pdo->prepare($sql);
        $st->execute([':clubId' => $clubId]);
        $rows = $st->fetchAll();

        // Sort by last name like the Wix code
        usort($rows, static function (array $a, array $b): int {
            $lastA = strtolower(self::lastName($a['name'] ?? ''));
            $lastB = strtolower(self::lastName($b['name'] ?? ''));
            return $lastA <=> $lastB;
        });

        // Normalize output
        $out = [];
        $seen = [];
        foreach ($rows as $r) {
            $ghin = trim((string)($r['ghin'] ?? ''));
            $name = trim((string)($r['name'] ?? ''));
            if ($ghin === '' || isset($seen[$ghin])) {
                continue;
            }
            $seen[$ghin] = true;
            $out[] = ['ghin' => $ghin, 'name' => $name];
        }
        return $out;
    }

    /**
     * Favorite admins for a user.
     * @return array<int,array{ghin:string,name:string,lname:string}>
     */
    public static function listFavoriteAdmins(string $userGhin, array $config): array
    {
        $pdo = Db::pdo($config);

        $sql = "
            SELECT
                COALESCE(dbFavAdmin_AdminGHIN,'') AS ghin,
                COALESCE(dbFavAdmin_AdminName,'') AS name,
                COALESCE(dbFavAdmin_AdminLName,'') AS lname
            FROM db_FavAdmins
            WHERE dbFavAdmin_UserGHIN = :userGhin
            LIMIT 1000
        ";

        $st = $pdo->prepare($sql);
        $st->execute([':userGhin' => $userGhin]);
        $rows = $st->fetchAll();

        // De-dupe and sort by lname
        $out = [];
        $seen = [];
        foreach ($rows as $r) {
            $ghin = trim((string)($r['ghin'] ?? ''));
            if ($ghin === '' || isset($seen[$ghin])) {
                continue;
            }
            $seen[$ghin] = true;
            $name = trim((string)($r['name'] ?? ''));
            $lname = trim((string)($r['lname'] ?? ''));
            if ($lname === '') {
                $lname = self::lastName($name);
            }
            $out[] = ['ghin' => $ghin, 'name' => $name, 'lname' => $lname];
        }

        usort($out, static fn(array $a, array $b): int => strtolower($a['lname']) <=> strtolower($b['lname']));
        return $out;
    }

    public static function isFavoriteAdmin(string $userGhin, string $adminGhin, array $config): bool
    {
        $pdo = Db::pdo($config);
        $sql = "SELECT 1 FROM db_FavAdmins WHERE dbFavAdmin_UserGHIN = :u AND dbFavAdmin_AdminGHIN = :a LIMIT 1";
        $st = $pdo->prepare($sql);
        $st->execute([':u' => $userGhin, ':a' => $adminGhin]);
        return (bool)$st->fetchColumn();
    }

    /**
     * Toggle favorite admin (compound key delete/insert).
     * Returns ['status' => 'ADDED'|'DELETED', 'message' => string]
     */
    public static function toggleFavoriteAdmin(string $userGhin, string $adminGhin, string $clubId, array $config): array
    {
        $adminGhin = trim($adminGhin);
        if ($adminGhin === '') {
            return ['status' => 'FAIL', 'message' => 'Missing adminKey'];
        }

        if (self::isFavoriteAdmin($userGhin, $adminGhin, $config)) {
            self::deleteFavoriteAdmin($userGhin, $adminGhin, $config);
            return ['status' => 'DELETED', 'message' => 'Removed from Favorites'];
        }

        self::addFavoriteAdminFromGames($userGhin, $adminGhin, $clubId, $config);
        return ['status' => 'ADDED', 'message' => 'Added to Favorites'];
    }

    private static function deleteFavoriteAdmin(string $userGhin, string $adminGhin, array $config): void
    {
        $pdo = Db::pdo($config);
        $sql = "DELETE FROM db_FavAdmins WHERE dbFavAdmin_UserGHIN = :u AND dbFavAdmin_AdminGHIN = :a";
        $st = $pdo->prepare($sql);
        $st->execute([':u' => $userGhin, ':a' => $adminGhin]);
    }

    /**
     * Insert favorite admin by looking up name/facility in db_Games (fast, no GHIN calls).
     * If nothing is found, inserts with minimal fields.
     */
    private static function addFavoriteAdminFromGames(string $userGhin, string $adminGhin, string $clubId, array $config): void
    {
        $pdo = Db::pdo($config);

        // Try to hydrate from existing games for this club
        $sql = "
            SELECT
                dbGames_AdminName AS adminName,
                dbGames_FacilityID AS facilityId,
                dbGames_FacilityName AS facilityName
            FROM db_Games
            WHERE dbGames_AdminClubID = :clubId
              AND dbGames_AdminGHIN = :adminGhin
            ORDER BY dbGames_PlayDate DESC
            LIMIT 1
        ";
        $st = $pdo->prepare($sql);
        $st->execute([':clubId' => $clubId, ':adminGhin' => $adminGhin]);
        $row = $st->fetch() ?: [];

        $adminName = trim((string)($row['adminName'] ?? ''));
        $lname = self::lastName($adminName);
        $facilityId = $row['facilityId'] ?? null;
        $facilityName = $row['facilityName'] ?? null;

        $ins = "
            INSERT INTO db_FavAdmins (
                dbFavAdmin_UserGHIN,
                dbFavAdmin_AdminGHIN,
                dbFavAdmin_AdminName,
                dbFavAdmin_AdminLName,
                dbFavAdmin_FacilityID,
                dbFavAdmin_FacilityName
            ) VALUES (
                :u, :a, :n, :l, :fid, :fname
            )
        ";
        $st2 = $pdo->prepare($ins);
        $st2->execute([
            ':u' => $userGhin,
            ':a' => $adminGhin,
            ':n' => $adminName,
            ':l' => $lname,
            ':fid' => $facilityId,
            ':fname' => $facilityName,
        ]);
    }

    // -----------------------------
    // Games
    // -----------------------------

    /**
     * @param array<int,string> $adminKeys
     * @return array{raw: array<int,array<string,mixed>>, vm: array<int,array<string,mixed>>}
     */
    public static function listGames(string $clubId, ?string $dateFromISO, ?string $dateToISO, array $adminKeys, array $config): array
    {
        $pdo = Db::pdo($config);

        $where = ["dbGames_AdminClubID = :clubId"]; 
        $params = [':clubId' => $clubId];

        if ($dateFromISO) {
            $where[] = 'dbGames_PlayDate >= :fromDt';
            $params[':fromDt'] = $dateFromISO . ' 00:00:00';
        }
        if ($dateToISO) {
            $where[] = 'dbGames_PlayDate <= :toDt';
            $params[':toDt'] = $dateToISO . ' 23:59:59';
        }

        $adminKeys = array_values(array_filter(array_map('strval', $adminKeys), static fn($v) => trim($v) !== ''));
        if (count($adminKeys) > 0) {
            $in = [];
            foreach ($adminKeys as $i => $ghin) {
                $ph = ':a' . $i;
                $in[] = $ph;
                $params[$ph] = $ghin;
            }
            $where[] = 'dbGames_AdminGHIN IN (' . implode(',', $in) . ')';
        }

        $dir = self::sortDirection($dateFromISO, $dateToISO);
        $orderBy = ($dir === 'asc') ? 'dbGames_PlayDate ASC' : 'dbGames_PlayDate DESC';

        $sql = "SELECT * FROM db_Games WHERE " . implode(' AND ', $where) . " ORDER BY $orderBy LIMIT 1000";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $games = $st->fetchAll();

        // Player counts (batch)
        $counts = self::countPlayersForGames($pdo, array_map(static fn($g) => (int)($g['dbGames_GGID'] ?? 0), $games));

        // Enrich raw (keep fields similar to Wix)
        foreach ($games as &$g) {
            $ggid = (int)($g['dbGames_GGID'] ?? 0);
            $g['gameGGID'] = (string)$ggid;
            $g['gamePlayerCount'] = (int)($counts[$ggid] ?? 0);

            $g['gamePlayDateDDMDY'] = self::formatPlayDateShort($g['dbGames_PlayDate'] ?? null);
            $g['gamePlayTimeHHMM'] = self::formatPlayTimeCondensed($g['dbGames_PlayTime'] ?? null);
        }
        unset($g);

        $vm = array_map(static fn(array $g): array => self::toGameVM($g), $games);

        return ['raw' => $games, 'vm' => $vm];
    }

    // -----------------------------
    // Helpers
    // -----------------------------

    /** @return array<int,int> map[ggid] => count */
    private static function countPlayersForGames(PDO $pdo, array $ggids): array
    {
        $ggids = array_values(array_filter(array_map('intval', $ggids), static fn(int $v) => $v > 0));
        if (count($ggids) === 0) return [];

        $in = implode(',', array_fill(0, count($ggids), '?'));
        $sql = "SELECT dbPlayers_GGID AS ggid, COUNT(*) AS cnt FROM db_Players WHERE dbPlayers_GGID IN ($in) GROUP BY dbPlayers_GGID";
        $st = $pdo->prepare($sql);
        $st->execute($ggids);
        $rows = $st->fetchAll();

        $map = [];
        foreach ($rows as $r) {
            $map[(int)$r['ggid']] = (int)$r['cnt'];
        }
        return $map;
    }

    private static function toGameVM(array $g): array
    {
        $ggid = (string)($g['dbGames_GGID'] ?? '');

        return [
            'recId' => $ggid, // Wix had _id; on MySQL this is GGID
            'ggid' => $ggid,
            'title' => (string)($g['dbGames_Title'] ?? ''),
            'playDate' => self::toISODate($g['dbGames_PlayDate'] ?? null),
            'playTime' => (string)($g['dbGames_PlayTime'] ?? ''),
            'playDateText' => self::formatPlayDateLong($g['dbGames_PlayDate'] ?? null),
            'playTimeText' => (string)($g['gamePlayTimeHHMM'] ?? self::formatPlayTimeCondensed($g['dbGames_PlayTime'] ?? null)),
            'facilityName' => (string)($g['dbGames_FacilityName'] ?? ''),
            'courseName' => (string)($g['dbGames_CourseName'] ?? ''),
            'holes' => (string)($g['dbGames_Holes'] ?? ''),
            'teeTimeCnt' => (string)($g['dbGames_TeeTimeCnt'] ?? ''),
            'privacy' => (string)($g['dbGames_Privacy'] ?? ''),
            'playerCount' => (int)($g['gamePlayerCount'] ?? 0),
            'adminGHIN' => (string)($g['dbGames_AdminGHIN'] ?? ''),
            'adminName' => (string)($g['dbGames_AdminName'] ?? ''),
        ];
    }

    private static function lastName(string $fullName): string
    {
        $fullName = trim($fullName);
        if ($fullName === '') return '';
        $parts = preg_split('/\s+/', $fullName) ?: [];
        return (string)end($parts);
    }

    private static function toISODate($dt): string
    {
        if (!$dt) return '';
        $ts = is_string($dt) ? strtotime($dt) : (is_int($dt) ? $dt : null);
        if (!$ts) return '';
        return gmdate('Y-m-d', $ts);
    }

    private static function formatPlayDateLong($dt): string
    {
        if (!$dt) return '';
        $ts = is_string($dt) ? strtotime($dt) : (is_int($dt) ? $dt : null);
        if (!$ts) return '';
        // Matches HTML regex: DDD M/D/YYYY
        return date('D n/j/Y', $ts);
    }

    private static function formatPlayDateShort($dt): string
    {
        if (!$dt) return '';
        $ts = is_string($dt) ? strtotime($dt) : (is_int($dt) ? $dt : null);
        if (!$ts) return '';
        return date('D n/j/y', $ts);
    }

    private static function formatPlayTimeCondensed($t): string
    {
        if ($t === null) return '';
        $s = trim((string)$t);
        if ($s === '') return '';

        // MySQL TIME typically: HH:MM:SS or HH:MM
        $parts = explode(':', $s);
        $hh = (int)($parts[0] ?? 0);
        $mm = (int)($parts[1] ?? 0);

        $ampm = ($hh >= 12) ? 'p' : 'a';
        $h12 = $hh % 12;
        if ($h12 === 0) $h12 = 12;

        // "8:05a" / "12:00p"
        return sprintf('%d:%02d%s', $h12, $mm, $ampm);
    }

    /**
     * Ported from Wix getSortDirection.
     */
    private static function sortDirection(?string $fromISO, ?string $toISO): string
    {
        $msDay = 86400000;

        $today = new DateTimeImmutable('today');
        $todayMs = ((int)$today->format('U')) * 1000;

        $hasFrom = is_string($fromISO) && $fromISO !== '';
        $hasTo = is_string($toISO) && $toISO !== '';

        $from = $hasFrom ? DateTimeImmutable::createFromFormat('Y-m-d', $fromISO) : null;
        $to = $hasTo ? DateTimeImmutable::createFromFormat('Y-m-d', $toISO) : null;

        // One-sided windows
        if ($hasFrom && !$hasTo) {
            return ($from && $from >= $today) ? 'asc' : 'desc';
        }
        if (!$hasFrom && $hasTo) {
            return ($to && $to >= $today) ? 'asc' : 'desc';
        }

        // No window
        if (!$hasFrom && !$hasTo) return 'desc';

        // Two-sided windows
        if ($to && $to < $today) return 'desc';
        if ($from && $from > $today) return 'asc';

        $fromMs = $from ? ((int)$from->format('U')) * 1000 : $todayMs;
        $toMs = $to ? ((int)$to->format('U')) * 1000 : $todayMs;

        $daysBefore = ($from && $from < $today) ? (int)round(($todayMs - $fromMs) / $msDay) : 0;
        $daysAfter = ($to && $to > $today) ? (int)round(($toMs - $todayMs) / $msDay) : 0;

        return ($daysAfter >= $daysBefore) ? 'asc' : 'desc';
    }
}
