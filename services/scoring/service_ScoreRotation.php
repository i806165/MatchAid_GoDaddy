<?php

declare(strict_types=1);
// /public_html/services/scoring/service_ScoreRotation.php

/**
 * ServiceScoreRotation
 *
 * Shared normalization / derivation layer for scored pages.
 *
 * Baseline acquisition remains upstream. This service accepts already-hydrated
 * baseline game/player data and returns a normalized virtual path:
 *
 * - non-rotation game: one pass-through virtual context
 * - rotation-aware PairPair game: one virtual context per spin
 *
 * Canonical raw scores are NOT cloned here. The returned structures are
 * rendering/rules contexts only.
 */
final class ServiceScoreRotation
{
    private const HOLES_ALL_18 = 'All 18';
    private const HOLES_F9 = 'F9';
    private const HOLES_B9 = 'B9';

    /**
     * Main public entry point.
     *
     * @return array{
     *   isRotationAware: bool,
     *   baseline: array,
     *   virtualContexts: array<int,array>,
     *   activeContext: ?array
     * }
     */
    public static function buildNormalizedContexts(
        array $gameRow,
        array $baselinePlayers,
        int $holeNumber,
        array $seatOverrides = []
    ): array {
        $effectivePlayers = self::buildEffectiveBaselinePlayers($baselinePlayers, $seatOverrides);
        $baseline = self::buildBaselineContext($effectivePlayers);

        if (!$effectivePlayers) {
            return [
                'isRotationAware' => false,
                'baseline' => $baseline,
                'virtualContexts' => [],
                'activeContext' => null,
            ];
        }

        if (!self::isRotationAwarePairPair($gameRow)) {
            $context = self::buildPassthroughContext($gameRow, $baseline);
            return [
                'isRotationAware' => false,
                'baseline' => $baseline,
                'virtualContexts' => [$context],
                'activeContext' => $context,
            ];
        }

        $contexts = self::buildRotatedContexts($gameRow, $baseline);
        $active = self::findActiveContext($contexts, $holeNumber) ?? ($contexts[0] ?? null);

        return [
            'isRotationAware' => true,
            'baseline' => $baseline,
            'virtualContexts' => $contexts,
            'activeContext' => $active,
        ];
    }

    public static function isRotationAwarePairPair(array $gameRow): bool
    {
        $competition = trim((string)($gameRow['dbGames_Competition'] ?? ''));
        $rotation = strtoupper(trim((string)($gameRow['dbGames_RotationMethod'] ?? '')));

        return $competition === 'PairPair' && in_array($rotation, ['COD', '1324', '1423'], true);
    }

public static function buildEffectiveBaselinePlayers(array $players, array $seatOverrides = []): array
{
    $normalizedOverrides = self::normalizeSeatOverrides($seatOverrides);
    $effective = [];

    foreach ($players as $player) {
        if (!is_array($player)) {
            continue;
        }

        $row = $player;
        $ghin = trim((string)($row['dbPlayers_PlayerGHIN'] ?? ''));
        if ($ghin !== '' && isset($normalizedOverrides[$ghin])) {
            $row['dbPlayers_PairingPos'] = (string)$normalizedOverrides[$ghin];
        }
        $effective[] = $row;
    }

    usort($effective, static function (array $a, array $b): int {
        $pairA = self::normStr($a['dbPlayers_PairingID'] ?? '', 'ZZZ');
        $pairB = self::normStr($b['dbPlayers_PairingID'] ?? '', 'ZZZ');
        if ($pairA !== $pairB) {
            return strnatcmp($pairA, $pairB);
        }

        $posA = self::normInt($a['dbPlayers_PairingPos'] ?? null, 999);
        $posB = self::normInt($b['dbPlayers_PairingPos'] ?? null, 999);
        if ($posA !== $posB) {
            return $posA <=> $posB;
        }

        $lastA = self::normStr($a['dbPlayers_LName'] ?? '');
        $lastB = self::normStr($b['dbPlayers_LName'] ?? '');
        if ($lastA !== $lastB) {
            return strcmp($lastA, $lastB);
        }

        return strcmp(
            self::normStr($a['dbPlayers_Name'] ?? ''),
            self::normStr($b['dbPlayers_Name'] ?? '')
        );
    });

    return $effective;
}

    public static function buildSpinDefinitions(array $gameRow): array
    {
        $visibleHoles = self::holesForGame(trim((string)($gameRow['dbGames_Holes'] ?? self::HOLES_ALL_18)));
        if (!$visibleHoles) {
            return [];
        }

        $segmentSize = self::deriveSegmentHoleCount($gameRow, count($visibleHoles));
        $startHole = min($visibleHoles);
        $endHole = max($visibleHoles);
        $spinCount = (int)ceil(count($visibleHoles) / $segmentSize);
        $suffixes = self::alphabetSuffixes($spinCount);
        $labels = self::defaultSpinLabels($spinCount, strtoupper(trim((string)($gameRow['dbGames_RotationMethod'] ?? ''))));

        $definitions = [];
        for ($i = 0; $i < $spinCount; $i++) {
            $spinStart = $startHole + ($i * $segmentSize);
            $spinEnd = min($spinStart + $segmentSize - 1, $endHole);
            $spinVisible = array_values(array_filter($visibleHoles, static fn(int $h): bool => $h >= $spinStart && $h <= $spinEnd));

            $definitions[] = [
                'spinNumber' => $i + 1,
                'spinSuffix' => $suffixes[$i],
                'spinKey' => 'S' . ($i + 1),
                'spinLabel' => $labels[$i] ?? ('Spin ' . ($i + 1)),
                'spinStartHole' => $spinStart,
                'spinEndHole' => $spinEnd,
                'visibleHoles' => $spinVisible,
                'segmentSize' => $segmentSize,
            ];
        }

        return $definitions;
    }

    public static function determineSpinForHole(array $gameRow, int $holeNumber): ?array
    {
        foreach (self::buildSpinDefinitions($gameRow) as $spin) {
            if ($holeNumber >= $spin['spinStartHole'] && $holeNumber <= $spin['spinEndHole']) {
                return $spin;
            }
        }
        return null;
    }

    public static function buildSpinAwareStrokeAllocationMap(array $gameRow, float $playerHC, array $teeSetHoles = []): array
    {
        $holes = [];
        foreach ($teeSetHoles as $hole) {
            if (!is_array($hole)) {
                continue;
            }
            $number = self::normInt($hole['Number'] ?? $hole['number'] ?? null, 0);
            if ($number <= 0) {
                continue;
            }
            $holes[] = [
                'Number' => $number,
                'Allocation' => self::normInt($hole['Allocation'] ?? $hole['allocation'] ?? null, 99),
            ];
        }

        usort($holes, static fn(array $a, array $b): int => $a['Number'] <=> $b['Number']);
        $strokeMap = [];
        foreach ($holes as $hole) {
            $strokeMap[$hole['Number']] = 0;
        }

        if (!$holes || abs($playerHC) < 0.00001) {
            return $strokeMap;
        }

        $visibleHoles = array_flip(self::holesForGame(trim((string)($gameRow['dbGames_Holes'] ?? self::HOLES_ALL_18))));
        $filteredHoles = array_values(array_filter($holes, static function (array $hole) use ($visibleHoles): bool {
            return isset($visibleHoles[$hole['Number']]);
        }));

        if (!$filteredHoles) {
            return $strokeMap;
        }

        $strokeMode = trim((string)($gameRow['dbGames_StrokeDistribution'] ?? 'Standard'));
        if (!self::isRotationAwarePairPair($gameRow) || $strokeMode === 'Standard') {
            return self::buildStandardStrokeAllocationMap($filteredHoles, $playerHC, $strokeMap);
        }

        // Derive working handicap based on stroke distribution mode:
        // Balanced (Trimmed) — use raw handicap, remainder will be dropped
        // Balanced-Rounded   — round to nearest multiple of spin count for exact equal distribution
        $spinDefinitions = self::buildSpinDefinitions($gameRow);
        if (!$spinDefinitions) {
            return self::buildStandardStrokeAllocationMap($filteredHoles, $playerHC, $strokeMap);
        }

        $spinCount = count($spinDefinitions);
        $workingHC = $playerHC;
        if ($strokeMode === 'Balanced-Rounded') {
            $workingHC = round($playerHC / (float)$spinCount) * (float)$spinCount;
        }

        $isPlus = $workingHC < 0;
        $totalStrokes = (int)abs($workingHC);
        if ($totalStrokes === 0) {
            return $strokeMap;
        }

        $basePerSpin = intdiv($totalStrokes, $spinCount);

        $holesBySpin = [];
        foreach ($spinDefinitions as $spin) {
            $spinHoles = array_values(array_filter($filteredHoles, static function (array $hole) use ($spin): bool {
                return $hole['Number'] >= $spin['spinStartHole'] && $hole['Number'] <= $spin['spinEndHole'];
            }));
            usort($spinHoles, static function (array $a, array $b) use ($isPlus): int {
                return $isPlus ? ($b['Allocation'] <=> $a['Allocation']) : ($a['Allocation'] <=> $b['Allocation']);
            });
            $holesBySpin[] = $spinHoles;
        }

        foreach ($holesBySpin as $spinHoles) {
            if (!$spinHoles) {
                continue;
            }
            for ($i = 0; $i < $basePerSpin; $i++) {
                $hole = $spinHoles[$i % count($spinHoles)];
                $strokeMap[$hole['Number']] += $isPlus ? -1 : 1;
            }
        }

        // Balanced-Rounded only — distribute remainder strokes after rounding.
        // Balanced (Trimmed) intentionally drops the remainder for clean equal spin allocation.
        if ($strokeMode === 'Balanced-Rounded') {
            $remainder = $totalStrokes % $spinCount;
            if ($remainder > 0) {
                $alreadyTouched = [];
                foreach ($strokeMap as $holeNumber => $value) {
                    if ($value !== 0) {
                        $alreadyTouched[$holeNumber] = true;
                    }
                }

                $remaining = array_values(array_filter($filteredHoles, static function (array $hole) use ($alreadyTouched): bool {
                    return !isset($alreadyTouched[$hole['Number']]);
                }));

                usort($remaining, static function (array $a, array $b) use ($isPlus): int {
                    return $isPlus ? ($b['Allocation'] <=> $a['Allocation']) : ($a['Allocation'] <=> $b['Allocation']);
                });

                for ($i = 0; $i < $remainder; $i++) {
                    if (!isset($remaining[$i])) {
                        break;
                    }
                    $strokeMap[$remaining[$i]['Number']] += $isPlus ? -1 : 1;
                }
            }
        }

        return $strokeMap;
    }

    public static function buildVirtualPlayerKey(string $basePlayerKey, string $suffix): string
    {
        return trim($basePlayerKey) . trim($suffix);
    }

    public static function buildVirtualFlightId(string $baseFlightId, string $suffix): string
    {
        return trim($baseFlightId) . trim($suffix);
    }

    public static function buildVirtualPairingIds(array $baselinePairingIds, string $suffix): array
    {
        $result = [];
        foreach ($baselinePairingIds as $pairingId) {
            $result[] = trim((string)$pairingId) . trim($suffix);
        }
        return $result;
    }

    private static function buildBaselineContext(array $effectivePlayers): array
    {
        $basePlayerKey = self::normStr($effectivePlayers[0]['dbPlayers_PlayerKey'] ?? '', '000');
        $baseFlightId = self::normStr($effectivePlayers[0]['dbPlayers_FlightID'] ?? '', '000');
        $baselinePairingIds = self::baselinePairingIds($effectivePlayers);

        return [
            'playerKey' => $basePlayerKey,
            'flightID' => $baseFlightId,
            'pairingIDs' => $baselinePairingIds,
            'players' => $effectivePlayers,
        ];
    }

    private static function buildPassthroughContext(array $gameRow, array $baseline): array
    {
        $visibleHoles = self::holesForGame(trim((string)($gameRow['dbGames_Holes'] ?? self::HOLES_ALL_18)));
        $players = [];
        foreach ($baseline['players'] as $player) {
            $row = $player;
            $row['baselinePlayerKey'] = $baseline['playerKey'];
            $row['baselineFlightID'] = $baseline['flightID'];
            $row['baselinePairingID'] = self::normStr($player['dbPlayers_PairingID'] ?? '', '000');
            $row['virtualPlayerKey'] = $baseline['playerKey'];
            $row['virtualFlightID'] = $baseline['flightID'];
            $row['virtualPairingID'] = self::normStr($player['dbPlayers_PairingID'] ?? '', '000');
            $row['virtualFlightPos'] = self::normStr($player['dbPlayers_FlightPos'] ?? '', '');
            $row['effectivePlayerKey'] = $row['virtualPlayerKey'];
            $row['effectiveFlightID'] = $row['virtualFlightID'];
            $row['effectivePairingID'] = $row['virtualPairingID'];
            $row['spinNumber'] = 1;
            $row['spinKey'] = 'S1';
            $row['spinLabel'] = 'Round';
            $row['spinStartHole'] = $visibleHoles ? min($visibleHoles) : 1;
            $row['spinEndHole'] = $visibleHoles ? max($visibleHoles) : 18;
            $row['visibleHoles'] = $visibleHoles;
            $players[] = $row;
        }

        return [
            'spinNumber' => 1,
            'spinSuffix' => '',
            'spinKey' => 'S1',
            'spinLabel' => 'Round',
            'spinStartHole' => $visibleHoles ? min($visibleHoles) : 1,
            'spinEndHole' => $visibleHoles ? max($visibleHoles) : 18,
            'visibleHoles' => $visibleHoles,
            'segmentSize' => count($visibleHoles),
            'baselinePlayerKey' => $baseline['playerKey'],
            'baselineFlightID' => $baseline['flightID'],
            'baselinePairingIDs' => $baseline['pairingIDs'],
            'virtualPlayerKey' => $baseline['playerKey'],
            'virtualFlightID' => $baseline['flightID'],
            'virtualPairingIDs' => $baseline['pairingIDs'],
            'players' => $players,
        ];
    }

private static function buildRotatedContexts(array $gameRow, array $baseline): array
{
    $spinDefinitions = self::buildSpinDefinitions($gameRow);
    $contexts = [];

    foreach ($spinDefinitions as $spinIndex => $spin) {
        $teams = self::deriveSpinTeams($gameRow, $spinIndex + 1);
        $virtualPlayerKey = self::buildVirtualPlayerKey($baseline['playerKey'], $spin['spinSuffix']);
        $virtualFlightId = self::buildVirtualFlightId($baseline['flightID'], $spin['spinSuffix']);
        $virtualPairingIds = self::buildVirtualPairingIds($baseline['pairingIDs'], $spin['spinSuffix']);

        $players = [];
        foreach ($baseline['players'] as $player) {
            $seat = self::logicalSeatForPlayer($baseline['pairingIDs'], $player);
            $side = self::sideForSeat($teams, $seat);

            $virtualPairingId = ($side === 'A')
                ? ($virtualPairingIds[0] ?? ($baseline['pairingIDs'][0] . $spin['spinSuffix']))
                : ($virtualPairingIds[1] ?? ($baseline['pairingIDs'][1] . $spin['spinSuffix']));

            $row = $player;
            $row['baselinePlayerKey'] = $baseline['playerKey'];
            $row['baselineFlightID'] = $baseline['flightID'];
            $row['baselinePairingID'] = self::normStr($player['dbPlayers_PairingID'] ?? '', '000');
            $row['virtualPlayerKey'] = $virtualPlayerKey;
            $row['virtualFlightID'] = $virtualFlightId;
            $row['virtualPairingID'] = $virtualPairingId;
            $row['virtualFlightPos'] = $side;
            $row['effectivePlayerKey'] = $virtualPlayerKey;
            $row['effectiveFlightID'] = $virtualFlightId;
            $row['effectivePairingID'] = $virtualPairingId;
            $row['spinNumber'] = $spin['spinNumber'];
            $row['spinKey'] = $spin['spinKey'];
            $row['spinLabel'] = $spin['spinLabel'];
            $row['spinStartHole'] = $spin['spinStartHole'];
            $row['spinEndHole'] = $spin['spinEndHole'];
            $row['visibleHoles'] = $spin['visibleHoles'];
            $players[] = $row;
        }

        usort($players, static function (array $a, array $b): int {
            $pairA = self::normStr($a['effectivePairingID'] ?? '', 'ZZZ');
            $pairB = self::normStr($b['effectivePairingID'] ?? '', 'ZZZ');
            if ($pairA !== $pairB) {
                return strcmp($pairA, $pairB);
            }

            $basePairA = self::normStr($a['baselinePairingID'] ?? '', 'ZZZ');
            $basePairB = self::normStr($b['baselinePairingID'] ?? '', 'ZZZ');
            if ($basePairA !== $basePairB) {
                return strnatcmp($basePairA, $basePairB);
            }

            $posA = self::normInt($a['dbPlayers_PairingPos'] ?? null, 999);
            $posB = self::normInt($b['dbPlayers_PairingPos'] ?? null, 999);
            if ($posA !== $posB) {
                return $posA <=> $posB;
            }

            return strcmp(
                self::normStr($a['dbPlayers_Name'] ?? ''),
                self::normStr($b['dbPlayers_Name'] ?? '')
            );
        });

        $contexts[] = array_merge($spin, [
            'baselinePlayerKey' => $baseline['playerKey'],
            'baselineFlightID' => $baseline['flightID'],
            'baselinePairingIDs' => $baseline['pairingIDs'],
            'virtualPlayerKey' => $virtualPlayerKey,
            'virtualFlightID' => $virtualFlightId,
            'virtualPairingIDs' => $virtualPairingIds,
            'teamMap' => $teams,
            'players' => $players,
        ]);
    }

    return $contexts;
}

    private static function findActiveContext(array $contexts, int $holeNumber): ?array
    {
        foreach ($contexts as $context) {
            if ($holeNumber >= ($context['spinStartHole'] ?? 0) && $holeNumber <= ($context['spinEndHole'] ?? 0)) {
                return $context;
            }
        }
        return null;
    }

    private static function deriveSegmentHoleCount(array $gameRow, int $visibleHoleCount): int
    {
        $raw = self::normInt($gameRow['dbGames_Segments'] ?? null, $visibleHoleCount);
        if ($raw <= 0) {
            return max(1, $visibleHoleCount);
        }
        return min($raw, max(1, $visibleHoleCount));
    }

private static function deriveSpinTeams(array $gameRow, int $spinNumber): array
{
    $rotation = strtoupper(trim((string)($gameRow['dbGames_RotationMethod'] ?? 'NONE')));
    $index = max(0, $spinNumber - 1);

    $sequences = match ($rotation) {
        'COD' => [
            ['A' => ['A1', 'A2'], 'B' => ['B1', 'B2']],
            ['A' => ['A1', 'B2'], 'B' => ['A2', 'B1']],
            ['A' => ['A1', 'B1'], 'B' => ['A2', 'B2']],
        ],
        '1324' => [
            ['A' => ['A1', 'A2'], 'B' => ['B1', 'B2']],
            ['A' => ['A1', 'B1'], 'B' => ['A2', 'B2']],
        ],
        '1423' => [
            ['A' => ['A1', 'A2'], 'B' => ['B1', 'B2']],
            ['A' => ['A1', 'B2'], 'B' => ['A2', 'B1']],
        ],
        default => [
            ['A' => ['A1', 'A2'], 'B' => ['B1', 'B2']],
        ],
    };

    return $sequences[$index % count($sequences)];
}

private static function logicalSeatForPlayer(array $baselinePairingIds, array $player): string
{
    $pairingId = self::normStr($player['dbPlayers_PairingID'] ?? '', '');
    $pairingPos = self::normInt($player['dbPlayers_PairingPos'] ?? null, 0);

    $firstPairingId = $baselinePairingIds[0] ?? '';
    $secondPairingId = $baselinePairingIds[1] ?? '';

    if ($pairingId === $firstPairingId) {
        return match ($pairingPos) {
            1 => 'A1',
            2 => 'A2',
            default => 'X',
        };
    }

    if ($pairingId === $secondPairingId) {
        return match ($pairingPos) {
            1 => 'B1',
            2 => 'B2',
            default => 'X',
        };
    }

    return 'X';
}

private static function sideForSeat(array $teams, string $seat): string
{
    if (in_array($seat, $teams['A'] ?? [], true)) {
        return 'A';
    }
    if (in_array($seat, $teams['B'] ?? [], true)) {
        return 'B';
    }
    return 'X';
}

    private static function baselinePairingIds(array $players): array
    {
        $ids = [];
        foreach ($players as $player) {
            $id = self::normStr($player['dbPlayers_PairingID'] ?? '', '000');
            if ($id !== '' && !in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }
        sort($ids, SORT_NATURAL);
        return array_slice($ids, 0, 2);
    }

    private static function normalizeSeatOverrides(array $seatOverrides): array
    {
        $normalized = [];
        foreach ($seatOverrides as $key => $value) {
            if (is_array($value)) {
                $ghin = trim((string)($value['playerGHIN'] ?? $value['dbPlayers_PlayerGHIN'] ?? ''));
                $pos = self::normInt($value['pairingPos'] ?? $value['dbPlayers_PairingPos'] ?? null, 0);
                if ($ghin !== '' && $pos > 0) {
                    $normalized[$ghin] = $pos;
                }
                continue;
            }
            $ghin = trim((string)$key);
            $pos = self::normInt($value, 0);
            if ($ghin !== '' && $pos > 0) {
                $normalized[$ghin] = $pos;
            }
        }
        return $normalized;
    }

    private static function holesForGame(string $holesMode): array
    {
        return match ($holesMode) {
            self::HOLES_F9 => range(1, 9),
            self::HOLES_B9 => range(10, 18),
            default => range(1, 18),
        };
    }

    private static function alphabetSuffixes(int $count): array
    {
        $suffixes = [];
        for ($i = 0; $i < $count; $i++) {
            $suffixes[] = chr(ord('a') + $i);
        }
        return $suffixes;
    }

    private static function defaultSpinLabels(int $spinCount, string $rotationMethod): array
    {
        $labels = [];
        for ($i = 0; $i < $spinCount; $i++) {
            $labels[] = 'Spin ' . ($i + 1);
        }
        if ($rotationMethod === 'COD' && $spinCount === 3) {
            return ['Cart', 'Opposite', 'Driver'];
        }
        return $labels;
    }

    private static function buildStandardStrokeAllocationMap(array $holes, float $playerHC, array $strokeMap): array
    {
        $count = count($holes);
        if ($count === 0) {
            return $strokeMap;
        }

        if ($playerHC < 0) {
            $giveBack = (int)abs($playerHC);
            usort($holes, static fn(array $a, array $b): int => $b['Allocation'] <=> $a['Allocation']);
            for ($i = 0; $i < $giveBack; $i++) {
                $hole = $holes[$i % $count];
                $strokeMap[$hole['Number']] = -1;
            }
            return $strokeMap;
        }

        $base = (int)floor($playerHC / $count);
        $remainder = (int)round($playerHC - ($base * $count));

        foreach ($holes as $hole) {
            $strokeMap[$hole['Number']] = $base;
        }

        usort($holes, static fn(array $a, array $b): int => $a['Allocation'] <=> $b['Allocation']);
        for ($i = 0; $i < $remainder; $i++) {
            $hole = $holes[$i % $count];
            $strokeMap[$hole['Number']] += 1;
        }

        return $strokeMap;
    }

    private static function normStr($value, string $fallback = ''): string
    {
        $text = trim((string)($value ?? ''));
        return ($text !== '') ? $text : $fallback;
    }

    private static function normInt($value, int $fallback = 0): int
    {
        $text = trim((string)($value ?? ''));
        return is_numeric($text) ? (int)$text : $fallback;
    }
}
