<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreSummary.php

require_once __DIR__ . '/service_ScoreCardRotation.php';

final class ServiceScoreSummary
{
    public static function buildScoreSummaryPayload(array $gameRow, array $scorecards): array
    {
        if (!$gameRow) {
            throw new RuntimeException('buildScoreSummaryPayload: missing gameRow');
        }

        $competition = trim((string)($scorecards['competition'] ?? $gameRow['dbGames_Competition'] ?? 'PairField'));
        $meta = is_array($scorecards['meta'] ?? null) ? $scorecards['meta'] : [];

        $rows = ($competition === 'PairPair')
            ? self::buildPairPairRows($scorecards['rows'] ?? [], $gameRow, $meta)
            : self::buildPairFieldRows($scorecards['rows'] ?? [], $gameRow, $meta);

        $scoringBasis = trim((string)($meta['scoringBasis'] ?? $gameRow['dbGames_ScoringBasis'] ?? 'Strokes'));
        $defaultValueMode = in_array($scoringBasis, ['Holes', 'Skins'], true) ? 'game' : 'net';

        return [
            'mode' => 'game',
            'competition' => $competition,
            'rows' => $rows,
            'meta' => array_merge($meta, [
                'rowCount' => count($rows),
                'scoringBasis' => $scoringBasis,
                'defaultValueMode' => $defaultValueMode,
            ]),
        ];
    }

    private static function extractRowContext(array $row): array
    {
        return [
            'spinNumber' => intval($row['spinNumber'] ?? 1),
            'spinLabel' => (string)($row['spinLabel'] ?? 'Round'),
            'spinStartHole' => intval($row['spinStartHole'] ?? 1),
            'spinEndHole' => intval($row['spinEndHole'] ?? 18),
            'visibleHoles' => is_array($row['visibleHoles'] ?? null) ? array_values($row['visibleHoles']) : [],
            'virtualFlightId' => (string)($row['virtualFlightID'] ?? ''),
            'virtualPairingIds' => is_array($row['virtualPairingIDs'] ?? null) ? array_values($row['virtualPairingIDs']) : [],
            'isRotationAware' => !empty($row['isRotationAware']),
        ];
    }

    private static function scopedHolesForRow(array $ctx, array $gameRow): array
    {
        $holes = is_array($ctx['visibleHoles'] ?? null) ? array_values($ctx['visibleHoles']) : [];
        $holes = array_values(array_filter(array_map('intval', $holes), fn($n) => $n > 0));

        if ($holes) {
            sort($holes, SORT_NUMERIC);
            return $holes;
        }

        return self::holesForGame($gameRow);
    }

    private static function summaryMetricCellKey(array $ctx, array $gameRow): string
    {
        $segStr = trim((string)($gameRow['dbGames_Segments'] ?? '9'));
        $size = ($segStr === 'None') ? 18 : max(1, intval($segStr));

        $scopedHoles = self::scopedHolesForRow($ctx, $gameRow);
        $fullHoles = self::holesForGame($gameRow);

        if (!$scopedHoles || $scopedHoles === $fullHoles) {
            return '9c';
        }

        if ($size >= 18) {
            return '9c';
        }

        $prefix = (string)$size;
        $firstHole = $scopedHoles[0];
        $startIndex = array_search($firstHole, $fullHoles, true);
        if ($startIndex === false) {
            return '9c';
        }

        $segmentIndex = intdiv((int)$startIndex, $size) + 1;
        $suffix = chr(96 + $segmentIndex); // a, b, c, ...
        return $prefix . $suffix;
    }

    private static function buildPairFieldRows(array $scorecardRows, array $gameRow, array $meta): array
    {
        $out = [];

        foreach ($scorecardRows as $row) {
            $ctx = self::extractRowContext($row);
            $scopedHoles = self::scopedHolesForRow($ctx, $gameRow);
            $metricKey = self::summaryMetricCellKey($ctx, $gameRow);

            $playersByPairing = self::groupPlayersByPairing($row['players'] ?? []);
            $pairingIds = self::orderedPairingIds($row, $playersByPairing);

            foreach ($pairingIds as $pairingId) {
                $pairPlayers = $playersByPairing[$pairingId] ?? [];
                if (!$pairPlayers) {
                    continue;
                }

                $totalRow = self::findTotalRowForPairing($row['columnTotals'] ?? [], $pairingId);

                $gross = self::metricFromTotalRow($totalRow, 'grossDiff', $metricKey);
                $net = self::metricFromTotalRow($totalRow, 'netDiff', $metricKey);
                $points = self::metricFromTotalRow($totalRow, 'points', $metricKey);
                $shapeStats = self::buildPairFieldShapeStats($pairPlayers);

                $out[] = [
                    'pairingId' => (string)$pairingId,
                    'pairingLabel' => self::buildPairFieldLabel($pairPlayers),
                    'scoreCount' => self::countDeclaredScores($pairPlayers, $scopedHoles),
                    'grossDiffValue' => $gross['value'],
                    'grossDiffDisplay' => $gross['display'],
                    'netDiffValue' => $net['value'],
                    'netDiffDisplay' => $net['display'],
                    'pointsValue' => $points['value'],
                    'pointsDisplay' => $points['display'],
                    'thru' => self::deriveThru($pairPlayers, $scopedHoles),

                    // New stat buckets for PairField leaderboard cards
                    'countedGrossStats' => $shapeStats['countedGrossStats'],
                    'countedNetStats' => $shapeStats['countedNetStats'],
                    'notCountedGrossStats' => $shapeStats['notCountedGrossStats'],
                    'notCountedNetStats' => $shapeStats['notCountedNetStats'],

                    // Normalized scored-row metadata
                    'spinNumber' => $ctx['spinNumber'],
                    'spinLabel' => $ctx['spinLabel'],
                    'spinStartHole' => $ctx['spinStartHole'],
                    'spinEndHole' => $ctx['spinEndHole'],
                    'visibleHoles' => $ctx['visibleHoles'],
                    'virtualFlightId' => $ctx['virtualFlightId'],
                    'virtualPairingIds' => $ctx['virtualPairingIds'],
                    'isRotationAware' => $ctx['isRotationAware'],
                ];
            }
        }

        $basis = strtolower((string)($meta['scoringBasis'] ?? 'Strokes'));

        usort($out, function (array $a, array $b) use ($basis): int {
            return self::comparePairFieldRows($a, $b, $basis);
        });

        if ($out) {
            $leaderSeed = $out[0];
            foreach ($out as $idx => &$row) {
                $row['rank'] = $idx + 1;
                $row['isLeader'] = self::comparePairFieldRows($row, $leaderSeed, $basis) === 0;
            }
            unset($row);
        }

        return $out;
    }

    private static function comparePairFieldRows(array $a, array $b, string $basis): int
    {
        if ($basis === 'points') {
            $cmp = ($b['pointsValue'] <=> $a['pointsValue']); // higher points wins
            if ($cmp !== 0) return $cmp;
        } else {
            $cmp = ($a['netDiffValue'] <=> $b['netDiffValue']); // lower to-par wins
            if ($cmp !== 0) return $cmp;

            $cmp = ($a['grossDiffValue'] <=> $b['grossDiffValue']);
            if ($cmp !== 0) return $cmp;
        }

        $cmp = ($b['thru'] <=> $a['thru']);
        if ($cmp !== 0) return $cmp;

        return strnatcmp((string)$a['pairingId'], (string)$b['pairingId']);
    }

    private static function buildPairFieldShapeStats(array $pairPlayers): array
    {
        $countedGross = self::emptyShapeStats();
        $countedNet = self::emptyShapeStats();
        $notCountedGross = self::emptyShapeStats();
        $notCountedNet = self::emptyShapeStats();

        foreach ($pairPlayers as $player) {
            $holes = is_array($player['holes'] ?? null) ? $player['holes'] : [];

            foreach ($holes as $cell) {
                if (!is_array($cell)) {
                    continue;
                }

                $declared = !empty($cell['declared']);
                $grossShape = trim((string)($cell['shapes']['gross'] ?? ''));
                $netShape = trim((string)($cell['shapes']['net'] ?? ''));

                if ($declared) {
                    self::bumpShapeStat($countedGross, $grossShape);
                    self::bumpShapeStat($countedNet, $netShape);
                } else {
                    self::bumpShapeStat($notCountedGross, $grossShape);
                    self::bumpShapeStat($notCountedNet, $netShape);
                }
            }
        }

        return [
            'countedGrossStats' => $countedGross,
            'countedNetStats' => $countedNet,
            'notCountedGrossStats' => $notCountedGross,
            'notCountedNetStats' => $notCountedNet,
        ];
    }

    private static function emptyShapeStats(): array
    {
        return [
            'eaglePlus' => 0,
            'birdie' => 0,
            'par' => 0,
            'bogey' => 0,
            'bogeyPlus' => 0,
        ];
    }

    private static function bumpShapeStat(array &$stats, string $shape): void
    {
        if ($shape === '') return;

        $key = match (strtolower($shape)) {
            'eagle' => 'eaglePlus',
            'eagleplus' => 'eaglePlus',
            'birdie' => 'birdie',
            'par' => 'par',
            'bogey' => 'bogey',
            'bogeyplus' => 'bogeyPlus',
            default => null,
        };

        if ($key !== null) {
            $stats[$key] = intval($stats[$key] ?? 0) + 1;
        }
    }

    private static function buildPairPairRows(array $scorecardRows, array $gameRow, array $meta): array
    {
        $out = [];

        foreach ($scorecardRows as $row) {
            $players = is_array($row['players'] ?? null) ? $row['players'] : [];
            if (!$players) continue;

            $ctx = self::extractRowContext($row);
            $scopedHoles = self::scopedHolesForRow($ctx, $gameRow);
            $metricKey = self::summaryMetricCellKey($ctx, $gameRow);

            $sides = self::groupPlayersByFlightPos($players);
            if (!$sides) continue;

            $sideKeys = array_keys($sides);
            usort($sideKeys, fn($a, $b) => strnatcmp((string)$a, (string)$b));

            $leftKey = $sideKeys[0] ?? null;
            $rightKey = $sideKeys[1] ?? null;

            $leftPlayers = $leftKey !== null ? ($sides[$leftKey] ?? []) : [];
            $rightPlayers = $rightKey !== null ? ($sides[$rightKey] ?? []) : [];

            $leftPairingId = self::firstPairingId($leftPlayers);
            $rightPairingId = self::firstPairingId($rightPlayers);

            $leftTotal = self::findTotalRowForPairingAndFlightPos($row['columnTotals'] ?? [], $leftPairingId, $leftKey);
            $rightTotal = self::findTotalRowForPairingAndFlightPos($row['columnTotals'] ?? [], $rightPairingId, $rightKey);

            $leftGross = self::metricFromTotalRow($leftTotal, 'grossDiff', $metricKey);
            $leftNet = self::metricFromTotalRow($leftTotal, 'netDiff', $metricKey);

            $rightGross = self::metricFromTotalRow($rightTotal, 'grossDiff', $metricKey);
            $rightNet = self::metricFromTotalRow($rightTotal, 'netDiff', $metricKey);

            $scoringBasis = trim((string)($meta['scoringBasis'] ?? $gameRow['dbGames_ScoringBasis'] ?? 'Strokes'));
            $gameKpi = self::buildPairPairGameKpi($leftPlayers, $rightPlayers, $gameRow, $scoringBasis, $scopedHoles);

            $flightId = (string)($row['flightIDs'][0] ?? $row['flightID'] ?? $ctx['virtualFlightId'] ?? '');
            $spinPrefix = ($ctx['spinLabel'] ?? 'Round') !== 'Round'
                ? trim((string)$ctx['spinLabel']) . ' • '
                : '';

            $pairingLabel = $flightId !== ''
                ? ($spinPrefix . 'Match ' . $flightId)
                : ($spinPrefix . 'Pairings ' . trim((string)$leftPairingId) . ' / ' . trim((string)$rightPairingId));

            $leftSort = self::pairPairSortSeed($leftPlayers);

            $out[] = [
                'flightId' => $flightId,
                'matchLabel' => $pairingLabel,
                'matchLabelTop' => self::buildPairFieldLabel($leftPlayers),
                'matchLabelBottom' => self::buildPairFieldLabel($rightPlayers),

                'spinNumber' => $ctx['spinNumber'],
                'spinLabel' => $ctx['spinLabel'],
                'spinStartHole' => $ctx['spinStartHole'],
                'spinEndHole' => $ctx['spinEndHole'],
                'visibleHoles' => $ctx['visibleHoles'],
                'virtualFlightId' => $ctx['virtualFlightId'],
                'virtualPairingIds' => $ctx['virtualPairingIds'],
                'isRotationAware' => $ctx['isRotationAware'],

                'left' => [
                    'flightPos' => (string)$leftKey,
                    'pairingId' => (string)$leftPairingId,
                    'scoreCount' => self::countDeclaredScores($leftPlayers, $scopedHoles),
                    'grossDiffValue' => $leftGross['value'],
                    'grossDiffDisplay' => $leftGross['display'],
                    'netDiffValue' => $leftNet['value'],
                    'netDiffDisplay' => $leftNet['display'],
                    'gameValue' => $gameKpi['left']['total']['value'],
                    'gameDisplay' => $gameKpi['left']['total']['display'],
                    'gameSegments' => $gameKpi['left'],
                ],
                'right' => [
                    'flightPos' => (string)$rightKey,
                    'pairingId' => (string)$rightPairingId,
                    'scoreCount' => self::countDeclaredScores($rightPlayers, $scopedHoles),
                    'grossDiffValue' => $rightGross['value'],
                    'grossDiffDisplay' => $rightGross['display'],
                    'netDiffValue' => $rightNet['value'],
                    'netDiffDisplay' => $rightNet['display'],
                    'gameValue' => $gameKpi['right']['total']['value'],
                    'gameDisplay' => $gameKpi['right']['total']['display'],
                    'gameSegments' => $gameKpi['right'],
                ],
                'thru' => max(
                    self::deriveThru($leftPlayers, $scopedHoles),
                    self::deriveThru($rightPlayers, $scopedHoles)
                ),
                '_sort' => [
                    'flightId' => $leftSort['flightId'],
                    'flightPos' => $leftSort['flightPos'],
                    'pairingId' => $leftSort['pairingId'],
                    'pairingPos' => $leftSort['pairingPos'],
                    'lName' => $leftSort['lName'],
                    'spinNumber' => $ctx['spinNumber'],
                ],
            ];
        }

        usort($out, function (array $a, array $b): int {
            foreach (['flightId', 'flightPos', 'pairingId', 'pairingPos', 'lName'] as $key) {
                $cmp = strnatcmp((string)$a['_sort'][$key], (string)$b['_sort'][$key]);
                if ($cmp !== 0) return $cmp;
            }

            $cmp = (($a['_sort']['spinNumber'] ?? 1) <=> ($b['_sort']['spinNumber'] ?? 1));
            if ($cmp !== 0) return $cmp;

            return strnatcmp((string)($a['matchLabel'] ?? ''), (string)($b['matchLabel'] ?? ''));
        });

        foreach ($out as &$row) {
            unset($row['_sort']);
        }
        unset($row);

        return $out;
    }

    private static function buildPairPairGameKpi(array $leftPlayers, array $rightPlayers, array $gameRow, string $scoringBasis, array $scopedHoles): array
    {
        $basis = trim($scoringBasis);
        if (!in_array($basis, ['Holes', 'Skins'], true)) {
            return [
                'left' => self::emptyGameSegments(),
                'right' => self::emptyGameSegments(),
            ];
        }

        $metricMode = (trim((string)($gameRow['dbGames_ScoringMethod'] ?? 'NET')) === 'ADJ GROSS')
            ? 'gross'
            : 'net';

        $left = self::emptyGameSegments();
        $right = self::emptyGameSegments();

        $carry = 0;
        $holes = $scopedHoles ?: self::holesForGame($gameRow);

        foreach ($holes as $holeNumber) {
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';

            $leftScore = self::countedSideScoreForHole($leftPlayers, $holeNumber, $metricMode);
            $rightScore = self::countedSideScoreForHole($rightPlayers, $holeNumber, $metricMode);

            if ($leftScore === null || $rightScore === null) {
                continue;
            }

            if ($basis === 'Holes') {
                if ($leftScore < $rightScore) {
                    self::bumpGameSegment($left, $segmentKey, 1);
                    self::bumpGameSegment($right, $segmentKey, -1);
                } elseif ($rightScore < $leftScore) {
                    self::bumpGameSegment($left, $segmentKey, -1);
                    self::bumpGameSegment($right, $segmentKey, 1);
                }
                continue;
            }

            // Skins
            $carry++;

            if ($leftScore < $rightScore) {
                self::bumpGameSegment($left, $segmentKey, $carry);
                self::bumpGameSegment($right, $segmentKey, -$carry);
                $carry = 0;
            } elseif ($rightScore < $leftScore) {
                self::bumpGameSegment($left, $segmentKey, -$carry);
                self::bumpGameSegment($right, $segmentKey, $carry);
                $carry = 0;
            }
        }

        self::finalizeGameSegments($left);
        self::finalizeGameSegments($right);

        return [
            'left' => $left,
            'right' => $right,
        ];
    }

    private static function countedSideScoreForHole(array $players, int $holeNumber, string $metricMode): ?float
    {
        $sum = 0.0;
        $count = 0;
        $holeKey = 'h' . $holeNumber;

        foreach ($players as $player) {
            $cell = $player['holes'][$holeKey] ?? null;
            if (!is_array($cell) || empty($cell['declared'])) {
                continue;
            }

            $value = $cell[$metricMode] ?? null;
            if ($value === null || !is_numeric($value)) {
                continue;
            }

            $sum += (float)$value;
            $count++;
        }

        return $count > 0 ? $sum : null;
    }

    private static function emptyGameSegments(): array
    {
        return [
            'front' => ['value' => 0, 'display' => '0'],
            'back'  => ['value' => 0, 'display' => '0'],
            'total' => ['value' => 0, 'display' => '0'],
        ];
    }

    private static function bumpGameSegment(array &$segments, string $segmentKey, int $delta): void
    {
        $segments[$segmentKey]['value'] += $delta;
        $segments['total']['value'] += $delta;
    }

    private static function finalizeGameSegments(array &$segments): void
    {
        foreach (['front', 'back', 'total'] as $key) {
            $segments[$key]['display'] = self::formatGameDiff($segments[$key]['value']);
        }
    }

    private static function formatGameDiff(int|float $value): string
    {
        $n = (float)$value;
        if ($n > 0) return '+' . (string)(int)$n;
        if ($n < 0) return (string)(int)$n;
        return '0';
    }

    private static function buildPairFieldLabel(array $players): string
    {
        $parts = [];

        foreach ($players as $player) {
            $last = trim((string)($player['dbPlayers_LName'] ?? ''));
            $fullName = trim((string)($player['dbPlayers_Name'] ?? ''));

            if ($last !== '') {
                $parts[] = $last;
            } elseif ($fullName !== '') {
                $parts[] = $fullName;
            }
        }

        return implode(' • ', $parts);
    }

    private static function orderedPairingIds(array $row, array $playersByPairing): array
    {
        $ids = array_map('strval', array_keys($playersByPairing));
        $fromRow = array_map('strval', is_array($row['pairingIDs'] ?? null) ? $row['pairingIDs'] : []);

        if ($fromRow) {
            $seen = [];
            $ordered = [];
            foreach ($fromRow as $id) {
                if (isset($playersByPairing[$id]) && !isset($seen[$id])) {
                    $ordered[] = $id;
                    $seen[$id] = true;
                }
            }
            foreach ($ids as $id) {
                if (!isset($seen[$id])) $ordered[] = $id;
            }
            return $ordered;
        }

        usort($ids, fn($a, $b) => strnatcmp((string)$a, (string)$b));
        return $ids;
    }

    private static function groupPlayersByPairing(array $players): array
    {
        $out = [];
        foreach ($players as $player) {
            $pairingId = trim((string)(
                $player['pairingID']
                ?? $player['effectivePairingID']
                ?? $player['dbPlayers_PairingID']
                ?? '000'
            ));
            if ($pairingId === '') $pairingId = '000';
            $out[$pairingId][] = $player;
        }
        return $out;
    }

    private static function groupPlayersByFlightPos(array $players): array
    {
        $out = [];
        foreach ($players as $player) {
            $flightPos = trim((string)(
                $player['flightPos']
                ?? $player['virtualFlightPos']
                ?? $player['dbPlayers_FlightPos']
                ?? ''
            ));
            if ($flightPos === '') continue;
            $out[$flightPos][] = $player;
        }
        return $out;
    }

    private static function firstPairingId(array $players): string
    {
        $first = $players[0] ?? [];
        return trim((string)(
            $first['pairingID']
            ?? $first['effectivePairingID']
            ?? $first['dbPlayers_PairingID']
            ?? ''
        ));
    }

    private static function findTotalRowForPairing(array $totals, string $pairingId): ?array
    {
        $wanted = trim((string)$pairingId);

        foreach ($totals as $row) {
            $rowPairingId = trim((string)($row['pairingID'] ?? ''));
            if ($rowPairingId !== '' && $rowPairingId === $wanted) {
                return $row;
            }
        }

        $needle = 'PAIR ' . $wanted;
        foreach ($totals as $row) {
            $label = strtoupper(trim((string)($row['label'] ?? '')));
            if (str_contains($label, strtoupper($needle))) {
                return $row;
            }
        }

        return null;
    }

    private static function findTotalRowForPairingAndFlightPos(array $totals, string $pairingId, ?string $flightPos): ?array
    {
        $wantedPairingId = trim((string)$pairingId);
        $wantedFlightPos = trim((string)$flightPos);

        foreach ($totals as $row) {
            $rowPairingId = trim((string)($row['pairingID'] ?? ''));
            $rowFlightPos = trim((string)($row['flightPos'] ?? ''));

            if ($rowPairingId === $wantedPairingId && $rowFlightPos === $wantedFlightPos) {
                return $row;
            }
        }

        $pairNeedle = 'PAIR ' . $wantedPairingId;
        $teamNeedle = 'TEAM ' . $wantedFlightPos;

        foreach ($totals as $row) {
            $label = strtoupper(trim((string)($row['label'] ?? '')));
            if (str_contains($label, strtoupper($pairNeedle)) && str_contains($label, strtoupper($teamNeedle))) {
                return $row;
            }
        }

        return self::findTotalRowForPairing($totals, $pairingId);
    }

    private static function metricFromTotalRow(?array $totalRow, string $mode, string $cellKey = '9c'): array
    {
        $cell = is_array($totalRow['cells'][$cellKey] ?? null) ? $totalRow['cells'][$cellKey] : null;
        $display = '';
        $value = 0.0;

        if ($cell) {
            $display = (string)($cell['display'][$mode] ?? '');
            if (isset($cell[$mode]) && is_numeric($cell[$mode])) {
                $value = (float)$cell[$mode];
            } else {
                $value = self::displayToNumeric($display);
            }
        }

        return [
            'display' => $display !== '' ? $display : '—',
            'value' => $value,
        ];
    }

    private static function displayToNumeric(string $display): float
    {
        $display = trim($display);
        if ($display === '' || $display === '—') return 0.0;
        if (strcasecmp($display, 'E') === 0) return 0.0;
        return is_numeric($display) ? (float)$display : 0.0;
    }

    private static function countDeclaredScores(array $players, array $scopedHoles): int
    {
        $count = 0;
        $holeKeys = array_map(fn($n) => 'h' . intval($n), $scopedHoles);

        foreach ($players as $player) {
            $holes = is_array($player['holes'] ?? null) ? $player['holes'] : [];
            foreach ($holeKeys as $holeKey) {
                $cell = $holes[$holeKey] ?? null;
                if (is_array($cell) && !empty($cell['declared'])) {
                    $count++;
                }
            }
        }

        return $count;
    }

    private static function deriveThru(array $players, array $scopedHoles): int
    {
        $max = 0;

        foreach ($players as $player) {
            $holes = is_array($player['holes'] ?? null) ? $player['holes'] : [];
            foreach ($scopedHoles as $holeNumber) {
                $cell = $holes['h' . $holeNumber] ?? null;
                if (is_array($cell) && ($cell['gross'] ?? null) !== null) {
                    $max = max($max, $holeNumber);
                }
            }
        }

        return $max;
    }

    private static function holesForGame(array $gameRow): array
    {
        $holesLabel = trim((string)($gameRow['dbGames_Holes'] ?? 'All 18'));
        if ($holesLabel === 'F9') return range(1, 9);
        if ($holesLabel === 'B9') return range(10, 18);
        return range(1, 18);
    }

    private static function pairPairSortSeed(array $players): array
    {
        $first = $players[0] ?? [];
        return [
            'flightId' => trim((string)(
                $first['flightID']
                ?? $first['effectiveFlightID']
                ?? $first['dbPlayers_FlightID']
                ?? ''
            )),
            'flightPos' => trim((string)(
                $first['flightPos']
                ?? $first['virtualFlightPos']
                ?? $first['dbPlayers_FlightPos']
                ?? ''
            )),
            'pairingId' => trim((string)(
                $first['pairingID']
                ?? $first['effectivePairingID']
                ?? $first['dbPlayers_PairingID']
                ?? ''
            )),
            'pairingPos' => trim((string)($first['dbPlayers_PairingPos'] ?? '')),
            'lName' => trim((string)($first['dbPlayers_LName'] ?? '')),
        ];
    }
}