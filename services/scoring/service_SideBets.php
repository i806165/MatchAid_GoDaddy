<?php
declare(strict_types=1);
// /public_html/services/scoring/service_SideBets.php

require_once __DIR__ . "/../../bootstrap.php";
require_once __DIR__ . "/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

/**
 * ServiceSideBets
 * Persists side-bet CLAIMS from Score Entry.
 *
 * Definitions live in db_Games.dbGames_CustomScores (written only by
 * saveGameSideBets.php). Claims live per player in
 * db_Players.dbPlayers_CustomScores and are written ONLY here:
 *
 *   { "version": 1, "claims": [
 *       { "betKey", "hole", "status": "active"|"removed",
 *         "distance": int|null, "unit": "in"|"yd"|null, "recordedAt": ISO-8601 UTC } ] }
 *
 * A claim is identified by betKey + hole (one entry per pair per player).
 * Nothing here derives, awards or validates a claim against a hole score —
 * claims are entered by hand and never recalculated.
 *
 * Access mirrors the Score Entry page's own save: the session scorecard key
 * is the authority for which pod (and so which game) is being written.
 */
final class ServiceSideBets
{
    private const MAX_CLAIMS = 500;
    private const UNIT_BY_MEASURE = ['ftin' => 'in', 'yd' => 'yd'];
    private const DISTANCE_BOUNDS = ['in' => [1, 2400], 'yd' => [1, 600]];

    /**
     * @param array $body { playerKey?, scorerGHIN, hole?, players: [ { ghin, originalCustomScores, customScores } ] }
     * @return array ok: { ok:true, status:200, payload:{ players:[{ghin,customScores}] } }
     *               otherwise { ok:false, conflict:bool, status:int, message, players? }
     */
    public static function persistClaims(array $body): array
    {
        $scorerGHIN = trim((string)($body['scorerGHIN'] ?? ''));
        if ($scorerGHIN === '') {
            return self::fail(400, 'Scorekeeper is required.');
        }

        $sessionKey = strtoupper(trim((string)(ServiceScoreEntry::getScorecardKey() ?? '')));
        if ($sessionKey === '') {
            return self::fail(401, 'Scoring session expired.');
        }

        // The session key decides the pod; a body value that disagrees is a stale page.
        $postedKey = strtoupper(trim((string)($body['playerKey'] ?? '')));
        if ($postedKey !== '' && $postedKey !== $sessionKey) {
            Logger::error('SAVE_SIDE_BETS_SCOPE_VIOLATION', ['reason' => 'key mismatch', 'sessionKey' => $sessionKey, 'postedKey' => $postedKey]);
            return self::fail(400, 'This scorecard changed. Please reopen it.');
        }

        $submitted = $body['players'] ?? null;
        if (!is_array($submitted) || !$submitted) {
            return self::fail(400, 'There are no side games to save.');
        }

        // ── Pod + game, resolved from the session ───────────────────────
        $pod = ServiceDbPlayers::getPlayersByPlayerKey($sessionKey);
        if (!$pod) {
            return self::fail(400, 'Scoring group not found.');
        }

        $ggid    = (int)($pod[0]['dbPlayers_GGID'] ?? 0);
        $podGgid = ServiceScoreEntry::getScoringPodGGID();
        if ($ggid <= 0 || ($podGgid !== null && $podGgid !== $ggid)) {
            return self::fail(400, 'Scoring group not found.');
        }

        // Active rotation players are always members of this baseline pod
        // (ServiceScoreRotation reads no other rows), so the pod is the scope.
        $podByGhin = [];
        foreach ($pod as $row) {
            if ((int)($row['dbPlayers_GGID'] ?? 0) !== $ggid) continue;
            $g = trim((string)($row['dbPlayers_PlayerGHIN'] ?? ''));
            if ($g !== '') $podByGhin[$g] = $row;
        }

        $game = ServiceDbGames::getGameByGGID($ggid);
        if (!$game) {
            return self::fail(400, 'Game not found.');
        }

        // The master switch (dbGames_CustomScores.status) is deliberately NOT
        // checked: it only decides whether downstream code looks at the bets.
        // A claim from a page that loaded just before the switch was turned
        // off is still real data, and refusing it would strand the scorer.
        $bets = self::loadBets($game);
        if (!$bets) {
            return self::fail(400, 'Side games are not configured for this game.');
        }

        [$minHole, $maxHole] = self::holeRange($game);

        // ── Stored state for every pod player ───────────────────────────
        $storedDocs = [];
        foreach ($podByGhin as $g => $row) {
            $storedDocs[$g] = ServiceScoreEntry::buildOrHydratePlayerCustomScores($row);
        }

        // ── Scope + snapshot conflict check (nothing written yet) ───────
        $seen = [];
        foreach ($submitted as $entry) {
            if (!is_array($entry)) {
                return self::fail(400, 'Invalid side games payload.');
            }

            $ghin = trim((string)($entry['ghin'] ?? ''));
            if ($ghin === '' || !isset($podByGhin[$ghin])) {
                Logger::error('SAVE_SIDE_BETS_SCOPE_VIOLATION', ['reason' => 'ghin not in pod', 'ggid' => $ggid, 'sessionKey' => $sessionKey]);
                return self::fail(400, 'One or more players are not on this scorecard.');
            }
            if (isset($seen[$ghin])) {
                return self::fail(400, 'Invalid side games payload.');
            }
            $seen[$ghin] = true;

            $original = ServiceScoreEntry::buildOrHydratePlayerCustomScores(['dbPlayers_CustomScores' => $entry['originalCustomScores'] ?? null]);
            if (self::canonicalDoc($original) !== self::canonicalDoc($storedDocs[$ghin])) {
                Logger::info('SAVE_SIDE_BETS_CONFLICT', ['ggid' => $ggid, 'sessionKey' => $sessionKey]);
                return [
                    'ok'       => false,
                    'conflict' => true,
                    'status'   => 409,
                    'message'  => 'Side games for this scorecard were updated elsewhere.',
                    'players'  => self::playersPayload($storedDocs),
                ];
            }
        }

        // ── Validate + normalize each submitted player ──────────────────
        $now     = gmdate('Y-m-d\TH:i:s\Z');
        $newDocs = [];

        foreach ($submitted as $entry) {
            $ghin = trim((string)$entry['ghin']);

            $customScores = $entry['customScores'] ?? null;
            if (is_string($customScores)) {
                $customScores = json_decode($customScores, true);
            }
            if (!is_array($customScores) || !is_array($customScores['claims'] ?? null)) {
                return self::fail(400, 'Invalid side games claims.');
            }
            if (count($customScores['claims']) > self::MAX_CLAIMS) {
                return self::fail(400, 'There are too many side game claims.');
            }

            $result = self::normalizePlayerClaims($customScores['claims'], $storedDocs[$ghin], $bets, $minHole, $maxHole, $now);
            if (isset($result['error'])) {
                return self::fail(400, $result['error']);
            }

            $newDocs[$ghin] = $result['doc'];
        }

        // ── One winner per competitive bet per hole across the pod ──────
        $post = $storedDocs;
        foreach ($newDocs as $g => $doc) {
            $post[$g] = $doc;
        }

        $holders = [];
        foreach ($post as $doc) {
            foreach ($doc['claims'] as $claim) {
                if (!is_array($claim) || ($claim['status'] ?? '') !== 'active') continue;

                $betKey = (string)($claim['betKey'] ?? '');
                $bet    = $bets[$betKey] ?? null;
                if (!$bet || ($bet['type'] ?? '') !== 'competitive') continue;

                $k = $betKey . '|' . (int)($claim['hole'] ?? 0);
                $holders[$k] = ($holders[$k] ?? 0) + 1;

                if ($holders[$k] > 1) {
                    $name = trim((string)($bet['name'] ?? '')) !== '' ? (string)$bet['name'] : $betKey;
                    return self::fail(400, "Only one player can hold {$name} on a hole.");
                }
            }
        }

        // ── Persist atomically (a competitive move writes two rows) ─────
        $pdo = Db::pdo();

        try {
            $pdo->beginTransaction();

            foreach ($newDocs as $ghin => $doc) {
                // Unchanged players are not rewritten.
                if (self::canonicalDoc($doc) === self::canonicalDoc($storedDocs[$ghin])) continue;

                $saved = ServiceDbPlayers::updateGamePlayerFields((string)$ggid, (string)$ghin, [
                    'dbPlayers_CustomScores' => json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]);

                if (!$saved) {
                    throw new RuntimeException('Unable to persist side games for a player.');
                }
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Logger::error('SAVE_SIDE_BETS_FAIL', ['ggid' => $ggid, 'error' => $e->getMessage()]);
            return self::fail(500, 'Unable to save side games.');
        }

        return [
            'ok'      => true,
            'status'  => 200,
            'payload' => ['players' => self::playersPayload($newDocs)],
        ];
    }

    // ==========================================================================
    // Claim normalization
    // ==========================================================================

    /**
     * Validates one player's submitted claims against what is stored and
     * returns the canonical document to persist.
     *
     * Rules:
     *  - A submitted claim identical to the stored one is kept exactly as stored
     *    (recordedAt and all) and is NOT re-validated, so old claims — removed
     *    ones, ones for since-disabled bets, ones outside a since-changed hole
     *    range — always round-trip.
     *  - Only new or changed ACTIVE claims are checked against the bet
     *    definitions, the game's holes and the distance bounds.
     *  - A stored claim missing from the submission is kept, never dropped.
     *  - A "removed" claim with no stored counterpart is dropped.
     *  - recordedAt is server-stamped when a claim is created or reactivated.
     */
    private static function normalizePlayerClaims(array $claims, array $storedDoc, array $bets, int $minHole, int $maxHole, string $now): array
    {
        // Index what is stored; anything unindexable is passed through untouched.
        $stored      = [];
        $passthrough = [];
        foreach ($storedDoc['claims'] as $sc) {
            $sKey = is_array($sc) ? self::claimKey($sc) : null;
            if ($sKey === null) {
                $passthrough[] = $sc;
            } else {
                $stored[$sKey] = $sc;
            }
        }

        $out  = [];
        $seen = [];

        foreach ($claims as $claim) {
            if (!is_array($claim)) {
                return ['error' => 'Side games contains an invalid claim.'];
            }

            $betKey = $claim['betKey'] ?? null;
            if (!is_string($betKey) || $betKey === '' || strlen($betKey) > 32) {
                return ['error' => 'Side games contains an invalid side game.'];
            }

            $hole = self::asInt($claim['hole'] ?? null);
            if ($hole === null || $hole < 1 || $hole > 18) {
                return ['error' => 'Side games contains an invalid hole.'];
            }

            $status = (string)($claim['status'] ?? '');
            if (!in_array($status, ['active', 'removed'], true)) {
                return ['error' => 'Side games contains an invalid claim status.'];
            }

            $key = $betKey . '|' . $hole;
            if (isset($seen[$key])) {
                return ['error' => 'Side games contains a duplicate claim.'];
            }
            $seen[$key] = true;

            $distance = $claim['distance'] ?? null;
            if ($distance !== null) {
                $distance = self::asInt($distance);
                if ($distance === null) {
                    return ['error' => 'A distance must be a whole number.'];
                }
            }

            $unit = $claim['unit'] ?? null;
            if ($unit === '') $unit = null;
            if ($unit !== null && !in_array($unit, ['in', 'yd'], true)) {
                return ['error' => 'Side games contains an invalid distance unit.'];
            }

            // A removed claim carries no distance; a unit only travels with one.
            if ($status === 'removed') $distance = null;
            if ($distance === null) $unit = null;

            $existing = $stored[$key] ?? null;

            if ($existing !== null && self::sameClaim($existing, $status, $distance, $unit)) {
                $out[] = $existing;
                continue;
            }

            if ($existing === null && $status === 'removed') {
                continue; // never persisted, nothing to keep
            }

            if ($status === 'active') {
                $bet = $bets[$betKey] ?? null;
                if ($bet === null) {
                    return ['error' => 'Side games contains an unknown side game.'];
                }
                if ($hole < $minHole || $hole > $maxHole) {
                    return ['error' => 'That hole is not part of this game.'];
                }
                if (($bet['status'] ?? '') !== 'active') {
                    return ['error' => 'That side game is not turned on for this game.'];
                }

                $measure = (string)($bet['measure'] ?? '');
                if ($distance !== null) {
                    $expected = self::UNIT_BY_MEASURE[$measure] ?? null;
                    if ($expected === null) {
                        return ['error' => 'That side game does not record a distance.'];
                    }
                    if ($unit !== $expected) {
                        return ['error' => 'The distance unit does not match this side game.'];
                    }
                    [$lo, $hi] = self::DISTANCE_BOUNDS[$expected];
                    if ($distance < $lo || $distance > $hi) {
                        return ['error' => 'That distance is out of range.'];
                    }
                }
            }

            // Stamp a new time only when the claim is created or reactivated.
            $recordedAt = $now;
            if ($existing !== null) {
                $wasActive = (($existing['status'] ?? '') === 'active');
                if ($status === 'removed' || $wasActive) {
                    $recordedAt = (string)($existing['recordedAt'] ?? $now);
                }
            }

            $out[] = [
                'betKey'     => $betKey,
                'hole'       => $hole,
                'status'     => $status,
                'distance'   => $distance,
                'unit'       => $unit,
                'recordedAt' => $recordedAt,
            ];
        }

        // Preserve anything stored that the submission did not mention.
        foreach ($stored as $key => $existing) {
            if (!isset($seen[$key])) {
                $out[] = $existing;
            }
        }
        foreach ($passthrough as $p) {
            $out[] = $p;
        }

        return ['doc' => ['version' => 1, 'claims' => self::sortClaims($out)]];
    }

    private static function sameClaim(array $existing, string $status, ?int $distance, ?string $unit): bool
    {
        $eDistance = self::asInt($existing['distance'] ?? null);
        $eUnit     = $existing['unit'] ?? null;
        if ($eUnit === '') $eUnit = null;

        return (string)($existing['status'] ?? '') === $status
            && $eDistance === $distance
            && $eUnit === $unit;
    }

    private static function claimKey(array $claim): ?string
    {
        $betKey = $claim['betKey'] ?? null;
        $hole   = self::asInt($claim['hole'] ?? null);

        return (is_string($betKey) && $betKey !== '' && $hole !== null) ? $betKey . '|' . $hole : null;
    }

    // ==========================================================================
    // Definitions + helpers
    // ==========================================================================

    /** @return array<string,array> bet key => stored bet record (any status) */
    private static function loadBets(array $game): array
    {
        $raw = $game['dbGames_CustomScores'] ?? null;

        if (is_string($raw)) {
            $trimmed = trim($raw);
            $raw = ($trimmed === '') ? null : json_decode($trimmed, true);
        }

        $byKey = [];
        if (is_array($raw) && is_array($raw['bets'] ?? null)) {
            foreach ($raw['bets'] as $bet) {
                if (is_array($bet) && is_string($bet['key'] ?? null) && $bet['key'] !== '') {
                    $byKey[$bet['key']] = $bet;
                }
            }
        }

        return $byKey;
    }

    private static function holeRange(array $game): array
    {
        $label = (string)($game['dbGames_Holes'] ?? 'All 18');

        if ($label === 'F9') return [1, 9];
        if ($label === 'B9') return [10, 18];
        return [1, 18];
    }

    private static function asInt($value): ?int
    {
        if (is_int($value)) return $value;
        if (is_float($value) && $value == floor($value)) return (int)$value;
        if (is_string($value) && preg_match('/^-?\d+$/', trim($value))) return (int)trim($value);
        return null;
    }

    private static function sortClaims(array $claims): array
    {
        $claims = array_values(array_filter($claims, 'is_array'));

        usort($claims, static function (array $a, array $b): int {
            return [(int)($a['hole'] ?? 0), (string)($a['betKey'] ?? '')]
               <=> [(int)($b['hole'] ?? 0), (string)($b['betKey'] ?? '')];
        });

        return $claims;
    }

    /** Comparison form: only version + claims, claims sorted, numbers normalized. */
    private static function canonicalDoc(array $doc): string
    {
        $normalized = self::sortRecursive(['version' => 1, 'claims' => self::sortClaims($doc['claims'] ?? [])]);

        return json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function sortRecursive($value)
    {
        // JS drops the int/float distinction, PHP does not — compare as floats.
        if (is_int($value) || is_float($value)) {
            return (float)$value;
        }

        if (!is_array($value)) {
            return $value;
        }

        $isAssoc = $value !== [] && array_keys($value) !== range(0, count($value) - 1);

        if ($isAssoc) {
            ksort($value);
        }

        foreach ($value as $k => $v) {
            $value[$k] = self::sortRecursive($v);
        }

        return $value;
    }

    /** @param array<string,array> $docs ghin => document */
    private static function playersPayload(array $docs): array
    {
        $players = [];

        foreach ($docs as $ghin => $doc) {
            $players[] = [
                'ghin'         => (string)$ghin,
                'customScores' => ['version' => 1, 'claims' => self::sortClaims($doc['claims'] ?? [])],
            ];
        }

        return $players;
    }

    private static function fail(int $status, string $message): array
    {
        return ['ok' => false, 'conflict' => false, 'status' => $status, 'message' => $message];
    }
}
