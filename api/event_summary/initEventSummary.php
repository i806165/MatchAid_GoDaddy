<?php
declare(strict_types=1);
// /public_html/api/event_summary/initEventSummary.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreCard.php';
require_once MA_SERVICES . '/scoring/service_ScoreCardRotation.php';
require_once MA_SERVICES . '/scoring/service_ScoreSummary.php';
require_once MA_SERVICES . '/scoring/service_buildEventSummary.php';
require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';
require_once MA_SVC_DB . '/service_dbEventPlayers.php';

/**
 * buildEventSummaryInit($ctx, $ec)
 *
 * Same shape as initScoreSummary.php's buildScoreSummaryInit() — resolves
 * everything an event's leaderboard page needs, then hands off to the
 * aggregation service. $ec is an event context array, same shape as
 * ServiceContextEvent::getEventContext()'s return (['eid','event',
 * 'authorizations']), the same way $gc mirrors ServiceContextGame's.
 */
function buildEventSummaryInit(array $ctx, array $ec): array
{
    $eventRow = is_array($ec['event'] ?? null) ? $ec['event'] : [];
    if (!$eventRow) {
        return ['ok' => false, 'message' => 'No event context available.'];
    }

    $eid = (int)($ec['eid'] ?? $eventRow['dbEvents_EID'] ?? 0);
    if ($eid <= 0) {
        return ['ok' => false, 'message' => 'Missing EID.'];
    }

    $roster = ServiceDbEventPlayers::getEventRoster($eid);
    if (!$roster) {
        return ['ok' => false, 'message' => 'No roster found for this event.'];
    }

    $gameRows = loadEventGameRows($eid);
    if (!$gameRows) {
        return ['ok' => false, 'message' => 'No rounds found for this event.'];
    }

    $roundPayloads = buildEventRoundPayloads($gameRows);
    if (!$roundPayloads) {
        return ['ok' => false, 'message' => 'No scoreable rounds found for this event.'];
    }

    $summary = ServiceBuildEventSummary::buildEventSummaryPayload($eventRow, $roster, $roundPayloads);

    $title = trim((string)($eventRow['dbEvents_Title'] ?? ''));
    $startDate = trim((string)($eventRow['startDateISO'] ?? $eventRow['dbEvents_StartDate'] ?? ''));

    return [
        'ok' => true,
        'page' => 'event_summary',
        'header' => [
            'title' => 'Event Leaderboard',
            'subtitle' => implode(' • ', array_values(array_filter([$title, $startDate]))),
        ],
        'event' => $eventRow,
        'summary' => $summary,
        'portal' => $_SESSION['SessionPortal'] ?? 'ADMIN PORTAL',
    ];
}

/**
 * CONFIRMED — ServiceDbGames::queryEventGames($eid) exists (service_dbGames.php)
 * and is exactly the intended source: it orders by dbGames_EventRoundNo
 * ASC, then PlayDate, then PlayTime, which getGamesByEID() (same file)
 * does not — that one has no ORDER BY at all, so it isn't safe to use for
 * round sequencing on its own. Returns ['games' => ['vm' => ..., 'raw' =>
 * ...]]; 'raw' is the full db_Games rows this needs.
 */
function loadEventGameRows(int $eid): array
{
    $result = ServiceDbGames::queryEventGames($eid);
    $rows = $result['games']['raw'] ?? [];
    return is_array($rows) ? $rows : [];
}

/**
 * One buildScoreSummaryPayload() call per round, same per-round build
 * initScoreSummary.php's buildScoreSummaryInit() already does for a single
 * game — see that file for the pattern this loops. Also attaches
 * 'scoringMethod', the one field ServiceBuildEventSummary needs that
 * buildScoreSummaryPayload()'s own output doesn't carry (see
 * service_buildEventSummary.php's class doc for why).
 *
 * roundNumber comes from dbGames_EventRoundNo — the real, authoritative
 * column (confirmed via service_dbGames.php's queryEventGames(), which
 * already sorts by it) — not a counter incremented over array order. Rows
 * missing that column entirely (shouldn't happen for an event-linked game,
 * but defensively) fall back to array position among rows that do have it.
 *
 * NOTE: unlike initScoreSummary.php, this does not merge blind-player
 * scores (ServiceBlindPlayer) — omitted here as a deliberate scope
 * decision for this first pass, not an oversight; revisit if event
 * leaderboards need to reflect blind players too.
 */
function buildEventRoundPayloads(array $gameRows): array
{
    $roundPayloads = [];
    $fallbackNumber = 1;

    foreach ($gameRows as $gameRow) {
        $ggid = trim((string)($gameRow['dbGames_GGID'] ?? ''));
        if ($ggid === '') continue;

        $players = loadEventRoundPlayers($ggid);
        if (!$players) continue;

        $baselineScorecards = ServiceScoreCard::buildGameScorecardsPayload($gameRow, $players);
        $normalizedScorecards = ServiceScoreCardRotation::buildScorecardPayload(
            $gameRow,
            $baselineScorecards,
            $players,
            'game',
            ''
        );

        $payload = ServiceScoreSummary::buildScoreSummaryPayload($gameRow, $normalizedScorecards);

        $roundNo = (int)($gameRow['dbGames_EventRoundNo'] ?? 0);
        if ($roundNo <= 0) $roundNo = $fallbackNumber;

        $roundPayloads[] = [
            'roundNumber' => $roundNo,
            'roundLabel' => 'Round ' . $roundNo,
            'scoringMethod' => (string)($gameRow['dbGames_ScoringMethod'] ?? 'NET'),
            'payload' => $payload,
        ];
        $fallbackNumber++;
    }

    return $roundPayloads;
}

function loadEventRoundPlayers(string $ggid): array
{
    $rows = [];
    if (method_exists('ServiceDbPlayers', 'getScorecardPlayersByGGID')) {
        $fetched = ServiceDbPlayers::getScorecardPlayersByGGID($ggid);
        if (is_array($fetched) && !empty($fetched)) $rows = $fetched;
    }
    if (!$rows && method_exists('ServiceDbPlayers', 'getGamePlayers')) {
        $fetched = ServiceDbPlayers::getGamePlayers($ggid);
        if (is_array($fetched) && !empty($fetched)) $rows = $fetched;
    }
    return hydrateEventRoundPlayerRows($rows);
}

/**
 * Same JSON-decoding step as initScoreSummary.php's own
 * hydrateScoreSummaryPlayerRows() — dbPlayers_TeeSetDetails and
 * dbPlayers_Scores are stored as JSON strings and must be decoded to
 * arrays before ServiceScoreCard/ServiceScoreCardRotation touch them. This
 * was missing from the first version of this file: player rows went
 * straight from the DB fetch into buildGameScorecardsPayload() as raw
 * strings, which is the actual root cause of the "Modulo by zero" crash —
 * not round score-count, which was an earlier, incorrect diagnosis.
 * Defined locally rather than depending on initScoreSummary.php's global
 * function, keeping this file self-contained the same way its sibling is.
 */
function hydrateEventRoundPlayerRows(array $players): array
{
    foreach ($players as &$p) {
        if (isset($p['dbPlayers_TeeSetDetails']) && is_string($p['dbPlayers_TeeSetDetails']) && trim($p['dbPlayers_TeeSetDetails']) !== '') {
            $decoded = json_decode($p['dbPlayers_TeeSetDetails'], true);
            if (is_array($decoded)) {
                $p['dbPlayers_TeeSetDetails'] = $decoded;
            }
        }
        if (isset($p['dbPlayers_Scores']) && is_string($p['dbPlayers_Scores']) && trim($p['dbPlayers_Scores']) !== '') {
            $decoded = json_decode($p['dbPlayers_Scores'], true);
            if (is_array($decoded)) {
                $p['dbPlayers_Scores'] = $decoded;
            }
        }
    }
    unset($p);

    return $players;
}
