<?php
declare(strict_types=1);
// /public_html/api/score_home/getPlayersForRefresh.php
//
// Thin, read-only fetch — no declare/handicap logic lives here. Returns raw
// player rows (including dbPlayers_Scores) for whichever scope the caller
// asks for, PLUS a per-hole effective-pairing map for rotation-aware PairPair
// games (COD/1324/1423) — resolved via ServiceScoreRotation::buildNormalizedContexts(),
// the exact same public entry point service_ScoreCardRotation.php already
// uses for the live scorecard view. This is deliberate: the correct per-hole
// grouping already exists in this codebase; this endpoint calls it rather
// than re-deriving it, so refresh_scores.js never has to guess at pairing
// for a rotation game.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SERVICES . "/scoring/service_ScoreRotation.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

$in = ma_json_in();
$ggid = trim((string)($in['ggid'] ?? ''));
$scorecardKey = trim((string)($in['scorecardKey'] ?? ''));

if ($ggid === '' && $scorecardKey === '') {
    ma_respond(400, ['ok' => false, 'message' => 'ggid or scorecardKey required.']);
}

try {
    if ($scorecardKey !== '') {
        $players = ServiceDbPlayers::getPlayersByPlayerKey($scorecardKey);
        // Defensive scope check when both are provided — never return players
        // from a different game than the one the caller thinks it's asking about.
        if ($ggid !== '') {
            $players = array_values(array_filter(
                $players,
                fn($p) => ((string)($p['dbPlayers_GGID'] ?? '') === $ggid)
            ));
        }
    } else {
        $players = ServiceDbPlayers::getGamePlayers($ggid);
    }

    // Resolve the game GGID we actually need for rotation lookup, even when
    // the caller only supplied a scorecardKey.
    $resolvedGgid = $ggid !== '' ? (int)$ggid : (int)($players[0]['dbPlayers_GGID'] ?? 0);
    $gameRow = $resolvedGgid > 0 ? ServiceDbGames::getGameByGGID($resolvedGgid) : null;

    // holePairingMap: { ghin: { holeNumber: effectivePairingID } } — only
    // populated for rotation-aware PairPair games. Absent (or a missing
    // ghin/hole entry within it) means "use dbPlayers_PairingID as-is,"
    // which is correct for every non-rotating game.
    $holePairingMap = [];

    if ($gameRow && ServiceScoreRotation::isRotationAwarePairPair($gameRow) && $players) {
        // holeNumber arg only picks which context comes back as 'activeContext' —
        // virtualContexts always contains every spin regardless, which is all
        // this loop needs.
        $rotation = ServiceScoreRotation::buildNormalizedContexts($gameRow, $players, 1, []);
        $contexts = is_array($rotation['virtualContexts'] ?? null) ? $rotation['virtualContexts'] : [];

        foreach ($contexts as $context) {
            $startHole = (int)($context['spinStartHole'] ?? 0);
            $endHole   = (int)($context['spinEndHole'] ?? 0);
            $contextPlayers = is_array($context['players'] ?? null) ? $context['players'] : [];

            foreach ($contextPlayers as $cp) {
                $ghin = trim((string)($cp['dbPlayers_PlayerGHIN'] ?? ''));
                $effectivePairingId = trim((string)($cp['effectivePairingID'] ?? ''));
                if ($ghin === '' || $effectivePairingId === '') continue;

                if (!isset($holePairingMap[$ghin])) $holePairingMap[$ghin] = [];
                for ($h = $startHole; $h <= $endHole; $h++) {
                    $holePairingMap[$ghin][$h] = $effectivePairingId;
                }
            }
        }
    }

    ma_respond(200, [
        'ok' => true,
        'players' => $players,
        'isRotationAware' => $gameRow ? ServiceScoreRotation::isRotationAwarePairPair($gameRow) : false,
        'holePairingMap' => $holePairingMap,
    ]);

} catch (Throwable $e) {
    Logger::error('GET_PLAYERS_FOR_REFRESH_FAIL', ['ggid' => $ggid, 'scorecardKey' => $scorecardKey, 'err' => $e->getMessage()]);
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}

