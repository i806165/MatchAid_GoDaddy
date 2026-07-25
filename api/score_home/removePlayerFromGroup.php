<?php
declare(strict_types=1);
// /public_html/api/score_home/removePlayerFromGroup.php
//
// "Remove player from pairing" — for a no-show at score time. Clears the
// same field set as game_pairings.js's removePlayerFromPairing() (see
// that function's own comment, and its confirmed relationship to
// unslotBlock()/unslotCard() in game_slotting.js): unpairing cascades
// down and unslots too, by design.
//
// Unlike game_pairings.js/game_slotting.js, this is a direct write —
// score_home.js has no staged-edit/markDirty layer to defer this
// through. The clear happens immediately, on confirm.
//
// Does NOT delete the player from the game (dbPlayers row stays) — only
// clears their pairing/slot assignment. Does NOT call
// WorkflowReconcilePairingBoundaries::reconcileGame() — that workflow is
// tied to Team/Flight-level saves (saveGameTeams.php/saveGameFlights.php);
// game_pairings.js's own removePlayerFromPairing()/unpairGroup() don't
// call it either for this same action, so this endpoint doesn't either,
// for consistency with that precedent.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

$in   = ma_json_in();
$ghin = trim((string)($in['ghin'] ?? ''));

if ($ghin === '') {
    ma_respond(400, ['ok' => false, 'message' => 'GHIN required.']);
}

try {
    // Session GGID is authoritative — same pattern as setScorerContext.php.
    $ggid = (int)(ServiceScoreEntry::getScoringPodGGID() ?? 0);
    if ($ggid <= 0) {
        ma_respond(400, ['ok' => false, 'message' => 'No active game.']);
    }

    $game = ServiceDbGames::getGameByGGID($ggid);
    if (!$game) {
        ma_respond(404, ['ok' => false, 'message' => 'Game not found.']);
    }

    // Confirm the target player actually belongs to this game before
    // touching anything — never trust the posted GHIN alone.
    $player = ServiceDbPlayers::getPlayerByGGIDGHIN((string)$ggid, $ghin);
    if (!$player) {
        ma_respond(404, ['ok' => false, 'message' => 'Player not found in this game.']);
    }

    $competition = trim((string)($game['dbGames_Competition'] ?? 'PairField'));

    // Same 8-field set as game_pairings.js's removePlayerFromPairing() —
    // unpairing cascades down and unslots too, by design (see that
    // function's own comment).
    $fields = [
        'dbPlayers_PairingID'      => '000',
        'dbPlayers_PairingPos'     => '',
        'dbPlayers_TeeTime'        => '',
        'dbPlayers_StartHole'      => '',
        'dbPlayers_StartHoleSuffix'=> '',
        'dbPlayers_PlayerKey'      => '',
    ];
    if ($competition === 'PairPair') {
        $fields['dbPlayers_MatchID']  = '';
        $fields['dbPlayers_MatchPos'] = '';
    }

    $saved = ServiceDbPlayers::updateGamePlayerFields((string)$ggid, $ghin, $fields);
    if (!$saved) {
        ma_respond(500, ['ok' => false, 'message' => 'Unable to remove player from pairing.']);
    }

    Logger::info('REMOVE_PLAYER_FROM_GROUP', ['ggid' => $ggid, 'ghin' => $ghin]);

    ma_respond(200, ['ok' => true, 'player' => $saved]);

} catch (Throwable $e) {
    Logger::error('REMOVE_PLAYER_FROM_GROUP_FAIL', ['ghin' => $ghin, 'err' => $e->getMessage()]);
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
