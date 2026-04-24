<?php
declare(strict_types=1);
// /services/scoring/service_CalcPoints.php

/**
 * ServiceCalcPoints — Pure stateless points calculator.
 *
 * Responsibilities:
 *   - Accept a structured set of pairings/players with declared hole scores
 *   - Resolve gross points and net points independently, hole by hole
 *   - Support all six points strategies: Stableford, Nines, LowBallLowTotal,
 *     LowBallHighBall, Vegas, Chicago
 *   - Return per-pairing points totals broken down by front, back, and total
 *     for both gross and net passes
 *
 * This class has no database access, no session awareness, and no side effects.
 * It is called by service_ScoreSummary.php for both Points (PairField)
 * and Points Match (PairPair) game types.
 *
 * Mirrors the pattern established by service_CalcSkins.php.
 */
final class ServiceCalcPoints
{
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Resolve both gross and net points in a single call.
     *
     * @param array $pairings  Keyed by pairingId. Each entry:
     *                         [
     *                           'pairingId' => 'P01',
     *                           'holes'     => [
     *                             'h1' => ['gross' => 4, 'net' => 3.5, 'grossDiff' => 0, 'netDiff' => -0.5, 'declared' => true],
     *                             ...
     *                           ]
     *                         ]
     * @param array $holes     Ordered list of hole numbers in scope e.g. [1,2,...,18]
     * @param array $config    Parsed dbGames_PointsConfig envelope:
     *                         ['strategy' => 'Stableford', 'values' => [...], ...]
     * @param array $players   Full player rows (needed for Nines group context and
     *                         Chicago quota — keyed by pairingId)
     *
     * @return array [
     *   'gross' => [
     *     'P01' => ['front' => 10, 'back' => 8, 'total' => 18],
     *     'P02' => ['front' => 6,  'back' => 9, 'total' => 15],
     *   ],
     *   'net' => [ ... same shape ... ],
     * ]
     */
    public static function resolvePoints(array $pairings, array $holes, array $config, array $players = []): array
    {
        return [
            'gross' => self::resolvePass($pairings, $holes, 'gross', $config, $players),
            'net'   => self::resolvePass($pairings, $holes, 'net',   $config, $players),
        ];
    }

    /**
     * Resolve gross points only.
     */
    public static function resolveGrossPoints(array $pairings, array $holes, array $config, array $players = []): array
    {
        return self::resolvePass($pairings, $holes, 'gross', $config, $players);
    }

    /**
     * Resolve net points only.
     */
    public static function resolveNetPoints(array $pairings, array $holes, array $config, array $players = []): array
    {
        return self::resolvePass($pairings, $holes, 'net', $config, $players);
    }

    // -------------------------------------------------------------------------
    // Core resolver — dispatches to the correct strategy
    // -------------------------------------------------------------------------

    private static function resolvePass(
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config,
        array  $players
    ): array {
        // Initialize front/back/total to zero for every pairing
        $points = [];
        foreach ($pairings as $pairing) {
            $pairingId = trim((string)($pairing['pairingId'] ?? ''));
            if ($pairingId !== '') {
                $points[$pairingId] = ['front' => 0, 'back' => 0, 'total' => 0];
            }
        }

        $strategy = trim((string)($config['strategy'] ?? 'Stableford'));

        switch ($strategy) {
            case 'Stableford':
            case 'Chicago':
                return self::resolveStableford($points, $pairings, $holes, $metric, $config);

            case 'Nines':
                return self::resolveNines($points, $pairings, $holes, $metric, $config);

            case 'LowBallLowTotal':
                return self::resolveLowBallLowTotal($points, $pairings, $holes, $metric, $config);

            case 'LowBallHighBall':
                return self::resolveLowBallHighBall($points, $pairings, $holes, $metric, $config);

            case 'Vegas':
                return self::resolveVegas($points, $pairings, $holes, $metric, $config);

            default:
                return $points;
        }
    }

    // -------------------------------------------------------------------------
    // Strategy: Stableford / Chicago
    // -------------------------------------------------------------------------

    /**
     * Stableford and Chicago share the same per-hole points calculation —
     * points awarded based on score relative to par using the configured map.
     *
     * Chicago's quota comparison happens at the summary level (score_summary.js)
     * not here — this calculator simply accumulates raw points per pairing.
     *
     * Diff metric: uses grossDiff for gross pass, netDiff for net pass.
     */
    private static function resolveStableford(
        array  $points,
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config
    ): array {
        $map       = self::parseStablefordMap($config);
        $diffMetric = ($metric === 'gross') ? 'grossDiff' : 'netDiff';

        foreach ($holes as $holeNumber) {
            $holeNumber = (int)$holeNumber;
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';
            $holeKey    = 'h' . $holeNumber;

            foreach ($pairings as $pairing) {
                $pairingId = trim((string)($pairing['pairingId'] ?? ''));
                if ($pairingId === '' || !isset($points[$pairingId])) continue;

                $holeData = $pairing['holes'][$holeKey] ?? null;
                if (!is_array($holeData) || empty($holeData['declared'])) continue;

                $diff = $holeData[$diffMetric] ?? null;
                if ($diff === null || !is_numeric($diff)) continue;

                $pts = self::stablefordPointsForDiff((int)round((float)$diff), $map);
                $points[$pairingId][$segmentKey] += $pts;
                $points[$pairingId]['total']      += $pts;
            }
        }

        return $points;
    }

    // -------------------------------------------------------------------------
    // Strategy: Nines
    // -------------------------------------------------------------------------

    /**
     * Distribute a fixed pool of 9 points per hole based on finish position
     * within the group. Distribution array is keyed by group size.
     *
     * Tie handling: tied positions split the combined points for those positions
     * equally (rounded to 1 decimal).
     *
     * Example (4 players, dist = [5,3,1,0]):
     *   Scores: A=4, B=4, C=5, D=6
     *   A and B tie for 1st — each gets (5+3)/2 = 4
     *   C gets 1, D gets 0
     */
    private static function resolveNines(
        array  $points,
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config
    ): array {
        $valuesMap = is_array($config['values'] ?? null) ? $config['values'] : [];

        foreach ($holes as $holeNumber) {
            $holeNumber = (int)$holeNumber;
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';
            $holeKey    = 'h' . $holeNumber;

            // Collect declared scores for this hole
            $holeScores = [];
            foreach ($pairings as $pairing) {
                $pairingId = trim((string)($pairing['pairingId'] ?? ''));
                if ($pairingId === '') continue;

                $holeData = $pairing['holes'][$holeKey] ?? null;
                if (!is_array($holeData) || empty($holeData['declared'])) continue;

                $raw = $holeData[$metric] ?? null;
                if ($raw === null || !is_numeric($raw)) continue;

                $holeScores[] = ['pairingId' => $pairingId, 'score' => (float)$raw];
            }

            $groupSize = count($holeScores);
            if ($groupSize < 2) continue;

            // Get distribution for this group size, fall back to closest available
            $sizeKey = (string)$groupSize;
            if (!isset($valuesMap[$sizeKey])) {
                // Try to find the nearest available size
                $available = array_map('intval', array_keys($valuesMap));
                if (!$available) continue;
                sort($available);
                $nearest = end($available);
                foreach ($available as $sz) {
                    if ($sz >= $groupSize) { $nearest = $sz; break; }
                }
                $sizeKey = (string)$nearest;
            }

            $dist = is_array($valuesMap[$sizeKey] ?? null) ? array_values($valuesMap[$sizeKey]) : [];
            if (!$dist) continue;

            // Sort scores ascending (lower is better in golf)
            usort($holeScores, fn($a, $b) => $a['score'] <=> $b['score']);

            // Distribute points with tie splitting
            $i = 0;
            while ($i < $groupSize) {
                $currentScore = $holeScores[$i]['score'];

                // Find all tied at this position
                $tiedGroup = [$holeScores[$i]['pairingId']];
                $j = $i + 1;
                while ($j < $groupSize && $holeScores[$j]['score'] === $currentScore) {
                    $tiedGroup[] = $holeScores[$j]['pairingId'];
                    $j++;
                }

                // Sum the points for the tied positions and split
                $tiedCount   = count($tiedGroup);
                $pointsSum   = 0.0;
                for ($k = $i; $k < $i + $tiedCount; $k++) {
                    $pointsSum += (float)($dist[$k] ?? 0);
                }
                $splitPts = $tiedCount > 0 ? $pointsSum / $tiedCount : 0.0;

                foreach ($tiedGroup as $pairingId) {
                    if (!isset($points[$pairingId])) continue;
                    $points[$pairingId][$segmentKey] += $splitPts;
                    $points[$pairingId]['total']      += $splitPts;
                }

                $i = $j;
            }
        }

        return $points;
    }

    // -------------------------------------------------------------------------
    // Strategy: LowBallLowTotal
    // -------------------------------------------------------------------------

    /**
     * Two point opportunities per hole between exactly two pairings:
     *   Low Ball:  points to the side with the lowest individual score
     *   Low Total: points to the side with the lowest combined team score
     *
     * Tied holes: no points awarded for that category (push).
     * Requires exactly 2 pairings.
     */
    private static function resolveLowBallLowTotal(
        array  $points,
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config
    ): array {
        if (count($pairings) !== 2) return $points;

        $lowBallPts  = (float)(($config['values'] ?? [])['lowBall']  ?? 1);
        $lowTotalPts = (float)(($config['values'] ?? [])['lowTotal'] ?? 1);

        $pairingIds = array_values(array_map(
            fn($p) => trim((string)($p['pairingId'] ?? '')),
            $pairings
        ));
        [$leftId, $rightId] = $pairingIds;

        foreach ($holes as $holeNumber) {
            $holeNumber = (int)$holeNumber;
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';
            $holeKey    = 'h' . $holeNumber;

            // Collect individual declared scores per pairing
            $individualScores = [];
            $teamTotals       = [];

            foreach ($pairings as $pairing) {
                $pairingId = trim((string)($pairing['pairingId'] ?? ''));
                if ($pairingId === '') continue;

                $holeData = $pairing['holes'][$holeKey] ?? null;
                if (!is_array($holeData) || empty($holeData['declared'])) continue;

                $raw = $holeData[$metric] ?? null;
                if ($raw === null || !is_numeric($raw)) continue;

                $score = (float)$raw;
                // Track the best (lowest) individual score per pairing
                if (!isset($individualScores[$pairingId]) || $score < $individualScores[$pairingId]) {
                    $individualScores[$pairingId] = $score;
                }
                $teamTotals[$pairingId] = ($teamTotals[$pairingId] ?? 0.0) + $score;
            }

            if (!isset($individualScores[$leftId], $individualScores[$rightId])) continue;

            // Low Ball
            $leftBall  = $individualScores[$leftId];
            $rightBall = $individualScores[$rightId];
            if ($leftBall < $rightBall) {
                self::addPoints($points, $leftId,  $segmentKey, $lowBallPts);
            } elseif ($rightBall < $leftBall) {
                self::addPoints($points, $rightId, $segmentKey, $lowBallPts);
            }
            // Tied — push, no points

            // Low Total
            if (isset($teamTotals[$leftId], $teamTotals[$rightId])) {
                $leftTotal  = $teamTotals[$leftId];
                $rightTotal = $teamTotals[$rightId];
                if ($leftTotal < $rightTotal) {
                    self::addPoints($points, $leftId,  $segmentKey, $lowTotalPts);
                } elseif ($rightTotal < $leftTotal) {
                    self::addPoints($points, $rightId, $segmentKey, $lowTotalPts);
                }
                // Tied — push
            }
        }

        return $points;
    }

    // -------------------------------------------------------------------------
    // Strategy: LowBallHighBall
    // -------------------------------------------------------------------------

    /**
     * Two point opportunities per hole between exactly two pairings:
     *   Low Ball:  points to the side with the lowest individual score
     *   High Ball: points to the side with the lower of the two "high scores"
     *              (i.e. the better worst score between partners)
     *
     * Tied holes: push, no points awarded for that category.
     * Requires exactly 2 pairings.
     */
    private static function resolveLowBallHighBall(
        array  $points,
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config
    ): array {
        if (count($pairings) !== 2) return $points;

        $lowBallPts  = (float)(($config['values'] ?? [])['lowBall']  ?? 1);
        $highBallPts = (float)(($config['values'] ?? [])['highBall'] ?? 1);

        $pairingIds = array_values(array_map(
            fn($p) => trim((string)($p['pairingId'] ?? '')),
            $pairings
        ));
        [$leftId, $rightId] = $pairingIds;

        foreach ($holes as $holeNumber) {
            $holeNumber = (int)$holeNumber;
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';
            $holeKey    = 'h' . $holeNumber;

            $lowScores  = [];  // best (lowest) individual score per pairing
            $highScores = [];  // worst (highest) individual score per pairing

            foreach ($pairings as $pairing) {
                $pairingId = trim((string)($pairing['pairingId'] ?? ''));
                if ($pairingId === '') continue;

                $holeData = $pairing['holes'][$holeKey] ?? null;
                if (!is_array($holeData) || empty($holeData['declared'])) continue;

                $raw = $holeData[$metric] ?? null;
                if ($raw === null || !is_numeric($raw)) continue;

                $score = (float)$raw;
                if (!isset($lowScores[$pairingId])  || $score < $lowScores[$pairingId])  $lowScores[$pairingId]  = $score;
                if (!isset($highScores[$pairingId]) || $score > $highScores[$pairingId]) $highScores[$pairingId] = $score;
            }

            if (!isset($lowScores[$leftId], $lowScores[$rightId])) continue;

            // Low Ball
            if ($lowScores[$leftId] < $lowScores[$rightId]) {
                self::addPoints($points, $leftId,  $segmentKey, $lowBallPts);
            } elseif ($lowScores[$rightId] < $lowScores[$leftId]) {
                self::addPoints($points, $rightId, $segmentKey, $lowBallPts);
            }

            // High Ball — lower high score wins
            if (isset($highScores[$leftId], $highScores[$rightId])) {
                if ($highScores[$leftId] < $highScores[$rightId]) {
                    self::addPoints($points, $leftId,  $segmentKey, $highBallPts);
                } elseif ($highScores[$rightId] < $highScores[$leftId]) {
                    self::addPoints($points, $rightId, $segmentKey, $highBallPts);
                }
            }
        }

        return $points;
    }

    // -------------------------------------------------------------------------
    // Strategy: Vegas
    // -------------------------------------------------------------------------

    /**
     * Each side combines their two scores into a two-digit number (low score
     * first). The difference between the two numbers is multiplied by the
     * configured points-per-unit value. Points are signed — the winning side
     * gains, the losing side loses.
     *
     * Example: Left scores 4+5 = 45, Right scores 3+6 = 36.
     * Difference = 45 - 36 = 9. At 1pt/unit: Right +9, Left -9.
     *
     * Requires exactly 2 pairings with exactly 2 players each.
     */
    private static function resolveVegas(
        array  $points,
        array  $pairings,
        array  $holes,
        string $metric,
        array  $config
    ): array {
        if (count($pairings) !== 2) return $points;

        $ptsPerUnit = max(1, (float)(($config['values'] ?? [])['pointsPerUnit'] ?? 1));

        $pairingIds = array_values(array_map(
            fn($p) => trim((string)($p['pairingId'] ?? '')),
            $pairings
        ));
        [$leftId, $rightId] = $pairingIds;

        foreach ($holes as $holeNumber) {
            $holeNumber = (int)$holeNumber;
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';
            $holeKey    = 'h' . $holeNumber;

            $sideScores = [];

            foreach ($pairings as $pairing) {
                $pairingId = trim((string)($pairing['pairingId'] ?? ''));
                if ($pairingId === '') continue;

                $holeData = $pairing['holes'][$holeKey] ?? null;
                if (!is_array($holeData) || empty($holeData['declared'])) continue;

                $raw = $holeData[$metric] ?? null;
                if ($raw === null || !is_numeric($raw)) continue;

                $sideScores[$pairingId][] = (int)round((float)$raw);
            }

            if (!isset($sideScores[$leftId], $sideScores[$rightId])) continue;
            if (count($sideScores[$leftId]) < 2 || count($sideScores[$rightId]) < 2) continue;

            // Build two-digit numbers — low score first
            $leftNums  = $sideScores[$leftId];
            $rightNums = $sideScores[$rightId];
            sort($leftNums);
            sort($rightNums);

            $leftNum  = (int)($leftNums[0]  * 10 + $leftNums[1]);
            $rightNum = (int)($rightNums[0] * 10 + $rightNums[1]);
            $diff     = abs($leftNum - $rightNum) * $ptsPerUnit;

            if ($diff == 0) continue; // tied hole — push

            if ($leftNum < $rightNum) {
                // Left wins — lower number is better
                self::addPoints($points, $leftId,  $segmentKey,  $diff);
                self::addPoints($points, $rightId, $segmentKey, -$diff);
            } else {
                self::addPoints($points, $rightId, $segmentKey,  $diff);
                self::addPoints($points, $leftId,  $segmentKey, -$diff);
            }
        }

        return $points;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Parse the Stableford points map from the config envelope.
     * Returns an int-keyed array of [relToPar => points].
     * Falls back to standard Stableford defaults if config is missing/invalid.
     */
    private static function parseStablefordMap(array $config): array
    {
        $default = [-3 => 5, -2 => 4, -1 => 3, 0 => 2, 1 => 1, 2 => 0];
        $values  = $config['values'] ?? null;

        if (!is_array($values) || empty($values)) return $default;

        $map = [];
        foreach ($values as $entry) {
            if (is_array($entry) && isset($entry['reltoPar'], $entry['points'])) {
                $map[intval($entry['reltoPar'])] = intval($entry['points']);
            } elseif (is_array($entry) && isset($entry['relToPar'], $entry['points'])) {
                $map[intval($entry['relToPar'])] = intval($entry['points']);
            }
        }

        return $map ?: $default;
    }

    /**
     * Look up points for a given score diff against the map.
     * Clamps to the nearest boundary if diff is outside the map range.
     */
    private static function stablefordPointsForDiff(int $diff, array $map): int
    {
        if (array_key_exists($diff, $map)) return intval($map[$diff]);

        $keys = array_keys($map);
        if ($diff < min($keys)) return intval($map[min($keys)] ?? 0);
        if ($diff > max($keys)) return intval($map[max($keys)] ?? 0);

        return 0;
    }

    /**
     * Add points to a pairing's segment and total.
     */
    private static function addPoints(array &$points, string $pairingId, string $segmentKey, float $pts): void
    {
        if (!isset($points[$pairingId])) return;
        $points[$pairingId][$segmentKey] += $pts;
        $points[$pairingId]['total']      += $pts;
    }
}
