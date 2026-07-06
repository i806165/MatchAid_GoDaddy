<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreSummary.php

require_once __DIR__ . '/service_ScoreCardRotation.php';
require_once __DIR__ . '/service_CalcSkins.php';
require_once __DIR__ . '/service_CalcPoints.php';

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
        $defaultValueMode = in_array($scoringBasis, ['Holes', 'Skins', 'Points'], true) ? 'game' : 'net';

        // PairPair only — 1 (default) or 3. Always normalized to 1 for PairField,
        // since the field has no meaning there (mirrors the save-side normalization
        // in ServiceDbGames::saveGameSettings).
        $scoringSegments = 1;
        if ($competition === 'PairPair') {
            $scoringSegments = (int)($gameRow['dbGames_ScoringSegments'] ?? 1);
            if (!in_array($scoringSegments, [1, 3], true)) $scoringSegments = 1;
        }

        return [
            'mode' => 'game',
            'competition' => $competition,
            'rows' => $rows,
            // Team rollup — computed server-side, not client-side, specifically
            // so event-level scoring (a separate, likely server-side aggregation
            // across multiple games) can consume this same data without
            // reimplementing the summation itself. Points are the field that
            // actually generalizes across rounds/formats for that purpose;
            // raw KPI sums are included for this page's own display only.
            'teamRollup' => self::buildTeamRollupRows($rows, $competition),
            // Individual rows — every player's own gross/net-to-par, from
            // totals.grossDiff/netDiff.9c already attached by
            // ServiceScoreCard::decorateScoredPlayers() upstream, for EVERY
            // game regardless of competition type. No individual match
            // outcome exists for PairPair (matches are decided pairing vs.
            // pairing), but each player's own score is still real data — and,
            // as of individualGross/individualNet, real ranking/points too:
            // the original §4.3 constraint ("no ranking/points at this grain")
            // has been reversed on purpose; see applyIndividualPlacementPoints().
            'individualRows' => self::applyIndividualPlacementPoints(
                self::buildIndividualRows($scorecards['rows'] ?? [], $gameRow),
                $gameRow
            ),
            'meta' => array_merge($meta, [
                'rowCount' => count($rows),
                'scoringBasis' => $scoringBasis,
                'defaultValueMode' => $defaultValueMode,
                'scoringSegments' => $scoringSegments,
                // Surfaced as a blocking pop-up by score_summary.js — see
                // checkTeamIntegrity()'s own comment for what it catches and why.
                'teamIntegrityWarning' => self::checkTeamIntegrity($scorecards['rows'] ?? [], $gameRow, $competition),
                // The one thing score_summary.js reads to decide column
                // headers ("Points" vs "Default Points"), pill-disabling, and
                // Leaderboard-tab suppression. Never consulted server-side to
                // decide whether to compute — see parsePlacementPoints().
                'placementPointsStates' => self::placementPointsStatesMap(self::parsePlacementPoints($gameRow)),
            ]),
        ];
    }

    /**
     * One row per player — PairField's Individual aggregate grain. Reads
     * totals.grossDiff/netDiff.9c (a plain formatted string, e.g. "+3"/"E"/"-",
     * per splitTotalFromMap()'s actual return shape — not a {value,display}
     * object like metricFromTotalRow's output) already attached upstream by
     * ServiceScoreCard::decorateScoredPlayers(). displayToNumeric() is the
     * same existing fallback parser already used elsewhere in this file for
     * the identical display-string-only situation.
     *
     * placementPointsGross/placementPointsNet are attached separately, after
     * this function returns, by applyIndividualPlacementPoints() — kept out
     * of this function so the "one row per player" data-assembly concern
     * stays separate from the "rank them" concern, the same separation
     * buildPairFieldRows already has between its own row-building and its
     * own placement-points block.
     */
    private static function buildIndividualRows(array $scorecardRows, array $gameRow): array
    {
        $out = [];
        $teamConfigById = self::parseTeamConfig($gameRow);
        // Rotation games (COD/1324/1423) produce one $scorecardRows entry per
        // spin, not per physical scorecard — the same physical players get
        // re-stamped with a different effectivePairingID in each spin's
        // context. totals.grossDiff/netDiff are computed once upstream,
        // independent of spin/pairing, and carried along unchanged on every
        // re-stamped copy — so the first occurrence of a given player is
        // already correct; later spin-context copies are pure duplicates,
        // not new or different data, and must be skipped rather than appended.
        $seenPlayerIds = [];

        // thru is the opposite situation from grossDiff/netDiff — it is NOT
        // safe to take from just the first-seen spin-context row. Each spin
        // row's scopedHoles is that spin's own narrow hole range (e.g. holes
        // 1-6 for spin 1), so deriveThru() computed against it would cap at
        // that spin's range even if the player has actually completed every
        // hole across all spins. Individual's thru needs the whole game's
        // hole range, computed once here, not per spin-context row.
        $fullGameHoles = self::holesForGame($gameRow);

        foreach ($scorecardRows as $row) {
            $players = is_array($row['players'] ?? null) ? $row['players'] : [];
            if (!$players) continue;

            foreach ($players as $player) {
                $playerId = (string)($player['playerId'] ?? $player['dbPlayers_PlayerGHIN'] ?? '');
                if ($playerId !== '' && isset($seenPlayerIds[$playerId])) {
                    continue;
                }
                if ($playerId !== '') {
                    $seenPlayerIds[$playerId] = true;
                }

                $teamKey = trim((string)($player['dbPlayers_TeamKey'] ?? ''));
                $teamInfo = $teamConfigById[$teamKey] ?? null;

                $grossDisplay = $player['totals']['grossDiff']['9c'] ?? null;
                $netDisplay = $player['totals']['netDiff']['9c'] ?? null;

                $fullName = trim((string)($player['dbPlayers_Name'] ?? ''));
                $lastName = trim((string)($player['dbPlayers_LName'] ?? ''));

                $out[] = [
                    'playerId' => $playerId,
                    // Full name for display; last name kept separately since
                    // it's the more natural sort key for a leaderboard list —
                    // avoids re-deriving it from playerName later.
                    'playerName' => $fullName ?: self::buildPairFieldLabel([$player]),
                    'playerLastName' => $lastName,
                    'grossDiffValue' => ($grossDisplay !== null) ? self::displayToNumeric((string)$grossDisplay) : null,
                    'grossDiffDisplay' => $grossDisplay ?? '—',
                    'netDiffValue' => ($netDisplay !== null) ? self::displayToNumeric((string)$netDisplay) : null,
                    'netDiffDisplay' => $netDisplay ?? '—',
                    'thru' => self::deriveThru([$player], $fullGameHoles),
                    'teamKey' => $teamKey !== '' ? $teamKey : null,
                    'teamName' => $teamInfo['name'] ?? null,
                    'teamColor' => $teamInfo['color'] ?? null,
                    'teamSort' => $teamInfo['sort'] ?? null,
                ];
            }
        }

        return $out;
    }

    /**
     * Ranks individualRows twice — once by gross, once by net — via the same
     * assignPlacementPoints() tie-aware rank-to-points mapper Pairing already
     * uses; it has no idea whether it's ranking pairings or individuals, per
     * the original handoff's scoping. Always computed regardless of the
     * individualGross/individualNet categories' active/disabled/default
     * state — state is display-only (score_summary.js), never a gate here.
     * A player who hasn't started (grossDiffValue/netDiffValue null) ranks as
     * if even-par, the same convention buildPairFieldRows already uses.
     */
    private static function applyIndividualPlacementPoints(array $individualRows, array $gameRow): array
    {
        $placement = self::parsePlacementPoints($gameRow);
        $grossCat = $placement['categories']['individualGross'];
        $netCat = $placement['categories']['individualNet'];

        $grossRankInput = [];
        $netRankInput = [];
        foreach ($individualRows as $idx => $row) {
            $grossRankInput[] = ['idx' => $idx, 'value' => (float)($row['grossDiffValue'] ?? 0)];
            $netRankInput[] = ['idx' => $idx, 'value' => (float)($row['netDiffValue'] ?? 0)];
        }
        $grossPts = self::assignPlacementPoints($grossRankInput, $grossCat['pointsConfig'], $grossCat['tieRule']);
        $netPts = self::assignPlacementPoints($netRankInput, $netCat['pointsConfig'], $netCat['tieRule']);

        foreach ($individualRows as $idx => &$row) {
            $row['placementPointsGross'] = $grossPts[$idx] ?? 0.0;
            $row['placementPointsNet'] = $netPts[$idx] ?? 0.0;
        }
        unset($row);

        return $individualRows;
    }

    /**
     * Sums Pairing-grain rows into Team-grain rows. Server-side by design —
     * see the call site's comment for why this can't just be client-side
     * arithmetic in score_leaderboard.js: event-level scoring needs to
     * consume this same rollup without a second implementation of it.
     *
     * PairField: sums raw KPI values (gross/net diff) and both Placement
     * Points rankings across every pairing sharing a team.
     *
     * PairPair: sums each side's overall matchStatus points across every
     * match, plus a Record (W-L-H tally) — the same Ryder-Cup-style
     * aggregation from §7.3. Segment-level (front/back) team sums are
     * deliberately not computed — only 'total' rolls up to Team, per the
     * still-open §3.8 question about whether segment-level Team sums are
     * even meaningful; skip rather than guess.
     *
     * Teams with no dbGames_TeamConfig entry (teamKey null) are excluded
     * entirely — an empty teamRollup array means "no team config," not zero
     * teams meaningfully computed to nothing.
     */
    private static function buildTeamRollupRows(array $rows, string $competition): array
    {
        $teams = [];

        if ($competition === 'PairPair') {
            foreach ($rows as $row) {
                foreach (['left', 'right'] as $side) {
                    $sideData = $row[$side] ?? [];
                    $teamKey = $sideData['teamKey'] ?? null;
                    if ($teamKey === null || $teamKey === '') continue;

                    if (!isset($teams[$teamKey])) {
                        $teams[$teamKey] = [
                            'teamKey' => $teamKey,
                            'teamName' => $sideData['teamName'] ?? null,
                            'teamColor' => $sideData['teamColor'] ?? null,
                            'teamSort' => $sideData['teamSort'] ?? null,
                            'record' => ['w' => 0, 'l' => 0, 'h' => 0],
                            'pointsTotal' => 0.0,
                        ];
                    }

                    $overall = $sideData['matchStatus']['total'] ?? null;
                    $status = $overall['status'] ?? null;
                    if ($status === 'W') $teams[$teamKey]['record']['w']++;
                    elseif ($status === 'L') $teams[$teamKey]['record']['l']++;
                    elseif ($status === 'H') $teams[$teamKey]['record']['h']++;

                    $teams[$teamKey]['pointsTotal'] += (float)($overall['points'] ?? 0);
                }
            }
        } else {
            foreach ($rows as $row) {
                $teamKey = $row['teamKey'] ?? null;
                if ($teamKey === null || $teamKey === '') continue;

                if (!isset($teams[$teamKey])) {
                    $hasGrossPts = ($row['placementPointsGross'] !== null);
                    $hasNetPts = ($row['placementPointsNet'] !== null);
                    $teams[$teamKey] = [
                        'teamKey' => $teamKey,
                        'teamName' => $row['teamName'] ?? null,
                        'teamColor' => $row['teamColor'] ?? null,
                        'teamSort' => $row['teamSort'] ?? null,
                        'grossDiffTotal' => 0.0,
                        'netDiffTotal' => 0.0,
                        'placementPointsGrossTotal' => $hasGrossPts ? 0.0 : null,
                        'placementPointsNetTotal' => $hasNetPts ? 0.0 : null,
                    ];
                }

                $teams[$teamKey]['grossDiffTotal'] += (float)($row['grossDiffValue'] ?? 0);
                $teams[$teamKey]['netDiffTotal'] += (float)($row['netDiffValue'] ?? 0);
                if ($teams[$teamKey]['placementPointsGrossTotal'] !== null) {
                    $teams[$teamKey]['placementPointsGrossTotal'] += (float)($row['placementPointsGross'] ?? 0);
                }
                if ($teams[$teamKey]['placementPointsNetTotal'] !== null) {
                    $teams[$teamKey]['placementPointsNetTotal'] += (float)($row['placementPointsNet'] ?? 0);
                }
            }
        }

        $out = array_values($teams);
        usort($out, fn($a, $b) => ($a['teamSort'] ?? 999) <=> ($b['teamSort'] ?? 999));
        return $out;
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
        $teamConfigById = self::parseTeamConfig($gameRow);

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

                // Team — resolved from the first player's dbPlayers_TeamKey.
                // Upstream player/pairing alignment guarantees every player in
                // a pairing shares the same team, so no mismatch handling here.
                $teamKey = trim((string)($pairPlayers[0]['dbPlayers_TeamKey'] ?? ''));
                $teamInfo = $teamConfigById[$teamKey] ?? null;

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

                    // Team — null fields when no dbGames_TeamConfig is set,
                    // meaning the leaderboard's Team pill has nothing to show.
                    'teamKey' => $teamKey !== '' ? $teamKey : null,
                    'teamName' => $teamInfo['name'] ?? null,
                    'teamColor' => $teamInfo['color'] ?? null,
                    'teamSort' => $teamInfo['sort'] ?? null,

                    // Stat buckets for PairField leaderboard cards
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

        // ── Skins resolution for Traditional Skins (PairField) ───────────────────────
        if ($basis === 'skins') {
            $skinsResult = self::resolvePairFieldSkins($out, $scorecardRows, $gameRow);
            foreach ($out as &$row) {
                $pId = $row['pairingId'];
                $row['grossSkins'] = $skinsResult['gross'][$pId] ?? 0;
                $row['netSkins']   = $skinsResult['net'][$pId]   ?? 0;
            }
            unset($row);
        } else {
            foreach ($out as &$row) {
                $row['grossSkins'] = 0;
                $row['netSkins']   = 0;
            }
            unset($row);
        }
        // ─────────────────────────────────────────────────────────────────────────────

        // ── Points resolution for Points (PairField) ─────────────────────────────────
        if ($basis === 'points') {
            $pointsResult = self::resolvePairFieldPoints($out, $scorecardRows, $gameRow);
            foreach ($out as &$row) {
                $pId      = $row['pairingId'];
                $grossPts = $pointsResult['gross'][$pId] ?? ['front' => 0, 'back' => 0, 'total' => 0];
                $netPts   = $pointsResult['net'][$pId]   ?? ['front' => 0, 'back' => 0, 'total' => 0];
                $row['grossPoints']   = $grossPts;
                $row['netPoints']     = $netPts;
                // Override the columnTotals-derived values (which are zero since
                // points are now calculated here, not in decorateScoredPlayers)
                $row['pointsValue']   = (float)$netPts['total'];
                $row['pointsDisplay'] = (string)(int)$netPts['total'];
            }
            unset($row);
        } else {
            foreach ($out as &$row) {
                $row['grossPoints'] = ['front' => 0, 'back' => 0, 'total' => 0];
                $row['netPoints']   = ['front' => 0, 'back' => 0, 'total' => 0];
            }
            unset($row);
        }
        // ─────────────────────────────────────────────────────────────────────────────

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

        // ── Placement Points (§4.2, extended for Individual/Pairing category
        // states) — ranks the field twice, once by gross, once by net,
        // independent of dbGames_ScoringBasis. Always computed regardless of
        // the gross/net categories' active/disabled/default state — state is
        // display-only (score_summary.js), never a gate on acquisition.
        $placement = self::parsePlacementPoints($gameRow);
        $grossCat = $placement['categories']['gross'];
        $netCat = $placement['categories']['net'];

        $grossRankInput = [];
        $netRankInput = [];
        foreach ($out as $idx => $row) {
            $grossRankInput[] = ['idx' => $idx, 'value' => (float)($row['grossDiffValue'] ?? 0)];
            $netRankInput[] = ['idx' => $idx, 'value' => (float)($row['netDiffValue'] ?? 0)];
        }
        $grossPts = self::assignPlacementPoints($grossRankInput, $grossCat['pointsConfig'], $grossCat['tieRule']);
        $netPts = self::assignPlacementPoints($netRankInput, $netCat['pointsConfig'], $netCat['tieRule']);

        foreach ($out as $idx => &$row) {
            $row['placementPointsGross'] = $grossPts[$idx] ?? 0.0;
            $row['placementPointsNet'] = $netPts[$idx] ?? 0.0;
        }
        unset($row);

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

    /**
     * Parses dbGames_TeamConfig into an id-keyed lookup:
     * {"teams":[{"id":"T1","name":"Red","color":"red","sort":1}, ...]}
     * -> ["T1" => {"id":"T1","name":"Red","color":"red","sort":1}, ...]
     * Empty array when unset — callers treat a missing lookup entry as
     * "no team config," not an error.
     */
    private static function parseTeamConfig(array $gameRow): array
    {
        $raw = $gameRow['dbGames_TeamConfig'] ?? null;
        if ($raw === null || $raw === '') return [];

        $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
        $teams = is_array($decoded['teams'] ?? null) ? $decoded['teams'] : [];

        $byId = [];
        foreach ($teams as $t) {
            if (!is_array($t)) continue;
            $id = trim((string)($t['id'] ?? ''));
            if ($id !== '') $byId[$id] = $t;
        }
        return $byId;
    }

    /**
     * The five categories every game carries from creation onward (see
     * service_dbGames.php's applyDefaultsForAdd and module_definePlacementPoints.js).
     * Used both as the ultimate fallback when dbGames_PlacementPoints is null/
     * malformed, and to backfill any category missing from an otherwise-valid
     * decoded value — every read of this column is guaranteed to return all
     * five, fully populated, regardless of what's actually stored.
     */
    private static function defaultPlacementCategories(): array
    {
        $placementTable = ['pointsConfig' => ['1' => 100, '2' => 75, '3' => 50], 'tieRule' => 'split'];
        return [
            'gross' => ['key' => 'gross', 'kind' => 'placement', 'scope' => 'pairfield', 'state' => 'default'] + $placementTable,
            'net' => ['key' => 'net', 'kind' => 'placement', 'scope' => 'pairfield', 'state' => 'default'] + $placementTable,
            'matchResult' => ['key' => 'matchResult', 'kind' => 'segments', 'scope' => 'pairpair', 'state' => 'default',
                'segments' => ['1' => ['win' => 1, 'halve' => 0.5, 'loss' => 0]]],
            'individualGross' => ['key' => 'individualGross', 'kind' => 'placement', 'scope' => 'individual', 'state' => 'default'] + $placementTable,
            'individualNet' => ['key' => 'individualNet', 'kind' => 'placement', 'scope' => 'individual', 'state' => 'default'] + $placementTable,
        ];
    }

    /**
     * Parses dbGames_PlacementPoints's unified shape:
     * {"top":"default"|"active"|"disabled","categories":[{key,kind,scope,state,...}, ...]}
     * Always returns all five categories, fully populated — "default",
     * "active", and "disabled" are all computed identically here; state is
     * never consulted to decide whether to compute (§ design decision:
     * suppress at rendering, not at acquisition, so a future event-level
     * aggregator can still read a category's points even on a game where
     * this page hides them). Only score_summary.js reads state, to decide
     * what to display.
     */
    private static function parsePlacementPoints(array $gameRow): array
    {
        $defaults = self::defaultPlacementCategories();
        $raw = $gameRow['dbGames_PlacementPoints'] ?? null;

        $decoded = null;
        if ($raw !== null && $raw !== '') {
            $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
        }

        $top = (is_array($decoded) && in_array($decoded['top'] ?? null, ['default', 'active', 'disabled'], true))
            ? $decoded['top']
            : 'default';

        $categories = $defaults;
        if (is_array($decoded) && is_array($decoded['categories'] ?? null)) {
            foreach ($decoded['categories'] as $c) {
                if (!is_array($c) || !isset($c['key']) || !isset($defaults[$c['key']])) continue;
                $categories[$c['key']] = array_merge($defaults[$c['key']], $c);
            }
        }

        return ['top' => $top, 'categories' => $categories];
    }

    /**
     * Flat key => state map for score_summary.js — the one thing it reads to
     * decide column headers ("Points" vs "Default Points"), pill-disabling,
     * and Leaderboard-tab suppression. Never consulted here for computation.
     */
    private static function placementPointsStatesMap(array $parsed): array
    {
        $out = ['top' => $parsed['top']];
        foreach ($parsed['categories'] as $key => $cat) {
            $out[$key] = (string)($cat['state'] ?? 'default');
        }
        return $out;
    }

    /**
     * Ranks $rows (each ['idx' => original array key, 'value' => float, lower
     * is better]) and maps rank position to a points value via $pointsConfig
     * (keyed by string position, e.g. "1"=>100), applying $tieRule when two
     * or more rows share a value. Returns [idx => points].
     *
     * tieRule:
     *   'split' (default) — tied rows split the average of the positions they occupy
     *   'high'             — tied rows all receive the better (higher-points) position's value
     *   'low'              — tied rows all receive the worse (lower-points) position's value
     */
    private static function assignPlacementPoints(array $rows, array $pointsConfig, string $tieRule): array
    {
        usort($rows, fn($a, $b) => $a['value'] <=> $b['value']);

        $result = [];
        $n = count($rows);
        $i = 0;
        while ($i < $n) {
            $j = $i;
            while ($j + 1 < $n && $rows[$j + 1]['value'] === $rows[$i]['value']) {
                $j++;
            }

            $ptsForPositions = [];
            for ($p = $i + 1; $p <= $j + 1; $p++) {
                $ptsForPositions[] = (float)($pointsConfig[(string)$p] ?? 0);
            }

            switch ($tieRule) {
                case 'high':
                    $assigned = max($ptsForPositions);
                    break;
                case 'low':
                    $assigned = min($ptsForPositions);
                    break;
                case 'split':
                default:
                    $assigned = array_sum($ptsForPositions) / count($ptsForPositions);
                    break;
            }

            for ($k = $i; $k <= $j; $k++) {
                $result[$rows[$k]['idx']] = $assigned;
            }

            $i = $j + 1;
        }

        return $result;
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
        $scoringBasis = trim((string)($meta['scoringBasis'] ?? $gameRow['dbGames_ScoringBasis'] ?? 'Strokes'));
        $scoringMethod = trim((string)($gameRow['dbGames_ScoringMethod'] ?? 'NET'));
        $isSkins = (strtolower($scoringBasis) === 'skins');

        // Scoring Segments — PairPair only. 1 = one overall match result (default),
        // 3 = front 9 / back 9 / overall scored independently. Independent of
        // Playing Segments (dbGames_Segments) — no relationship between the two.
        $scoringSegments = (int)($gameRow['dbGames_ScoringSegments'] ?? 1);
        if (!in_array($scoringSegments, [1, 3], true)) $scoringSegments = 1;

        // Which of front/back are structurally real for this game's hole range —
        // a 9-hole round (F9/B9) only ever has one, never both.
        $validSeg = self::validSegmentKeys($gameRow);
        $teamConfigById = self::parseTeamConfig($gameRow);

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
            $leftNet   = self::metricFromTotalRow($leftTotal, 'netDiff', $metricKey);

            $rightGross = self::metricFromTotalRow($rightTotal, 'grossDiff', $metricKey);
            $rightNet   = self::metricFromTotalRow($rightTotal, 'netDiff', $metricKey);

            // Medal Match (Strokes basis) front/back — only computed when 3-segment
            // scoring is on. The 9a/9b cells already exist in columnTotals (same
            // splitTotalFromMap() every other metric uses); this just reads them,
            // no new calculation. Nulled per $validSeg on a 9-hole round.
            $leftGrossSegments = $leftNetSegments = null;
            $rightGrossSegments = $rightNetSegments = null;
            if ($scoringSegments === 3) {
                $nullCell = ['value' => null, 'display' => null];
                $leftGrossSegments = [
                    'front' => $validSeg['front'] ? self::metricFromTotalRow($leftTotal, 'grossDiff', '9a') : $nullCell,
                    'back'  => $validSeg['back']  ? self::metricFromTotalRow($leftTotal, 'grossDiff', '9b') : $nullCell,
                    'total' => $leftGross,
                ];
                $leftNetSegments = [
                    'front' => $validSeg['front'] ? self::metricFromTotalRow($leftTotal, 'netDiff', '9a') : $nullCell,
                    'back'  => $validSeg['back']  ? self::metricFromTotalRow($leftTotal, 'netDiff', '9b') : $nullCell,
                    'total' => $leftNet,
                ];
                $rightGrossSegments = [
                    'front' => $validSeg['front'] ? self::metricFromTotalRow($rightTotal, 'grossDiff', '9a') : $nullCell,
                    'back'  => $validSeg['back']  ? self::metricFromTotalRow($rightTotal, 'grossDiff', '9b') : $nullCell,
                    'total' => $rightGross,
                ];
                $rightNetSegments = [
                    'front' => $validSeg['front'] ? self::metricFromTotalRow($rightTotal, 'netDiff', '9a') : $nullCell,
                    'back'  => $validSeg['back']  ? self::metricFromTotalRow($rightTotal, 'netDiff', '9b') : $nullCell,
                    'total' => $rightNet,
                ];
            }

            $gameKpi = self::buildPairPairGameKpi($leftPlayers, $rightPlayers, $gameRow, $scoringBasis, $scopedHoles);

            // ── Skins Match resolution ────────────────────────────────────────────
            $pairPairSkins = ['gross' => [], 'net' => []];
            if ($isSkins) {
                $matchPairings = [
                    [
                        'pairingId' => (string)$leftPairingId,
                        'holes'     => self::extractHolesForCalc($leftPlayers, $scopedHoles),
                    ],
                    [
                        'pairingId' => (string)$rightPairingId,
                        'holes'     => self::extractHolesForCalc($rightPlayers, $scopedHoles),
                    ],
                ];
                $pairPairSkins = ServiceCalcSkins::resolveSkins($matchPairings, $scopedHoles);
            }
            // ─────────────────────────────────────────────────────────────────────

            // ── Points Match resolution ───────────────────────────────────────────
            // Points are player-specific — build one entry per player keyed by
            // pairingId_playerId_pos (three-part composite) so blind clones sharing
            // the same GHIN, including two clones of the same donor in the same
            // pairing, each resolve independently.
            $pairPairPoints = ['gross' => [], 'net' => []];
            $isPoints = (strtolower($scoringBasis) === 'points');
            if ($isPoints) {
                $pointsConfig = self::parsePointsConfig($gameRow);
                $playerEntries  = [];
                $playerPairings = [];
                foreach ([
                    (string)$leftPairingId  => $leftPlayers,
                    (string)$rightPairingId => $rightPlayers,
                ] as $pairingId => $sidePlayers) {
                    foreach ($sidePlayers as $player) {
                        $playerId = trim((string)(
                            $player['playerId']
                            ?? $player['dbPlayers_PlayerGHIN']
                            ?? $player['dbPlayers_PlayerKey']
                            ?? ''
                        ));
                        if ($playerId === '') continue;
                        $pos = (int)($player['dbPlayers_PairingPos'] ?? 0);
                        $keyPairingGHIN = $pairingId . '_' . $playerId . '_' . $pos;

                        $playerPairings[$keyPairingGHIN] = $pairingId;
                        if (!isset($playerEntries[$keyPairingGHIN])) {
                            $playerEntries[$keyPairingGHIN] = ['pairingId' => $keyPairingGHIN, 'holes' => []];
                        }
                        foreach ($scopedHoles as $holeNumber) {
                            $holeKey = 'h' . $holeNumber;
                            $cell    = $player['holes'][$holeKey] ?? null;
                            if (!is_array($cell) || empty($cell['declared'])) continue;
                            $grossDiff = $cell['diff'] ?? null;
                            $net       = $cell['net']  ?? null;
                            $par       = $cell['par']  ?? null;
                            $netDiff   = (is_numeric($net) && is_numeric($par))
                                ? (float)$net - (float)$par : null;
                            if ($grossDiff === null && $netDiff === null) continue;
                            $playerEntries[$keyPairingGHIN]['holes'][$holeKey] = [
                                'gross'     => $cell['gross'] ?? null,
                                'net'       => $net,
                                'grossDiff' => is_numeric($grossDiff) ? (float)$grossDiff : null,
                                'netDiff'   => $netDiff,
                                'declared'  => true,
                            ];
                        }
                    }
                }
                if ($playerEntries) {
                    $perPlayer = ServiceCalcPoints::resolvePoints(
                        array_values($playerEntries), $scopedHoles, $pointsConfig
                    );
                    foreach (['gross', 'net'] as $metric) {
                        foreach ($perPlayer[$metric] as $keyPairingGHIN => $pts) {
                            $pid = $playerPairings[$keyPairingGHIN] ?? null;
                            if (!$pid) continue;
                            if (!isset($pairPairPoints[$metric][$pid])) {
                                $pairPairPoints[$metric][$pid] = ['front' => 0.0, 'back' => 0.0, 'total' => 0.0];
                            }
                            $pairPairPoints[$metric][$pid]['front'] += $pts['front'];
                            $pairPairPoints[$metric][$pid]['back']  += $pts['back'];
                            $pairPairPoints[$metric][$pid]['total'] += $pts['total'];
                        }
                    }
                }
            }
            // ─────────────────────────────────────────────────────────────────────

            $flightId = (string)($row['flightIDs'][0] ?? $row['flightID'] ?? $ctx['virtualFlightId'] ?? '');
            $spinPrefix = ($ctx['spinLabel'] ?? 'Round') !== 'Round'
                ? trim((string)$ctx['spinLabel']) . ' • '
                : '';

            $pairingLabel = $flightId !== ''
                ? ($spinPrefix . 'Match ' . $flightId)
                : ($spinPrefix . 'Pairings ' . trim((string)$leftPairingId) . ' / ' . trim((string)$rightPairingId));

            $leftSort = self::pairPairSortSeed($leftPlayers);

            // Team — ignored entirely for rotation-aware games (COD/1324/1423),
            // per explicit decision: a static per-player TeamKey can't rotate
            // with the match, so rotation games fall back to plain Side A/B
            // with no named/colored team at all, rather than a stale or
            // half-correct team label.
            //
            // The same principle now also covers a side whose own partners
            // don't agree on TeamKey (e.g. Side A's two players recorded as
            // T1 and T2) — sideTeamKey() requires every player on a side to
            // share one TeamKey before trusting it; a disagreement falls
            // back to no team/color, same as the rotation-aware case, rather
            // than silently trusting whichever player happens to be first in
            // the array and mislabeling the whole side with one partner's team.
            $leftTeamKey = null;
            $rightTeamKey = null;
            $leftTeamInfo = null;
            $rightTeamInfo = null;
            if (!$ctx['isRotationAware']) {
                $leftTeamKey = self::sideTeamKey($leftPlayers);
                $rightTeamKey = self::sideTeamKey($rightPlayers);
                $leftTeamInfo = ($leftTeamKey !== null) ? ($teamConfigById[$leftTeamKey] ?? null) : null;
                $rightTeamInfo = ($rightTeamKey !== null) ? ($teamConfigById[$rightTeamKey] ?? null) : null;
            }

            $out[] = [
                'flightId'       => $flightId,
                'matchLabel'     => $pairingLabel,
                'matchLabelTop'  => self::buildPairFieldLabel($leftPlayers),
                'matchLabelBottom' => self::buildPairFieldLabel($rightPlayers),

                'spinNumber'      => $ctx['spinNumber'],
                'spinLabel'       => $ctx['spinLabel'],
                'spinStartHole'   => $ctx['spinStartHole'],
                'spinEndHole'     => $ctx['spinEndHole'],
                'visibleHoles'    => $ctx['visibleHoles'],
                'virtualFlightId' => $ctx['virtualFlightId'],
                'virtualPairingIds' => $ctx['virtualPairingIds'],
                'isRotationAware' => $ctx['isRotationAware'],

                'left' => [
                    'flightPos'       => (string)$leftKey,
                    'pairingId'       => (string)$leftPairingId,
                    'teamKey'         => $leftTeamKey,
                    'teamName'        => $leftTeamInfo['name'] ?? null,
                    'teamColor'       => $leftTeamInfo['color'] ?? null,
                    'teamSort'        => $leftTeamInfo['sort'] ?? null,
                    'scoreCount'      => self::countDeclaredScores($leftPlayers, $scopedHoles),
                    'grossDiffValue'  => $leftGross['value'],
                    'grossDiffDisplay'=> $leftGross['display'],
                    'netDiffValue'    => $leftNet['value'],
                    'netDiffDisplay'  => $leftNet['display'],
                    'grossDiffSegments' => $leftGrossSegments,
                    'netDiffSegments'   => $leftNetSegments,
                    'gameValue'       => $gameKpi['left']['total']['value'],
                    'gameDisplay'     => $gameKpi['left']['total']['display'],
                    'gameSegments'    => $gameKpi['left'],
                    'grossSkins'      => self::nullInvalidScalarSegments($pairPairSkins['gross'][(string)$leftPairingId]  ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'netSkins'        => self::nullInvalidScalarSegments($pairPairSkins['net'][(string)$leftPairingId]    ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'grossPoints'     => self::nullInvalidScalarSegments($pairPairPoints['gross'][(string)$leftPairingId] ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'netPoints'       => self::nullInvalidScalarSegments($pairPairPoints['net'][(string)$leftPairingId]   ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                ],
                'right' => [
                    'flightPos'       => (string)$rightKey,
                    'pairingId'       => (string)$rightPairingId,
                    'teamKey'         => $rightTeamKey,
                    'teamName'        => $rightTeamInfo['name'] ?? null,
                    'teamColor'       => $rightTeamInfo['color'] ?? null,
                    'teamSort'        => $rightTeamInfo['sort'] ?? null,
                    'scoreCount'      => self::countDeclaredScores($rightPlayers, $scopedHoles),
                    'grossDiffValue'  => $rightGross['value'],
                    'grossDiffDisplay'=> $rightGross['display'],
                    'netDiffValue'    => $rightNet['value'],
                    'netDiffDisplay'  => $rightNet['display'],
                    'grossDiffSegments' => $rightGrossSegments,
                    'netDiffSegments'   => $rightNetSegments,
                    'gameValue'       => $gameKpi['right']['total']['value'],
                    'gameDisplay'     => $gameKpi['right']['total']['display'],
                    'gameSegments'    => $gameKpi['right'],
                    'grossSkins'      => self::nullInvalidScalarSegments($pairPairSkins['gross'][(string)$rightPairingId] ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'netSkins'        => self::nullInvalidScalarSegments($pairPairSkins['net'][(string)$rightPairingId]   ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'grossPoints'     => self::nullInvalidScalarSegments($pairPairPoints['gross'][(string)$rightPairingId] ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                    'netPoints'       => self::nullInvalidScalarSegments($pairPairPoints['net'][(string)$rightPairingId]   ?? ['front' => 0, 'back' => 0, 'total' => 0], $validSeg),
                ],
                'thru' => max(
                    self::deriveThru($leftPlayers, $scopedHoles),
                    self::deriveThru($rightPlayers, $scopedHoles)
                ),
                '_sort' => [
                    'flightId'   => $leftSort['flightId'],
                    'flightPos'  => $leftSort['flightPos'],
                    'pairingId'  => $leftSort['pairingId'],
                    'pairingPos' => $leftSort['pairingPos'],
                    'lName'      => $leftSort['lName'],
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

        // ── matchStatus / points (§3.3-3.4) — the actual normalized W/L/H result
        // per side, per segment. This is net-new: today's leaderboard-adjacent
        // code only ever computes a transient comparison for a CSS highlight
        // class (pairPairLeaderClass in score_summary.js) and throws it away.
        // Segment-aware: one 'total' pair when scoringSegments=1, three
        // independent pairs (front/back/total) when =3.
        $segmentKeys = ($scoringSegments === 3) ? ['front', 'back', 'total'] : ['total'];
        // Maps a segment key to dbGames_PlacementPoints's segment index.
        // "1"=front, "2"=back, "3"=overall when segments=3; "1"=overall (the
        // only segment) when segments=1 — matches module_definePlacementPoints.js's
        // convention exactly.
        $segmentIndexMap = ($scoringSegments === 3)
            ? ['front' => '1', 'back' => '2', 'total' => '3']
            : ['total' => '1'];
        $lowerWins = (strtolower($scoringBasis) === 'strokes');
        // Always computed regardless of matchResult's active/disabled/default
        // state — same acquisition-vs-display split as Pairing/Individual.
        $placementConfig = self::parsePlacementPoints($gameRow)['categories']['matchResult'];

        foreach ($out as &$row) {
            $leftMatch = [];
            $rightMatch = [];
            foreach ($segmentKeys as $segKey) {
                $lv = self::pairPairComparisonValue($row['left'], $scoringBasis, $scoringMethod, $segKey);
                $rv = self::pairPairComparisonValue($row['right'], $scoringBasis, $scoringMethod, $segKey);
                $statusPair = self::determineMatchStatus($lv, $rv, $lowerWins);
                $segIdx = $segmentIndexMap[$segKey];

                $leftStatus = $statusPair['left'] ?? null;
                $rightStatus = $statusPair['right'] ?? null;

                $leftMatch[$segKey] = [
                    'status' => $leftStatus,
                    'points' => self::placementPointsForStatus($leftStatus, $placementConfig, $segIdx),
                ];
                $rightMatch[$segKey] = [
                    'status' => $rightStatus,
                    'points' => self::placementPointsForStatus($rightStatus, $placementConfig, $segIdx),
                ];
            }
            $row['left']['matchStatus'] = $leftMatch;
            $row['right']['matchStatus'] = $rightMatch;
        }
        unset($row);

        return $out;
    }

    /**
     * Reads the per-side KPI value for one segment ('front'|'back'|'total'),
     * picking the right underlying field for the game's basis and scoring
     * method. Returns null when the value isn't applicable (mirrors the
     * null-for-invalid-segment convention from validSegmentKeys/nullInvalid*
     * — a 9-hole round's missing segment, or segments=1 asking for
     * 'front'/'back' at all, correctly yields null rather than a fabricated
     * number).
     */
    private static function pairPairComparisonValue(array $side, string $scoringBasis, string $scoringMethod, string $segmentKey): ?float
    {
        $basis = strtolower($scoringBasis);
        $isGross = ($scoringMethod === 'ADJ GROSS');

        switch ($basis) {
            case 'strokes':
                if ($segmentKey === 'total') {
                    $v = $isGross ? ($side['grossDiffValue'] ?? null) : ($side['netDiffValue'] ?? null);
                    return ($v !== null) ? (float)$v : null;
                }
                $segs = $isGross ? ($side['grossDiffSegments'] ?? null) : ($side['netDiffSegments'] ?? null);
                $cell = $segs[$segmentKey] ?? null;
                return (is_array($cell) && $cell['value'] !== null) ? (float)$cell['value'] : null;

            case 'holes':
                $segs = $side['gameSegments'] ?? null;
                $cell = $segs[$segmentKey] ?? null;
                return (is_array($cell) && $cell['value'] !== null) ? (float)$cell['value'] : null;

            case 'skins':
                $arr = $isGross ? ($side['grossSkins'] ?? null) : ($side['netSkins'] ?? null);
                $v = is_array($arr) ? ($arr[$segmentKey] ?? null) : null;
                return ($v !== null) ? (float)$v : null;

            case 'points':
                $arr = $isGross ? ($side['grossPoints'] ?? null) : ($side['netPoints'] ?? null);
                $v = is_array($arr) ? ($arr[$segmentKey] ?? null) : null;
                return ($v !== null) ? (float)$v : null;

            default:
                return null;
        }
    }

    /**
     * W/L/H for one segment from both sides' comparison values. Null in
     * either input (segment not applicable — e.g. back-9 on an F9 round)
     * propagates to null status on both sides, not a fabricated result.
     */
    private static function determineMatchStatus(?float $leftVal, ?float $rightVal, bool $lowerWins): array
    {
        if ($leftVal === null || $rightVal === null) {
            return ['left' => null, 'right' => null];
        }
        if ($leftVal == $rightVal) {
            return ['left' => 'H', 'right' => 'H'];
        }
        $leftWins = $lowerWins ? ($leftVal < $rightVal) : ($leftVal > $rightVal);
        return $leftWins ? ['left' => 'W', 'right' => 'L'] : ['left' => 'L', 'right' => 'W'];
    }

    private static function placementPointsForStatus(?string $status, array $placementConfig, string $segmentIndex): float
    {
        if ($status === null) return 0.0;
        $seg = $placementConfig['segments'][$segmentIndex] ?? ['win' => 1, 'halve' => 0.5, 'loss' => 0];
        switch ($status) {
            case 'W': return (float)($seg['win'] ?? 1);
            case 'H': return (float)($seg['halve'] ?? 0.5);
            case 'L': return (float)($seg['loss'] ?? 0);
            default: return 0.0;
        }
    }

    private static function buildPairPairGameKpi(array $leftPlayers, array $rightPlayers, array $gameRow, string $scoringBasis, array $scopedHoles): array
    {
        $basis = trim($scoringBasis);
        if (!in_array($basis, ['Holes', 'Points'], true)) {
            return [
                'left'  => self::emptyGameSegments(),
                'right' => self::emptyGameSegments(),
            ];
        }

        $metricMode = (trim((string)($gameRow['dbGames_ScoringMethod'] ?? 'NET')) === 'ADJ GROSS')
            ? 'gross'
            : 'net';

        $left  = self::emptyGameSegments();
        $right = self::emptyGameSegments();
        $holes = $scopedHoles ?: self::holesForGame($gameRow);

        foreach ($holes as $holeNumber) {
            $segmentKey = ($holeNumber <= 9) ? 'front' : 'back';

            $leftScore  = self::countedSideScoreForHole($leftPlayers,  $holeNumber, $metricMode);
            $rightScore = self::countedSideScoreForHole($rightPlayers, $holeNumber, $metricMode);

            if ($leftScore === null || $rightScore === null) continue;

            if ($basis === 'Holes') {
                if ($leftScore < $rightScore) {
                    self::bumpGameSegment($left,  $segmentKey,  1);
                    self::bumpGameSegment($right, $segmentKey, -1);
                } elseif ($rightScore < $leftScore) {
                    self::bumpGameSegment($left,  $segmentKey, -1);
                    self::bumpGameSegment($right, $segmentKey,  1);
                }
            }
            // Points basis: gameKpi segments are driven by pairPairPoints
            // resolved via ServiceCalcPoints in buildPairPairRows — nothing per-hole here.
        }

        self::finalizeGameSegments($left);
        self::finalizeGameSegments($right);

        $valid = self::validSegmentKeys($gameRow);
        $left  = self::nullInvalidValueDisplaySegments($left,  $valid);
        $right = self::nullInvalidValueDisplaySegments($right, $valid);

        return [
            'left'  => $left,
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
                ?? $player['dbPlayers_MatchPos']
                ?? ''
            ));
            if ($flightPos === '') continue;
            $out[$flightPos][] = $player;
        }
        return $out;
    }

    /**
     * Detects team-assignment data problems and returns an admin-facing
     * message directing them to check Team Configuration — surfaced as a
     * blocking pop-up by score_summary.js. Returns null when everything's
     * consistent, including when there's no team config at all (nothing to
     * check against).
     *
     * Two independent checks, because they catch different mistakes:
     *   1. Headcount — does the full roster split evenly across every
     *      configured team? Catches a lopsided or incomplete assignment
     *      (e.g. 3 players on one team, 1 on another).
     *   2. Side agreement (PairPair only) — do the two partners on each
     *      match side actually agree on TeamKey? Catches partners recorded
     *      on different teams even when the game-wide headcount happens to
     *      still be perfectly even — this is what an even 2-and-2 split can
     *      hide, and is exactly the failure mode this check exists for: two
     *      players correctly split 2-and-2 game-wide, but paired up wrong,
     *      so each side silently borrowed one partner's team for the whole
     *      side (see sideTeamKey()).
     */
    private static function checkTeamIntegrity(array $scorecardRows, array $gameRow, string $competition): ?string
    {
        $teamConfigById = self::parseTeamConfig($gameRow);
        $teamCount = count($teamConfigById);
        if ($teamCount < 2) return null;

        // ── 1. Headcount ──────────────────────────────────────────────────
        $countsByTeam = [];
        $seenPlayerIds = [];
        $totalAssigned = 0;
        foreach ($scorecardRows as $row) {
            $players = is_array($row['players'] ?? null) ? $row['players'] : [];
            foreach ($players as $player) {
                $playerId = (string)($player['playerId'] ?? $player['dbPlayers_PlayerGHIN'] ?? $player['dbPlayers_PlayerKey'] ?? '');
                if ($playerId !== '' && isset($seenPlayerIds[$playerId])) continue;
                if ($playerId !== '') $seenPlayerIds[$playerId] = true;

                $teamKey = trim((string)($player['dbPlayers_TeamKey'] ?? ''));
                if ($teamKey === '') continue;
                $countsByTeam[$teamKey] = ($countsByTeam[$teamKey] ?? 0) + 1;
                $totalAssigned++;
            }
        }
        if ($totalAssigned > 0) {
            $counts = array_values($countsByTeam);
            $allEqual = (count(array_unique($counts)) <= 1);
            $allTeamsPresent = (count($countsByTeam) === $teamCount);
            if (!$allEqual || !$allTeamsPresent) {
                $parts = [];
                foreach ($countsByTeam as $key => $count) {
                    $name = $teamConfigById[$key]['name'] ?? $key;
                    $parts[] = "{$name}: {$count}";
                }
                return 'Players are not split evenly across the configured teams ('
                    . implode(', ', $parts)
                    . '). Check Team Configuration for this game.';
            }
        }

        // ── 2. Side agreement (PairPair only) ────────────────────────────
        if ($competition === 'PairPair') {
            foreach ($scorecardRows as $row) {
                $players = is_array($row['players'] ?? null) ? $row['players'] : [];
                if (!$players) continue;
                foreach (self::groupPlayersByFlightPos($players) as $sidePlayers) {
                    if (count($sidePlayers) < 2) continue;
                    $keys = [];
                    foreach ($sidePlayers as $p) {
                        $k = trim((string)($p['dbPlayers_TeamKey'] ?? ''));
                        if ($k !== '') $keys[$k] = true;
                    }
                    if (count($keys) > 1) {
                        return 'Partners on the same side of a match are assigned to different teams. '
                            . 'Check Team Configuration for this game.';
                    }
                }
            }
        }

        return null;
    }

    /**
     * A side's team is only trusted when every player on that side actually
     * agrees on dbPlayers_TeamKey. Returns null on disagreement (or if
     * nobody has a TeamKey at all) rather than silently picking one
     * player's value to represent the whole side — see the "no stale or
     * half-correct team label" principle this shares with the
     * rotation-aware fallback in buildPairPairRows().
     */
    private static function sideTeamKey(array $sidePlayers): ?string
    {
        $keys = [];
        foreach ($sidePlayers as $p) {
            $k = trim((string)($p['dbPlayers_TeamKey'] ?? ''));
            if ($k !== '') $keys[$k] = true;
        }
        $distinct = array_keys($keys);
        return (count($distinct) === 1) ? $distinct[0] : null;
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

    /**
     * Which of the front/back segment slices are structurally real for this game's
     * hole range. On a 9-hole round (F9 or B9), only one of front/back actually
     * corresponds to holes that were played — the other has no data at all, and
     * treating it as a legitimate 0 would silently misrepresent it as a real tie.
     * 'Overall' is always valid — it's just whatever holes were actually played.
     */
    private static function validSegmentKeys(array $gameRow): array
    {
        $holesLabel = trim((string)($gameRow['dbGames_Holes'] ?? 'All 18'));
        if ($holesLabel === 'F9') return ['front' => true,  'back' => false];
        if ($holesLabel === 'B9') return ['front' => false, 'back' => true];
        return ['front' => true, 'back' => true];
    }

    /**
     * Null out front/back on a {value, display} shaped segment structure
     * (gameSegments, and the new Medal Match segment extraction) when this
     * game's hole range doesn't actually cover that segment.
     */
    private static function nullInvalidValueDisplaySegments(array $segments, array $valid): array
    {
        if (!$valid['front']) $segments['front'] = ['value' => null, 'display' => null];
        if (!$valid['back'])  $segments['back']  = ['value' => null, 'display' => null];
        return $segments;
    }

    /**
     * Null out front/back on a plain-scalar shaped segment structure
     * (grossSkins/netSkins, grossPoints/netPoints front/back values) when this
     * game's hole range doesn't actually cover that segment.
     */
    private static function nullInvalidScalarSegments(array $segments, array $valid): array
    {
        if (!$valid['front']) $segments['front'] = null;
        if (!$valid['back'])  $segments['back']  = null;
        return $segments;
    }

    private static function pairPairSortSeed(array $players): array
    {
        $first = $players[0] ?? [];
        return [
            'flightId' => trim((string)(
                $first['flightID']
                ?? $first['effectiveFlightID']
                ?? $first['dbPlayers_MatchID']
                ?? ''
            )),
            'flightPos' => trim((string)(
                $first['flightPos']
                ?? $first['virtualFlightPos']
                ?? $first['dbPlayers_MatchPos']
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

    /**
     * Prepare pairings and delegate to ServiceCalcSkins for PairField skins resolution.
     *
     * For Traditional Skins, all pairings compete against the full field on each hole.
     * The pairing's hole score = SUM of grossDiff (gross pass) or netDiff (net pass)
     * across ALL declared scores on that hole. The declare flag — set upstream by
     * score entry based on BestBall/N or DeclareManual settings — is the only truth
     * we interrogate here. This service is intentionally dumb about game settings.
     */
    private static function resolvePairFieldSkins(
        array $builtRows,
        array $scorecardRows,
        array $gameRow
    ): array {
        $holes    = self::holesForGame($gameRow);
        $pairings = [];

        foreach ($scorecardRows as $scoreRow) {
            $players = is_array($scoreRow['players'] ?? null) ? $scoreRow['players'] : [];
            if (!$players) continue;

            $playersByPairing = self::groupPlayersByPairing($players);

            foreach ($playersByPairing as $pairingId => $pairPlayers) {
                $pairingId = (string)$pairingId;
                if (!isset($pairings[$pairingId])) {
                    $pairings[$pairingId] = ['pairingId' => $pairingId, 'holes' => []];
                }

                foreach ($holes as $holeNumber) {
                    $holeKey      = 'h' . $holeNumber;
                    $grossDiffSum = null;
                    $netDiffSum   = null;

                    foreach ($pairPlayers as $player) {
                        $cell = $player['holes'][$holeKey] ?? null;
                        if (!is_array($cell) || empty($cell['declared'])) continue;

                        $grossDiff = $cell['diff'] ?? null;
                        $net       = $cell['net']  ?? null;
                        $par       = $cell['par']  ?? null;
                        $netDiff   = (is_numeric($net) && is_numeric($par))
                            ? (float)$net - (float)$par
                            : null;

                        if (is_numeric($grossDiff)) {
                            $grossDiffSum = ($grossDiffSum ?? 0) + (float)$grossDiff;
                        }
                        if (is_numeric($netDiff)) {
                            $netDiffSum = ($netDiffSum ?? 0) + (float)$netDiff;
                        }
                    }

                    if ($grossDiffSum !== null || $netDiffSum !== null) {
                        $pairings[$pairingId]['holes'][$holeKey] = [
                            'gross'    => $grossDiffSum,
                            'net'      => $netDiffSum,
                            'declared' => true,
                        ];
                    }
                }
            }
        }

        return ServiceCalcSkins::resolveSkins(array_values($pairings), $holes);
    }

    /**
     * Extract declared hole scores from players for PairPair skins/points calc.
     * Skins: sums grossDiff/netDiff across all declared scores per pairing per hole.
     * One entry per pairing per hole with aggregated diffs.
     */
    private static function extractHolesForCalc(array $players, array $scopedHoles): array
    {
        $holes = [];

        foreach ($scopedHoles as $holeNumber) {
            $holeKey      = 'h' . (int)$holeNumber;
            $grossDiffSum = null;
            $netDiffSum   = null;

            foreach ($players as $player) {
                $cell = $player['holes'][$holeKey] ?? null;
                if (!is_array($cell) || empty($cell['declared'])) continue;

                $grossDiff = $cell['diff'] ?? null;
                $net       = $cell['net']  ?? null;
                $par       = $cell['par']  ?? null;
                $netDiff   = (is_numeric($net) && is_numeric($par))
                    ? (float)$net - (float)$par
                    : null;

                if (is_numeric($grossDiff)) {
                    $grossDiffSum = ($grossDiffSum ?? 0) + (float)$grossDiff;
                }
                if (is_numeric($netDiff)) {
                    $netDiffSum = ($netDiffSum ?? 0) + (float)$netDiff;
                }
            }

            if ($grossDiffSum !== null || $netDiffSum !== null) {
                $holes[$holeKey] = [
                    'gross'    => $grossDiffSum,
                    'net'      => $netDiffSum,
                    'declared' => true,
                ];
            }
        }

        return $holes;
    }

    /**
     * Resolve points for all pairings in a PairField game.
     *
     * Points are player-specific: each declared score gets an individual
     * points lookup, then results are summed to the pairing level.
     * The declare flag is the only truth — this service is intentionally
     * dumb about BestBall/N settings.
     *
     * Keys by pairingId_playerId_pos (three-part composite) so blind clones
     * sharing the same GHIN, including two clones of the same donor in the
     * same pairing, each resolve independently.
     */
    private static function resolvePairFieldPoints(
        array $builtRows,
        array $scorecardRows,
        array $gameRow
    ): array {
        $holes        = self::holesForGame($gameRow);
        $pointsConfig = self::parsePointsConfig($gameRow);

        $playerEntries  = [];
        $playerPairings = [];

        foreach ($scorecardRows as $scoreRow) {
            $players = is_array($scoreRow['players'] ?? null) ? $scoreRow['players'] : [];
            if (!$players) continue;

            foreach ($players as $player) {
                $pairingId = trim((string)(
                    $player['effectivePairingID']
                    ?? $player['pairingID']
                    ?? $player['dbPlayers_PairingID']
                    ?? '000'
                ));
                $playerId = trim((string)(
                    $player['playerId']
                    ?? $player['dbPlayers_PlayerGHIN']
                    ?? $player['dbPlayers_PlayerKey']
                    ?? ''
                ));
                if ($playerId === '') continue;

                $pos = (int)($player['dbPlayers_PairingPos'] ?? 0);
                $keyPairingGHIN = $pairingId . '_' . $playerId . '_' . $pos;

                $playerPairings[$keyPairingGHIN] = $pairingId;

                if (!isset($playerEntries[$keyPairingGHIN])) {
                    $playerEntries[$keyPairingGHIN] = [
                        'pairingId' => $keyPairingGHIN,
                        'holes'     => [],
                    ];
                }

                foreach ($holes as $holeNumber) {
                    $holeKey = 'h' . $holeNumber;
                    $cell    = $player['holes'][$holeKey] ?? null;
                    if (!is_array($cell) || empty($cell['declared'])) continue;

                    $grossDiff = $cell['diff'] ?? null;
                    $net       = $cell['net']  ?? null;
                    $par       = $cell['par']  ?? null;
                    $netDiff   = (is_numeric($net) && is_numeric($par))
                        ? (float)$net - (float)$par
                        : null;

                    if ($grossDiff === null && $netDiff === null) continue;

                    $playerEntries[$keyPairingGHIN]['holes'][$holeKey] = [
                        'gross'     => $cell['gross'] ?? null,
                        'net'       => $net,
                        'grossDiff' => is_numeric($grossDiff) ? (float)$grossDiff : null,
                        'netDiff'   => $netDiff,
                        'declared'  => true,
                    ];
                }
            }
        }

        if (!$playerEntries) {
            return ['gross' => [], 'net' => []];
        }

        $perPlayerResult = ServiceCalcPoints::resolvePoints(
            array_values($playerEntries),
            $holes,
            $pointsConfig
        );

        $pairingTotals = ['gross' => [], 'net' => []];
        foreach (['gross', 'net'] as $metric) {
            foreach ($perPlayerResult[$metric] as $keyPairingGHIN => $pts) {
                $pairingId = $playerPairings[$keyPairingGHIN] ?? null;
                if ($pairingId === null) continue;
                if (!isset($pairingTotals[$metric][$pairingId])) {
                    $pairingTotals[$metric][$pairingId] = ['front' => 0.0, 'back' => 0.0, 'total' => 0.0];
                }
                $pairingTotals[$metric][$pairingId]['front'] += $pts['front'];
                $pairingTotals[$metric][$pairingId]['back']  += $pts['back'];
                $pairingTotals[$metric][$pairingId]['total'] += $pts['total'];
            }
        }

        return $pairingTotals;
    }

    /**
     * Parse dbGames_PointsConfig from the game row.
     * Supports new envelope format and legacy dbGames_StablefordPoints flat array.
     * Returns a normalized config array always containing at least 'strategy'.
     */
    private static function parsePointsConfig(array $gameRow): array
    {
        $default = ['strategy' => 'Stableford', 'values' => []];

        $raw = $gameRow['dbGames_PointsConfig'] ?? $gameRow['dbGames_StablefordPoints'] ?? null;

        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) $raw = $decoded;
        }

        if (!is_array($raw)) return $default;

        // New envelope: { strategy, values, ... }
        if (isset($raw['strategy'])) return $raw;

        // Legacy: flat array of stableford rows [{ reltoPar, points }, ...]
        if (!empty($raw)) {
            return ['strategy' => 'Stableford', 'values' => $raw];
        }

        return $default;
    }
}