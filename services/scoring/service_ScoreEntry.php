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

    // ==========================================================================
    // 0. Session Context Helpers
    // ==========================================================================

    public static function setScorerContext(string $ghin): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $_SESSION['SessionScorerGHIN'] = trim($ghin);
    }

    public static function setScorecardKey(string $key): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $_SESSION['SessionScorecardKey'] = strtoupper(trim($key));
    }

    public static function getScorecardKey(): ?string {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        return $_SESSION['SessionScorecardKey'] ?? null;
    }

    public static function setScoringPodGGID(int $ggid): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $_SESSION['ScoringPodGGID'] = $ggid;
    }

    public static function getScoringPodGGID(): ?int {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        return isset($_SESSION['ScoringPodGGID']) ? (int)$_SESSION['ScoringPodGGID'] : null;
    }

    public static function clearScoringSession(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        unset($_SESSION['SessionScorerGHIN'], $_SESSION['SessionScorecardKey'], $_SESSION['SessionCurrentHole'], $_SESSION['ScoringPodGGID']);
    }

    public static function getEffectivePlayerGHIN(): ?string {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $ghin = $_SESSION['SessionScorerGHIN'] ?? $_SESSION['SessionGHINLogonID'] ?? null;
        return ($ghin !== null && trim((string)$ghin) !== "") ? trim((string)$ghin) : null;
    }

    // ==========================================================================
    // 1. Public Entry Points
    // ==========================================================================

    public static function buildLaunchPayload(array $gameRow, array $groupPlayers, int $holeNumber, string $playerKey = ''): array
    {
        $players = [];
        $groupPlayers = self::sortLaunchPlayers($gameRow, $groupPlayers);
        $launchedPlayer = $groupPlayers[0] ?? [];
        $ggid = (string)($launchedPlayer['dbPlayers_GGID'] ?? $gameRow['dbGames_GGID'] ?? '');

        foreach ($groupPlayers as $playerRow) {
            // Ensure JSON fields are arrays
            $playerRow = self::hydratePlayerFields($playerRow);
            
            // Build or hydrate the canonical scores structure
            $scoresJson = self::buildOrHydratePlayerScores($gameRow, $playerRow);
            $players[] = [
                'playerRow' => $playerRow,
                'originalScoresJson' => $scoresJson,
                'scoresJson' => $scoresJson,
                'scoreEntryRow' => self::buildScoreEntryRow($gameRow, $playerRow, $scoresJson, $holeNumber),
            ];
        }

        // Resolve declarations based on rules before returning to UI
        self::resolveDeclaredScores($gameRow, $players, $holeNumber);

        $isAllowedToday = self::isScoreEntryAllowedToday($gameRow);
        $requiresCart = trim((string)($gameRow['dbGames_RotationMethod'] ?? '')) === 'COD';
        $canSave = MA_TESTING_MODE || $isAllowedToday;

        return [
            'gameRow' => $gameRow,
            'currentHole' => $holeNumber,
            'portal' => $_SESSION["SessionPortal"] ?? "",
            'isGameDay' => $isAllowedToday,
            'requiresCartConfig' => $requiresCart && $canSave,
            'players' => $players,
            'scorerGHIN' => self::getEffectivePlayerGHIN(),
            'launchContext' => [
                'playerKey' => $playerKey,
                'groupLoadRule' => 'PlayerKey',
                'launchedPlayerId' => (string)($launchedPlayer['_id'] ?? ''),
                'ggid' => $ggid,
            ]
        ];
    }

    public static function saveScoresForGroup(array $request): array
    {
        return self::persistScores($request);
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

    // ==========================================================================
    // 2. Launch Payload Building
    // ==========================================================================

    // Logic contained within buildLaunchPayload in section 1.

    // ==========================================================================
    // 3. Player Score JSON Hydration
    // ==========================================================================

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
        
        // Ensure course/tee identity matches game context
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

    private static function deriveNumberOfHoles(string $holesLabel): int
    {
        return ($holesLabel === 'F9' || $holesLabel === 'B9') ? 9 : 18;
    }

    // ==========================================================================
    // 3.5 Declaration Engine
    // ==========================================================================

    public static function resolveDeclaredScores(array $gameRow, array &$players, int $holeNumber): void
    {
        $scoringSystem = (string)($gameRow['dbGames_ScoringSystem'] ?? 'BestBall');
        $competition = (string)($gameRow['dbGames_Competition'] ?? 'PairField');
        $scoringMethod = (string)($gameRow['dbGames_ScoringMethod'] ?? 'NET');

        // 1. Manual modes exit early
        if (in_array($scoringSystem, ['DeclareManual', 'DeclarePlayer'], true)) {
            return;
        }

        // 2. Determine evaluation partitions by PairingID
        $partitions = [];
        foreach ($players as $idx => $wrapper) {
            $pairingId = trim((string)($wrapper['playerRow']['dbPlayers_PairingID'] ?? ''));
            if ($pairingId === '') $pairingId = '000';

            $partitions[$pairingId][] = [
                'idx' => $idx,
                'raw' => $wrapper['scoreEntryRow']['rawScore'] ?? null,
                'net' => $wrapper['scoreEntryRow']['netScore'] ?? null,
                'pos' => (int)($wrapper['playerRow']['dbPlayers_PairingPos'] ?? 99)
            ];
        }

        // 3. Resolve each partition
        foreach ($partitions as $side => $rows) {
            // Filter to only rows with valid scores
            $validRows = array_filter($rows, fn($r) => is_numeric($r['raw']));

            // Determine N (number of scores to declare)
            $n = 1;
            if ($scoringSystem === 'AllScores') {
                $n = count($validRows);
            } elseif ($scoringSystem === 'DeclareHole') {
                $holeDecls = $gameRow['dbGames_HoleDeclaration'] ?? [];
                if (is_string($holeDecls)) $holeDecls = json_decode($holeDecls, true) ?: [];
                $foundHole = array_values(array_filter($holeDecls, fn($h) => (int)($h['hole'] ?? 0) === $holeNumber));
                $n = (int)($foundHole[0]['count'] ?? 1);
            } elseif ($scoringSystem === 'BestBall') {
                $n = (int)($gameRow['dbGames_BestBall'] ?? 1);
            }

            // Sort by: Metric -> then Gross -> then Position
            usort($validRows, function($a, $b) use ($scoringMethod) {
                $metricA = ($scoringMethod === 'ADJ GROSS') ? $a['raw'] : $a['net'];
                $metricB = ($scoringMethod === 'ADJ GROSS') ? $b['raw'] : $b['net'];

                if ($metricA != $metricB) return $metricA <=> $metricB;
                if ($a['raw'] != $b['raw']) return $a['raw'] <=> $b['raw'];
                return $a['pos'] <=> $b['pos'];
            });

            $declaredIndices = array_column(array_slice($validRows, 0, $n), 'idx');

            // Apply updates to the original players array
            foreach ($rows as $row) {
                $pIdx = $row['idx'];
                $isDeclared = in_array($pIdx, $declaredIndices, true);
                
                $players[$pIdx]['scoreEntryRow']['declared'] = $isDeclared;
                $players[$pIdx]['scoreEntryRow']['declaredSource'] = 'system';

                // Re-sync the hydrated JSON object
                self::syncHoleDetailDeclaration($players[$pIdx], $holeNumber, $isDeclared);
            }
        }
    }

    private static function syncHoleDetailDeclaration(array &$wrapper, int $holeNumber, bool $isDeclared): void
    {
        if (!isset($wrapper['scoresJson']['Scores'][0])) return;
        $details = &$wrapper['scoresJson']['Scores'][0]['hole_details'];
        if (!is_array($details)) return;

        foreach ($details as &$detail) {
            if ((int)($detail['hole_number'] ?? 0) === $holeNumber) {
                $detail['declared'] = $isDeclared;
                $detail['declaredSource'] = 'system';
                break;
            }
        }
    }

    // ==========================================================================
    // 4. Hole Row Builders
    // ==========================================================================

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

    private static function strokeSuperscript(float $value): string
    {
        static $map = [
            '-5' => '⁻⁵', '-4' => '⁻⁴', '-3' => '⁻³', '-2' => '⁻²', '-1' => '⁻¹',
            '1' => '¹', '2' => '²', '3' => '³', '4' => '⁴', '5' => '⁵',
        ];
        $key = (string)intval($value);
        return $map[$key] ?? ($value == 0 ? '' : $key);
    }

    // ==========================================================================
    // 5. Score Summary Recalculation
    // ==========================================================================

    public static function calculateEffectiveHandicap(array $gameRow, array $playerRow): float
    {
        // Delegate to centralized logic in ServiceScoreCard
        return ServiceScoreCard::calculateEffectiveHandicap($gameRow, $playerRow);
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

    private static function numOrZero($value): float
    {
        return is_numeric($value) ? (float)$value : 0.0;
    }

    private static function numOrNull($value): ?float
    {
        return is_numeric($value) ? (float)$value : null;
    }

    // ==========================================================================
    // 6. Save / Conflict Handling
    // ==========================================================================

    public static function persistScores(array $request): array
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

        $conflicts = self::detectSaveConflict($players, currentDbPlayers: $currentDbPlayers, gameRow: $gameRow);
        if ($conflicts) {
            return [
                'ok' => false,
                'conflict' => true,
                'message' => 'Another scorer is already updating this scorecard. Your current hole entries were not saved.',
                'players' => [],
                'nextHole' => $nextHole
            ];
        }

        // Authoritatively resolve declarations for automatic modes before persisting
        self::resolveDeclaredScores($gameRow, $players, $currentHole);

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
                    $currentDbPlayer = self::hydratePlayerFields($dbPlayer);
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

    public static function detectSaveConflict(array $submittedPlayers, array $currentDbPlayers, array $gameRow): array
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
                    $currentDbPlayer = self::hydratePlayerFields($dbPlayer);
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

    // ==========================================================================
    // 7. Date-Gating and Eligibility
    // ==========================================================================

    // Logic contained within isScoreEntryAllowedToday in section 1.
    
    public static function validateDateGate(array $gameRow): bool
    {
        return self::isScoreEntryAllowedToday($gameRow);
    }

    // ==========================================================================
    // 8. Generic Helpers
    // ==========================================================================

    private static function hydratePlayerFields(array $row): array
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

    private static function sortLaunchPlayers(array $gameRow, array $players): array
  {
      $competition = trim((string)($gameRow['dbGames_Competition'] ?? 'PairField'));

      usort($players, function ($a, $b) use ($competition) {
          $pairA = trim((string)($a['dbPlayers_PairingID'] ?? ''));
          $pairB = trim((string)($b['dbPlayers_PairingID'] ?? ''));
          $pairPosA = (int)($a['dbPlayers_PairingPos'] ?? 999);
          $pairPosB = (int)($b['dbPlayers_PairingPos'] ?? 999);

          if ($competition === 'PairPair') {
              $flightA = trim((string)($a['dbPlayers_FlightID'] ?? ''));
              $flightB = trim((string)($b['dbPlayers_FlightID'] ?? ''));
              if ($flightA !== $flightB) {
                  return strnatcmp($flightA, $flightB);
              }

              $fPosA = trim((string)($a['dbPlayers_FlightPos'] ?? ''));
              $fPosB = trim((string)($b['dbPlayers_FlightPos'] ?? ''));
              if ($fPosA !== $fPosB) {
                  return strcmp($fPosA, $fPosB);
              }
          }

          if ($pairA !== $pairB) {
              return strnatcmp($pairA, $pairB);
          }

          if ($pairPosA !== $pairPosB) {
              return $pairPosA <=> $pairPosB;
          }

          $lastA = trim((string)($a['dbPlayers_LName'] ?? ''));
          $lastB = trim((string)($b['dbPlayers_LName'] ?? ''));
          if ($lastA !== $lastB) {
              return strcmp($lastA, $lastB);
          }

          $nameA = trim((string)($a['dbPlayers_Name'] ?? ''));
          $nameB = trim((string)($b['dbPlayers_Name'] ?? ''));
          return strcmp($nameA, $nameB);
      });

      return $players;
  }
}
