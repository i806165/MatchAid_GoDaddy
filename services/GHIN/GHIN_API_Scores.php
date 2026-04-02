<?php
declare(strict_types=1);
/* /services/GHIN/GHIN_API_Scores.php */

require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';
require_once MA_API_LIB . '/HttpClient.php';
require_once MA_API_LIB . '/Logger.php';

final class ServiceGHINScores
{
    public static function postScoreToGHIN(int $ggid, string $playerGHIN, string $token): array
    {
        try {
            $game = ServiceDbGames::getGameByGGID($ggid);
            $player = ServiceDbPlayers::getGamePlayer($ggid, $playerGHIN);

            if (!$game || !$player) {
                return ['ok' => false, 'message' => 'Game or Player record not found.'];
            }

            if (!empty($player['dbPlayers_GHINPostID'])) {
                return ['ok' => false, 'message' => 'This score has already been posted to GHIN.'];
            }

            $payload = self::buildGHINPayload($game, $player);

            // TEMPORARY: Log the JSON payload for testing purposes
            Logger::info("GHIN_SCORE_POST_DEBUG", [
                'ggid' => $ggid,
                'playerGHIN' => $playerGHIN,
                'payload' => $payload
            ]);

            // INTERCEPT: Return early during testing to prevent live GHIN posting
            return ['ok' => true, 'message' => 'DRY RUN: Score logged but not posted to GHIN.', 'ghinPostId' => 'DEBUG_' . time()];

            $url = "https://api.ghin.com/api/v1/scores/hbh.json";
            $headers = [
                "accept: application/json",
                "Content-Type: application/json",
                "Authorization: Bearer " . $token
            ];

            $response = HttpClient::postJson($url, $payload, $headers);

            // GHIN API returns the new unique identifier in 'score_id'
            $ghinPostId = (string)($response['score_id'] ?? $response['id'] ?? '');

            if ($ghinPostId !== '') {
                ServiceDbPlayers::updateGamePlayerFields($ggid, $playerGHIN, [
                    'dbPlayers_GHINPostID' => $ghinPostId,
                    'dbPlayers_GHINPostTime' => date('Y-m-d H:i:s')
                ]);
                return ['ok' => true, 'ghinPostId' => $ghinPostId];
            }

            return ['ok' => false, 'message' => 'Submission succeeded but GHIN did not return a post ID.'];

        } catch (Throwable $e) {
            error_log("[GHIN_API_Scores] Error: " . $e->getMessage());
            return ['ok' => false, 'message' => 'GHIN API Error: ' . $e->getMessage()];
        }
    }

    private static function buildGHINPayload(array $game, array $player): array
    {
        $scoresJson = $player['dbPlayers_Scores'] ?? [];
        if (is_string($scoresJson)) {
            $scoresJson = json_decode($scoresJson, true) ?: [];
        }

        $maScore = $scoresJson['Scores'][0] ?? [];
        $holeScope = (string)($game['dbGames_Holes'] ?? 'All 18');

        $payload = [
            "golfer_id" => (string)$player['dbPlayers_PlayerGHIN'],
            "course_id" => (string)$game['dbGames_CourseID'],
            "tee_set_id" => (string)$player['dbPlayers_TeeSetID'],
            "tee_set_side" => self::mapTeeSetSide($holeScope),
            "played_at" => substr((string)$game['dbGames_PlayDate'], 0, 10),
            "score_type" => "H",
            "number_of_holes" => ($holeScope === 'F9' || $holeScope === 'B9') ? 9 : 18,
            "gender" => (string)$player['dbPlayers_Gender'],
            "tm_username" => (string)($_SESSION['SessionUserName'] ?? ''),
            "tm_association_club" => (string)($_SESSION['SessionClubName'] ?? ''),
            "tm_league_or_event" => (string)($game['dbGames_Title'] ?? ''),
            "hole_details" => []
        ];

        $maHoleDetails = [];
        foreach ($maScore['hole_details'] ?? [] as $hd) {
            $maHoleDetails[(int)($hd['hole_number'] ?? 0)] = $hd;
        }

        $start = 1; $end = 18;
        if ($holeScope === 'F9') { $start = 1; $end = 9; }
        if ($holeScope === 'B9') { $start = 10; $end = 18; }

        $playedCount = 0;
        for ($h = $start; $h <= $end; $h++) {
            $hd = $maHoleDetails[$h] ?? null;
            $raw = ($hd && !empty($hd['raw_score'])) ? (int)$hd['raw_score'] : null;

            if ($raw !== null && $raw > 0) {
                $payload["hole_details"][] = [
                    "hole_number" => $h,
                    "raw_score" => $raw
                ];
                $playedCount++;
            } else {
                // USGA requirement: send x_hole=true for unplayed/blank holes
                $payload["hole_details"][] = [
                    "hole_number" => $h,
                    "x_hole" => true
                ];
            }
        }
        $payload['number_of_played_holes'] = $playedCount;

        return $payload;
    }

    private static function mapTeeSetSide(string $scope): string
    {
        return ($scope === 'F9') ? 'Front9' : (($scope === 'B9') ? 'Back9' : 'All18');
    }
}