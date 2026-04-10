<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreSummary.php

require_once __DIR__ . '/service_ScoreCard.php';

final class ServiceScoreSummary
{
    public static function buildScoreSummaryPayload(array $gameRow, array $players): array
    {
        if (!$gameRow) {
            throw new RuntimeException('buildScoreSummaryPayload: missing gameRow');
        }

        $scorecards = ServiceScoreCard::buildGameScorecardsPayload($gameRow, $players);
        $competition = trim((string)($scorecards['competition'] ?? $gameRow['dbGames_Competition'] ?? 'PairField'));
        $meta = is_array($scorecards['meta'] ?? null) ? $scorecards['meta'] : [];

        $rows = ($competition === 'PairPair')
            ? self::buildPairPairRows($scorecards['rows'] ?? [], $gameRow, $meta)
            : self::buildPairFieldRows($scorecards['rows'] ?? [], $gameRow, $meta);

        return [
            'mode' => 'game',
            'competition' => $competition,
            'rows' => $rows,
            'meta' => array_merge($meta, [
                'rowCount' => count($rows),
            ]),
        ];
    }

    private static function buildPairFieldRows(array $scorecardRows, array $gameRow, array $meta): array
    {
        $out = [];

        foreach ($scorecardRows as $row) {
            $playersByPairing = self::groupPlayersByPairing($row['players'] ?? []);
            $pairingIds = self::orderedPairingIds($row, $playersByPairing);

            foreach ($pairingIds as $pairingId) {
                $pairPlayers = $playersByPairing[$pairingId] ?? [];
                if (!$pairPlayers) {
                    continue;
                }

                $totalRow = self::findTotalRowForPairing($row['columnTotals'] ?? [], $pairingId);

                $gross = self::metricFromTotalRow($totalRow, 'grossDiff');
                $net = self::metricFromTotalRow($totalRow, 'netDiff');
                $points = self::metricFromTotalRow($totalRow, 'points');

                $out[] = [
                    'pairingId' => (string)$pairingId,
                    'pairingLabel' => 'Pairing ' . (string)$pairingId,
                    'scoreCount' => self::countDeclaredScores($pairPlayers),
                    'grossDiffValue' => $gross['value'],
                    'grossDiffDisplay' => $gross['display'],
                    'netDiffValue' => $net['value'],
                    'netDiffDisplay' => $net['display'],
                    'pointsValue' => $points['value'],
                    'pointsDisplay' => $points['display'],
                    'thru' => self::deriveThru($pairPlayers, $gameRow),
                ];
            }
        }

        $basis = strtolower((string)($meta['scoringBasis'] ?? 'Strokes'));
        usort($out, function (array $a, array $b) use ($basis): int {
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
        });

        return $out;
    }

    private static function buildPairPairRows(array $scorecardRows, array $gameRow, array $meta): array
    {
        $out = [];

        foreach ($scorecardRows as $row) {
            $players = is_array($row['players'] ?? null) ? $row['players'] : [];
            if (!$players) continue;

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

            $leftGross = self::metricFromTotalRow($leftTotal, 'grossDiff');
            $leftNet = self::metricFromTotalRow($leftTotal, 'netDiff');

            $rightGross = self::metricFromTotalRow($rightTotal, 'grossDiff');
            $rightNet = self::metricFromTotalRow($rightTotal, 'netDiff');

            $flightId = (string)($row['flightIDs'][0] ?? $row['flightID'] ?? '');
            $pairingLabel = $flightId !== ''
                ? 'Match ' . $flightId
                : ('Pairings ' . trim((string)$leftPairingId) . ' / ' . trim((string)$rightPairingId));

            $leftSort = self::pairPairSortSeed($leftPlayers);
            $rightSort = self::pairPairSortSeed($rightPlayers);

            $out[] = [
                'flightId' => $flightId,
                'matchLabel' => $pairingLabel,
                'left' => [
                    'flightPos' => (string)$leftKey,
                    'pairingId' => (string)$leftPairingId,
                    'scoreCount' => self::countDeclaredScores($leftPlayers),
                    'grossDiffValue' => $leftGross['value'],
                    'grossDiffDisplay' => $leftGross['display'],
                    'netDiffValue' => $leftNet['value'],
                    'netDiffDisplay' => $leftNet['display'],
                ],
                'right' => [
                    'flightPos' => (string)$rightKey,
                    'pairingId' => (string)$rightPairingId,
                    'scoreCount' => self::countDeclaredScores($rightPlayers),
                    'grossDiffValue' => $rightGross['value'],
                    'grossDiffDisplay' => $rightGross['display'],
                    'netDiffValue' => $rightNet['value'],
                    'netDiffDisplay' => $rightNet['display'],
                ],
                'thru' => max(
                    self::deriveThru($leftPlayers, $gameRow),
                    self::deriveThru($rightPlayers, $gameRow)
                ),
                '_sort' => [
                    'flightId' => $leftSort['flightId'],
                    'flightPos' => $leftSort['flightPos'],
                    'pairingId' => $leftSort['pairingId'],
                    'pairingPos' => $leftSort['pairingPos'],
                    'lName' => $leftSort['lName'],
                ],
            ];
        }

        usort($out, function (array $a, array $b): int {
            foreach (['flightId', 'flightPos', 'pairingId', 'pairingPos', 'lName'] as $key) {
                $cmp = strnatcmp((string)$a['_sort'][$key], (string)$b['_sort'][$key]);
                if ($cmp !== 0) return $cmp;
            }
            return strnatcmp((string)($a['matchLabel'] ?? ''), (string)($b['matchLabel'] ?? ''));
        });

        foreach ($out as &$row) {
            unset($row['_sort']);
        }
        unset($row);

        return $out;
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
            $pairingId = trim((string)($player['dbPlayers_PairingID'] ?? '000'));
            if ($pairingId === '') $pairingId = '000';
            $out[$pairingId][] = $player;
        }
        return $out;
    }

    private static function groupPlayersByFlightPos(array $players): array
    {
        $out = [];
        foreach ($players as $player) {
            $flightPos = trim((string)($player['dbPlayers_FlightPos'] ?? ''));
            if ($flightPos === '') continue;
            $out[$flightPos][] = $player;
        }
        return $out;
    }

    private static function firstPairingId(array $players): string
    {
        $first = $players[0] ?? [];
        return trim((string)($first['dbPlayers_PairingID'] ?? ''));
    }

    private static function findTotalRowForPairing(array $totals, string $pairingId): ?array
    {
        $needle = 'PAIR ' . trim((string)$pairingId);
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
        $pairNeedle = 'PAIR ' . trim((string)$pairingId);
        $teamNeedle = 'TEAM ' . trim((string)$flightPos);

        foreach ($totals as $row) {
            $label = strtoupper(trim((string)($row['label'] ?? '')));
            if (str_contains($label, strtoupper($pairNeedle)) && str_contains($label, strtoupper($teamNeedle))) {
                return $row;
            }
        }

        return self::findTotalRowForPairing($totals, $pairingId);
    }

    private static function metricFromTotalRow(?array $totalRow, string $mode): array
    {
        $cell = is_array($totalRow['cells']['9c'] ?? null) ? $totalRow['cells']['9c'] : null;
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

    private static function countDeclaredScores(array $players): int
    {
        $count = 0;
        foreach ($players as $player) {
            $holes = is_array($player['holes'] ?? null) ? $player['holes'] : [];
            foreach ($holes as $hole) {
                if (!empty($hole['declared'])) {
                    $count++;
                }
            }
        }
        return $count;
    }

    private static function deriveThru(array $players, array $gameRow): int
    {
        $holesToCheck = self::holesForGame($gameRow);
        $max = 0;

        foreach ($players as $player) {
            $holes = is_array($player['holes'] ?? null) ? $player['holes'] : [];
            foreach ($holesToCheck as $holeNumber) {
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
            'flightId' => trim((string)($first['dbPlayers_FlightID'] ?? '')),
            'flightPos' => trim((string)($first['dbPlayers_FlightPos'] ?? '')),
            'pairingId' => trim((string)($first['dbPlayers_PairingID'] ?? '')),
            'pairingPos' => trim((string)($first['dbPlayers_PairingPos'] ?? '')),
            'lName' => trim((string)($first['dbPlayers_LName'] ?? '')),
        ];
    }
}