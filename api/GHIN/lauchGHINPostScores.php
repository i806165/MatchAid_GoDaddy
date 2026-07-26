<?php
declare(strict_types=1);
/* /api/GHIN/lauchGHINPostScores.php */

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

header("Content-Type: application/json; charset=utf-8");

try {
    // Rule: Pull GGID and Identity authoritatively from session context
    $ggid = (string)($_SESSION["SessionStoredGGID"] ?? "");
    $ghin = (string)($_SESSION["SessionGHINLogonID"] ?? "");

    if ($ggid === "" || $ghin === "") {
        echo json_encode(["ok" => false, "message" => "GHIN session required. Please log in again."]);
        exit;
    }

    $game = ServiceDbGames::getGameByGGID((int)$ggid);
    if (!$game) {
        echo json_encode(["ok" => false, "message" => "Game not found."]);
        exit;
    }

    // GHIN posting is single-player — go straight to that player's own row
    // rather than through ServiceScoreCard's rotation/team/format pipeline,
    // which this screen doesn't need.
    $playerRow = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);
    if (!$playerRow) {
        echo json_encode(["ok" => false, "message" => "Player record not found for this game."]);
        exit;
    }

    // Deliberately no decoding, selection, or computation here.
    // dbPlayers_Scores is handed back exactly as it sits in the table —
    // still a JSON string — same for every other field on the row.
    // ghin_post_scores.js owns all interpretation of this data; this
    // endpoint's only job is identity/session gating and the raw fetch.
    $out = [
        "ok" => true,
        // Authoritative — already validated against
        // $_SESSION["SessionGHINLogonID"] above. ghin_post_scores.js reads
        // it from here rather than guessing at whichever init-payload
        // shape the calling page happens to have.
        "sessionGhin" => $ghin,
        "game" => $game,
        "player" => $playerRow,
    ];

    echo json_encode($out, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Review Error: " . $e->getMessage()]);
}
