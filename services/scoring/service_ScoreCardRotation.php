<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreCardRotation.php

require_once __DIR__ . '/service_ScoreCard.php';
require_once __DIR__ . '/service_ScoreRotation.php';

/**
 * ServiceScoreCardRotation
 *
 * Second-layer scorecard normalizer.
 *
 * Responsibilities:
 * - consume the baseline scorecard payload produced by ServiceScoreCard
 * - normalize PairPair rows to one consistent outward shape for spin and non-spin
 * - preserve one outward row shape for PairField as well
 * - reuse ServiceScoreRotation helpers without polluting ServiceScoreCard
 *
 * Notes:
 * - Acquisition stays upstream in initSharedScoreCard.php
 * - Baseline scorecard construction stays in ServiceScoreCard
 * - This file only reshapes the scorecard payload for the page
 */
final class ServiceScoreCardRotation
{
    public static function buildScorecardPayload(
        array $gameRow,
        array $baselineScorecards,
        array $hydratedPlayers = [],
        string $mode = 'game',
        string $scope = ''
    ): array {
        if (!$gameRow) {
            return $baselineScorecards;
        }

        $mode = strtolower(trim($mode !== '' ? $mode : (string)($baselineScorecards['mode'] ?? 'game')));
        $scope = trim($scope);

        // Always normalize from a GAME baseline so group/player can be derived
        // from a single consistent normalized game contract.
        $gameBaseline = self::resolveGameBaselinePayload($gameRow, $baselineScorecards, $hydratedPlayers);
        $normalizedGame = self::buildNormalizedGamePayload($gameRow, $gameBaseline);

        return self::projectModeFromNormalizedGame($normalizedGame, $mode, $scope, $hydratedPlayers);
    }

    private static function resolveGameBaselinePayload(
        array $gameRow,
        array $baselineScorecards,
        array $hydratedPlayers
    ): array {
        $baselineMode = strtolower(trim((string)($baselineScorecards['mode'] ?? 'game')));

        if ($baselineMode === 'game' && !empty($baselineScorecards['rows'])) {
            return $baselineScorecards;
        }

        if ($hydratedPlayers) {
            return ServiceScoreCard::buildGameScorecardsPayload($gameRow, $hydratedPlayers);
        }

        return $baselineScorecards;
    }

    private static function buildNormalizedGamePayload(array $gameRow, array $gameBaseline): array
    {
        $rows = [];
        foreach (($gameBaseline['rows'] ?? []) as $baselineRow) {
            foreach (self::normalizeBaselineRow($gameRow, $baselineRow) as $normalizedRow) {
                $rows[] = $normalizedRow;
            }
        }

        return [
            'mode' => 'game',
            'competition' => (string)($gameBaseline['competition'] ?? $gameRow['dbGames_Competition'] ?? 'PairField'),
            'grouping' => (string)($gameBaseline['grouping'] ?? ''),
            'rows' => $rows,
            'meta' => $gameBaseline['meta'] ?? [],
        ];
    }

    private static function normalizeBaselineRow(array $gameRow, array $baselineRow): array
    {
        $baselinePlayers = is_array($baselineRow['players'] ?? null) ? $baselineRow['players'] : [];
        if (!$baselinePlayers) {
            return [self::stampPassthroughRow($baselineRow, $gameRow)];
        }

        $rotation = ServiceScoreRotation::buildNormalizedContexts($gameRow, $baselinePlayers, 1, []);
        $contexts = is_array($rotation['virtualContexts'] ?? null) ? $rotation['virtualContexts'] : [];

        if (!$contexts) {
            return [self::stampPassthroughRow($baselineRow, $gameRow)];
        }

        $normalizedRows = [];
        foreach ($contexts as $context) {
            $contextPlayers = self::stampPlayersForContext($baselinePlayers, $context);
            $contextPlayers = self::sortPlayersForContext($contextPlayers);

            $visibleHoles = self::normalizeVisibleHoles($context['visibleHoles'] ?? self::holesForGame($gameRow));
            $contextTotals = self::buildColumnTotalsForContext($gameRow, $contextPlayers, $visibleHoles);

            $row = $baselineRow;
            $row['rowId'] = (string)($context['virtualPlayerKey'] ?? $context['baselinePlayerKey'] ?? $baselineRow['groupId'] ?? '000');
            $row['groupId'] = $row['rowId'];

            $row['competition'] = trim((string)($gameRow['dbGames_Competition'] ?? 'PairField'));
            $row['grouping'] = (string)($baselineRow['grouping'] ?? '');

            $row['baselinePlayerKey'] = (string)($context['baselinePlayerKey'] ?? '');
            $row['baselineFlightID'] = (string)($context['baselineFlightID'] ?? '');
            $row['baselinePairingIDs'] = array_values(array_map('strval', $context['baselinePairingIDs'] ?? []));

            $row['virtualPlayerKey'] = (string)($context['virtualPlayerKey'] ?? $row['baselinePlayerKey']);
            $row['virtualFlightID'] = (string)($context['virtualFlightID'] ?? $row['baselineFlightID']);
            $row['virtualPairingIDs'] = array_values(array_map('strval', $context['virtualPairingIDs'] ?? []));

            $row['isRotationAware'] = !empty($rotation['isRotationAware']);
            $row['spinNumber'] = intval($context['spinNumber'] ?? 1);
            $row['spinLabel'] = (string)($context['spinLabel'] ?? 'Round');
            $row['spinStartHole'] = intval($context['spinStartHole'] ?? (min($visibleHoles) ?: 1));
            $row['spinEndHole'] = intval($context['spinEndHole'] ?? (max($visibleHoles) ?: 18));
            $row['visibleHoles'] = $visibleHoles;

            // outward page fields
            $row['pairingIDs'] = $row['virtualPairingIDs'] ?: array_values(array_map('strval', $baselineRow['pairingIDs'] ?? []));
            $row['flightIDs'] = $row['virtualFlightID'] !== ''
                ? [$row['virtualFlightID']]
                : array_values(array_map('strval', $baselineRow['flightIDs'] ?? []));

            $row['players'] = $contextPlayers;
            $row['columnTotals'] = $contextTotals;

            if (is_array($row['gameHeader'] ?? null)) {
                $row['gameHeader']['playerKey'] = $row['virtualPlayerKey'];
                $row['gameHeader']['spinNumber'] = $row['spinNumber'];
                $row['gameHeader']['spinLabel'] = $row['spinLabel'];
                $row['gameHeader']['spinStartHole'] = $row['spinStartHole'];
                $row['gameHeader']['spinEndHole'] = $row['spinEndHole'];
                $row['gameHeader']['visibleHoles'] = $row['visibleHoles'];
            }

            $normalizedRows[] = $row;
        }

        return $normalizedRows;
    }

    private static function stampPassthroughRow(array $row, array $gameRow): array
    {
        $visibleHoles = self::holesForGame($gameRow);

        $row['rowId'] = (string)($row['groupId'] ?? '000');
        $row['baselinePlayerKey'] = (string)($row['groupId'] ?? '');
        $row['baselineFlightID'] = (string)($row['flightID'] ?? '');
        $row['baselinePairingIDs'] = array_values(array_map('strval', $row['pairingIDs'] ?? []));

        $row['virtualPlayerKey'] = (string)($row['groupId'] ?? '');
        $row['virtualFlightID'] = (string)($row['flightID'] ?? '');
        $row['virtualPairingIDs'] = array_values(array_map('strval', $row['pairingIDs'] ?? []));

        $row['isRotationAware'] = false;
        $row['spinNumber'] = 1;
        $row['spinLabel'] = 'Round';
        $row['spinStartHole'] = min($visibleHoles) ?: 1;
        $row['spinEndHole'] = max($visibleHoles) ?: 18;
        $row['visibleHoles'] = $visibleHoles;

        return $row;
    }

    private static function projectModeFromNormalizedGame(
        array $normalizedGame,
        string $mode,
        string $scope,
        array $hydratedPlayers
    ): array {
        if ($mode === 'game') {
            return $normalizedGame;
        }

        $selectedPlayer = self::findSelectedPlayer($hydratedPlayers, $scope);

        if (!$selectedPlayer) {
            return [
                'mode' => $mode,
                'competition' => (string)($normalizedGame['competition'] ?? ''),
                'grouping' => (string)($normalizedGame['grouping'] ?? ''),
                'rows' => [],
                'meta' => $normalizedGame['meta'] ?? [],
            ];
        }

        $selectedGroupKey = self::normStr($selectedPlayer['dbPlayers_PlayerKey'] ?? '', '000');
        $selectedIdentity = self::playerIdentity($selectedPlayer);

        $rows = array_values(array_filter(
            $normalizedGame['rows'] ?? [],
            static fn(array $row): bool =>
                self::normStr($row['baselinePlayerKey'] ?? '', '000') === $selectedGroupKey
        ));

        if ($mode === 'player') {
            foreach ($rows as &$row) {
                $row['players'] = array_values(array_filter(
                    $row['players'] ?? [],
                    static fn(array $player): bool => self::playerIdentity($player) === $selectedIdentity
                ));

                $row['meta'] = array_merge((array)($row['meta'] ?? []), [
                    'selectedPlayerId' => $selectedIdentity,
                ]);
            }
            unset($row);
        }

        return [
            'mode' => $mode,
            'competition' => (string)($normalizedGame['competition'] ?? ''),
            'grouping' => (string)($normalizedGame['grouping'] ?? ''),
            'rows' => $rows,
            'meta' => array_merge((array)($normalizedGame['meta'] ?? []), [
                'selectedPlayerId' => $mode === 'player' ? $selectedIdentity : null,
            ]),
        ];
    }

    private static function stampPlayersForContext(array $baselinePlayers, array $context): array
    {
        $contextPlayers = is_array($context['players'] ?? null) ? $context['players'] : [];
        if (!$contextPlayers) {
            return $baselinePlayers;
        }

        $byGHIN = [];
        foreach ($contextPlayers as $contextPlayer) {
            $ghin = self::normStr($contextPlayer['dbPlayers_PlayerGHIN'] ?? '', '');
            if ($ghin !== '') {
                $byGHIN[$ghin] = $contextPlayer;
            }
        }

        $players = [];
        foreach ($baselinePlayers as $player) {
            $row = $player;
            $ghin = self::normStr($player['dbPlayers_PlayerGHIN'] ?? '', '');

            if ($ghin !== '' && isset($byGHIN[$ghin])) {
                $contextPlayer = $byGHIN[$ghin];

                $row['baselinePlayerKey'] = (string)($contextPlayer['baselinePlayerKey'] ?? '');
                $row['baselineFlightID'] = (string)($contextPlayer['baselineFlightID'] ?? '');
                $row['baselinePairingID'] = (string)($contextPlayer['baselinePairingID'] ?? '');

                $row['effectivePlayerKey'] = (string)($contextPlayer['effectivePlayerKey'] ?? '');
                $row['effectiveFlightID'] = (string)($contextPlayer['effectiveFlightID'] ?? '');
                $row['effectivePairingID'] = (string)($contextPlayer['effectivePairingID'] ?? '');
                $row['virtualFlightPos'] = (string)($contextPlayer['virtualFlightPos'] ?? '');

                // outward-friendly aliases for renderers
                $row['pairingID'] = $row['effectivePairingID'];
                $row['flightID'] = $row['effectiveFlightID'];
                $row['flightPos'] = $row['virtualFlightPos'];
            }

            $players[] = $row;
        }

        return $players;
    }

    private static function sortPlayersForContext(array $players): array
    {
        usort($players, static function (array $a, array $b): int {
            $aFlight = self::normStr($a['flightID'] ?? $a['effectiveFlightID'] ?? $a['dbPlayers_FlightID'] ?? '', 'ZZZ');
            $bFlight = self::normStr($b['flightID'] ?? $b['effectiveFlightID'] ?? $b['dbPlayers_FlightID'] ?? '', 'ZZZ');
            if ($aFlight !== $bFlight) {
                return strcmp($aFlight, $bFlight);
            }

            $aSide = self::normStr($a['flightPos'] ?? $a['virtualFlightPos'] ?? $a['dbPlayers_FlightPos'] ?? '', 'Z');
            $bSide = self::normStr($b['flightPos'] ?? $b['virtualFlightPos'] ?? $b['dbPlayers_FlightPos'] ?? '', 'Z');
            if ($aSide !== $bSide) {
                return strcmp($aSide, $bSide);
            }

            $aPair = self::normStr($a['pairingID'] ?? $a['effectivePairingID'] ?? $a['dbPlayers_PairingID'] ?? '', 'ZZZ');
            $bPair = self::normStr($b['pairingID'] ?? $b['effectivePairingID'] ?? $b['dbPlayers_PairingID'] ?? '', 'ZZZ');
            if ($aPair !== $bPair) {
                return strcmp($aPair, $bPair);
            }

            $aPos = self::normInt($a['dbPlayers_PairingPos'] ?? null, 999);
            $bPos = self::normInt($b['dbPlayers_PairingPos'] ?? null, 999);
            if ($aPos !== $bPos) {
                return $aPos <=> $bPos;
            }

            $aLast = self::normStr($a['dbPlayers_LName'] ?? '', '');
            $bLast = self::normStr($b['dbPlayers_LName'] ?? '', '');
            if ($aLast !== $bLast) {
                return strcmp($aLast, $bLast);
            }

            return strcmp(
                self::normStr($a['dbPlayers_Name'] ?? '', ''),
                self::normStr($b['dbPlayers_Name'] ?? '', '')
            );
        });

        return $players;
    }

    private static function buildColumnTotalsForContext(array $gameRow, array $players, array $visibleHoles): array
    {
        $competition = trim((string)($gameRow['dbGames_Competition'] ?? 'PairField'));
        $pairings = [];

        foreach ($players as $player) {
            $pairingId = self::normStr($player['pairingID'] ?? $player['effectivePairingID'] ?? $player['dbPlayers_PairingID'] ?? '', '000');
            $pairings[$pairingId][] = $player;
        }

        ksort($pairings);

        $totalRows = [];
        foreach ($pairings as $pairingId => $pairPlayers) {
            $label = 'PAIR ' . $pairingId . ' TOTAL';

            if ($competition === 'PairPair') {
                $flightPos = self::normStr($pairPlayers[0]['flightPos'] ?? $pairPlayers[0]['virtualFlightPos'] ?? '', '');
                if ($flightPos !== '') {
                    $label = 'TEAM ' . $flightPos . ' · PAIR ' . $pairingId . ' TOTAL';
                }
            }

            $totalRows[] = [
                'label' => $label,
                'pairingID' => $pairingId,
                'flightPos' => $competition === 'PairPair'
                    ? self::normStr($pairPlayers[0]['flightPos'] ?? $pairPlayers[0]['virtualFlightPos'] ?? '', '')
                    : '',
                'cells' => self::calculateTeamTotalsForContext($visibleHoles, $pairPlayers),
            ];
        }

        return $totalRows;
    }

    private static function calculateTeamTotalsForContext(array $visibleHoles, array $players): array
    {
        $rowCells = [];
        $sums = ['gross' => [], 'net' => [], 'grossDiff' => [], 'netDiff' => [], 'points' => []];

        foreach ($visibleHoles as $holeNumber) {
            foreach ($players as $player) {
                $cell = $player['holes']['h' . $holeNumber] ?? null;
                if ($cell && !empty($cell['declared']) && ($cell['gross'] ?? null) !== null) {
                    $par = floatval($cell['par'] ?? 0);
                    $gross = floatval($cell['gross']);
                    $net = floatval($cell['net'] ?? $gross);

                    $sums['gross'][$holeNumber] = ($sums['gross'][$holeNumber] ?? 0.0) + $gross;
                    $sums['net'][$holeNumber] = ($sums['net'][$holeNumber] ?? 0.0) + $net;
                    $sums['grossDiff'][$holeNumber] = ($sums['grossDiff'][$holeNumber] ?? 0.0) + ($gross - $par);
                    $sums['netDiff'][$holeNumber] = ($sums['netDiff'][$holeNumber] ?? 0.0) + ($net - $par);
                    $sums['points'][$holeNumber] = ($sums['points'][$holeNumber] ?? 0.0) + floatval($cell['points'] ?? 0);
                }
            }

            if (isset($sums['gross'][$holeNumber])) {
                $rowCells['h' . $holeNumber] = [
                    'display' => [
                        'gross' => self::formatMaybeNumber($sums['gross'][$holeNumber]),
                        'net' => self::formatMaybeNumber($sums['net'][$holeNumber]),
                        'grossDiff' => self::formatDiffDisplay($sums['grossDiff'][$holeNumber]),
                        'netDiff' => self::formatDiffDisplay($sums['netDiff'][$holeNumber]),
                        'points' => self::formatMaybeNumber($sums['points'][$holeNumber]),
                    ]
                ];
            } else {
                $rowCells['h' . $holeNumber] = '';
            }
        }

        foreach (['gross', 'net', 'grossDiff', 'netDiff', 'points'] as $mode) {
            $segments = self::splitTotalFromVisibleHoles($visibleHoles, $sums[$mode], str_ends_with($mode, 'Diff'));
            foreach ($segments as $segmentKey => $segmentValue) {
                if (!isset($rowCells[$segmentKey])) {
                    $rowCells[$segmentKey] = ['display' => []];
                }
                $rowCells[$segmentKey]['display'][$mode] = $segmentValue;
            }
        }

        return $rowCells;
    }

    private static function splitTotalFromVisibleHoles(array $visibleHoles, array $kpiMap, bool $diffMode = false): array
    {
        $holes = self::normalizeVisibleHoles($visibleHoles);
        $sum = static function (array $source, bool $isDiff) {
            $total = 0.0;
            $any = false;
            foreach ($source as $value) {
                if ($value !== null && $value !== '') {
                    $total += floatval($value);
                    $any = true;
                }
            }
            if (!$any) {
                return '-';
            }
            if ($isDiff) {
                return self::formatDiffDisplay($total);
            }
            $rounded = round($total);
            if (abs($total - $rounded) < 0.0001) {
                return (string)intval($rounded);
            }
            return number_format($total, 1);
        };

        $out = [];
        $segStr = (count($holes) === 18) ? '6' : (count($holes) === 9 ? '9' : '6');

        if (count($holes) === 18) {
            $chunks = array_chunk($holes, 6);
            $keys = ['6a', '6b', '6c'];
        } elseif (count($holes) === 9) {
            $chunks = [array_slice($holes, 0, 9)];
            $keys = [min($holes) <= 9 ? '9a' : '9b'];
        } else {
            $chunks = [array_values($holes)];
            $keys = [self::segmentKeyForVisibleHoles($holes)];
        }

        foreach ($chunks as $index => $chunk) {
            $values = [];
            foreach ($chunk as $holeNumber) {
                $values[] = $kpiMap[$holeNumber] ?? null;
            }
            $out[$keys[$index]] = $sum($values, $diffMode);
        }

        if (count($holes) === 18) {
            $out['9a'] = $out['6a'] !== '-' || $out['6b'] !== '-'
                ? $sum([self::displayToNumeric($out['6a']), self::displayToNumeric($out['6b'])], $diffMode)
                : '-';
            $out['9b'] = $out['6c'] !== '-'
                ? $sum(array_map(static fn(int $h) => $kpiMap[$h] ?? null, array_slice($holes, 9, 9)), $diffMode)
                : '-';
            $out['9c'] = $sum(array_map(static fn(int $h) => $kpiMap[$h] ?? null, $holes), $diffMode);
        } elseif (count($holes) === 9) {
            $onlyKey = $keys[0];
            $out['9c'] = $out[$onlyKey];
        } else {
            $onlyKey = $keys[0];
            $out['9c'] = $out[$onlyKey];
        }

        return $out;
    }

    private static function segmentKeyForVisibleHoles(array $visibleHoles): string
    {
        $holes = self::normalizeVisibleHoles($visibleHoles);
        $start = $holes[0] ?? 1;
        $end = $holes[count($holes) - 1] ?? $start;

        if ($start === 1 && $end === 6) return '6a';
        if ($start === 7 && $end === 12) return '6b';
        if ($start === 13 && $end === 18) return '6c';
        if ($start === 1 && $end === 9) return '9a';
        if ($start === 10 && $end === 18) return '9b';

        return '9c';
    }

    private static function normalizeVisibleHoles(array $visibleHoles): array
    {
        $holes = array_values(array_filter(array_map('intval', $visibleHoles), static fn(int $n): bool => $n > 0));
        sort($holes, SORT_NUMERIC);
        return $holes;
    }

    private static function findSelectedPlayer(array $players, string $selectedPlayerId): ?array
    {
        $selectedPlayerId = trim((string)$selectedPlayerId);
        if ($selectedPlayerId === '') {
            return null;
        }

        foreach ($players as $player) {
            $candidates = [
                self::normStr($player['dbPlayers_PlayerGHIN'] ?? ''),
                self::normStr($player['dbPlayers_PlayerKey'] ?? ''),
            ];
            foreach ($candidates as $candidate) {
                if ($candidate !== '' && $candidate === $selectedPlayerId) {
                    return $player;
                }
            }
        }

        return null;
    }

    private static function playerIdentity(array $player): string
    {
        $ghin = self::normStr($player['dbPlayers_PlayerGHIN'] ?? '');
        if ($ghin !== '') {
            return $ghin;
        }

        return self::normStr($player['dbPlayers_PlayerKey'] ?? '');
    }

    private static function normStr($value, string $fallback = ''): string
    {
        $str = trim((string)($value ?? ''));
        return $str !== '' ? $str : $fallback;
    }

    private static function normInt($value, int $fallback = 0): int
    {
        $str = trim((string)($value ?? ''));
        return is_numeric($str) ? (int)$str : $fallback;
    }

    private static function formatMaybeNumber($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (!is_numeric($value)) {
            return (string)$value;
        }

        $float = floatval($value);
        if (abs($float - round($float)) < 0.00001) {
            return (string)intval(round($float));
        }

        return number_format($float, 1);
    }

    private static function formatDiffDisplay($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (!is_numeric($value)) {
            return (string)$value;
        }

        $num = intval(round(floatval($value)));
        if ($num === 0) {
            return 'E';
        }

        return ($num > 0 ? '+' : '') . (string)$num;
    }

    private static function displayToNumeric($display): float
    {
        $display = trim((string)$display);
        if ($display === '' || $display === '-') {
            return 0.0;
        }
        if (strcasecmp($display, 'E') === 0) {
            return 0.0;
        }
        return is_numeric($display) ? floatval($display) : 0.0;
    }
}