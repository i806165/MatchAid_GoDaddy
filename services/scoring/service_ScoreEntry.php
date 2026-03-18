<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreEntry.php

require_once __DIR__ . '/service_ScoreCard.php';

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
            $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
            $players[] = [
                'playerRow' => $playerRow,
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

        return [
            'playerId' => (string)($playerRow['_id'] ?? ''),
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
}
