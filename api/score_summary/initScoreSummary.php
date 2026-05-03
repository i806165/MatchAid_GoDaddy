<?php
declare(strict_types=1);
// /public_html/api/score_summary/initScoreSummary.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreCard.php';
require_once MA_SERVICES . '/scoring/service_ScoreCardRotation.php';
require_once MA_SERVICES . '/scoring/service_ScoreSummary.php';
require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';

function buildScoreSummaryInit(array $ctx, array $gc): array
{
    $gameRow = is_array($gc['game'] ?? null) ? $gc['game'] : [];
    if (!$gameRow) {
        return ['ok' => false, 'message' => 'No game context available.'];
    }

    $ggid = trim((string)($gc['ggid'] ?? $gameRow['dbGames_GGID'] ?? ''));
    if ($ggid === '') {
        return ['ok' => false, 'message' => 'Missing GGID.'];
    }

    $players = loadScoreSummaryPlayers($gc, $ggid);
    if (!$players) {
        return ['ok' => false, 'message' => 'No players found for this game.'];
    }

    $baselineScorecards = ServiceScoreCard::buildGameScorecardsPayload($gameRow, $players);
    $normalizedScorecards = ServiceScoreCardRotation::buildScorecardPayload(
        $gameRow,
        $baselineScorecards,
        $players,
        'game',
        ''
    );

    $summary = ServiceScoreSummary::buildScoreSummaryPayload($gameRow, $normalizedScorecards);

    $course = trim((string)($gameRow['dbGames_CourseName'] ?? ''));
    $playDate = trim((string)($gameRow['dbGames_PlayDate'] ?? ''));
    $competition = trim((string)($summary['competition'] ?? $gameRow['dbGames_Competition'] ?? ''));

    return [
        'ok' => true,
        'page' => 'score_summary',
        'header' => [
            'title' => 'Score Summary',
            'subtitle' => implode(' • ', array_values(array_filter([$course, $playDate, $competition]))),
        ],
        'game' => $gameRow,
        'summary' => $summary,
        'portal' => $_SESSION['SessionPortal'] ?? 'ADMIN PORTAL',
    ];
}

function loadScoreSummaryPlayers(array $gc, string $ggid): array
{
    $players = null;

    if (is_array($gc['players'] ?? null) && !empty($gc['players'])) {
        $players = hydrateScoreSummaryPlayerRows($gc['players']);
    }

    if ($players === null && method_exists('ServiceDbPlayers', 'getScorecardPlayersByGGID')) {
        $rows = ServiceDbPlayers::getScorecardPlayersByGGID($ggid);
        if (is_array($rows) && !empty($rows)) {
            $players = hydrateScoreSummaryPlayerRows($rows);
        }
    }

    if ($players === null && method_exists('ServiceDbPlayers', 'getGamePlayers')) {
        $rows = ServiceDbPlayers::getGamePlayers($ggid);
        if (is_array($rows) && !empty($rows)) {
            $players = hydrateScoreSummaryPlayerRows($rows);
        }
    }

    $players = $players ?? [];

    // Merge blind player records into player pool if any exist
    return mergeBlindScoresIntoSummaryPlayers($players, $ggid, $gc);
}

function mergeBlindScoresIntoSummaryPlayers(array $players, string $ggid, array $gc): array
{
    require_once MA_SERVICES . '/scoring/service_BlindPlayer.php';
    $blindScores = ServiceBlindPlayer::getBlindScoresForGame((int)$ggid);
    if (empty($blindScores)) return $players;

    foreach ($blindScores as &$bs) {
        if (isset($bs['dbScores_Scores']) && is_string($bs['dbScores_Scores'])) {
            $decoded = json_decode($bs['dbScores_Scores'], true);
            if (is_array($decoded)) $bs['dbScores_Scores'] = $decoded;
        }
    }
    unset($bs);

    $gameRow = $gc['game'] ?? [];
    return ServiceBlindPlayer::mergeBlindScoresIntoPlayers($players, $blindScores, $gameRow);
}

function hydrateScoreSummaryPlayerRows(array $players): array
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