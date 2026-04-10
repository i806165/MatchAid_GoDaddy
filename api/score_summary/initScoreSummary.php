<?php
declare(strict_types=1);
// /public_html/api/score_summary/initScoreSummary.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreSummary.php';
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

    $summary = ServiceScoreSummary::buildScoreSummaryPayload($gameRow, $players);

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
    if (is_array($gc['players'] ?? null) && !empty($gc['players'])) {
        return $gc['players'];
    }

    foreach (['getPlayersByGGID', 'getPlayersByGameGGID'] as $method) {
        if (method_exists('ServiceDbPlayers', $method)) {
            $rows = ServiceDbPlayers::{$method}($ggid);
            if (is_array($rows) && !empty($rows)) {
                return $rows;
            }
        }
    }

    return [];
}