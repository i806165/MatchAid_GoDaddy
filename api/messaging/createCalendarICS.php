<?php
// /api/messaging/createCalendarICS.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once __DIR__ . '/../../services/service_ContextUser.php';
require_once __DIR__ . '/../../services/service_dbGames.php';

session_start();

function ma_ics_text(string $s): string {
    $s = str_replace("\\", "\\\\", $s);
    $s = str_replace(";", "\\;", $s);
    $s = str_replace(",", "\\,", $s);
    $s = preg_replace("/\r\n|\r|\n/", "\\n", $s);
    return $s;
}

function ma_html_to_plain_text(?string $html): string {
    $s = (string)($html ?? '');
    if ($s === '') return '';

    $s = preg_replace('/<br\s*\/?>/i', "\n", $s);
    $s = preg_replace('/<\/p>/i', "\n", $s);
    $s = preg_replace('/<\/div>/i', "\n", $s);
    $s = preg_replace('/<\/li>/i', "\n", $s);
    $s = preg_replace('/<li[^>]*>/i', "• ", $s);

    $s = strip_tags($s);
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $s = str_replace("\r", "", $s);
    $s = preg_replace("/\n{3,}/", "\n\n", $s);
    $s = preg_replace("/[ \t]+\n/", "\n", $s);
    $s = preg_replace("/\n[ \t]+/", "\n", $s);

    return trim($s);
}

function ma_fold_ics_line(string $line): string {
    // RFC5545 recommends line folding at 75 octets.
    // This is a practical UTF-8-safe approximation.
    $max = 73;
    if (strlen($line) <= $max) return $line;

    $out = '';
    while (strlen($line) > $max) {
        $out .= substr($line, 0, $max) . "\r\n ";
        $line = substr($line, $max);
    }

    return $out . $line;
}

function ma_ics_datetime_utc(DateTimeInterface $dt): string {
    $utc = new DateTimeZone('UTC');
    $copy = new DateTimeImmutable($dt->format('Y-m-d H:i:s'), $dt->getTimezone());
    return $copy->setTimezone($utc)->format('Ymd\THis\Z');
}

function ma_safe_filename_part(string $s): string {
    $s = trim($s);
    $s = preg_replace('/\s+/', '-', $s);
    $s = preg_replace('/[^A-Za-z0-9._-]/', '', $s);
    return $s ?: 'game';
}

function ma_get_field(array $row, array $keys): string {
    foreach ($keys as $k) {
        if (isset($row[$k]) && trim((string)$row[$k]) !== '') {
            return trim((string)$row[$k]);
        }
    }
    return '';
}

try {
    $ggid = trim((string)($_GET['ggid'] ?? ''));

    if ($ggid === '' || !ctype_digit($ggid)) {
        http_response_code(400);
        echo 'Missing or invalid game id.';
        exit;
    }

    // Validate logged-in user/session.
    // Adjust method name if your ServiceUserContext signature differs.
    $userCtx = ServiceUserContext::getUserContext();

    if (!$userCtx || empty($userCtx['userGHIN'])) {
        http_response_code(401);
        echo 'Not authorized.';
        exit;
    }

    /*
     * Load game row.
     *
     * Replace this with your canonical service_dbGames method if named differently.
     * The important thing is: query db_Games by dbGames_GGID and return one associative row.
     */
    $game = ServiceDbGames::getGameByGGID((int)$ggid);

    if (!$game || !is_array($game)) {
        http_response_code(404);
        echo 'Game not found.';
        exit;
    }

    /*
     * Optional but recommended:
     * Validate that this player is allowed to see/download this game.
     *
     * Example placeholders:
     * - same club
     * - registered player
     * - open/club-visible game
     * - favorite/admin relationship
     *
     * Keep permissive at first only if the game list already limits visibility.
     */

    $gameTitle    = ma_get_field($game, ['title', 'dbGames_Title']) ?: 'Golf Game';
    $adminName    = ma_get_field($game, ['adminName', 'dbGames_AdminName']);
    $playDate     = ma_get_field($game, ['playDate', 'dbGames_PlayDate']);
    $playTime     = ma_get_field($game, ['playTimeText', 'dbGames_PlayTime']) ?: '08:00';
    $courseName   = ma_get_field($game, ['courseName', 'dbGames_CourseName']);
    $facilityName = ma_get_field($game, ['facilityName', 'dbGames_FacilityName']);
    $holes        = ma_get_field($game, ['holes', 'dbGames_Holes']);
    $teeTimeList  = ma_get_field($game, ['teeTimeList', 'dbGames_TeeTimeList']);
    $commentsRaw  = ma_get_field($game, ['comments', 'dbGames_Comments']);

    if ($playDate === '') {
        http_response_code(422);
        echo 'Game is missing play date.';
        exit;
    }

    if (!preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $playTime)) {
        $playTime = '08:00';
    }

    $playTime = substr($playTime, 0, 5);

    // Use your club/app timezone if needed. New York is a safe default for your current use.
    $tz = new DateTimeZone('America/New_York');

    $start = DateTimeImmutable::createFromFormat(
        'Y-m-d H:i:s',
        $playDate . ' ' . $playTime . ':00',
        $tz
    );

    if (!$start) {
        http_response_code(422);
        echo 'Invalid game date/time.';
        exit;
    }

    $end = $start->modify('+4 hours');

    $hostedTitle = $adminName !== ''
        ? $gameTitle . ' golf hosted by ' . $adminName
        : $gameTitle;

    $summaryParts = [];

    if ($holes !== '') {
        $summaryParts[] = 'Playing ' . $holes . ' holes';
    }

    if ($teeTimeList !== '') {
        $summaryParts[] = 'Tee Times ' . $teeTimeList;
    }

    $description = implode(' with ', $summaryParts);

    $commentsPlain = ma_html_to_plain_text($commentsRaw);
    if ($commentsPlain !== '') {
        $description .= ($description !== '' ? "\n\n" : '') . $commentsPlain;
    }

    $directGameLink = 'https://www.matchaid.org/game/' . rawurlencode($ggid);
    $description .= ($description !== '' ? "\n\n" : '') .
        'To view or register for the game, please click ' . $directGameLink;

    $location = trim(implode(' ', array_filter([$facilityName, $courseName])));

    $uid = 'matchaid-game-' . $ggid . '@matchaid';
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

    $lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//MatchAid//Player Portal//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' . ma_ics_text($uid),
        'DTSTAMP:' . ma_ics_datetime_utc($now),
        'DTSTART:' . ma_ics_datetime_utc($start),
        'DTEND:' . ma_ics_datetime_utc($end),
        'SUMMARY:' . ma_ics_text($hostedTitle),
        'LOCATION:' . ma_ics_text($location),
        'DESCRIPTION:' . ma_ics_text($description),
        'END:VEVENT',
        'END:VCALENDAR',
    ];

    $ics = implode("\r\n", array_map('ma_fold_ics_line', $lines)) . "\r\n";

    $filePart = ma_safe_filename_part('game-' . $ggid);
    $filename = 'matchaid-' . $filePart . '-' . time() . '.ics';

    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Content-Length: ' . strlen($ics));

    echo $ics;
    exit;

} catch (Throwable $e) {
    error_log('[MA][CALENDAR_ICS_ERROR] ' . $e->getMessage());

    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Unable to create calendar file.';
    exit;
}