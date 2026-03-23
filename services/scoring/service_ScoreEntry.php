<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreEntry.php

require_once __DIR__ . '/service_ScoreCard.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';

/**
 * ServiceScoreEntry
 * Shared builder/update logic for the Score Entry collector page.
 *
 * Responsibilities:
 * - validate/normalize player score JSON shell
 * - build group launch payload from game row + player rows
 * - derive current-hole collector rows
 * - apply hole edits and recalculate summary totals
 * - enforce score-entry date gating
 */
final class ServiceScoreEntry
{
    public const SCORE_DAY_OFFSET_HOURS = 6; // business rule per current discussion

    public static function buildLaunchPayload(array $gameRow, array $groupPlayers, int $holeNumber): array
    {
        $players = [];
        foreach ($groupPlayers as $playerRow) {
            $playerRow = self::hydrateJsonFields($playerRow);
            $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
            $players[] = [
                'playerRow' => $playerRow,
                'originalScoresJson' => $scoresJson,
                'scoresJson' => $scoresJson,
                'scoreEntryRow' => self::buildScoreEntryRow($gameRow, $playerRow, $scoresJson, $holeNumber),
            ];
        }

        return [
            'gameRow' => $gameRow,
            'currentHole' => $holeNumber,
            'isGameDay' => self::isScoreEntryAllowedToday($gameRow),
            'requiresCartConfig' => trim((string)($gameRow['dbGames_RotationMethod'] ?? '')) === 'COD',
            'players' => $players,
        ];
    }

    public static function isScoreEntryAllowedToday(array $gameRow, ?DateTimeImmutable $now = null): bool
    {
        $playDateRaw = trim((string)($gameRow['dbGames_PlayDate'] ?? ''));
        if ($playDateRaw === '') {
            return false;
        }

        $tz = new DateTimeZone('America/New_York');
        $now = $now ? $now->setTimezone($tz) : new DateTimeImmutable('now', $tz);
        $adjustedNow = $now->modify(sprintf('+%d hours', self::SCORE_DAY_OFFSET_HOURS));
        $today = $adjustedNow->format('Y-m-d');

        try {
            $playDate = (new DateTimeImmutable($playDateRaw, $tz))->format('Y-m-d');
        } catch (Throwable $e) {
            return false;
        }

        return $today === $playDate;
    }

    public static function buildOrHydratePlayerScores(array $gameRow, array $playerRow): array
    {
        $existingScores = $playerRow['dbPlayers_Scores'] ?? null;
        $effectiveHC = self::calculateEffectiveHandicap($gameRow, $playerRow);
        $numberOfHoles = self::deriveNumberOfHoles((string)($gameRow['dbGames_Holes'] ?? 'All 18'));

        $baseSummary = [
            'number_of_holes' => $numberOfHoles,
            'number_of_played_holes' => 0,
            'adjusted_gross_score' => 0,
            'net_score' => 0,
            'played_at' => (string)($gameRow['dbGames_PlayDate'] ?? ''),
            'course_id' => (string)($gameRow['dbGames_CourseID'] ?? ''),
            'course_name' => (string)($gameRow['dbGames_CourseName'] ?? ''),
            'tee_set_id' => (string)($playerRow['dbPlayers_TeeSetID'] ?? ''),
            'tee_set_side' => (string)($gameRow['dbGames_Holes'] ?? 'All 18'),
            'score_type' => 'H',
            'posted_on_home_course' => true,
            'gender' => (string)($playerRow['dbPlayers_Gender'] ?? ''),
            'course_handicap' => (string)$effectiveHC,
            'used' => true,
            'revision' => true,
            'edited' => false,
            'hole_details' => [],
        ];

        if (!is_array($existingScores) || !isset($existingScores['Scores'][0]) || !is_array($existingScores['Scores'][0])) {
            return ['Scores' => [$baseSummary]];
        }

        $existingSummary = $existingScores['Scores'][0];
        $hydratedSummary = array_merge($baseSummary, $existingSummary);
        $hydratedSummary['played_at'] = $baseSummary['played_at'];
        $hydratedSummary['course_id'] = $baseSummary['course_id'];
        $hydratedSummary['course_name'] = $baseSummary['course_name'];
        $hydratedSummary['tee_set_id'] = $baseSummary['tee_set_id'];
        $hydratedSummary['tee_set_side'] = $baseSummary['tee_set_side'];
        $hydratedSummary['gender'] = $baseSummary['gender'];
        $hydratedSummary['course_handicap'] = $baseSummary['course_handicap'];
        $hydratedSummary['number_of_holes'] = $baseSummary['number_of_holes'];
        $hydratedSummary['hole_details'] = self::normalizeHoleDetails($existingSummary['hole_details'] ?? []);

        $recalculated = self::recalculateScoreSummary($gameRow, $playerRow, $hydratedSummary);
        return ['Scores' => [$recalculated]];
    }

    public static function calculateEffectiveHandicap(array $gameRow, array $playerRow): float
    {
        $scoringMethod = trim((string)($gameRow['dbGames_ScoringMethod'] ?? 'NET'));
        $hcMethod = trim((string)($gameRow['dbGames_HCMethod'] ?? 'CH'));

        if ($scoringMethod === 'ADJ GROSS') {
            return 0.0;
        }

        $raw = (str_starts_with($hcMethod, 'SO'))
            ? ($playerRow['dbPlayers_SO'] ?? 0)
            : ($playerRow['dbPlayers_PH'] ?? 0);

        return is_numeric($raw) ? (float)$raw : 0.0;
    }

    public static function normalizeHoleDetails($holeDetails): array
    {
        if (!is_array($holeDetails)) {
            return [];
        }

        $byHole = [];
        foreach ($holeDetails as $detail) {
            if (!is_array($detail)) {
                continue;
            }
            $holeNumber = intval($detail['hole_number'] ?? 0);
            if ($holeNumber <= 0) {
                continue;
            }
            $byHole[$holeNumber] = [
                'adjusted_gross_score' => self::numOrZero($detail['adjusted_gross_score'] ?? 0),
                'raw_score' => self::numOrZero($detail['raw_score'] ?? ($detail['adjusted_gross_score'] ?? 0)),
                'hole_number' => $holeNumber,
                'par' => self::numOrNull($detail['par'] ?? null),
                'stroke_allocation' => self::numOrZero($detail['stroke_allocation'] ?? 0),
                'declared' => !empty($detail['declared']),
            ];
        }

        ksort($byHole, SORT_NUMERIC);
        return array_values($byHole);
    }

    public static function recalculateScoreSummary(array $gameRow, array $playerRow, array $summary): array
    {
        $effectiveHC = self::calculateEffectiveHandicap($gameRow, $playerRow);
        $holeDetails = self::normalizeHoleDetails($summary['hole_details'] ?? []);

        $grossTotal = 0.0;
        $netTotal = 0.0;
        foreach ($holeDetails as $holeDetail) {
            $raw = self::numOrZero($holeDetail['raw_score'] ?? ($holeDetail['adjusted_gross_score'] ?? 0));
            $alloc = self::numOrZero($holeDetail['stroke_allocation'] ?? 0);
            $grossTotal += $raw;
            $netTotal += ($raw - $alloc);
        }

        $summary['number_of_played_holes'] = count($holeDetails);
        $summary['adjusted_gross_score'] = $grossTotal;
        $summary['net_score'] = $netTotal;
        $summary['course_handicap'] = (string)$effectiveHC;
        $summary['hole_details'] = $holeDetails;

        return $summary;
    }

    public static function applyHoleScore(
        array $gameRow,
        array $playerRow,
        array $scoresJson,
        int $holeNumber,
        ?float $rawScore,
        bool $declaredFlag
    ): array {
        if (!isset($scoresJson['Scores'][0]) || !is_array($scoresJson['Scores'][0])) {
            $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
        }

        $summary = $scoresJson['Scores'][0];
        $courseMap = ServiceScoreCard::getCourseInfoMap($gameRow, $playerRow);
        $teeDetails = $playerRow['dbPlayers_TeeSetDetails'] ?? [];
        $teeHoles = is_array($teeDetails) ? ($teeDetails['Holes'] ?? []) : [];
        $effectiveHC = self::calculateEffectiveHandicap($gameRow, $playerRow);
        $strokeMap = ServiceScoreCard::buildStrokeAllocationMap($gameRow, $effectiveHC, $teeHoles);

        $courseInfo = $courseMap[$holeNumber] ?? [];
        $par = self::numOrNull($courseInfo['par'] ?? null);
        $strokeAllocation = self::numOrZero($strokeMap[$holeNumber] ?? 0);

        $holeDetails = self::normalizeHoleDetails($summary['hole_details'] ?? []);

        $newHole = [
            'adjusted_gross_score' => self::numOrZero($rawScore),
            'raw_score' => self::numOrZero($rawScore),
            'hole_number' => $holeNumber,
            'par' => $par,
            'stroke_allocation' => $strokeAllocation,
            'declared' => $declaredFlag,
        ];

        $updated = false;
        foreach ($holeDetails as $idx => $detail) {
            if (intval($detail['hole_number'] ?? 0) === $holeNumber) {
                $holeDetails[$idx] = $newHole;
                $updated = true;
                break;
            }
        }
        if (!$updated) {
            $holeDetails[] = $newHole;
        }

        $summary['hole_details'] = $holeDetails;
        $summary['edited'] = true;
        $summary = self::recalculateScoreSummary($gameRow, $playerRow, $summary);

        return ['Scores' => [$summary]];
    }

    public static function clearHoleScore(array $gameRow, array $playerRow, array $scoresJson, int $holeNumber): array
    {
        if (!isset($scoresJson['Scores'][0]) || !is_array($scoresJson['Scores'][0])) {
            $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
        }

        $summary = $scoresJson['Scores'][0];
        $holeDetails = self::normalizeHoleDetails($summary['hole_details'] ?? []);
        $holeDetails = array_values(array_filter($holeDetails, static fn(array $detail): bool => intval($detail['hole_number'] ?? 0) !== $holeNumber));
        $summary['hole_details'] = $holeDetails;
        $summary['edited'] = true;
        $summary = self::recalculateScoreSummary($gameRow, $playerRow, $summary);

        return ['Scores' => [$summary]];
    }

    public static function buildScoreEntryRow(array $gameRow, array $playerRow, array $scoresJson, int $holeNumber): array
    {
        $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
        $summary = $scoresJson['Scores'][0];

        $courseMap = ServiceScoreCard::getCourseInfoMap($gameRow, $playerRow);
        $teeDetails = $playerRow['dbPlayers_TeeSetDetails'] ?? [];
        $teeHoles = is_array($teeDetails) ? ($teeDetails['Holes'] ?? []) : [];
        $effectiveHC = self::calculateEffectiveHandicap($gameRow, $playerRow);
        $strokeMap = ServiceScoreCard::buildStrokeAllocationMap($gameRow, $effectiveHC, $teeHoles);

        $courseInfo = $courseMap[$holeNumber] ?? [];
        $par = self::numOrNull($courseInfo['par'] ?? null);
        $yardage = self::numOrNull($courseInfo['yardage'] ?? null);
        $holeHcp = self::numOrNull($courseInfo['hcp'] ?? null);
        $strokeAllocation = self::numOrZero($strokeMap[$holeNumber] ?? 0);

        $savedHole = null;
        foreach (self::normalizeHoleDetails($summary['hole_details'] ?? []) as $detail) {
            if (intval($detail['hole_number'] ?? 0) === $holeNumber) {
                $savedHole = $detail;
                break;
            }
        }

        $rawScore = $savedHole ? self::numOrNull($savedHole['raw_score'] ?? ($savedHole['adjusted_gross_score'] ?? null)) : null;
        $declared = $savedHole ? !empty($savedHole['declared']) : false;
        $netScore = is_numeric($rawScore) ? ((float)$rawScore - $strokeAllocation) : null;

        $pid = ($playerRow['dbPlayers_GGID'] ?? '') . '_' . ($playerRow['dbPlayers_PlayerGHIN'] ?? '');

        return [
            'playerId' => $pid,
            'playerGHIN' => (string)($playerRow['dbPlayers_PlayerGHIN'] ?? ''),
            'playerKey' => (string)($playerRow['dbPlayers_PlayerKey'] ?? ''),
            'playerName' => (string)($playerRow['dbPlayers_Name'] ?? ''),
            'teeTime' => (string)($playerRow['dbPlayers_TeeTime'] ?? ''),
            'flightId' => (string)($playerRow['dbPlayers_FlightID'] ?? ''),
            'pairingId' => (string)($playerRow['dbPlayers_PairingID'] ?? ''),
            'pairingPos' => (string)($playerRow['dbPlayers_PairingPos'] ?? ''),
            'startHole' => (string)($playerRow['dbPlayers_StartHole'] ?? ''),
            'teeSetId' => (string)($playerRow['dbPlayers_TeeSetID'] ?? ''),
            'teeSetName' => (string)($playerRow['dbPlayers_TeeSetName'] ?? ''),
            'effectiveHC' => $effectiveHC,
            'holeNumber' => $holeNumber,
            'par' => $par,
            'yardage' => $yardage,
            'holeHcp' => $holeHcp,
            'strokeAllocation' => $strokeAllocation,
            'rawScore' => $rawScore,
            'netScore' => $netScore,
            'declared' => $declared,
            'strokeSuperscript' => self::strokeSuperscript($strokeAllocation),
        ];
    }

    public static function resolveGroupLoadMode(array $gameRow, array $launchedPlayer): array
    {
        $toMethod = trim((string)($gameRow['dbGames_TOMethod'] ?? ''));
        $gameFormat = trim((string)($gameRow['dbGames_GameFormat'] ?? ''));
        $startHole = trim((string)($launchedPlayer['dbPlayers_StartHole'] ?? ''));
        $teeTime = trim((string)($launchedPlayer['dbPlayers_TeeTime'] ?? ''));
        $flightId = trim((string)($launchedPlayer['dbPlayers_FlightID'] ?? ''));
        $pairingId = trim((string)($launchedPlayer['dbPlayers_PairingID'] ?? '000'));

        if (strcasecmp($toMethod, 'ShotGun') === 0 && $startHole !== '') {
            return ['mode' => 'start_hole', 'value' => $startHole];
        }
        if ($teeTime !== '') {
            return ['mode' => 'tee_time', 'value' => $teeTime];
        }
        if (stripos($gameFormat, 'Match') !== false && $flightId !== '') {
            return ['mode' => 'flight_id', 'value' => $flightId];
        }
        return ['mode' => 'pairing_id', 'value' => $pairingId];
    }

    public static function saveScoresForGroup(array $request): array
    {
        $gameRow = is_array($request['gameRow'] ?? null) ? $request['gameRow'] : [];
        $players = is_array($request['players'] ?? null) ? $request['players'] : [];
        $scorerGHIN = trim((string)($request['scorerGHIN'] ?? ''));
        $currentHole = intval($request['currentHole'] ?? 0);
        $nextHole = intval($request['nextHole'] ?? $currentHole);

        if (!$gameRow || !$players) {
            return ['ok' => false, 'conflict' => false, 'message' => 'Missing game or player payload.'];
        }
        if ($scorerGHIN === '') {
            return ['ok' => false, 'conflict' => false, 'message' => 'Scorekeeper is required.'];
        }
        if ($currentHole <= 0) {
            return ['ok' => false, 'conflict' => false, 'message' => 'Invalid current hole.'];
        }

        $firstPlayerRow = is_array($players[0]['playerRow'] ?? null) ? $players[0]['playerRow'] : [];
        $ggid = trim((string)($firstPlayerRow['dbPlayers_GGID'] ?? $gameRow['dbGames_GGID'] ?? ''));
        $playerKey = trim((string)($firstPlayerRow['dbPlayers_PlayerKey'] ?? ''));

        if ($ggid === '' || $playerKey === '') {
            return ['ok' => false, 'conflict' => false, 'message' => 'Missing group identity.'];
        }

        $currentDbPlayers = ServiceDbPlayers::getPlayersByPlayerKey($playerKey);
        if (!$currentDbPlayers) {
            return ['ok' => false, 'conflict' => false, 'message' => 'Scoring group not found.'];
        }

        $conflicts = self::detectGroupScoreConflicts($players, $currentDbPlayers, $gameRow);
        if ($conflicts) {
            return [
                'ok' => false,
                'conflict' => true,
                'message' => 'Another scorer is already updating this scorecard. Your current hole entries were not saved.',
                'players' => [],
                'nextHole' => $nextHole
            ];
        }

        $validatedStartHole = self::validateStartHoleForSide(
            (string)($firstPlayerRow['dbPlayers_StartHole'] ?? ''),
            (string)($gameRow['dbGames_Holes'] ?? 'All 18')
        );

        $savedPlayers = [];
        foreach ($players as $submittedWrapper) {
            $submittedPlayerRow = is_array($submittedWrapper['playerRow'] ?? null) ? $submittedWrapper['playerRow'] : [];
            $playerGHIN = trim((string)($submittedPlayerRow['dbPlayers_PlayerGHIN'] ?? ''));
            if ($playerGHIN === '') {
                return ['ok' => false, 'conflict' => false, 'message' => 'One or more players are missing GHIN IDs.'];
            }

            $currentDbPlayer = null;
            foreach ($currentDbPlayers as $dbPlayer) {
                if ((string)($dbPlayer['dbPlayers_GGID'] ?? '') === $ggid
                    && (string)($dbPlayer['dbPlayers_PlayerGHIN'] ?? '') === $playerGHIN) {
                    $currentDbPlayer = $dbPlayer;
                    $currentDbPlayer = self::hydrateJsonFields($dbPlayer);
                    break;
                }
            }
            if (!$currentDbPlayer) {
                return ['ok' => false, 'conflict' => false, 'message' => 'One or more players could not be reloaded.'];
            }

            $fields = self::buildSavedPlayerFields(
                $gameRow,
                $submittedWrapper,
                $currentDbPlayer,
                $currentHole,
                $scorerGHIN,
                $validatedStartHole
            );

            $saved = ServiceDbPlayers::updateGamePlayerFields($ggid, $playerGHIN, $fields);
            if (!$saved) {
                return ['ok' => false, 'conflict' => false, 'message' => 'Unable to persist score updates.'];
            }

            // Ensure the response payload has array scores (ServiceDbPlayers might return string or array)
            if (isset($saved['dbPlayers_Scores']) && is_string($saved['dbPlayers_Scores'])) {
                $decoded = json_decode($saved['dbPlayers_Scores'], true);
                if (is_array($decoded)) {
                    $saved['dbPlayers_Scores'] = $decoded;
                }
            }

            $savedPlayers[] = [
                'dbPlayers_GGID' => (string)($saved['dbPlayers_GGID'] ?? $ggid),
                'dbPlayers_PlayerGHIN' => (string)($saved['dbPlayers_PlayerGHIN'] ?? $playerGHIN),
                'dbPlayers_Scores' => $saved['dbPlayers_Scores'] ?? null,
            ];
        }

        return [
            'ok' => true,
            'conflict' => false,
            'message' => 'Scores saved.',
            'players' => $savedPlayers,
            'nextHole' => $nextHole
        ];
    }

    public static function detectGroupScoreConflicts(array $submittedPlayers, array $currentDbPlayers, array $gameRow): array
    {
        $conflicts = [];
        foreach ($submittedPlayers as $wrapper) {
            $playerRow = is_array($wrapper['playerRow'] ?? null) ? $wrapper['playerRow'] : [];
            $ggid = (string)($playerRow['dbPlayers_GGID'] ?? '');
            $ghin = (string)($playerRow['dbPlayers_PlayerGHIN'] ?? '');

            if ($ggid === '' || $ghin === '') {
                continue;
            }

            $currentDbPlayer = null;
            foreach ($currentDbPlayers as $dbPlayer) {
                if ((string)($dbPlayer['dbPlayers_GGID'] ?? '') === $ggid
                    && (string)($dbPlayer['dbPlayers_PlayerGHIN'] ?? '') === $ghin) {
                    $currentDbPlayer = $dbPlayer;
                    $currentDbPlayer = self::hydrateJsonFields($dbPlayer);
                    break;
                }
            }
            if (!$currentDbPlayer) {
                $conflicts[] = (string)($playerRow['dbPlayers_Name'] ?? $ghin);
                continue;
            }

            $original = $wrapper['originalScoresJson'] ?? null;
            $current = self::buildOrHydratePlayerScores($gameRow, $currentDbPlayer);

            if (self::canonicalizeJsonish($original) !== self::canonicalizeJsonish($current)) {
                $conflicts[] = (string)($playerRow['dbPlayers_Name'] ?? $ghin);
            }
        }

        return $conflicts;
    }

    public static function buildSavedPlayerFields(
        array $gameRow,
        array $submittedWrapper,
        array $currentDbPlayer,
        int $holeNumber,
        string $scorerGHIN,
        string $validatedStartHole
    ): array {
        $scoreEntryRow = is_array($submittedWrapper['scoreEntryRow'] ?? null) ? $submittedWrapper['scoreEntryRow'] : [];
        $submittedPlayerRow = is_array($submittedWrapper['playerRow'] ?? null) ? $submittedWrapper['playerRow'] : [];
        $workingScoresJson = is_array($submittedWrapper['scoresJson'] ?? null) ? $submittedWrapper['scoresJson'] : ($currentDbPlayer['dbPlayers_Scores'] ?? []);

        $rawScore = $scoreEntryRow['rawScore'] ?? null;
        $declared = !empty($scoreEntryRow['declared']);

        if ($rawScore !== null && $rawScore !== '') {
            self::assertValidRawScore($rawScore);
            $newScoresJson = self::applyHoleScore(
                $gameRow,
                $currentDbPlayer,
                $workingScoresJson,
                $holeNumber,
                (float)$rawScore,
                $declared
            );
        } else {
            $newScoresJson = self::clearHoleScore(
                $gameRow,
                $currentDbPlayer,
                $workingScoresJson,
                $holeNumber
            );
        }

        $pairingPos = (string)($submittedPlayerRow['dbPlayers_PairingPos'] ?? $currentDbPlayer['dbPlayers_PairingPos'] ?? '');
        if (!in_array($pairingPos, ['1', '2', '3', '4'], true)) {
            $pairingPos = (string)($currentDbPlayer['dbPlayers_PairingPos'] ?? '');
        }

        return [
            'dbPlayers_Scores' => json_encode($newScoresJson), // Ensure we save as string
            'dbPlayers_ScoreKeeper' => $scorerGHIN,
            'dbPlayers_StartHole' => $validatedStartHole,
            'dbPlayers_PairingPos' => $pairingPos,
        ];
    }

    public static function validateStartHoleForSide(?string $startHole, string $teeSide): string
    {
        $allowed = [];
        if ($teeSide === 'F9') {
            $allowed = array_map('strval', range(1, 9));
        } elseif ($teeSide === 'B9') {
            $allowed = array_map('strval', range(10, 18));
        } else {
            $allowed = array_map('strval', range(1, 18));
        }

        $clean = trim((string)$startHole);
        return in_array($clean, $allowed, true) ? $clean : $allowed[0];
    }

    private static function deriveNumberOfHoles(string $holesLabel): int
    {
        return ($holesLabel === 'F9' || $holesLabel === 'B9') ? 9 : 18;
    }

    private static function strokeSuperscript(float $value): string
    {
        static $map = [
            '-5' => '⁻⁵', '-4' => '⁻⁴', '-3' => '⁻³', '-2' => '⁻²', '-1' => '⁻¹',
            '1' => '¹', '2' => '²', '3' => '³', '4' => '⁴', '5' => '⁵',
        ];
        $key = (string)intval($value);
        return $map[$key] ?? ($value == 0 ? '' : $key);
    }

    private static function numOrZero($value): float
    {
        return is_numeric($value) ? (float)$value : 0.0;
    }

    private static function numOrNull($value): ?float
    {
        return is_numeric($value) ? (float)$value : null;
    }
    
    private static function assertValidRawScore($value): void
    {
        if (!is_numeric($value)) {
            throw new RuntimeException('Raw score must be numeric.');
        }

        $num = (float)$value;
        if ($num < 1 || $num > 15) {
            throw new RuntimeException('Raw score must be between 1 and 15.');
        }
    }

    private static function canonicalizeJsonish($value): string
    {
        $normalized = self::sortRecursive($value);
        return json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function sortRecursive($value)
    {
        if (!is_array($value)) {
            return $value;
        }

        $isAssoc = array_keys($value) !== range(0, count($value) - 1);

        if ($isAssoc) {
            ksort($value);
            foreach ($value as $k => $v) {
                $value[$k] = self::sortRecursive($v);
            }
            return $value;
        }

        foreach ($value as $idx => $v) {
            $value[$idx] = self::sortRecursive($v);
        }
        return $value;
    }

    private static function hydrateJsonFields(array $row): array
    {
        if (isset($row['dbPlayers_TeeSetDetails']) && is_string($row['dbPlayers_TeeSetDetails'])) {
            $val = json_decode($row['dbPlayers_TeeSetDetails'], true);
            if (is_array($val)) {
                $row['dbPlayers_TeeSetDetails'] = $val;
            }
        }
        if (isset($row['dbPlayers_Scores']) && is_string($row['dbPlayers_Scores'])) {
            $val = json_decode($row['dbPlayers_Scores'], true);
            if (is_array($val)) {
                $row['dbPlayers_Scores'] = $val;
            }
        }
        return $row;
    }
}
