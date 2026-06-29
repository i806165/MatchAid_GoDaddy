<?php
// /public_html/services/database/service_dbEventPlayers.php
declare(strict_types=1);

require_once MA_API_LIB . "/Db.php";

/**
 * ServiceDbEventPlayers
 *
 * Final static service class for db_EventPlayers.
 * Follows established service pattern — final class, static methods,
 * Db::pdo() for all DB access, no session awareness, no echo/header/exit.
 *
 * Never writes to db_Players — that is the Game Players domain.
 * Read-only JOIN to db_Players is permitted in getEventPlayers() only.
 *
 * TeamKey values: "T1" | "T2" | "" (stored as NULL in DB)
 */
final class ServiceDbEventPlayers
{
    // ── Allowed fields for upsertEventPlayer ──────────────────────────────────
    private const ALLOWED_FIELDS = [
        'dbEventPlayers_Name',
        'dbEventPlayers_LName',
        'dbEventPlayers_Gender',
        'dbEventPlayers_HI',
        'dbEventPlayers_ClubID',
        'dbEventPlayers_ClubName',
        'dbEventPlayers_LocalID',
        'dbEventPlayers_TeamKey',
        'dbEventPlayers_PairingID',
        'dbEventPlayers_PairingPos',
        'dbEventPlayers_CreatorID',
        'dbEventPlayers_CreatorName',
    ];

    // Valid TeamKey values — must match saveTeamAssignments.php
    private const VALID_TEAM_KEYS = ['T1', 'T2', ''];

    // ═══════════════════════════════════════════════════════════════════════════
    // READ
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * getEventRoster(eid)
     * Fetch all db_EventPlayers rows for an event.
     * Ordered by LName ASC, Name ASC, GHIN ASC per spec §8.3.
     *
     * @param  int   $eid
     * @return array
     */
    public static function getEventRoster(int $eid): array
    {
        if ($eid <= 0) return [];

        try {
            $pdo = Db::pdo();
            $sql = "SELECT *
                    FROM db_EventPlayers
                    WHERE dbEventPlayers_EID = :eid
                    ORDER BY dbEventPlayers_LName ASC,
                             dbEventPlayers_Name  ASC,
                             dbEventPlayers_GHIN  ASC";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid]);
            return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::getEventRoster] ' . $e->getMessage());
            return [];
        }
    }

    /**
     * getEventPlayer(eid, ghin)
     * Fetch a single event player row. Returns null if not found.
     *
     * @param  int    $eid
     * @param  string $ghin
     * @return array|null
     */
    public static function getEventPlayer(int $eid, string $ghin): ?array
    {
        $ghin = trim($ghin);
        if ($eid <= 0 || $ghin === '') return null;

        try {
            $pdo = Db::pdo();
            $sql = "SELECT *
                    FROM db_EventPlayers
                    WHERE dbEventPlayers_EID  = :eid
                      AND dbEventPlayers_GHIN = :ghin
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid, ':ghin' => $ghin]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::getEventPlayer] ' . $e->getMessage());
            return null;
        }
    }

    /**
     * getEnrolledGHINs(eid)
     * Return a flat array of GHIN strings for all enrolled players.
     * Used to build existingGHINs Set in JS.
     *
     * @param  int   $eid
     * @return array  string[]
     */
    public static function getEnrolledGHINs(int $eid): array
    {
        if ($eid <= 0) return [];

        try {
            $pdo = Db::pdo();
            $sql = "SELECT dbEventPlayers_GHIN
                    FROM db_EventPlayers
                    WHERE dbEventPlayers_EID = :eid
                    ORDER BY dbEventPlayers_GHIN ASC";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid]);
            return array_column($st->fetchAll(PDO::FETCH_ASSOC), 'dbEventPlayers_GHIN') ?: [];

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::getEnrolledGHINs] ' . $e->getMessage());
            return [];
        }
    }

    /**
     * isEnrolled(eid, ghin)
     * Check whether a GHIN is already enrolled in the event.
     *
     * @param  int    $eid
     * @param  string $ghin
     * @return bool
     */
    public static function isEnrolled(int $eid, string $ghin): bool
    {
        $ghin = trim($ghin);
        if ($eid <= 0 || $ghin === '') return false;

        try {
            $pdo = Db::pdo();
            $sql = "SELECT 1
                    FROM db_EventPlayers
                    WHERE dbEventPlayers_EID  = :eid
                      AND dbEventPlayers_GHIN = :ghin
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid, ':ghin' => $ghin]);
            return $st->fetchColumn() !== false;

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::isEnrolled] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * getPlayerCount(eid)
     * Returns the number of players enrolled in an event.
     *
     * @param  int $eid
     * @return int
     */
    public static function getPlayerCount(int $eid): int
    {
        if ($eid <= 0) return 0;

        try {
            $pdo = Db::pdo();
            $sql = "SELECT COUNT(*)
                    FROM db_EventPlayers
                    WHERE dbEventPlayers_EID = :eid";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid]);
            return (int) $st->fetchColumn();

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::getPlayerCount] ' . $e->getMessage());
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * upsertEventPlayer(eid, ghin, fields)
     *
     * Insert or update a player row. Enforces composite PK.
     * Returns the saved row on success, throws RuntimeException on failure.
     *
     * $fields accepts only keys in ALLOWED_FIELDS — all others silently ignored.
     * TeamKey is validated — invalid values stored as NULL.
     *
     * @param  int    $eid
     * @param  string $ghin
     * @param  array  $fields   keyed by db column name
     * @return array            saved row
     * @throws RuntimeException on DB failure
     */
    public static function upsertEventPlayer(int $eid, string $ghin, array $fields): array
    {
        $ghin = trim($ghin);
        if ($eid <= 0 || $ghin === '') {
            throw new RuntimeException('upsertEventPlayer: missing eid or ghin');
        }

        // Filter to allowed fields only
        $safe = array_intersect_key($fields, array_flip(self::ALLOWED_FIELDS));

        // Validate TeamKey
        if (array_key_exists('dbEventPlayers_TeamKey', $safe)) {
            $tk = trim((string)($safe['dbEventPlayers_TeamKey'] ?? ''));
            if (!in_array($tk, self::VALID_TEAM_KEYS, true)) {
                error_log("[ServiceDbEventPlayers::upsertEventPlayer] Invalid TeamKey '{$tk}' stored as NULL");
                $tk = '';
            }
            $safe['dbEventPlayers_TeamKey'] = $tk !== '' ? $tk : null;
        }

        // Store empty strings as NULL for nullable fields
        foreach ($safe as $k => $v) {
            if ($v === '') $safe[$k] = null;
        }

        try {
            $pdo = Db::pdo();

            // Build column list for INSERT ... ON DUPLICATE KEY UPDATE
            $insertCols  = ['dbEventPlayers_EID', 'dbEventPlayers_GHIN'];
            $insertVals  = [':eid', ':ghin'];
            $updateParts = [];

            foreach ($safe as $col => $val) {
                $param          = ':' . $col;
                $insertCols[]   = $col;
                $insertVals[]   = $param;
                $updateParts[]  = "{$col} = VALUES({$col})";
            }

            $colList    = implode(', ', $insertCols);
            $valList    = implode(', ', $insertVals);
            $updateList = $updateParts
                ? implode(', ', $updateParts)
                : 'dbEventPlayers_EID = dbEventPlayers_EID'; // no-op if only PK provided

            $sql = "INSERT INTO db_EventPlayers ({$colList})
                    VALUES ({$valList})
                    ON DUPLICATE KEY UPDATE {$updateList}";

            $params = [':eid' => $eid, ':ghin' => $ghin];
            foreach ($safe as $col => $val) {
                $params[':' . $col] = $val;
            }

            $st = $pdo->prepare($sql);
            $ok = $st->execute($params);

            if (!$ok) {
                throw new RuntimeException('upsertEventPlayer: execute returned false');
            }

            $saved = self::getEventPlayer($eid, $ghin);
            if ($saved === null) {
                throw new RuntimeException('upsertEventPlayer: could not re-fetch saved row');
            }

            return $saved;

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::upsertEventPlayer] ' . $e->getMessage());
            throw new RuntimeException($e->getMessage());
        }
    }

    /**
     * deleteEventPlayer(eid, ghin)
     * Remove a player from the event roster.
     * Returns true if a row was deleted, false otherwise.
     *
     * @param  int    $eid
     * @param  string $ghin
     * @return bool
     */
    public static function deleteEventPlayer(int $eid, string $ghin): bool
    {
        $ghin = trim($ghin);
        if ($eid <= 0 || $ghin === '') return false;

        try {
            $pdo = Db::pdo();
            $sql = "DELETE FROM db_EventPlayers
                    WHERE dbEventPlayers_EID  = :eid
                      AND dbEventPlayers_GHIN = :ghin
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            $st->execute([':eid' => $eid, ':ghin' => $ghin]);
            return $st->rowCount() > 0;

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::deleteEventPlayer] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * updateTeamKey(eid, ghin, teamKey)
     * Update TeamKey for a single player.
     * Called after MA.manageTeams saves.
     * Invalid teamKey values coerced to NULL — mirrors saveTeamAssignments.php.
     *
     * @param  int    $eid
     * @param  string $ghin
     * @param  string $teamKey  "T1" | "T2" | ""
     * @return bool
     */
    public static function updateTeamKey(int $eid, string $ghin, string $teamKey): bool
    {
        $ghin    = trim($ghin);
        $teamKey = trim($teamKey);

        if ($eid <= 0 || $ghin === '') return false;

        if (!in_array($teamKey, self::VALID_TEAM_KEYS, true)) {
            error_log("[ServiceDbEventPlayers::updateTeamKey] Invalid teamKey '{$teamKey}' coerced to NULL");
            $teamKey = '';
        }

        try {
            $pdo = Db::pdo();
            $sql = "UPDATE db_EventPlayers
                    SET dbEventPlayers_TeamKey = :teamKey
                    WHERE dbEventPlayers_EID  = :eid
                      AND dbEventPlayers_GHIN = :ghin
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            return $st->execute([
                ':teamKey' => $teamKey !== '' ? $teamKey : null,
                ':eid'     => $eid,
                ':ghin'    => $ghin,
            ]);

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::updateTeamKey] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * updatePairing(eid, ghin, pairingId, pairingPos)
     * Update PairingID and PairingPos for a single player.
     * Called after MA.managePairings saves (Phase 6).
     *
     * @param  int    $eid
     * @param  string $ghin
     * @param  string $pairingId
     * @param  string $pairingPos
     * @return bool
     */
    public static function updatePairing(
        int    $eid,
        string $ghin,
        string $pairingId,
        string $pairingPos = ''
    ): bool {
        $ghin       = trim($ghin);
        $pairingId  = trim($pairingId);
        $pairingPos = trim($pairingPos);

        if ($eid <= 0 || $ghin === '') return false;

        try {
            $pdo = Db::pdo();
            $sql = "UPDATE db_EventPlayers
                    SET dbEventPlayers_PairingID  = :pairingId,
                        dbEventPlayers_PairingPos = :pairingPos
                    WHERE dbEventPlayers_EID  = :eid
                      AND dbEventPlayers_GHIN = :ghin
                    LIMIT 1";

            $st = $pdo->prepare($sql);
            return $st->execute([
                ':pairingId'  => $pairingId  !== '' ? $pairingId  : null,
                ':pairingPos' => $pairingPos !== '' ? $pairingPos : null,
                ':eid'        => $eid,
                ':ghin'       => $ghin,
            ]);

        } catch (Throwable $e) {
            error_log('[ServiceDbEventPlayers::updatePairing] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * cascadeToGame(eid, ggid)
     * Copy all event roster players into db_Players for the given GGID.
     * Applies cascade rules from spec §7.4.
     * Returns count of players cascaded.
     *
     * NOTE: Phase 5 implementation — stub only.
     * Full implementation requires ServiceContextGame and WorkflowProcessPlayers.
     *
     * @param  int $eid
     * @param  int $ggid
     * @return int
     */
    public static function cascadeToGame(int $eid, int $ggid): int
    {
        // Phase 5 — not yet implemented
        throw new RuntimeException('cascadeToGame: not yet implemented (Phase 5)');
    }
}
