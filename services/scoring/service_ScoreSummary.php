<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreSummary.php

require_once __DIR__ . '/service_ScoreCardRotation.php';
require_once __DIR__ . '/service_ScoreCard.php';
require_once __DIR__ . '/service_ScoreRotation.php';
require_once __DIR__ . '/service_CalcSkins.php';
require_once __DIR__ . '/service_CalcPoints.php';

final class ServiceScoreSummary
{
    // Formats where scoring happens at the team level (every teammate's
    // card shows the same duplicated score) — a player's own
    // grossDiffValue/netDiffValue/placementPoints/rank are not personal
    // performance in these formats, so individualRows carries null for all
    // of them rather than a technically-computed-but-illegitimate number.
    // This is now the canonical location for this list — game_settings.js
    // already names the same four values as its own "teamFmts" constant,
    // and this list was previously duplicated (each copy flagged in its own
    // comments as manually-synced) in service_buildEventSummary.php,
    // event_summary.js, and score_summary.js for display-only exclusion.
    // Those copies are now redundant now that the source itself excludes
    // this data, but removing them is a separate follow-up, not done here.
    private const NON_PERSONAL_SCORE_FORMATS = ['Scramble', 'Shamble', 'AltShot', 'Chapman'];

    public static function buildScoreSummaryPayload(array $gameRow, array $scorecards): array
    {
        if (!$gameRow) {
            throw new RuntimeException('buildScoreSummaryPayload: missing gameRow');
        }

        $competition = trim((string)($scorecards['competition'] ?? $gameRow['dbGames_Competition'] ?? 'PairField'));
        $meta = is_array($scorecards['meta'] ?? null) ? $scorecards['meta'] : [];
        $flightConfigById = self::parseFlightConfig($gameRow);

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
            'teamRollup' => self::buildTeamRollupRows($rows, $competition, $flightConfigById),
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
                // Surfaced for the event-level aggregator's round-column
                // labels (e.g. "Round 1 — Scramble") — this page doesn't
                // consume it itself, but it's cheap to carry along here
                // rather than have the aggregator re-fetch gameRow per
                // round just for this one field.
                'gameFormat' => trim((string)($gameRow['dbGames_GameFormat'] ?? '')),
                // Surfaced as a blocking pop-up by score_summary.js — see
                // checkTeamIntegrity()'s own comment for what it catches and why.
                'teamIntegrityWarning' => self::checkTeamIntegrity($scorecards['rows'] ?? [], $gameRow, $competition),
                // The one thing score_summary.js reads to decide column
                // headers ("Points" vs "Default Points"), pill-disabling, and
                // Leaderboard-tab suppression. Never consulted server-side to
                // decide whether to compute — see parsePlacementPoints().
                'placementPointsStates' => self::placementPointsStatesMap(self::parsePlacementPoints($gameRow)),
                // Display order for flight grouping — the config's own order,
                // not re-sorted here. Any flightKey a row resolves to that
                // isn't present in this list (legacy/malformed data) is
                // appended at the end by the client, sorted naturally.
                'flightOrder' => array_keys($flightConfigById),
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
        $flightConfigById = self::parseFlightConfig($gameRow);
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

        // Front/back always shown at Individual grain too, same convention
        // as buildPairFieldRows() — no per-game toggle, just structural
        // validity for this round's hole range.
        $validSeg = self::validSegmentKeys($gameRow);

        // Whole-round flag, computed once — Scramble/Shamble/AltShot/Chapman
        // have no personal score at all, not a per-player condition. See
        // NON_PERSONAL_SCORE_FORMATS' doc comment for why this nulls rather
        // than computes-then-hides.
        $isTeamOnlyFormat = in_array(
            trim((string)($gameRow['dbGames_GameFormat'] ?? '')),
            self::NON_PERSONAL_SCORE_FORMATS,
            true
        );

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

                // dbGames_FlightConfig is hydrated from the event (fixed
                // mode) same as dbGames_TeamConfig — corrects an earlier
                // assumption in this file's history that Flight had no
                // round-level config column at all. parseFlightConfig()
                // mirrors parseTeamConfig()'s exact pattern.
                $flightKeyRaw = trim((string)($player['dbPlayers_FlightKey'] ?? ''));
                // Every event always has at least 1 flight (never 0 — see
                // background doc §2), so an empty/unresolved key here means
                // legacy or malformed data, not a genuine "no flight" state.
                // Default to the same floor the rest of the system already
                // assumes rather than emitting null and pushing a new
                // null-handling branch onto the event-level aggregator.
                $flightKey = $flightKeyRaw !== '' ? $flightKeyRaw : 'F1';
                $flightInfo = $flightConfigById[$flightKey] ?? null;
                $flightName = trim((string)($flightInfo['name'] ?? '')) ?: 'Flight-1';

                $grossDisplay = $isTeamOnlyFormat ? null : ($player['totals']['grossDiff']['9c'] ?? null);
                $netDisplay = $isTeamOnlyFormat ? null : ($player['totals']['netDiff']['9c'] ?? null);
                $grossFrontDisplay = $isTeamOnlyFormat ? null : ($player['totals']['grossDiff']['9a'] ?? null);
                $grossBackDisplay = $isTeamOnlyFormat ? null : ($player['totals']['grossDiff']['9b'] ?? null);
                $netFrontDisplay = $isTeamOnlyFormat ? null : ($player['totals']['netDiff']['9a'] ?? null);
                $netBackDisplay = $isTeamOnlyFormat ? null : ($player['totals']['netDiff']['9b'] ?? null);

                // The real "hasn't started" signal — grossDisplay/netDisplay
                // are formatted strings (see this function's doc comment),
                // and a not-yet-played player still has a "-" placeholder
                // string there, not a PHP null, so displayToNumeric() would
                // otherwise silently resolve it to 0.0, indistinguishable
                // from a genuine even-par round. countDeclaredScores() looks
                // at the actual hole data instead of a display string.
                $scoreCount = $isTeamOnlyFormat ? 0 : self::countDeclaredScores([$player], $fullGameHoles);

                // Same {value,display} shape as buildPairFieldRows'
                // grossDiffSegments/netDiffSegments, nulled per $validSeg on
                // a 9-hole round — kept identical so score_summary.js's
                // strokeDiffSegments() works unmodified at either grain.
                $toCell = fn($display) => [
                    'value' => $display !== null ? self::displayToNumeric((string)$display) : null,
                    'display' => $display ?? '—',
                ];
                $nullCell = ['value' => null, 'display' => null];
                $grossDiffSegments = $isTeamOnlyFormat ? ['front' => $nullCell, 'back' => $nullCell, 'total' => $nullCell]
                    : self::nullInvalidValueDisplaySegments([
                        'front' => $toCell($grossFrontDisplay),
                        'back'  => $toCell($grossBackDisplay),
                        'total' => $toCell($grossDisplay),
                    ], $validSeg);
                $netDiffSegments = $isTeamOnlyFormat ? ['front' => $nullCell, 'back' => $nullCell, 'total' => $nullCell]
                    : self::nullInvalidValueDisplaySegments([
                        'front' => $toCell($netFrontDisplay),
                        'back'  => $toCell($netBackDisplay),
                        'total' => $toCell($netDisplay),
                    ], $validSeg);

                $fullName = trim((string)($player['dbPlayers_Name'] ?? ''));
                $lastName = trim((string)($player['dbPlayers_LName'] ?? ''));

                $out[] = [
                    'playerId' => $playerId,
                    // Full name for display; last name kept separately since
                    // it's the more natural sort key for a leaderboard list —
                    // avoids re-deriving it from playerName later.
                    'playerName' => $fullName ?: self::buildPairFieldLabel([$player]),
                    'playerLastName' => $lastName,
                    // null (not '—' / 0) for a team-only-format round — this
                    // player never had a personal score to report, distinct
                    // from a personal-format round where a score genuinely
                    // wasn't entered yet.
                    'grossDiffValue' => ($grossDisplay !== null) ? self::displayToNumeric((string)$grossDisplay) : null,
                    'grossDiffDisplay' => $isTeamOnlyFormat ? null : ($grossDisplay ?? '—'),
                    'netDiffValue' => ($netDisplay !== null) ? self::displayToNumeric((string)$netDisplay) : null,
                    'netDiffDisplay' => $isTeamOnlyFormat ? null : ($netDisplay ?? '—'),
                    'grossDiffSegments' => $grossDiffSegments,
                    'netDiffSegments' => $netDiffSegments,
                    // The authoritative "has this player declared anything"
                    // signal — see this loop's own comment on why
                    // grossDiffValue/netDiffValue can't be used for that.
                    'scoreCount' => $scoreCount,
                    'thru' => self::deriveThru([$player], $fullGameHoles),
                    'teamKey' => $teamKey !== '' ? $teamKey : null,
                    'teamName' => $teamInfo['name'] ?? null,
                    'teamColor' => $teamInfo['color'] ?? null,
                    'teamSort' => $teamInfo['sort'] ?? null,
                    'flightKey' => $flightKey,
                    'flightName' => $flightName,
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
     * A player who hasn't declared any scores (scoreCount === 0) is excluded
     * from ranking/points/rank entirely, same treatment as a scoreless
     * PairField pairing — not defaulted to even-par. grossDiffValue/
     * netDiffValue can't be used for this check: they're derived from a
     * formatted display string (see buildIndividualRows()' own doc comment),
     * and an unstarted player still has a "-" placeholder there rather than
     * a real null, so displayToNumeric() would silently resolve it to 0.0.
     * Team-only-format rounds (NON_PERSONAL_SCORE_FORMATS) are handled
     * separately below — there, null means "no personal score exists at
     * all," a different condition from "hasn't started yet."
     *
     * rankGross/rankNet are standard competition ranking (ties share a rank,
     * next distinct value skips accordingly — "1,2,2,4") — a separate
     * concern from the points tie rule (split/high/low), which governs how
     * points get distributed among tied ranks, not how rank itself reads.
     */
    private static function applyIndividualPlacementPoints(array $individualRows, array $gameRow): array
    {
        $isTeamOnlyFormat = in_array(
            trim((string)($gameRow['dbGames_GameFormat'] ?? '')),
            self::NON_PERSONAL_SCORE_FORMATS,
            true
        );

        if ($isTeamOnlyFormat) {
            foreach ($individualRows as &$row) {
                $row['placementPointsGross'] = null;
                $row['placementPointsNet'] = null;
                $row['rankGross'] = null;
                $row['rankNet'] = null;
            }
            unset($row);
            return $individualRows;
        }

        $placement = self::parsePlacementPoints($gameRow);
        $grossCat = $placement['categories']['individualGross'];
        $netCat = $placement['categories']['individualNet'];

        // scoreCount === 0 means the player never entered a personal score
        // at all (see this function's own doc comment above) — excluded
        // from ranking independently per metric, rather than defaulted to
        // even-par, so a player who hasn't started can't tie for and
        // collect a real placement. gross/net are excluded together here
        // (unlike PairField's per-metric scoreCount, this is a single
        // per-player signal — a player either declared scores this round or
        // didn't, there's no separate "gross started, net didn't" state).
        $flightKeyByIdx = [];
        $grossRankInput = [];
        $netRankInput = [];
        foreach ($individualRows as $idx => $row) {
            if (($row['scoreCount'] ?? 0) <= 0) {
                continue;
            }
            $flightKeyByIdx[$idx] = $row['flightKey'] ?? 'F1';
            $grossRankInput[] = ['idx' => $idx, 'value' => (float)($row['grossDiffValue'] ?? 0)];
            $netRankInput[] = ['idx' => $idx, 'value' => (float)($row['netDiffValue'] ?? 0)];
        }

        // Flight-scoped (task #9) — each flight ranked and pointed
        // completely independently, no crossover. rankGross/rankNet are
        // scoped along with the points they accompany, unlike rows' own
        // separate 'rank' field (a different, pre-existing mechanism,
        // explicitly out of scope for this task).
        $grossPts = self::rankWithinFlights($grossRankInput, $flightKeyByIdx,
            fn(array $g) => self::assignPlacementPoints($g, $grossCat['pointsConfig'], $grossCat['tieRule']));
        $netPts = self::rankWithinFlights($netRankInput, $flightKeyByIdx,
            fn(array $g) => self::assignPlacementPoints($g, $netCat['pointsConfig'], $netCat['tieRule']));
        $grossRanks = self::rankWithinFlights($grossRankInput, $flightKeyByIdx,
            fn(array $g) => self::computeStandardRanks($g));
        $netRanks = self::rankWithinFlights($netRankInput, $flightKeyByIdx,
            fn(array $g) => self::computeStandardRanks($g));

        foreach ($individualRows as $idx => &$row) {
            $hasScores = (($row['scoreCount'] ?? 0) > 0);
            $row['placementPointsGross'] = $hasScores ? ($grossPts[$idx] ?? 0.0) : null;
            $row['placementPointsNet'] = $hasScores ? ($netPts[$idx] ?? 0.0) : null;
            $row['rankGross'] = $grossRanks[$idx] ?? null;
            $row['rankNet'] = $netRanks[$idx] ?? null;
        }
        unset($row);

        return $individualRows;
    }

    /**
     * Standard competition ranking ("1,2,2,4") over the same
     * ['idx'=>..., 'value'=>...] shape assignPlacementPoints() takes — lower
     * value is better, ties share a rank, the next distinct value skips
     * ahead accordingly. Deliberately separate from assignPlacementPoints()'
     * own tie handling (split/high/low): that governs how POINTS get
     * distributed among tied ranks, this just answers "what rank is this,"
     * a display concept, not a points-distribution one.
     *
     * @return array<int,int> idx => rank
     */
    private static function computeStandardRanks(array $rows): array
    {
        $sorted = $rows;
        usort($sorted, fn(array $a, array $b): int => $a['value'] <=> $b['value']);

        $ranks = [];
        $rank = 0;
        $seen = 0;
        $prevValue = null;
        foreach ($sorted as $entry) {
            $seen++;
            if ($prevValue === null || $entry['value'] !== $prevValue) {
                $rank = $seen;
            }
            $ranks[$entry['idx']] = $rank;
            $prevValue = $entry['value'];
        }
        return $ranks;
    }

    /**
     * Groups $rankInput (['idx'=>..., 'value'=>...] entries) by
     * $flightKeyByIdx, runs $rankFn independently within each flight's own
     * group, and merges the results back into one idx-keyed map spanning
     * every row — task #9's fix: round-level Placement Points were ranking
     * the whole field together regardless of flight. Flight is a pure
     * grouping/scope (never itself aggregated or ranked) — this is what
     * makes that concrete: each flight gets its own complete 1..N ranking
     * and its own complete points distribution from the same points table,
     * with zero crossover between flights, same principle already
     * confirmed correct at the event level.
     *
     * $rankFn receives one flight's own entries and must return an
     * idx-keyed map, same shape assignPlacementPoints()/
     * computeStandardRanks() already return — this just fans a single call
     * out into N independent calls, one per flight, then flattens the
     * results back together.
     */
    private static function rankWithinFlights(array $rankInput, array $flightKeyByIdx, callable $rankFn): array
    {
        $groups = [];
        foreach ($rankInput as $entry) {
            $fk = $flightKeyByIdx[$entry['idx']] ?? 'F1';
            $groups[$fk][] = $entry;
        }

        $merged = [];
        foreach ($groups as $groupRows) {
            $merged += $rankFn($groupRows);
        }
        return $merged;
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
     *
     * Flight-scoped (confirmed: Team is nested inside Flight, never spans
     * flights) — grouped by [flightKey, teamKey] rather than teamKey alone,
     * same principle as rankWithinFlights() elsewhere in this file. A team
     * that happens to have members in more than one flight (data drift, not
     * expected) produces one rollup row per flight it actually appears in,
     * rather than one row silently summing across flight boundaries.
     * $flightConfigById resolves flightName the same way parseFlightConfig()
     * already does everywhere else in this file.
     */
    private static function buildTeamRollupRows(array $rows, string $competition, array $flightConfigById): array
    {
        $teams = [];

        $flightName = function (string $flightKey) use ($flightConfigById): string {
            return trim((string)($flightConfigById[$flightKey]['name'] ?? '')) ?: 'Flight-1';
        };

        if ($competition === 'PairPair') {
            foreach ($rows as $row) {
                $flightKey = $row['flightKey'] ?? 'F1';
                foreach (['left', 'right'] as $side) {
                    $sideData = $row[$side] ?? [];
                    $teamKey = $sideData['teamKey'] ?? null;
                    if ($teamKey === null || $teamKey === '') continue;

                    $groupKey = $flightKey . '|' . $teamKey;

                    if (!isset($teams[$groupKey])) {
                        $teams[$groupKey] = [
                            'flightKey' => $flightKey,
                            'flightName' => $flightName($flightKey),
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
                    if ($status === 'W') $teams[$groupKey]['record']['w']++;
                    elseif ($status === 'L') $teams[$groupKey]['record']['l']++;
                    elseif ($status === 'H') $teams[$groupKey]['record']['h']++;

                    $teams[$groupKey]['pointsTotal'] += (float)($overall['points'] ?? 0);
                }
            }
        } else {
            foreach ($rows as $row) {
                $teamKey = $row['teamKey'] ?? null;
                if ($teamKey === null || $teamKey === '') continue;
                $flightKey = $row['flightKey'] ?? 'F1';
                $groupKey = $flightKey . '|' . $teamKey;

                if (!isset($teams[$groupKey])) {
                    $teams[$groupKey] = [
                        'flightKey' => $flightKey,
                        'flightName' => $flightName($flightKey),
                        'teamKey' => $teamKey,
                        'teamName' => $row['teamName'] ?? null,
                        'teamColor' => $row['teamColor'] ?? null,
                        'teamSort' => $row['teamSort'] ?? null,
                        'grossDiffTotal' => 0.0,
                        'netDiffTotal' => 0.0,
                        // Starts null, same "no member has a real value yet"
                        // convention as a single scoreless row — upgraded to
                        // 0.0 the first time ANY member of the team actually
                        // has one, not decided by whichever member happens
                        // to be encountered first. A team with one scoreless
                        // pairing and one real one must still total the real
                        // one's points, not silently stay null forever.
                        'placementPointsGrossTotal' => null,
                        'placementPointsNetTotal' => null,
                    ];
                }

                $teams[$groupKey]['grossDiffTotal'] += (float)($row['grossDiffValue'] ?? 0);
                $teams[$groupKey]['netDiffTotal'] += (float)($row['netDiffValue'] ?? 0);
                if ($row['placementPointsGross'] !== null) {
                    $teams[$groupKey]['placementPointsGrossTotal'] =
                        ($teams[$groupKey]['placementPointsGrossTotal'] ?? 0.0) + (float)$row['placementPointsGross'];
                }
                if ($row['placementPointsNet'] !== null) {
                    $teams[$groupKey]['placementPointsNetTotal'] =
                        ($teams[$groupKey]['placementPointsNetTotal'] ?? 0.0) + (float)$row['placementPointsNet'];
                }
            }
        }

        $out = array_values($teams);
        usort($out, fn($a, $b) => [(string)$a['flightKey'], $a['teamSort'] ?? 999] <=> [(string)$b['flightKey'], $b['teamSort'] ?? 999]);
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
        $flightConfigById = self::parseFlightConfig($gameRow);

        $basis = strtolower((string)($meta['scoringBasis'] ?? 'Strokes'));
        $pointsConfig = ($basis === 'points') ? self::parsePointsConfig($gameRow) : ['strategy' => '', 'values' => []];
        $pointsStrategy = trim((string)($pointsConfig['strategy'] ?? 'Stableford'));
        $isChicago = ($basis === 'points' && $pointsStrategy === 'Chicago');

        // Front/back always shown for PairField (no per-game toggle, unlike
        // PairPair's dbGames_ScoringSegments) — validSegmentKeys() still
        // decides whether front/back are structurally real for this round's
        // hole range (9-hole rounds only have one real half), same helper
        // buildPairPairRows() already uses.
        $validSeg = self::validSegmentKeys($gameRow);

        // Chicago quota — (points value at reltoPar=0) is the only part of
        // the quota base that's constant across the whole game; the hole
        // count it multiplies by is NOT constant when rotation is active
        // (see the per-row use below), so only the at-par points value is
        // precomputed here.
        $atParPoints = 2.0;
        if ($isChicago) {
            $stablefordMapForQuota = ServiceCalcPoints::parseStablefordMap($pointsConfig);
            $atParPoints = (float)($stablefordMapForQuota[0] ?? 2.0);
        }

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

                // Front/back Strokes breakdown — same {value,display} shape
                // as gameSegments/grossDiffSegments elsewhere, nulled per
                // $validSeg on a 9-hole round rather than showing a
                // misleading real zero for the half that was never played.
                $grossDiffSegments = self::nullInvalidValueDisplaySegments([
                    'front' => self::metricFromTotalRow($totalRow, 'grossDiff', '9a'),
                    'back'  => self::metricFromTotalRow($totalRow, 'grossDiff', '9b'),
                    'total' => $gross,
                ], $validSeg);
                $netDiffSegments = self::nullInvalidValueDisplaySegments([
                    'front' => self::metricFromTotalRow($totalRow, 'netDiff', '9a'),
                    'back'  => self::metricFromTotalRow($totalRow, 'netDiff', '9b'),
                    'total' => $net,
                ], $validSeg);

                // Team — every player in the pairing must actually agree on
                // dbPlayers_TeamKey before it's trusted; see sideTeamKey()'s
                // own comment. (This function used to assume upstream
                // alignment guaranteed agreement and read only
                // $pairPlayers[0] — the same assumption that produced the
                // PairPair "everyone shows one team" incident, just not yet
                // known to affect this sibling code path until a PairField
                // game surfaced the identical pattern: TeamKey assigned by
                // position within the pairing rather than by pairing.)
                $teamKey = self::sideTeamKey($pairPlayers) ?? '';
                $teamInfo = $teamConfigById[$teamKey] ?? null;

                // Same "every event has ≥1 flight" floor as
                // buildIndividualRows() — disagreement or an unresolved key
                // falls back to 'F1' rather than surfacing null. Added
                // specifically to flight-scope this round's own Placement
                // Points ranking below (task #9); carried onto the row like
                // teamKey rather than stripped back out afterward.
                $flightKey = self::sideFlightKey($pairPlayers) ?? 'F1';

                // Chicago quota — see computeChicagoQuota() for the full
                // rotation-aware derivation. PairField rows are never
                // rotation-aware ($ctx['isRotationAware'] is always false
                // here — see ServiceScoreRotation::isRotationAwarePairPair,
                // which is PairPair-only), so this is the same whole-round
                // calculation as before for PairField; only PairPair rows
                // (below, in buildPairPairRows) actually exercise the
                // spin-scoped branch. Computed unconditionally and cheaply
                // here; zero/unused when the game isn't actually Chicago.
                $quotaValue = $isChicago
                    ? self::computeChicagoQuota($gameRow, $pairPlayers, $scopedHoles, $atParPoints, $ctx['isRotationAware'])
                    : 0.0;

                $out[] = [
                    'pairingId' => (string)$pairingId,
                    'pairingLabel' => self::buildPairFieldLabel($pairPlayers),
                    'scoreCount' => self::countDeclaredScores($pairPlayers, $scopedHoles),
                    'grossDiffValue' => $gross['value'],
                    'grossDiffDisplay' => $gross['display'],
                    'netDiffValue' => $net['value'],
                    'netDiffDisplay' => $net['display'],
                    'grossDiffSegments' => $grossDiffSegments,
                    'netDiffSegments' => $netDiffSegments,
                    'pointsValue' => $points['value'],
                    'pointsDisplay' => $points['display'],
                    'quotaValue' => $quotaValue,
                    'thru' => self::deriveThru($pairPlayers, $scopedHoles),

                    // Team — null fields when no dbGames_TeamConfig is set,
                    // meaning the leaderboard's Team pill has nothing to show.
                    'teamKey' => $teamKey !== '' ? $teamKey : null,
                    'teamName' => $teamInfo['name'] ?? null,
                    'teamColor' => $teamInfo['color'] ?? null,
                    'teamSort' => $teamInfo['sort'] ?? null,

                    // Flight — used to scope this round's own Placement
                    // Points ranking below (task #9); always resolves to a
                    // real value ('F1' floor), never null.
                    'flightKey' => $flightKey,

                    // Round-native player list for this pairing — see
                    // exportPlayersList()'s doc comment.
                    'players' => self::exportPlayersList($pairPlayers),

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


        // ── Skins resolution for Traditional Skins (PairField) ───────────────────────
        // grossSkins/netSkins are {front,back,total} objects here, same shape
        // PairPair already carries — score_summary.js's skinsValue()/
        // skinsSegments() read a .total/.front/.back off these regardless of
        // competition type, so the two sides need to agree on shape.
        if ($basis === 'skins') {
            $skinsResult = self::resolvePairFieldSkins($out, $scorecardRows, $gameRow);
            foreach ($out as &$row) {
                $pId = $row['pairingId'];
                $grossSk = $skinsResult['gross'][$pId] ?? ['front' => 0, 'back' => 0, 'total' => 0];
                $netSk   = $skinsResult['net'][$pId]   ?? ['front' => 0, 'back' => 0, 'total' => 0];
                $row['grossSkins'] = self::nullInvalidScalarSegments($grossSk, $validSeg);
                $row['netSkins']   = self::nullInvalidScalarSegments($netSk, $validSeg);
            }
            unset($row);
        } else {
            foreach ($out as &$row) {
                $row['grossSkins'] = ['front' => 0, 'back' => 0, 'total' => 0];
                $row['netSkins']   = ['front' => 0, 'back' => 0, 'total' => 0];
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
                $row['grossPoints']   = self::nullInvalidScalarSegments($grossPts, $validSeg);
                $row['netPoints']     = self::nullInvalidScalarSegments($netPts, $validSeg);
                // Override the columnTotals-derived values (which are zero since
                // points are now calculated here, not in decorateScoredPlayers)
                $row['pointsValue']   = (float)$netPts['total'];
                $row['pointsDisplay'] = (string)(int)$netPts['total'];

                // Chicago — net raw points against the pairing's quota (sum of
                // each player's 36-minus-handicap). Positive = beat quota,
                // negative = missed it, matching formatGameDiff's existing
                // +/-/0 convention used elsewhere for to-par display.
                if ($isChicago) {
                    $netToQuota = $row['pointsValue'] - $row['quotaValue'];
                    $row['quotaNetValue']   = $netToQuota;
                    $row['quotaNetDisplay'] = self::formatGameDiff($netToQuota);
                } else {
                    $row['quotaNetValue']   = null;
                    $row['quotaNetDisplay'] = null;
                }
            }
            unset($row);
        } else {
            foreach ($out as &$row) {
                $row['grossPoints'] = ['front' => 0, 'back' => 0, 'total' => 0];
                $row['netPoints']   = ['front' => 0, 'back' => 0, 'total' => 0];
                $row['quotaNetValue']   = null;
                $row['quotaNetDisplay'] = null;
            }
            unset($row);
        }
        // ─────────────────────────────────────────────────────────────────────────────

        usort($out, function (array $a, array $b) use ($basis, $isChicago): int {
            return self::comparePairFieldRows($a, $b, $basis, $isChicago);
        });

        if ($out) {
            // Rows with zero declared scores sort strictly after every row
            // that has scores (see comparePairFieldRows()'s own leading
            // check) — they never move a real leaderSeed. rank/isLeader are
            // explicitly null/false for them rather than a real standings
            // position: 'Cant rank null' — a pairing that never entered a
            // score isn't in 4th place, it just hasn't played.
            $leaderSeed = $out[0];
            $rankCounter = 0;
            foreach ($out as $idx => &$row) {
                $hasScores = (($row['scoreCount'] ?? 0) > 0);
                $row['rank'] = $hasScores ? (++$rankCounter) : null;
                $row['isLeader'] = $hasScores
                    && self::comparePairFieldRows($row, $leaderSeed, $basis, $isChicago) === 0;
            }
            unset($row);
        }

        // ── Placement Points (§4.2, extended for Individual/Pairing category
        // states) — ranks the field twice, once by gross, once by net,
        // independent of dbGames_ScoringBasis. Always computed regardless of
        // the gross/net categories' active/disabled/default state — state is
        // display-only (score_summary.js), never a gate on acquisition.
        // Flight-scoped (task #9) — each flight ranked and pointed
        // completely independently, no crossover, via rankWithinFlights().
        // The separate 'rank' field assigned earlier in this function
        // (score-based, pre-existing) is a different mechanism and stays
        // global — explicitly out of scope for this task.
        $placement = self::parsePlacementPoints($gameRow);
        $grossCat = $placement['categories']['gross'];
        $netCat = $placement['categories']['net'];

        // A pairing with zero declared scores has no basis for a placement
        // at all — leaving it in the ranking pool meant metricFromTotalRow's
        // manufactured 0.0 (see its own comment) was indistinguishable from
        // a genuine even-par round, so a scoreless pairing could tie for a
        // real position and walk away with real points. Excluded here
        // rather than ranked-then-zeroed, so it doesn't consume a tied rank
        // or skew the split-tie math for pairings that actually played.
        $flightKeyByIdx = [];
        $grossRankInput = [];
        $netRankInput = [];
        foreach ($out as $idx => $row) {
            if (($row['scoreCount'] ?? 0) <= 0) {
                continue;
            }
            $flightKeyByIdx[$idx] = $row['flightKey'] ?? 'F1';
            $grossRankInput[] = ['idx' => $idx, 'value' => (float)($row['grossDiffValue'] ?? 0)];
            $netRankInput[] = ['idx' => $idx, 'value' => (float)($row['netDiffValue'] ?? 0)];
        }
        $grossPts = self::rankWithinFlights($grossRankInput, $flightKeyByIdx,
            fn(array $g) => self::assignPlacementPoints($g, $grossCat['pointsConfig'], $grossCat['tieRule']));
        $netPts = self::rankWithinFlights($netRankInput, $flightKeyByIdx,
            fn(array $g) => self::assignPlacementPoints($g, $netCat['pointsConfig'], $netCat['tieRule']));

        foreach ($out as $idx => &$row) {
            $row['placementPointsGross'] = (($row['scoreCount'] ?? 0) > 0) ? ($grossPts[$idx] ?? 0.0) : null;
            $row['placementPointsNet'] = (($row['scoreCount'] ?? 0) > 0) ? ($netPts[$idx] ?? 0.0) : null;
        }
        unset($row);

        return $out;
    }

    /**
     * Chicago quota for a group of players (a PairField pairing, or one side
     * of a PairPair match) over a given hole scope.
     *
     * Sum, per player, of (at-par points × holes in scope) − handicap
     * contribution for that scope:
     *   - Non-rotation-aware: handicap contribution is the player's whole-
     *     round effective handicap (ServiceScoreCard::calculateEffectiveHandicap),
     *     same as before — unchanged behavior for PairField and non-rotation
     *     PairPair.
     *   - Rotation-aware (PairPair + COD/1324/1423): the round's holes are
     *     split into spins by ServiceScoreRotation, and $players here is
     *     already the specific synthetic side for ONE spin (see
     *     buildRotatedContexts()/deriveSpinTeams() — partners actually change
     *     each spin). $scopedHoles is that spin's holes only, not the whole
     *     round, so both the quota base and the handicap contribution must
     *     be scoped to just this spin: the handicap contribution sums
     *     ServiceScoreRotation::buildSpinAwareStrokeAllocationMap()'s
     *     per-hole strokes (already spin-apportioned, respecting
     *     dbGames_StrokeDistribution) over just this spin's holes.
     */
    private static function computeChicagoQuota(
        array $gameRow,
        array $players,
        array $scopedHoles,
        float $atParPoints,
        bool $isRotationAware
    ): float {
        $quotaBasePerPlayer = $atParPoints * count($scopedHoles);
        $fullRoundHoles = self::holesForGame($gameRow);
        // Whole round scope, non-rotation: exactly the original flat-handicap
        // behavior — verified against ServiceScoreCard::buildStrokeAllocationMap()
        // that its per-hole sum only equals the flat handicap value for a FULL
        // round; for a 9-hole (F9/B9) round specifically, that function's sum
        // deliberately comes out lower than the flat handicap once handicap
        // reaches 18+ (it doesn't try to cram a large handicap into 9 holes at
        // double rate — same divide-by-18 convention the scorecard itself
        // uses). So this whole-round branch must stay on the flat value; only
        // a genuinely partial scope below switches to the per-hole approach.
        $isWholeRound = (count($scopedHoles) === count($fullRoundHoles))
            && !array_diff($scopedHoles, $fullRoundHoles);

        $total = 0.0;

        foreach ($players as $player) {
            $fullHandicap = ServiceScoreCard::calculateEffectiveHandicap($gameRow, $player);

            if (!$isRotationAware && $isWholeRound) {
                $handicapContribution = $fullHandicap;
            } else {
                // Partial scope — front-9-only/back-9-only 3-segment scoring,
                // or a rotation spin. Sum the real per-hole stroke allocation
                // over just these holes (the same map the scorecard itself
                // uses to apply strokes), rather than assuming an even split —
                // a player's stroke holes aren't evenly distributed front vs.
                // back, so this matches what actually happened on the card.
                $teeDetails = $player['dbPlayers_TeeSetDetails'] ?? null;
                $teeHoles = is_array($teeDetails) ? ($teeDetails['holes'] ?? $teeDetails['Holes'] ?? []) : [];
                $strokeMap = $isRotationAware
                    ? ServiceScoreRotation::buildSpinAwareStrokeAllocationMap($gameRow, $fullHandicap, $teeHoles)
                    : ServiceScoreCard::buildStrokeAllocationMap($gameRow, $fullHandicap, $teeHoles);

                if ($strokeMap) {
                    $handicapContribution = 0.0;
                    foreach ($scopedHoles as $holeNumber) {
                        $handicapContribution += (float)($strokeMap[$holeNumber] ?? 0);
                    }
                } else {
                    // No tee-set hole data to allocate from (e.g. missing
                    // dbPlayers_TeeSetDetails) — fall back to a proportional
                    // share of the flat handicap rather than silently
                    // treating the player as scratch for this scope.
                    $fullCount = count($fullRoundHoles) ?: 1;
                    $handicapContribution = $fullHandicap * (count($scopedHoles) / $fullCount);
                }
            }

            $total += $quotaBasePerPlayer - $handicapContribution;
        }

        return $total;
    }

    private static function comparePairFieldRows(array $a, array $b, string $basis, bool $isChicago = false): int
    {
        // A pairing with zero declared scores always sorts last, regardless
        // of basis — metricFromTotalRow() defaults an empty round to a raw
        // 0.0 (see its own comment), which without this check would rank
        // ahead of anyone actually over par instead of not being ranked at
        // all.
        $aHasScores = (($a['scoreCount'] ?? 0) > 0);
        $bHasScores = (($b['scoreCount'] ?? 0) > 0);
        if ($aHasScores !== $bHasScores) {
            return $aHasScores ? -1 : 1;
        }

        if ($basis === 'points') {
            if ($isChicago) {
                // Chicago's winner is whoever most exceeds their own quota —
                // not whoever racked up the most raw points. quotaNetValue is
                // always populated on every row when $isChicago (never null),
                // set alongside pointsValue above.
                $cmp = ($b['quotaNetValue'] <=> $a['quotaNetValue']); // higher net-to-quota wins
                if ($cmp !== 0) return $cmp;
            } else {
                $cmp = ($b['pointsValue'] <=> $a['pointsValue']); // higher points wins
                if ($cmp !== 0) return $cmp;
            }
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
     * Parses dbGames_FlightConfig into an id-keyed lookup — same shape and
     * parsing pattern as parseTeamConfig(), now that dbGames_FlightConfig is
     * confirmed to exist and be hydrated from the event (correcting an
     * earlier assumption in this file's history that Flight had no
     * round-level config column at all).
     */
    private static function parseFlightConfig(array $gameRow): array
    {
        $raw = $gameRow['dbGames_FlightConfig'] ?? null;
        if ($raw === null || $raw === '') return [];

        $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
        $flights = is_array($decoded['flights'] ?? null) ? $decoded['flights'] : [];

        $byId = [];
        foreach ($flights as $f) {
            if (!is_array($f)) continue;
            $id = trim((string)($f['id'] ?? ''));
            if ($id !== '') $byId[$id] = $f;
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
     * Public (not private) specifically so the event-level aggregation
     * service can reuse this exact tie-aware rank-to-points mapper against
     * final event standings, rather than reimplementing it — see
     * event_leaderboard_spec.md §5, "Placement Points reuses the same
     * rank-to-points mechanism the round-level engine already has." No
     * behavior change from the round-level call sites in this file; they're
     * unaffected by the visibility change.
     *
     * tieRule:
     *   'split' (default) — tied rows split the average of the positions they occupy
     *   'high'             — tied rows all receive the better (higher-points) position's value
     *   'low'              — tied rows all receive the worse (lower-points) position's value
     */
    public static function assignPlacementPoints(array $rows, array $pointsConfig, string $tieRule): array
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
        $isPointsBasis = (strtolower($scoringBasis) === 'points');

        // Chicago — same detection/derivation as buildPairFieldRows(). Only
        // the at-par points value is precomputed here; the quota base's hole
        // count is scoped per-row below (see computeChicagoQuota()), since a
        // rotation-aware match's rows are per-spin, not per-whole-round.
        $pointsConfig = $isPointsBasis ? self::parsePointsConfig($gameRow) : ['strategy' => '', 'values' => []];
        $isChicago = $isPointsBasis && (trim((string)($pointsConfig['strategy'] ?? '')) === 'Chicago');
        $atParPoints = 2.0;
        if ($isChicago) {
            $atParPoints = (float)(ServiceCalcPoints::parseStablefordMap($pointsConfig)[0] ?? 2.0);
        }

        // Scoring Segments — PairPair only. 1 = one overall match result (default),
        // 3 = front 9 / back 9 / overall scored independently. Independent of
        // Playing Segments (dbGames_Segments) — no relationship between the two.
        $scoringSegments = (int)($gameRow['dbGames_ScoringSegments'] ?? 1);
        if (!in_array($scoringSegments, [1, 3], true)) $scoringSegments = 1;

        // Which of front/back are structurally real for this game's hole range —
        // a 9-hole round (F9/B9) only ever has one, never both.
        $validSeg = self::validSegmentKeys($gameRow);
        $teamConfigById = self::parseTeamConfig($gameRow);
        $flightConfigById = self::parseFlightConfig($gameRow);

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
            if ($isPointsBasis) {
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

            // ── Chicago quota resolution ──────────────────────────────────────────
            // Per side (not per player individually — see comparePairFieldRows'
            // PairField equivalent for the same sum-of-individual-quotas logic).
            // computeChicagoQuota() is spin-aware: $scopedHoles and
            // $ctx['isRotationAware'] already reflect THIS row's spin when
            // rotation is active (deriveSpinTeams() has already reshuffled
            // $leftPlayers/$rightPlayers into that spin's actual partnerships
            // by the time control reaches this point — see groupPlayersByFlightPos()
            // above, which groups the already-rotated $players for this row).
            //
            // quotaNetValue/quotaNetDisplay remain the 'total' scalar (unchanged
            // shape, still what the non-segmented display reads). quotaNetSegments
            // additionally carries front/back/total — front/back are only ever
            // non-null when ScoringSegments=3, which per the rotation clamp added
            // earlier can only happen when $ctx['isRotationAware'] is false, so
            // computeChicagoQuota() is always called non-rotation-aware for the
            // front/back split specifically.
            $leftQuotaValue = null;
            $rightQuotaValue = null;
            $leftQuotaNetValue = null;
            $rightQuotaNetValue = null;
            $leftQuotaNetDisplay = null;
            $rightQuotaNetDisplay = null;
            $leftQuotaNetSegments = null;
            $rightQuotaNetSegments = null;
            if ($isChicago) {
                $leftQuotaValue = self::computeChicagoQuota($gameRow, $leftPlayers, $scopedHoles, $atParPoints, $ctx['isRotationAware']);
                $rightQuotaValue = self::computeChicagoQuota($gameRow, $rightPlayers, $scopedHoles, $atParPoints, $ctx['isRotationAware']);

                // Same gross/net switch pairPairComparisonValue() already uses
                // for 'points' — keeps the quota-net value consistent with
                // whichever points figure the game's own scoring method says
                // is official.
                $pointsMetric = ($scoringMethod === 'ADJ GROSS') ? 'gross' : 'net';
                $leftPointsTotal = (float)($pairPairPoints[$pointsMetric][(string)$leftPairingId]['total'] ?? 0.0);
                $rightPointsTotal = (float)($pairPairPoints[$pointsMetric][(string)$rightPairingId]['total'] ?? 0.0);

                $leftQuotaNetValue = $leftPointsTotal - $leftQuotaValue;
                $rightQuotaNetValue = $rightPointsTotal - $rightQuotaValue;
                $leftQuotaNetDisplay = self::formatGameDiff($leftQuotaNetValue);
                $rightQuotaNetDisplay = self::formatGameDiff($rightQuotaNetValue);

                $nullCell = ['value' => null, 'display' => null];
                $totalCell = ['value' => $leftQuotaNetValue, 'display' => $leftQuotaNetDisplay];
                $leftQuotaNetSegments = ['front' => $nullCell, 'back' => $nullCell, 'total' => $totalCell];
                $rightQuotaNetSegments = ['front' => $nullCell, 'back' => $nullCell,
                    'total' => ['value' => $rightQuotaNetValue, 'display' => $rightQuotaNetDisplay]];

                if ($scoringSegments === 3) {
                    $frontHoles = array_values(array_filter($scopedHoles, fn($h) => (int)$h <= 9));
                    $backHoles  = array_values(array_filter($scopedHoles, fn($h) => (int)$h >= 10));

                    if ($validSeg['front'] && $frontHoles) {
                        $leftFrontQuota = self::computeChicagoQuota($gameRow, $leftPlayers, $frontHoles, $atParPoints, false);
                        $rightFrontQuota = self::computeChicagoQuota($gameRow, $rightPlayers, $frontHoles, $atParPoints, false);
                        $leftFrontPoints = (float)($pairPairPoints[$pointsMetric][(string)$leftPairingId]['front'] ?? 0.0);
                        $rightFrontPoints = (float)($pairPairPoints[$pointsMetric][(string)$rightPairingId]['front'] ?? 0.0);
                        $leftFrontNet = $leftFrontPoints - $leftFrontQuota;
                        $rightFrontNet = $rightFrontPoints - $rightFrontQuota;
                        $leftQuotaNetSegments['front'] = ['value' => $leftFrontNet, 'display' => self::formatGameDiff($leftFrontNet)];
                        $rightQuotaNetSegments['front'] = ['value' => $rightFrontNet, 'display' => self::formatGameDiff($rightFrontNet)];
                    }

                    if ($validSeg['back'] && $backHoles) {
                        $leftBackQuota = self::computeChicagoQuota($gameRow, $leftPlayers, $backHoles, $atParPoints, false);
                        $rightBackQuota = self::computeChicagoQuota($gameRow, $rightPlayers, $backHoles, $atParPoints, false);
                        $leftBackPoints = (float)($pairPairPoints[$pointsMetric][(string)$leftPairingId]['back'] ?? 0.0);
                        $rightBackPoints = (float)($pairPairPoints[$pointsMetric][(string)$rightPairingId]['back'] ?? 0.0);
                        $leftBackNet = $leftBackPoints - $leftBackQuota;
                        $rightBackNet = $rightBackPoints - $rightBackQuota;
                        $leftQuotaNetSegments['back'] = ['value' => $leftBackNet, 'display' => self::formatGameDiff($leftBackNet)];
                        $rightQuotaNetSegments['back'] = ['value' => $rightBackNet, 'display' => self::formatGameDiff($rightBackNet)];
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

            // Flight (division) — NOT the same thing as $flightId above, which
            // is the pre-existing MatchID-based bracket/slot label used only
            // for matchLabel display text. This is the real dbPlayers_FlightKey
            // grouping, same concept buildPairFieldRows resolves via
            // sideFlightKey(). A match's two sides are expected to agree (a
            // match is played within one flight); if they don't, prefer the
            // left side rather than silently picking whichever resolves
            // non-null, then fall back to the same 'F1' floor used everywhere
            // else in this file.
            $matchFlightKey = self::sideFlightKey($leftPlayers) ?? self::sideFlightKey($rightPlayers) ?? 'F1';
            $matchFlightName = trim((string)($flightConfigById[$matchFlightKey]['name'] ?? '')) ?: 'Flight-1';

            $out[] = [
                'flightId'       => $flightId,
                'flightKey'      => $matchFlightKey,
                'flightName'     => $matchFlightName,
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
                    // Round-native player list for this side — see
                    // exportPlayersList()'s doc comment.
                    'players'         => self::exportPlayersList($leftPlayers, true),
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
                    'quotaValue'      => $leftQuotaValue,
                    'quotaNetValue'   => $leftQuotaNetValue,
                    'quotaNetDisplay' => $leftQuotaNetDisplay,
                    'quotaNetSegments' => $leftQuotaNetSegments,
                ],
                'right' => [
                    'flightPos'       => (string)$rightKey,
                    'pairingId'       => (string)$rightPairingId,
                    'teamKey'         => $rightTeamKey,
                    'teamName'        => $rightTeamInfo['name'] ?? null,
                    'teamColor'       => $rightTeamInfo['color'] ?? null,
                    'teamSort'        => $rightTeamInfo['sort'] ?? null,
                    // Round-native player list for this side — see
                    // exportPlayersList()'s doc comment.
                    'players'         => self::exportPlayersList($rightPlayers, true),
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
                    'quotaValue'      => $rightQuotaValue,
                    'quotaNetValue'   => $rightQuotaNetValue,
                    'quotaNetDisplay' => $rightQuotaNetDisplay,
                    'quotaNetSegments' => $rightQuotaNetSegments,
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
        // "1"=overall (always — including the only segment when segments=1),
        // "2"=front, "3"=back when segments=3 — matches
        // module_definePlacementPoints.js's convention exactly: Overall is
        // permanently key "1" and is never part of segment expansion/
        // contraction, so it can never be silently mistaken for Front 9
        // (the old convention's key "1") when segment count changes.
        $segmentIndexMap = ($scoringSegments === 3)
            ? ['front' => '2', 'back' => '3', 'total' => '1']
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
                // Chicago — the match is decided by who most exceeds their
                // quota, not raw points. quotaNetSegments is only ever set on
                // a side when this game's strategy is actually Chicago (see
                // buildPairPairRows()); every other points strategy has no
                // such key and falls through to the raw-points comparison
                // below, unchanged. A null cell within quotaNetSegments (e.g.
                // front/back on a 9-hole round where that half doesn't exist)
                // is intentionally NOT backfilled from raw points — same
                // "null propagates, not fabricated" convention already used
                // for grossDiffSegments/netDiffSegments, see
                // determineMatchStatus()'s own doc comment.
                if (array_key_exists('quotaNetSegments', $side) && is_array($side['quotaNetSegments'])) {
                    $cell = $side['quotaNetSegments'][$segmentKey] ?? null;
                    return (is_array($cell) && $cell['value'] !== null) ? (float)$cell['value'] : null;
                }

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
     *   2. Partners/pairing agreement (both competition types) — do the
     *      players grouped together on one side/pairing actually agree on
     *      TeamKey? Catches players recorded on different teams even when
     *      the game-wide headcount happens to still be perfectly even —
     *      this is what an even split can hide, and is exactly the failure
     *      mode this check exists for: players correctly split evenly
     *      game-wide, but grouped wrong, so the group silently borrowed one
     *      member's team for the whole group (see sideTeamKey()).
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

        // ── 2. Partners/pairing agreement (both competition types) ───────
        // PairPair: the two partners on each match side must agree.
        // PairField: the two players in each pairing must agree — this
        // check used to be PairPair-only, on the theory that PairField
        // pairings couldn't have this problem; a real PairField game then
        // showed the identical pattern (TeamKey assigned by position within
        // the pairing rather than by pairing), so this now covers both.
        foreach ($scorecardRows as $row) {
            $players = is_array($row['players'] ?? null) ? $row['players'] : [];
            if (!$players) continue;
            $groups = ($competition === 'PairPair')
                ? self::groupPlayersByFlightPos($players)
                : self::groupPlayersByPairing($players);
            foreach ($groups as $groupPlayers) {
                if (count($groupPlayers) < 2) continue;
                $keys = [];
                foreach ($groupPlayers as $p) {
                    $k = trim((string)($p['dbPlayers_TeamKey'] ?? ''));
                    if ($k !== '') $keys[$k] = true;
                }
                if (count($keys) > 1) {
                    return ($competition === 'PairPair')
                        ? 'Partners on the same side of a match are assigned to different teams. '
                            . 'Check Team Configuration for this game.'
                        : 'The two players in a pairing are assigned to different teams. '
                            . 'Check Team Configuration for this game.';
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

    /**
     * Same agreement-required pattern as sideTeamKey() — every player on a
     * pairing must share one dbPlayers_FlightKey before it's trusted. Added
     * specifically so buildPairFieldRows() can flight-scope its Placement
     * Points ranking (task #9 — round-level Placement Points were ranking
     * the whole field together, ignoring flight entirely). Round-scoped
     * only, same as everywhere else in this file — no roster/event lookup.
     */
    private static function sideFlightKey(array $sidePlayers): ?string
    {
        $keys = [];
        foreach ($sidePlayers as $p) {
            $k = trim((string)($p['dbPlayers_FlightKey'] ?? ''));
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

    /**
     * Builds the 'players' list attached to pairing/side rows in
     * buildPairFieldRows()/buildPairPairRows() — GHIN, full name, and last
     * name per player, same fields buildIndividualRows() already exposes
     * per-player, just at pairing/side grain instead. Round-native data
     * only (no roster lookups, no event awareness — this file stays
     * game-scoped; any Event Roster resolution happens one layer up, in
     * the event-level aggregator).
     *
     * $includeMatchPos is PairPair-only: a side's players carry
     * dbPlayers_MatchPos so each player's authoritative side value travels
     * with them individually, not just implied by which of 'left'/'right'
     * they're nested under.
     */
    private static function exportPlayersList(array $players, bool $includeMatchPos = false): array
    {
        $out = [];
        foreach ($players as $player) {
            $entry = [
                'ghin' => (string)($player['playerId'] ?? $player['dbPlayers_PlayerGHIN'] ?? ''),
                'name' => trim((string)($player['dbPlayers_Name'] ?? '')),
                'lastName' => trim((string)($player['dbPlayers_LName'] ?? '')),
            ];
            if ($includeMatchPos) {
                $entry['matchPos'] = trim((string)($player['dbPlayers_MatchPos'] ?? ''));
            }
            $out[] = $entry;
        }
        return $out;
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
        $holes = self::holesForGame($gameRow);

        // Keyed by flightKey => [pairingId => ['pairingId'=>..., 'holes'=>...]].
        // Confirmed: skins are an in-flight pot — carryover chains and awards
        // must never cross a flight boundary, so pairings are bucketed by
        // flight before ServiceCalcSkins ever sees them, rather than pooling
        // the whole field into one calculation.
        $pairingsByFlight = [];

        foreach ($scorecardRows as $scoreRow) {
            $players = is_array($scoreRow['players'] ?? null) ? $scoreRow['players'] : [];
            if (!$players) continue;

            $playersByPairing = self::groupPlayersByPairing($players);

            foreach ($playersByPairing as $pairingId => $pairPlayers) {
                $pairingId = (string)$pairingId;
                // Same "every event has ≥1 flight, unresolved falls to F1"
                // floor used everywhere else in this file.
                $flightKey = self::sideFlightKey($pairPlayers) ?? 'F1';

                if (!isset($pairingsByFlight[$flightKey][$pairingId])) {
                    $pairingsByFlight[$flightKey][$pairingId] = ['pairingId' => $pairingId, 'holes' => []];
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
                        $pairingsByFlight[$flightKey][$pairingId]['holes'][$holeKey] = [
                            'gross'    => $grossDiffSum,
                            'net'      => $netDiffSum,
                            'declared' => true,
                        ];
                    }
                }
            }
        }

        // Front/back are resolved as their own self-contained skins pots —
        // carryover chains reset at the 9-hole boundary rather than
        // continuing through it — same "scored independently" convention
        // module_definePlacementPoints.js already documents for PairPair's
        // segments. $frontHoles/$backHoles are intersected with $holes so a
        // 9-hole round (F9/B9) naturally only ever resolves the half that
        // was actually played.
        $frontHoles = array_values(array_intersect($holes, range(1, 9)));
        $backHoles  = array_values(array_intersect($holes, range(10, 18)));

        // Each flight resolved independently, then merged back into one
        // pairingId-keyed map — pairingIds are unique game-wide, so there's
        // no collision risk in the merge regardless of how many flights
        // contributed to it.
        $totals = ['gross' => [], 'net' => []];
        $fronts = ['gross' => [], 'net' => []];
        $backs  = ['gross' => [], 'net' => []];
        foreach ($pairingsByFlight as $pairings) {
            $pairingsList = array_values($pairings);
            $totalResult = ServiceCalcSkins::resolveSkins($pairingsList, $holes);
            $totals['gross'] += $totalResult['gross'];
            $totals['net']   += $totalResult['net'];

            if ($frontHoles) {
                $frontResult = ServiceCalcSkins::resolveSkins($pairingsList, $frontHoles);
                $fronts['gross'] += $frontResult['gross'];
                $fronts['net']   += $frontResult['net'];
            }
            if ($backHoles) {
                $backResult = ServiceCalcSkins::resolveSkins($pairingsList, $backHoles);
                $backs['gross'] += $backResult['gross'];
                $backs['net']   += $backResult['net'];
            }
        }

        $merged = ['gross' => [], 'net' => []];
        foreach (['gross', 'net'] as $metric) {
            foreach ($totals[$metric] as $pairingId => $totalCount) {
                $merged[$metric][$pairingId] = [
                    'front' => $fronts[$metric][$pairingId] ?? 0,
                    'back'  => $backs[$metric][$pairingId]  ?? 0,
                    'total' => $totalCount,
                ];
            }
        }
        return $merged;
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

        // Nines, LowBallLowTotal, LowBallHighBall, and Vegas all require
        // exactly two comparable sides — none of them have a legitimate
        // field-wide meaning here. This function flattens every player
        // across every playing group into one list before calling
        // ServiceCalcPoints::resolvePoints() below; for Nines specifically,
        // that silently produces a wrong-but-not-crashing result (only the
        // top handful of finishers *in the entire field* would ever score
        // any points, since the distribution table only has 3-4 entries).
        // game_settings.js's compFilter and service_dbGames.php's save-time
        // normalization both already prevent this combination from being
        // configured — this is the last-resort backstop for anything that
        // slips past both anyway (existing data from before this fix,
        // manual edits, etc.): fail safe with no points rather than compute
        // a leaderboard that's wrong in a way nobody would notice.
        $pairPairOnlyStrategies = ['Nines', 'LowBallLowTotal', 'LowBallHighBall', 'Vegas'];
        if (in_array(trim((string)($pointsConfig['strategy'] ?? '')), $pairPairOnlyStrategies, true)) {
            return ['gross' => [], 'net' => []];
        }

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