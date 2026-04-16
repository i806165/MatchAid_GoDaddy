<?php
declare(strict_types=1);
/* /api/GHIN/lauchGHINPostScores.php */

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";

header("Content-Type: application/json; charset=utf-8");

try {
    // Rule: Pull GGID and Identity authoritatively from session context
    $ggid = (string)($_SESSION["SessionStoredGGID"] ?? "");
    $ghin = (string)($_SESSION["SessionGHINLogonID"] ?? "");

    if ($ggid === "" || $ghin === "") {
        echo json_encode(["ok" => false, "message" => "GHIN session required. Please log in again."]);
        exit;
    }

    // Call the library function internally, manually passing the session GHIN as the scope.
    // This bypasses the need for URL parameters and satisfies the "No URL Tagging" rule.
    $out = initScoredScoreCard($ggid, "player", $ghin);

    echo json_encode($out, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Review Error: " . $e->getMessage()]);
}