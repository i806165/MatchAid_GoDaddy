<?php
declare(strict_types=1);
// /public_html/services/scoring/service_buildEventSummary.php

require_once __DIR__ . '/service_ScoreSummary.php';

/**
 * ServiceBuildEventSummary
 *
 * Event-level leaderboard aggregation. Loops each round's already-built
 * ServiceScoreSummary::buildScoreSummaryPayload() output and sums into
 * Individual/Pairing/Team views, scoped independently within each Flight.
 *
 * ONE RULE GOVERNS EVERYTHING BELOW: grouping — which Flight, Team, or
 * Pairing a player belongs to — is ALWAYS resolved from the event roster
 * (db_EventPlayers, via ServiceDbEventPlayers::getEventRoster()), never
 * from round data. Round payloads are consulted ONLY for performance data
 * (scores, per-round placement points), matched back to roster members by
 * GHIN. This is a deliberate product decision, not a style preference —
 * round-level fields like dbPlayers_FlightKey/TeamKey/PairingID are cascade
 * snapshots, not the source of truth, and are not read here even though
 * ServiceScoreSummary::buildIndividualRows() happens to carry its own
 * flightKey/flightName (added for a future, separate, game-level use).
 *
 * Flight is a pure grouping/scope, never itself aggregated — an event is
 * partitioned into independent sub-events by Flight FIRST (e.g. Men in
 * Flight-1, Women in Flight-2), then every calculation below runs
 * separately inside each partition. No flight totals, no cross-flight
 * ranking, anywhere in this file.
 *
 * Flight, Team, and Pairing groupings are only built at all when their
 * respective dbEvents_*Mode column is "fixed" — "none" means no stable
 * identity exists across rounds to group by, so that view is simply
 * omitted, not degraded.
 */
final class ServiceBuildEventSummary
{
    // Same four values as game_settings.js's teamFmts constant — formats
    // where every teammate's card shows one duplicated team score, not
    // their own personal number, so a personal Individual Strokes/+/-
    // total would be meaningless for these rounds. "Best Ball" is
    // deliberately NOT in this list: per game_settings.js's GAME_LABELS
    // catalog, Best Ball is a scoringSystem modifier layered on top of
    // StrokePlay/MatchPlay, not a GameFormat value of its own — a Best
    // Ball round's dbGames_GameFormat is "StrokePlay" (or "MatchPlay" for
    // Four Ball), both already correctly included.
    private const NON_PERSONAL_SCORE_FORMATS = ['Scramble', 'Shamble', 'AltShot', 'Chapman'];

    // Independent copy — same name/value as the constants of the same
    // purpose in module_defineEventKPI.js and ServiceDbEvents, kept in
    // sync by convention (grep EVENT_PLACEMENT_DEFAULTS to find all
    // three), not by a shared require. Deliberately NOT exposed publicly
    // and NOT consumed by any other class: this copy's only job is a
    // same-class structural guard in parseEventKPIConfig() below, for a
    // category key that's absent from the decoded JSON entirely — a case
    // ServiceDbEvents' own seeding should make effectively unreachable
    // for any event created after that seeding existed. It is not a
    // second opinion on what "default" placement points should be, and
    // it never overrides real (even if minimal/empty) saved data.
    private const EVENT_PLACEMENT_DEFAULTS = ['1' => 100, '2' => 75, '3' => 50];
    private const DEFAULT_TIE_RULE = 'split';

    /**
     * @param array $eventRow      db_Events row — dbEvents_FlightMode,
     *                             dbEvents_TeamMode, dbEvents_PairingMode,
     *                             dbEvents_FlightConfig, dbEvents_TeamConfig,
     *                             dbEvents_KPIConfig.
     * @param array $roster        ServiceDbEventPlayers::getEventRoster($eid)'s
     *                             result — the sole source of Flight/Team/
     *                             Pairing grouping.
     * @param array $roundPayloads One entry per round, caller-built (this
     *                             service never fetches scorecards itself —
     *                             same separation ServiceScoreSummary keeps
     *                             from its own callers):
     *                               [
     *                                 'roundNumber'   => int,
     *                                 'roundLabel'    => string,
     *                                 'scoringMethod' => string,  // dbGames_ScoringMethod,
     *                                                              // e.g. "ADJ GROSS" — needed to
     *                                                              // pick gross-vs-net for
     *                                                              // Pairing/Team points, same as
     *                                                              // score_summary.js's
     *                                                              // officialMetricIsGross(). Not
     *                                                              // part of buildScoreSummaryPayload()'s
     *                                                              // own output, so the caller must
     *                                                              // supply it alongside.
     *                                 'payload'       => ServiceScoreSummary::buildScoreSummaryPayload()
     *                                                     result,
     *                               ]
     */
    public static function buildEventSummaryPayload(array $eventRow, array $roster, array $roundPayloads): array
    {
        $flightFixed  = trim((string)($eventRow['dbEvents_FlightMode']  ?? '')) === 'fixed';
        $teamFixed    = trim((string)($eventRow['dbEvents_TeamMode']    ?? '')) === 'fixed';
        $pairingFixed = trim((string)($eventRow['dbEvents_PairingMode'] ?? '')) === 'fixed';

        $rosterByGhin   = self::indexRosterByGhin($roster);
        $kpiConfig      = self::parseEventKPIConfig($eventRow);
        $teamConfigById = self::parseEventTeamConfig($eventRow);

        $flightBuckets = self::partitionRosterByFlight($eventRow, $rosterByGhin, $flightFixed);

        $flights = [];
        foreach ($flightBuckets as $flightKey => $bucket) {
            $ghinSet = array_flip($bucket['ghins']);

            $individual = self::buildIndividualSection(
                $roundPayloads, $ghinSet, $rosterByGhin, $teamConfigById, $teamFixed, $kpiConfig
            );

            // Pairing and Team both resolve Flight (and Team resolves Team
            // too) from the Event Roster via each pairing/side row's
            // round-native 'players' GHIN list (see
            // ServiceScoreSummary::exportPlayersList()) — not via
            // dbEventPlayers_PairingID. Every player on a pairing/side is
            // guaranteed to be drawn from within one team and one flight
            // (explicit product decision), even though pairing composition
            // itself is disposable and varies round to round (e.g. a 2-day
            // Ryder Cup-style event reshuffles partners between rounds
            // while team membership stays fixed). Neither section has any
            // dependency on PairingMode for THIS resolution — Pairing's
            // own grouping key (which pairings exist at all) is still
            // dbEventPlayers_PairingID when PairingMode="fixed", per the
            // Pairing view's definition, but Flight/Team lookup is uniform
            // across both sections via the roster+GHIN mechanism below.
            $pairing = $pairingFixed
                ? self::buildPairingSection($roundPayloads, $flightKey, $rosterByGhin, $flightFixed, $kpiConfig)
                : null;

            $team = $teamFixed
                ? self::buildTeamSection($roundPayloads, $flightKey, $rosterByGhin, $flightFixed, $teamConfigById, $kpiConfig)
                : null;

            $flights[] = [
                'flightKey'  => $flightKey,
                'flightName' => $bucket['name'],
                'individual' => $individual,
                'pairing'    => $pairing,
                'team'       => $team,
            ];
        }

        return [
            'flights' => $flights,
            'meta' => [
                'flightMode'  => $flightFixed  ? 'fixed' : 'none',
                'teamMode'    => $teamFixed    ? 'fixed' : 'none',
                'pairingMode' => $pairingFixed ? 'fixed' : 'none',
                'rounds' => array_map(static function (array $r): array {
                    return [
                        'roundNumber' => $r['roundNumber'] ?? null,
                        'roundLabel'  => (string)($r['roundLabel'] ?? ''),
                        'gameFormat'  => (string)($r['payload']['meta']['gameFormat'] ?? ''),
                    ];
                }, $roundPayloads),
            ],
        ];
    }

    // ── Roster / config parsing ──────────────────────────────────────────

    private static function indexRosterByGhin(array $roster): array
    {
        $out = [];
        foreach ($roster as $r) {
            $ghin = trim((string)($r['dbEventPlayers_GHIN'] ?? ''));
            if ($ghin !== '') $out[$ghin] = $r;
        }
        return $out;
    }

    /**
     * Parses dbEvents_FlightConfig — same {"flights":[{id,name}, ...]}
     * shape ServiceScoreSummary::parseFlightConfig() parses on its
     * cascaded round-level copy (dbGames_FlightConfig). Read from the
     * event row directly here, since this service always has the event in
     * scope and the roster is the authority, not a round's snapshot.
     */
    private static function parseEventFlightConfig(array $eventRow): array
    {
        $raw = $eventRow['dbEvents_FlightConfig'] ?? null;
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
     * Parses dbEvents_TeamConfig — same {"teams":[{id,name,color,sort}, ...]}
     * shape as ServiceScoreSummary::parseTeamConfig(), read from the event
     * row directly for the same reason as parseEventFlightConfig() above.
     */
    private static function parseEventTeamConfig(array $eventRow): array
    {
        $raw = $eventRow['dbEvents_TeamConfig'] ?? null;
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
     * Parses dbEvents_KPIConfig — flat map keyed by kpiKey, harmonized
     * with dbGames_PlacementPoints' "state" vocabulary (see
     * module_defineEventKPI.js's header comment for the full contract).
     * State is never consulted here to gate computation — same server-
     * side philosophy as ServiceScoreSummary::parsePlacementPoints():
     * always computed regardless of active/disabled/default; state is
     * display-only.
     *
     * This method TRUSTS the saved config completely — it does not
     * re-validate or second-guess a category's shape. The fallbacks
     * below only fire when a category key is absent from the decoded
     * JSON entirely, which ServiceDbEvents' own seeding (event creation
     * + mode-transition sync) should make effectively unreachable for
     * any event created after that seeding existed. This is a same-class
     * structural guard against a legacy/pre-seeding row, not a policy
     * decision about what an admin's real configuration should be.
     */
    private static function parseEventKPIConfig(array $eventRow): array
    {
        $raw = $eventRow['dbEvents_KPIConfig'] ?? null;
        $decoded = null;
        if ($raw !== null && $raw !== '') {
            $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
        }
        $decoded = is_array($decoded) ? $decoded : [];

        $out = [];
        foreach (['grossPlacement', 'netPlacement', 'pairingPlacement', 'teamPlacement'] as $key) {
            $entry = is_array($decoded[$key] ?? null) ? $decoded[$key] : [];
            $out[$key] = [
                'state' => in_array($entry['state'] ?? null, ['default', 'active', 'disabled'], true)
                    ? $entry['state']
                    : 'default',
                'pointsConfig' => is_array($entry['pointsConfig'] ?? null)
                    ? $entry['pointsConfig']
                    : self::EVENT_PLACEMENT_DEFAULTS,
                'tieRule' => in_array($entry['tieRule'] ?? null, ['split', 'high', 'low'], true)
                    ? $entry['tieRule']
                    : self::DEFAULT_TIE_RULE,
            ];
        }
        return $out;
    }

    // ── Partitioning ──────────────────────────────────────────────────────

    /**
     * flightKey => ['name' => ..., 'ghins' => [...]]. Not "fixed"? One
     * implicit bucket holding the whole roster — matches the system-wide
     * floor of "every event always has at least 1 flight."
     */
    private static function partitionRosterByFlight(array $eventRow, array $rosterByGhin, bool $flightFixed): array
    {
        if (!$flightFixed) {
            return ['F1' => ['name' => 'Flight-1', 'ghins' => array_keys($rosterByGhin)]];
        }

        $flightConfigById = self::parseEventFlightConfig($eventRow);
        $buckets = [];
        foreach ($rosterByGhin as $ghin => $r) {
            $key = trim((string)($r['dbEventPlayers_FlightKey'] ?? '')) ?: 'F1';
            if (!isset($buckets[$key])) {
                $name = trim((string)($flightConfigById[$key]['name'] ?? '')) ?: 'Flight-1';
                $buckets[$key] = ['name' => $name, 'ghins' => []];
            }
            $buckets[$key]['ghins'][] = $ghin;
        }
        return $buckets;
    }

    /**
     * Resolves Flight (and, when requested, Team) for a pairing/side row
     * from its round-native 'players' list (each entry's 'ghin' — see
     * ServiceScoreSummary::exportPlayersList()), by looking each player up
     * in the Event Roster. This is the only roster lookup this file
     * performs for pairing/team-grain rows — it replaces an earlier,
     * incorrect design that routed through dbEventPlayers_PairingID,
     * which only reliably matches a round's own pairingId when
     * PairingMode="fixed"; round-disposable pairings (e.g. a 2-day Ryder
     * Cup-style event reshuffling partners between rounds) do not.
     *
     * Every player on a pairing/side is guaranteed to be drawn from within
     * one team and one flight (explicit product decision) — agreement
     * across all listed players is still checked defensively, same "no
     * stale or half-correct label" posture as
     * ServiceScoreSummary::sideTeamKey(), but any one player resolves it
     * in the normal case.
     *
     * @return array{flightKey: string, teamKey: ?string}
     */
    private static function resolveGroupingFromPlayers(
        array $players,
        array $rosterByGhin,
        bool $flightFixed,
        bool $teamFixed
    ): array {
        $flightKeys = [];
        $teamKeys = [];
        foreach ($players as $p) {
            $ghin = trim((string)($p['ghin'] ?? ''));
            if ($ghin === '' || !isset($rosterByGhin[$ghin])) continue;
            $r = $rosterByGhin[$ghin];

            if ($flightFixed) {
                $fk = trim((string)($r['dbEventPlayers_FlightKey'] ?? '')) ?: 'F1';
                $flightKeys[$fk] = true;
            }
            if ($teamFixed) {
                $tk = trim((string)($r['dbEventPlayers_TeamKey'] ?? ''));
                if ($tk !== '') $teamKeys[$tk] = true;
            }
        }

        // Disagreement or an unresolvable roster lookup falls back to the
        // same "F1" floor used everywhere else in this file — never a
        // reason to throw the row away. Team, unlike Flight, has no
        // system-wide default floor, so disagreement there returns null
        // and the caller skips the row rather than mislabeling it.
        $flightKey = ($flightFixed && count($flightKeys) === 1) ? array_key_first($flightKeys) : 'F1';
        $teamKey = ($teamFixed && count($teamKeys) === 1) ? array_key_first($teamKeys) : null;

        return ['flightKey' => $flightKey, 'teamKey' => $teamKey];
    }

    // ── Round-format helpers ─────────────────────────────────────────────

    private static function isPersonalScoreFormat(string $gameFormat): bool
    {
        return !in_array($gameFormat, self::NON_PERSONAL_SCORE_FORMATS, true);
    }

    // Mirrors score_summary.js's officialMetricIsGross() exactly — the one
    // place gross-vs-net gets decided for Pairing/Team grain, which
    // (unlike Individual) has no viewer toggle of its own, just the
    // round's own official result.
    private static function officialMetricIsGross(string $scoringMethod): bool
    {
        return trim($scoringMethod) === 'ADJ GROSS';
    }

    // ── Individual section ────────────────────────────────────────────────

    private static function buildIndividualSection(
        array $roundPayloads,
        array $ghinSet,
        array $rosterByGhin,
        array $teamConfigById,
        bool $teamFixed,
        array $kpiConfig
    ): array {
        $players = [];

        foreach ($roundPayloads as $round) {
            $payload = $round['payload'] ?? [];
            $gameFormat = (string)($payload['meta']['gameFormat'] ?? '');
            $personalScore = self::isPersonalScoreFormat($gameFormat);
            $roundLabel = (string)($round['roundLabel'] ?? '');

            foreach (($payload['individualRows'] ?? []) as $row) {
                $playerId = (string)($row['playerId'] ?? '');
                if ($playerId === '' || !isset($ghinSet[$playerId])) continue;

                if (!isset($players[$playerId])) {
                    // Team badge — resolved from the roster's own TeamKey
                    // against the event's own TeamConfig, never from this
                    // round row's teamKey/teamName/teamColor, per the
                    // roster-is-authoritative rule. Left null entirely
                    // when TeamMode isn't "fixed" — a per-round team
                    // assignment has no stable event-wide meaning to show.
                    $rosterTeamKey = $teamFixed
                        ? trim((string)($rosterByGhin[$playerId]['dbEventPlayers_TeamKey'] ?? ''))
                        : '';
                    $teamInfo = ($rosterTeamKey !== '') ? ($teamConfigById[$rosterTeamKey] ?? null) : null;

                    $players[$playerId] = [
                        'playerId' => $playerId,
                        'playerName' => $row['playerName'] ?? '',
                        'playerLastName' => $row['playerLastName'] ?? '',
                        'teamKey' => $rosterTeamKey !== '' ? $rosterTeamKey : null,
                        'teamName' => $teamInfo['name'] ?? null,
                        'teamColor' => $teamInfo['color'] ?? null,
                        'rounds' => [],
                        'totalGrossValue' => 0.0,
                        'totalNetValue' => 0.0,
                        'totalPerformancePointsGross' => 0.0,
                        'totalPerformancePointsNet' => 0.0,
                    ];
                }

                $players[$playerId]['rounds'][] = [
                    'roundLabel' => $roundLabel,
                    'gameFormat' => $gameFormat,
                    'grossDiffDisplay' => $row['grossDiffDisplay'] ?? '—',
                    'netDiffDisplay' => $row['netDiffDisplay'] ?? '—',
                    'placementPointsGross' => (float)($row['placementPointsGross'] ?? 0),
                    'placementPointsNet' => (float)($row['placementPointsNet'] ?? 0),
                    // Already flight-scoped at the source (task #9) — pulled
                    // straight through, not recomputed here. Note: source
                    // scoping uses round-native dbPlayers_FlightKey, this
                    // aggregator's own flight buckets use the roster's
                    // dbEventPlayers_FlightKey — these agree whenever
                    // FlightMode="fixed" (the round cascades from the
                    // roster), but could diverge if FlightMode="none".
                    // Flagged, not resolved — the common/intended case is
                    // covered.
                    'rankGross' => $row['rankGross'] ?? null,
                    'rankNet' => $row['rankNet'] ?? null,
                    'countsTowardStrokes' => $personalScore,
                ];

                // Individual Strokes/Total +/- — eligible rounds only.
                if ($personalScore) {
                    $players[$playerId]['totalGrossValue'] += (float)($row['grossDiffValue'] ?? 0);
                    $players[$playerId]['totalNetValue'] += (float)($row['netDiffValue'] ?? 0);
                }
                // Performance Points — every round counts, regardless of
                // format; this is just addition, no config needed.
                $players[$playerId]['totalPerformancePointsGross'] += (float)($row['placementPointsGross'] ?? 0);
                $players[$playerId]['totalPerformancePointsNet'] += (float)($row['placementPointsNet'] ?? 0);
            }
        }

        // Event-level Placement Points — rank this flight's final totals
        // ONCE, using the event's own points table. Ranked from the
        // Performance Points TALLY, not from strokes — confirmed: "the row
        // tally is ranked against all other row tallies to become
        // placement." Same higher-is-better mechanism Pairing/Team already
        // use (rankByPointsDescending), not the lower-is-better strokes
        // convention this used to (incorrectly) rank by.
        $grossPts = self::rankByPointsDescending(
            array_map(static fn(array $p): float => $p['totalPerformancePointsGross'], $players),
            $kpiConfig['grossPlacement']
        );
        $netPts = self::rankByPointsDescending(
            array_map(static fn(array $p): float => $p['totalPerformancePointsNet'], $players),
            $kpiConfig['netPlacement']
        );
        foreach (array_keys($players) as $playerId) {
            $players[$playerId]['eventPlacementPointsGross'] = $grossPts[$playerId] ?? 0.0;
            $players[$playerId]['eventPlacementPointsNet'] = $netPts[$playerId] ?? 0.0;
        }

        return array_values($players);
    }

    // ── Pairing section ───────────────────────────────────────────────────

    private static function buildPairingSection(
        array $roundPayloads,
        string $flightKey,
        array $rosterByGhin,
        bool $flightFixed,
        array $kpiConfig
    ): array {
        $pairings = [];

        foreach ($roundPayloads as $round) {
            $payload = $round['payload'] ?? [];
            $competition = (string)($payload['competition'] ?? 'PairField');
            $roundLabel = (string)($round['roundLabel'] ?? '');
            $isGross = self::officialMetricIsGross((string)($round['scoringMethod'] ?? ''));

            if ($competition === 'PairPair') {
                foreach (($payload['rows'] ?? []) as $row) {
                    foreach (['left', 'right'] as $side) {
                        $sideData = $row[$side] ?? [];
                        $pairingId = (string)($sideData['pairingId'] ?? '');
                        if ($pairingId === '') continue;

                        $grouping = self::resolveGroupingFromPlayers(
                            $sideData['players'] ?? [], $rosterByGhin, $flightFixed, false
                        );
                        if ($grouping['flightKey'] !== $flightKey) continue;

                        if (!isset($pairings[$pairingId])) {
                            $pairings[$pairingId] = [
                                'pairingId' => $pairingId,
                                'pairingLabel' => ($side === 'left')
                                    ? ($row['matchLabelTop'] ?? '')
                                    : ($row['matchLabelBottom'] ?? ''),
                                'teamColor' => $sideData['teamColor'] ?? null,
                                'rounds' => [],
                                'totalPoints' => 0.0,
                            ];
                        }
                        $points = (float)($sideData['matchStatus']['total']['points'] ?? 0);
                        $pairings[$pairingId]['rounds'][] = [
                            'roundLabel' => $roundLabel,
                            'points' => $points,
                            // No rank/score concept for PairPair — head-to-
                            // head match result isn't rankable against the
                            // rest of the field. Explicit null, not an
                            // omitted key, so the renderer never has to
                            // guess whether these exist.
                            'rank' => null,
                            'scoreDisplay' => null,
                        ];
                        $pairings[$pairingId]['totalPoints'] += $points;
                    }
                }
            } else {
                foreach (($payload['rows'] ?? []) as $row) {
                    $pairingId = (string)($row['pairingId'] ?? '');
                    if ($pairingId === '') continue;

                    $grouping = self::resolveGroupingFromPlayers(
                        $row['players'] ?? [], $rosterByGhin, $flightFixed, false
                    );
                    if ($grouping['flightKey'] !== $flightKey) continue;

                    if (!isset($pairings[$pairingId])) {
                        $pairings[$pairingId] = [
                            'pairingId' => $pairingId,
                            'pairingLabel' => $row['pairingLabel'] ?? '',
                            'teamColor' => $row['teamColor'] ?? null,
                            'rounds' => [],
                            'totalPoints' => 0.0,
                        ];
                    }
                    $points = $isGross
                        ? (float)($row['placementPointsGross'] ?? 0)
                        : (float)($row['placementPointsNet'] ?? 0);
                    $pairings[$pairingId]['rounds'][] = [
                        'roundLabel' => $roundLabel,
                        'points' => $points,
                        // PairField only — a genuine field-wide finishing
                        // position exists here (score-based, not the
                        // points-based ranking above), so it's meaningful
                        // to show alongside points. PairPair has no
                        // equivalent field at all — head-to-head match
                        // result isn't rankable against the rest of the
                        // field, so no rank/score is set on that branch.
                        // NOT flight-scoped yet (task #2a) — whole-round
                        // rank for now, by explicit decision.
                        'rank' => $row['rank'] ?? null,
                        'scoreDisplay' => $isGross ? ($row['grossDiffDisplay'] ?? null) : ($row['netDiffDisplay'] ?? null),
                    ];
                    $pairings[$pairingId]['totalPoints'] += $points;
                }
            }
        }

        // Event-level Pairing Placement Points — rank by total POINTS,
        // descending (higher is better). This is the one place in this
        // file that ranks by points rather than score-to-par, since points
        // is the only unit comparable at this grain (spec §3) — negated
        // before assignPlacementPoints() since that mapper always treats
        // lower value as better, matching its round-level score-to-par use.
        $placementPts = self::rankByPointsDescending(
            array_map(static fn(array $p): float => $p['totalPoints'], $pairings),
            $kpiConfig['pairingPlacement']
        );
        foreach (array_keys($pairings) as $pairingId) {
            $pairings[$pairingId]['eventPlacementPoints'] = $placementPts[$pairingId] ?? 0.0;
        }

        return array_values($pairings);
    }

    // ── Team section ──────────────────────────────────────────────────────

    private static function buildTeamSection(
        array $roundPayloads,
        string $flightKey,
        array $rosterByGhin,
        bool $flightFixed,
        array $teamConfigById,
        array $kpiConfig
    ): array {
        $teams = [];

        foreach ($roundPayloads as $roundIdx => $round) {
            $payload = $round['payload'] ?? [];
            $competition = (string)($payload['competition'] ?? 'PairField');
            $roundLabel = (string)($round['roundLabel'] ?? '');
            $isGross = self::officialMetricIsGross((string)($round['scoringMethod'] ?? ''));

            if ($competition === 'PairPair') {
                foreach (($payload['rows'] ?? []) as $row) {
                    foreach (['left', 'right'] as $side) {
                        $sideData = $row[$side] ?? [];

                        // Team is resolved from the roster via this side's
                        // own players, NOT from $sideData['teamKey'] (round
                        // data) — no dependency on PairingMode anywhere in
                        // this section, unlike the earlier, incorrect design.
                        $grouping = self::resolveGroupingFromPlayers(
                            $sideData['players'] ?? [], $rosterByGhin, $flightFixed, true
                        );
                        if ($grouping['flightKey'] !== $flightKey || $grouping['teamKey'] === null) continue;
                        $teamKey = $grouping['teamKey'];

                        if (!isset($teams[$teamKey])) {
                            $teamInfo = $teamConfigById[$teamKey] ?? null;
                            $teams[$teamKey] = [
                                'teamKey' => $teamKey,
                                'teamName' => $teamInfo['name'] ?? null,
                                'teamColor' => $teamInfo['color'] ?? null,
                                'roundsByIdx' => [],
                                'totalPoints' => 0.0,
                                'record' => ['w' => 0, 'l' => 0, 'h' => 0],
                            ];
                        }
                        $status = $sideData['matchStatus']['total']['status'] ?? null;
                        if ($status === 'W') $teams[$teamKey]['record']['w']++;
                        elseif ($status === 'L') $teams[$teamKey]['record']['l']++;
                        elseif ($status === 'H') $teams[$teamKey]['record']['h']++;

                        $points = (float)($sideData['matchStatus']['total']['points'] ?? 0);
                        // Accumulate into ONE entry per (team, round) — a
                        // team can have several matches/sides in the same
                        // round (e.g. multiple pairs all on Team Blue), and
                        // those must sum into a single round column, not
                        // push a separate entry per match. This was the
                        // bug behind the extra-columns rendering issue.
                        if (!isset($teams[$teamKey]['roundsByIdx'][$roundIdx])) {
                            $teams[$teamKey]['roundsByIdx'][$roundIdx] = ['roundLabel' => $roundLabel, 'points' => 0.0];
                        }
                        $teams[$teamKey]['roundsByIdx'][$roundIdx]['points'] += $points;
                        $teams[$teamKey]['totalPoints'] += $points;
                    }
                }
            } else {
                foreach (($payload['rows'] ?? []) as $row) {
                    $grouping = self::resolveGroupingFromPlayers(
                        $row['players'] ?? [], $rosterByGhin, $flightFixed, true
                    );
                    if ($grouping['flightKey'] !== $flightKey || $grouping['teamKey'] === null) continue;
                    $teamKey = $grouping['teamKey'];

                    if (!isset($teams[$teamKey])) {
                        $teamInfo = $teamConfigById[$teamKey] ?? null;
                        $teams[$teamKey] = [
                            'teamKey' => $teamKey,
                            'teamName' => $teamInfo['name'] ?? null,
                            'teamColor' => $teamInfo['color'] ?? null,
                            'roundsByIdx' => [],
                            'totalPoints' => 0.0,
                            // PairField has no win/loss/halve concept.
                            'record' => null,
                        ];
                    }
                    $points = $isGross
                        ? (float)($row['placementPointsGross'] ?? 0)
                        : (float)($row['placementPointsNet'] ?? 0);
                    // Same accumulation fix as the PairPair branch above —
                    // a team can have multiple pairings in one round.
                    if (!isset($teams[$teamKey]['roundsByIdx'][$roundIdx])) {
                        $teams[$teamKey]['roundsByIdx'][$roundIdx] = ['roundLabel' => $roundLabel, 'points' => 0.0];
                    }
                    $teams[$teamKey]['roundsByIdx'][$roundIdx]['points'] += $points;
                    $teams[$teamKey]['totalPoints'] += $points;
                }
            }
        }

        // Flatten roundsByIdx (keyed by round position, sparse-safe if a
        // team skipped a round) into the ordered 'rounds' list callers
        // expect — ksort() guarantees round order even though a team may
        // have first appeared in a later round than index 0.
        foreach ($teams as $teamKey => &$team) {
            ksort($team['roundsByIdx']);
            $team['rounds'] = array_values($team['roundsByIdx']);
            unset($team['roundsByIdx']);
        }
        unset($team);

        $placementPts = self::rankByPointsDescending(
            array_map(static fn(array $t): float => $t['totalPoints'], $teams),
            $kpiConfig['teamPlacement']
        );
        foreach (array_keys($teams) as $teamKey) {
            $teams[$teamKey]['eventPlacementPoints'] = $placementPts[$teamKey] ?? 0.0;
        }

        return array_values($teams);
    }

    // ── Ranking helpers ───────────────────────────────────────────────────

    /**
     * Ranks a single higher-is-better points total (used by all three
     * grains now — Individual's Performance Points tally, Pairing/Team's
     * summed points) — negates the value before handing it to
     * assignPlacementPoints(), which always treats lower as better.
     *
     * @return array<string,float>
     */
    private static function rankByPointsDescending(array $totalsByKey, array $cat): array
    {
        $keys = array_keys($totalsByKey);
        $input = [];
        foreach ($keys as $idx => $key) {
            $input[] = ['idx' => $idx, 'value' => -$totalsByKey[$key]];
        }
        $out = ServiceScoreSummary::assignPlacementPoints($input, $cat['pointsConfig'], $cat['tieRule']);

        $byOrigKey = [];
        foreach ($keys as $idx => $key) {
            $byOrigKey[$key] = $out[$idx] ?? 0.0;
        }
        return $byOrigKey;
    }
}
