<?php
declare(strict_types=1);
// /public_html/services/scoring/service_BlindPlayer.php

require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';
require_once MA_SERVICES . '/scoring/service_ScoreEntry.php';

final class ServiceBlindPlayer
{
    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Master function — apply, update, or remove blind player for a game.
     * Safe to re-run: always deletes existing blind rows before re-inserting.
     */
    public static function applyBlindPlayer(int $ggid): array
    {
        try {
            // Step 1: Load and validate game
            $gameRow = ServiceDbGames::getGameByGGID($ggid);
            if (!$gameRow) {
                return ['ok' => false, 'message' => 'Game not found.'];
            }
            $competition = (string)($gameRow['dbGames_Competition'] ?? '');
            if ($competition !== 'PairField') {
                return ['ok' => false, 'message' => 'Blind player only applies to PairField games.'];
            }

            // Step 2: Parse blind config
            $rawBlind = $gameRow['dbGames_BlindPlayers'] ?? '[]';
            $blindArr = is_string($rawBlind) ? (json_decode($rawBlind, true) ?: []) : (is_array($rawBlind) ? $rawBlind : []);

            $blindGHINs = [];
            $target     = null;
            foreach ($blindArr as $item) {
                if (isset($item['ghin'])) {
                    $blindGHINs[] = (string)$item['ghin'];
                }
                if (isset($item['target'])) {
                    $target = (int)$item['target'];
                }
            }

            $n             = (int)($gameRow['dbGames_BestBall'] ?? 1);
            $scoringMethod = (string)($gameRow['dbGames_ScoringMethod'] ?? 'NET');

            // Step 3: Always delete existing blind rows (safe re-run)
            $pdo  = Db::pdo();
            $stmt = $pdo->prepare('DELETE FROM db_Scores WHERE dbScores_GGID = ? AND dbScores_isBlind = 1');
            $stmt->execute([$ggid]);
            Logger::info('BLIND_APPLY', ['ggid' => $ggid, 'step' => 'deleted_old_blind_rows']);

            // Step 4: If nothing configured, just recalculate real player flags
            if (empty($blindGHINs) || $target === null) {
                self::recalculateDeclaredFlags($ggid);
                return ['ok' => true, 'message' => 'Blind player removed, flags recalculated', 'pairingsUpdated' => 0];
            }

            // Step 5: Load players and find short pairings
            $allPlayers = ServiceDbPlayers::getScorecardPlayersByGGID((string)$ggid);
            foreach ($allPlayers as &$p) {
                if (isset($p['dbPlayers_Scores']) && is_string($p['dbPlayers_Scores'])) {
                    $decoded = json_decode($p['dbPlayers_Scores'], true);
                    if (is_array($decoded)) $p['dbPlayers_Scores'] = $decoded;
                }
            }
            unset($p);

            $pairingGroups = [];
            foreach ($allPlayers as $player) {
                $pid = (string)($player['dbPlayers_PairingID'] ?? '');
                if ($pid === '' || $pid === '000') continue;
                $pairingGroups[$pid][] = $player;
            }

            $shortPairings = array_filter($pairingGroups, fn($members) => count($members) < $target);
            if (empty($shortPairings)) {
                self::recalculateDeclaredFlags($ggid);
                return ['ok' => true, 'message' => 'No short pairings found', 'pairingsUpdated' => 0];
            }

            // Step 6: Load each blind player's real record
            $blindRecords = [];
            foreach ($blindGHINs as $blindGHIN) {
                $record = ServiceDbPlayers::getPlayerByGGIDGHIN((string)$ggid, $blindGHIN);
                if (!$record) {
                    return [
                        'ok'      => false,
                        'message' => 'Blind player not found in roster. Remove blind assignment or restore the player.',
                    ];
                }
                if (isset($record['dbPlayers_Scores']) && is_string($record['dbPlayers_Scores'])) {
                    $decoded = json_decode($record['dbPlayers_Scores'], true);
                    if (is_array($decoded)) $record['dbPlayers_Scores'] = $decoded;
                }
                $blindRecords[$blindGHIN] = $record;
            }

            // Step 7: Insert blind clones into short pairings
            $insertSql = '
                INSERT INTO db_Scores
                    (dbScores_GGID, dbScores_GHIN, dbScores_PairingID, dbScores_PairingPos, dbScores_isBlind, dbScores_Scores)
                VALUES (?, ?, ?, ?, 1, ?)
                ON DUPLICATE KEY UPDATE dbScores_Scores = VALUES(dbScores_Scores), _updatedDate = NOW()
            ';
            $insertStmt = $pdo->prepare($insertSql);

            $blindIdx = 0;
            foreach ($shortPairings as $shortPairingId => $members) {
                $shortBy = $target - count($members);

                $usedPositions = array_map(
                    fn($m) => (int)($m['dbPlayers_PairingPos'] ?? 0),
                    $members
                );

                $nextPos = 1;
                for ($clone = 0; $clone < $shortBy; $clone++) {
                    while (in_array($nextPos, $usedPositions, true)) {
                        $nextPos++;
                    }
                    $usedPositions[] = $nextPos;

                    $blindGHIN   = $blindGHINs[$blindIdx % count($blindGHINs)];
                    $blindRecord = $blindRecords[$blindGHIN];
                    $scoresJson  = json_encode($blindRecord['dbPlayers_Scores'] ?? []);

                    $insertStmt->execute([$ggid, $blindGHIN, $shortPairingId, $nextPos, $scoresJson]);
                    Logger::info('BLIND_APPLY', [
                        'ggid'      => $ggid,
                        'ghin'      => $blindGHIN,
                        'pairingId' => $shortPairingId,
                        'pos'       => $nextPos,
                    ]);
                    $blindIdx++;
                    $nextPos++;
                }
            }

            // Step 8: Recalculate all declared flags with blind players now in place
            self::recalculateDeclaredFlags($ggid);

            return [
                'ok'              => true,
                'message'         => 'Blind player applied successfully',
                'pairingsUpdated' => count($shortPairings),
            ];

        } catch (Throwable $e) {
            Logger::error('BLIND_APPLY_FAIL', ['ggid' => $ggid, 'err' => $e->getMessage()]);
            return ['ok' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Recalculate declared flags for ALL pairings in a game (real + blind players).
     */
    public static function recalculateDeclaredFlags(int $ggid): array
    {
        try {
            // Step 1: Load game config
            $gameRow = ServiceDbGames::getGameByGGID($ggid);
            if (!$gameRow) {
                return ['ok' => false, 'message' => 'Game not found.'];
            }
            $n             = (int)($gameRow['dbGames_BestBall'] ?? 1);
            $scoringMethod = (string)($gameRow['dbGames_ScoringMethod'] ?? 'NET');
            $holesLabel    = (string)($gameRow['dbGames_Holes'] ?? 'All 18');

            if ($holesLabel === 'F9') {
                $holeRange = range(1, 9);
            } elseif ($holesLabel === 'B9') {
                $holeRange = range(10, 18);
            } else {
                $holeRange = range(1, 18);
            }

            // Step 2: Load real players
            $realPlayers = ServiceDbPlayers::getScorecardPlayersByGGID((string)$ggid);
            foreach ($realPlayers as &$p) {
                if (isset($p['dbPlayers_Scores']) && is_string($p['dbPlayers_Scores'])) {
                    $decoded = json_decode($p['dbPlayers_Scores'], true);
                    if (is_array($decoded)) $p['dbPlayers_Scores'] = $decoded;
                }
            }
            unset($p);

            // Step 3: Load blind score records
            $blindScores = self::getBlindScoresForGame($ggid);
            foreach ($blindScores as &$bs) {
                if (isset($bs['dbScores_Scores']) && is_string($bs['dbScores_Scores'])) {
                    $decoded = json_decode($bs['dbScores_Scores'], true);
                    if (is_array($decoded)) $bs['dbScores_Scores'] = $decoded;
                }
            }
            unset($bs);

            // Step 4: Build unified player pool grouped by PairingID
            $pairingPool = [];

            foreach ($realPlayers as $player) {
                $pid = (string)($player['dbPlayers_PairingID'] ?? '');
                if ($pid === '' || $pid === '000') continue;
                $pairingPool[$pid][] = [
                    'ghin'    => (string)($player['dbPlayers_PlayerGHIN'] ?? ''),
                    'pos'     => (int)($player['dbPlayers_PairingPos'] ?? 99),
                    'scores'  => $player['dbPlayers_Scores'] ?? [],
                    'isBlind' => false,
                    'source'  => 'real',
                ];
            }

            foreach ($blindScores as $bs) {
                $pid = (string)($bs['dbScores_PairingID'] ?? '');
                if ($pid === '') continue;
                $pairingPool[$pid][] = [
                    'ghin'       => (string)($bs['dbScores_GHIN'] ?? ''),
                    'pos'        => (int)($bs['dbScores_PairingPos'] ?? 1),
                    'scores'     => $bs['dbScores_Scores'] ?? [],
                    'isBlind'    => true,
                    'source'     => 'blind',
                    'pairingId'  => $pid,
                    'pairingPos' => (int)($bs['dbScores_PairingPos'] ?? 1),
                ];
            }

            // Steps 5 & 6: For each pairing, each hole — resolve and persist
            $realPlayerScores  = [];   // ghin => updatedScores
            $blindPlayerScores = [];   // "ghin_pairingId_pos" => updatedScores

            foreach ($realPlayers as $player) {
                $ghin = (string)($player['dbPlayers_PlayerGHIN'] ?? '');
                if ($ghin !== '') {
                    $realPlayerScores[$ghin] = $player['dbPlayers_Scores'] ?? [];
                }
            }
            foreach ($blindScores as $bs) {
                $key = self::blindKey($bs);
                $blindPlayerScores[$key] = $bs['dbScores_Scores'] ?? [];
            }

            foreach ($pairingPool as $pairingId => $members) {
                foreach ($holeRange as $holeNumber) {
                    $scoreRows = [];
                    foreach ($members as $member) {
                        $holeDetail  = self::findHoleDetail($member['scores'], $holeNumber);
                        $scoreRows[] = [
                            'ghin' => $member['isBlind']
                                ? ($member['ghin'] . '_' . $pairingId)
                                : $member['ghin'],
                            'raw'  => isset($holeDetail['raw_score']) ? (float)$holeDetail['raw_score'] : null,
                            'net'  => isset($holeDetail['net_score'])
                                ? (float)$holeDetail['net_score']
                                : (isset($holeDetail['adjusted_gross_score']) ? (float)$holeDetail['adjusted_gross_score'] : null),
                            'pos'  => $member['pos'],
                        ];
                    }

                    $declared = ServiceScoreEntry::resolveDeclaredForHole($scoreRows, $n, $scoringMethod);

                    foreach ($members as $member) {
                        $key        = $member['isBlind']
                            ? ($member['ghin'] . '_' . $pairingId)
                            : $member['ghin'];
                        $isDeclared = $declared[$key] ?? false;

                        if ($member['isBlind']) {
                            $bsKey = self::blindKeyFromParts($member['ghin'], $pairingId, $member['pos']);
                            $blindPlayerScores[$bsKey] = self::patchHoleDeclared(
                                $blindPlayerScores[$bsKey] ?? [],
                                $holeNumber,
                                $isDeclared
                            );
                        } else {
                            $realPlayerScores[$member['ghin']] = self::patchHoleDeclared(
                                $realPlayerScores[$member['ghin']] ?? [],
                                $holeNumber,
                                $isDeclared
                            );
                        }
                    }
                }
            }

            // Persist real player score updates
            foreach ($realPlayers as $player) {
                $ghin = (string)($player['dbPlayers_PlayerGHIN'] ?? '');
                if ($ghin === '') continue;
                ServiceDbPlayers::updateGamePlayerFields(
                    (string)$ggid,
                    $ghin,
                    ['dbPlayers_Scores' => json_encode($realPlayerScores[$ghin] ?? [])]
                );
            }

            // Persist blind score updates
            $pdo     = Db::pdo();
            $updSql  = 'UPDATE db_Scores
                        SET dbScores_Scores = ?, _updatedDate = NOW()
                        WHERE dbScores_GGID = ? AND dbScores_GHIN = ? AND dbScores_PairingID = ? AND dbScores_PairingPos = ?';
            $updStmt = $pdo->prepare($updSql);

            foreach ($blindScores as $bs) {
                $key = self::blindKey($bs);
                $updStmt->execute([
                    json_encode($blindPlayerScores[$key] ?? []),
                    $ggid,
                    (string)($bs['dbScores_GHIN'] ?? ''),
                    (string)($bs['dbScores_PairingID'] ?? ''),
                    (int)($bs['dbScores_PairingPos'] ?? 1),
                ]);
            }

            Logger::info('BLIND_RECALC', ['ggid' => $ggid, 'pairings' => count($pairingPool)]);

            return [
                'ok'              => true,
                'message'         => 'Declared flags recalculated',
                'pairingsUpdated' => count($pairingPool),
            ];

        } catch (Throwable $e) {
            Logger::error('BLIND_RECALC_FAIL', ['ggid' => $ggid, 'err' => $e->getMessage()]);
            return ['ok' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Fetch all blind score rows for a game. Caller handles JSON hydration.
     */
    public static function getBlindScoresForGame(int $ggid): array
    {
        $pdo  = Db::pdo();
        $stmt = $pdo->prepare('SELECT * FROM db_Scores WHERE dbScores_GGID = ? AND dbScores_isBlind = 1');
        $stmt->execute([$ggid]);
        return $stmt->fetchAll() ?: [];
    }

    /**
     * Merge blind score rows into the player pool as synthetic player records.
     * Blind records inherit all tee/HC/course data from the real player record;
     * name fields and pairing placement are overridden.
     */
    public static function mergeBlindScoresIntoPlayers(array $players, array $blindScores, array $gameRow): array
    {
        $byGHIN = [];
        foreach ($players as $p) {
            $ghin = (string)($p['dbPlayers_PlayerGHIN'] ?? '');
            if ($ghin !== '') $byGHIN[$ghin] = $p;
        }

        // Build PairingID → PlayerKey map from real players so the blind clone
        // inherits the correct walking group (scorecard slot), not the donor's.
        $pairingKeyMap = [];
        foreach ($players as $p) {
            $pid = (string)($p['dbPlayers_PairingID'] ?? '');
            $key = (string)($p['dbPlayers_PlayerKey'] ?? '');
            if ($pid !== '' && $key !== '') {
                $pairingKeyMap[$pid] = $key;
            }
        }

        foreach ($blindScores as $bs) {
            $ghin      = (string)($bs['dbScores_GHIN'] ?? '');
            $pairingId = (string)($bs['dbScores_PairingID'] ?? '');
            $pos       = (int)($bs['dbScores_PairingPos'] ?? 1);
            $real      = $byGHIN[$ghin] ?? null;
            if (!$real) continue;

            $synthetic                         = $real;
            $synthetic['dbPlayers_Name']       = '* BLIND *';
            $synthetic['dbPlayers_FName']      = '*';
            $synthetic['dbPlayers_LName']      = 'BLIND *';
            $synthetic['dbPlayers_PairingID']  = $pairingId;
            $synthetic['dbPlayers_PairingPos'] = $pos;
            $synthetic['dbPlayers_Scores']     = $bs['dbScores_Scores'];
            $synthetic['dbPlayers_PlayerKey']  = $pairingKeyMap[$pairingId] ?? $pairingId;
            $synthetic['isBlind']              = true;

            $players[] = $synthetic;
        }

        return $players;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private static function findHoleDetail(array $scores, int $holeNumber): array
    {
        $details = $scores['Scores'][0]['hole_details'] ?? [];
        foreach ($details as $detail) {
            if ((int)($detail['hole_number'] ?? 0) === $holeNumber) {
                return $detail;
            }
        }
        return [];
    }

    private static function patchHoleDeclared(array $scores, int $holeNumber, bool $isDeclared): array
    {
        if (!isset($scores['Scores'][0]['hole_details'])) return $scores;
        foreach ($scores['Scores'][0]['hole_details'] as &$detail) {
            if ((int)($detail['hole_number'] ?? 0) === $holeNumber) {
                $detail['declared'] = $isDeclared;
                break;
            }
        }
        unset($detail);
        return $scores;
    }

    private static function blindKey(array $bs): string
    {
        return self::blindKeyFromParts(
            (string)($bs['dbScores_GHIN'] ?? ''),
            (string)($bs['dbScores_PairingID'] ?? ''),
            (int)($bs['dbScores_PairingPos'] ?? 1)
        );
    }

    private static function blindKeyFromParts(string $ghin, string $pairingId, int $pos): string
    {
        return $ghin . '_' . $pairingId . '_' . $pos;
    }
}
