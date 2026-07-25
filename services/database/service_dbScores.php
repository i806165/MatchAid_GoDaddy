<?php
declare(strict_types=1);
// /public_html/services/database/service_dbScores.php
//
// Dedicated data-access layer for db_Scores — query/insert/update/delete for
// blind-player rows. Extracted from service_BlindPlayer.php, which previously
// issued raw SQL against this table directly. service_BlindPlayer.php now
// consumes this file rather than touching the table itself, matching the
// existing pattern of service_dbPlayers.php / service_dbGames.php for their
// respective tables.
//
// No business logic lives here — no blind-player rules, no target/short-
// pairing math, no declared-flag resolution. Purely: given identifiers,
// read or write rows.

final class ServiceDbScores
{
    // =========================================================================
    // Reads
    // =========================================================================

    /**
     * Every blind row for a game. Caller handles JSON hydration of
     * dbScores_Scores.
     */
    public static function getBlindRowsForGame(int $ggid): array
    {
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare(
            'SELECT * FROM db_Scores WHERE dbScores_GGID = ? AND dbScores_isBlind = 1'
        );
        $stmt->execute([$ggid]);
        return $stmt->fetchAll() ?: [];
    }

    /**
     * Every blind row for a game, restricted to a specific set of
     * PairingIDs. Used to scope a lookup/delete to the pairings that fall
     * within a particular PlayerKey scope.
     */
    public static function getBlindRowsForPairings(int $ggid, array $pairingIds): array
    {
        $pairingIds = array_values(array_unique(array_filter(
            array_map('strval', $pairingIds),
            fn($p) => $p !== '' && $p !== '000'
        )));
        if (!$pairingIds) return [];

        $placeholders = implode(',', array_fill(0, count($pairingIds), '?'));
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare(
            "SELECT * FROM db_Scores
             WHERE dbScores_GGID = ? AND dbScores_isBlind = 1
               AND dbScores_PairingID IN ($placeholders)"
        );
        $stmt->execute(array_merge([$ggid], $pairingIds));
        return $stmt->fetchAll() ?: [];
    }

    /**
     * The blind donor GHIN currently assigned to one pairing, if any.
     */
    public static function getBlindGHINForPairing(int $ggid, string $pairingId): ?string
    {
        if ($pairingId === '' || $pairingId === '000') return null;
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare(
            'SELECT dbScores_GHIN FROM db_Scores
             WHERE dbScores_GGID = ? AND dbScores_isBlind = 1 AND dbScores_PairingID = ?
             LIMIT 1'
        );
        $stmt->execute([$ggid, $pairingId]);
        $row = $stmt->fetch();
        return $row ? (string)$row['dbScores_GHIN'] : null;
    }

    // =========================================================================
    // Writes
    // =========================================================================

    /**
     * Insert a blind clone row, or refresh its Scores in place if one
     * already exists at this (GGID, GHIN, PairingID, PairingPos).
     */
    public static function upsertBlindRow(
        int $ggid,
        string $ghin,
        string $pairingId,
        int $pairingPos,
        array $scoresJson
    ): bool {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('
            INSERT INTO db_Scores
                (dbScores_GGID, dbScores_GHIN, dbScores_PairingID, dbScores_PairingPos, dbScores_isBlind, dbScores_Scores)
            VALUES (?, ?, ?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE dbScores_Scores = VALUES(dbScores_Scores), _updatedDate = NOW()
        ');
        return $stmt->execute([$ggid, $ghin, $pairingId, $pairingPos, json_encode($scoresJson)]);
    }

    /**
     * Patch the Scores JSON on one existing blind row, identified by its
     * full composite key. Used for declared-flag correction — never
     * changes GHIN/PairingID/PairingPos.
     */
    public static function updateBlindRowScores(
        int $ggid,
        string $ghin,
        string $pairingId,
        int $pairingPos,
        array $scoresJson
    ): bool {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'UPDATE db_Scores
             SET dbScores_Scores = ?, _updatedDate = NOW()
             WHERE dbScores_GGID = ? AND dbScores_GHIN = ? AND dbScores_PairingID = ? AND dbScores_PairingPos = ?'
        );
        return $stmt->execute([json_encode($scoresJson), $ggid, $ghin, $pairingId, $pairingPos]);
    }

    // =========================================================================
    // Deletes
    // =========================================================================

    /**
     * Delete every blind row for a game. Returns the number of rows
     * actually deleted — callers use this to know whether a
     * user-facing "a blind player was removed" notification is warranted.
     */
    public static function deleteBlindRowsForGame(int $ggid): int
    {
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare('DELETE FROM db_Scores WHERE dbScores_GGID = ? AND dbScores_isBlind = 1');
        $stmt->execute([$ggid]);
        return $stmt->rowCount();
    }

    /**
     * Delete blind rows for one pairing only. Returns rows deleted.
     */
    public static function deleteBlindRowsForPairing(int $ggid, string $pairingId): int
    {
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare(
            'DELETE FROM db_Scores WHERE dbScores_GGID = ? AND dbScores_isBlind = 1 AND dbScores_PairingID = ?'
        );
        $stmt->execute([$ggid, $pairingId]);
        return $stmt->rowCount();
    }

    /**
     * Delete blind rows across a specific set of pairings in one call.
     * Returns rows deleted. Used by the new Blind Player Removal step
     * (Pass 3) when scope resolves to a list of PairingIDs rather than
     * the whole game — see ServiceBlindPlayer::removeBlindPlayersForScope().
     */
    public static function deleteBlindRowsForPairings(int $ggid, array $pairingIds): int
    {
        $pairingIds = array_values(array_unique(array_filter(
            array_map('strval', $pairingIds),
            fn($p) => $p !== '' && $p !== '000'
        )));
        if (!$pairingIds) return 0;

        $placeholders = implode(',', array_fill(0, count($pairingIds), '?'));
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare(
            "DELETE FROM db_Scores
             WHERE dbScores_GGID = ? AND dbScores_isBlind = 1
               AND dbScores_PairingID IN ($placeholders)"
        );
        $stmt->execute(array_merge([$ggid], $pairingIds));
        return $stmt->rowCount();
    }
}
