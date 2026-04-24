<?php
declare(strict_types=1);
// /services/scoring/service_CalcSkins.php

/**
 * ServiceCalcSkins — Pure stateless skins calculator.
 *
 * Responsibilities:
 *   - Accept a structured set of pairings with declared hole scores
 *   - Resolve gross skins and net skins independently, hole by hole
 *   - Handle carryovers indefinitely; forfeit unclaimed skins at end of round
 *   - Return per-pairing skins counts broken down by front, back, and total
 *     for both gross and net passes
 *
 * This class has no database access, no session awareness, and no side effects.
 * It is called by service_ScoreSummary.php for both Traditional Skins (PairField)
 * and Skins Match (PairPair) game types.
 *
 * Future calculators follow the same pattern as peer files:
 *   service_CalcPoints.php, service_CalcMatchPlay.php, etc.
 */
final class ServiceCalcSkins
{
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Resolve both gross and net skins in a single call.
     *
     * @param array $pairings  Keyed by pairingId. Each entry:
     *                         [
     *                           'pairingId' => 'P01',
     *                           'holes'     => [
     *                             'h1' => ['gross' => 4, 'net' => 3.5, 'declared' => true],
     *                             'h2' => ['gross' => 5, 'net' => 4.0, 'declared' => true],
     *                             ...
     *                           ]
     *                         ]
     * @param array $holes     Ordered list of hole numbers in scope e.g. [1,2,...,18]
     *
     * @return array [
     *   'gross' => [
     *     'P01' => ['front' => 2, 'back' => 1, 'total' => 3],
     *     'P02' => ['front' => 0, 'back' => 1, 'total' => 1],
     *   ],
     *   'net' => [
     *     'P01' => ['front' => 1, 'back' => 1, 'total' => 2],
     *     'P02' => ['front' => 1, 'back' => 0, 'total' => 1],
     *   ],
     * ]
     */
    public static function resolveSkins(array $pairings, array $holes): array
    {
        return [
            'gross' => self::resolvePass($pairings, $holes, 'gross'),
            'net'   => self::resolvePass($pairings, $holes, 'net'),
        ];
    }

    /**
     * Resolve gross skins only.
     */
    public static function resolveGrossSkins(array $pairings, array $holes): array
    {
        return self::resolvePass($pairings, $holes, 'gross');
    }

    /**
     * Resolve net skins only.
     */
    public static function resolveNetSkins(array $pairings, array $holes): array
    {
        return self::resolvePass($pairings, $holes, 'net');
    }

    // -------------------------------------------------------------------------
    // Core resolver
    // -------------------------------------------------------------------------

    /**
     * Walk holes sequentially and resolve skins for one metric pass (gross or net).
     *
     * Rules:
     *   1. Collect declared scores for all pairings on the current hole.
     *   2. If fewer than 2 pairings have a declared score, skip the hole —
     *      carryover continues but no skin is awarded or forfeited.
     *   3. If exactly one pairing has the lowest score, they win all accumulated
     *      skins (current hole + carryover). Skins are credited to front or back
     *      based on the winning hole number (1-9 = front, 10-18 = back).
     *      Carryover resets to zero.
     *   4. If two or more pairings tie for the lowest score, no winner —
     *      carryover increments by 1 and continues to the next hole.
     *   5. At end of round, any remaining carryover is forfeited.
     */
    private static function resolvePass(array $pairings, array $holes, string $metric): array
    {
        // Initialize front/back/total to zero for every pairing
        $skinsWon = [];
        foreach ($pairings as $pairing) {
            $pairingId = trim((string)($pairing['pairingId'] ?? ''));
            if ($pairingId !== '') {
                $skinsWon[$pairingId] = ['front' => 0, 'back' => 0, 'total' => 0];
            }
        }

        if (count($skinsWon) < 2) {
            return $skinsWon;
        }

        $carry = 0;

        foreach ($holes as $holeNumber) {
            $holeNumber   = (int)$holeNumber;
            $segmentKey   = ($holeNumber <= 9) ? 'front' : 'back';

            // Collect declared scores for this hole across all pairings
            $scores = self::collectHoleScores($pairings, $holeNumber, $metric);

            // Skip hole if fewer than 2 pairings have entered a score
            if (count($scores) < 2) {
                continue;
            }

            // Current hole is worth 1 skin + any accumulated carryover
            $carry++;

            $minScore = min(array_column($scores, 'score'));
            $winners  = array_filter($scores, fn(array $s): bool => $s['score'] === $minScore);

            if (count($winners) === 1) {
                // Outright winner — award all accumulated skins to the correct segment
                $winnerId = array_values($winners)[0]['pairingId'];
                $skinsWon[$winnerId][$segmentKey] += $carry;
                $skinsWon[$winnerId]['total']      += $carry;
                $carry = 0;
            }
            // Tied — carry accumulates, no award
        }

        // Remaining carryover at end of round is forfeited
        return $skinsWon;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Collect one declared score per pairing for the given hole and metric.
     *
     * With BestBall/1 locked on skins games, only one player per pairing
     * will have declared = true on any given hole. This method takes the
     * first declared score found per pairing — consistent with that contract.
     *
     * @return array  Flat list of ['pairingId' => string, 'score' => float]
     */
    private static function collectHoleScores(array $pairings, int $holeNumber, string $metric): array
    {
        $scores  = [];
        $holeKey = 'h' . $holeNumber;

        foreach ($pairings as $pairing) {
            $pairingId = trim((string)($pairing['pairingId'] ?? ''));
            if ($pairingId === '') {
                continue;
            }

            $holeData = $pairing['holes'][$holeKey] ?? null;
            if (!is_array($holeData)) {
                continue;
            }

            if (empty($holeData['declared'])) {
                continue;
            }

            $raw = $holeData[$metric] ?? null;
            if ($raw === null || !is_numeric($raw)) {
                continue;
            }

            $scores[] = [
                'pairingId' => $pairingId,
                'score'     => (float)$raw,
            ];
        }

        return $scores;
    }
}