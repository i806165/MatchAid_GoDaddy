<?php
declare(strict_types=1);
// /public_html/api/event_skins/initEventSkins.php
//
// Hole Champions data acquisition — Game/Flight/Round is filtered
// client-side in module_renderHoleChampions.js; this endpoint's only job
// is: given a round selection ("ALL" or a specific ggid), return the
// flat player set and the card-range/flight metadata the module needs.
//
// Deliberately does NOT use hydrateSharedScoreCardContext() from
// initSharedScoreCard.php — that function unconditionally merges blind
// player records in (ServiceBlindPlayer::mergeBlindScoresIntoPlayers()),
// and blind players are explicitly not part of Hole Champions. Rather
// than fork that function or bolt on a skip-flag (touching a file that's
// been deliberately left alone throughout this project), this hand-rolls
// its own player fetch — same approach the original scoreskins.php used,
// but with the SAME broader JSON-field fallback the canonical hydrator
// uses (checks dbPlayers_Scores/ScoreJson/ScoreJSON/ScoreCard, not just
// the first) — closing that specific gap without touching the file it
// was found in.
//
// "ALL" pools every round in the event into one flat player array before
// handing off to the SAME per-round builder (ServiceScoreCard::
// buildGameScorecardsPayload()) every other page already uses — same
// aggregate-per-game-then-combine model the Event Leaderboard already
// follows for its own cross-round rollup.
//
// Same-course-across-rounds is assumed for pooled "ALL" results (Hole 5
// in Round 1 is treated as the same hole as Hole 5 in Round 2) — a known,
// deliberately deferred constraint (see chat), not enforced here.
//
// fetchHoleChampionsRound() and resolveHoleChampionsMeta() below are
// shared with /api/score_skins/initScoreSkins.php (the standalone
// game-level page) — one round's worth of work, reused by both the
// pooling loop here and that page's single call.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbEvents.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

/**
 * Fetch + decode one round's players — deliberately no blind-player
 * merge (see file header). Mirrors hydrateSharedScoreCardContext()'s
 * JSON-fallback breadth, not its full behavior.
 */
function fetchSkinsPlayers(string $ggid): array {
  $pdo = Db::pdo();
  $st = $pdo->prepare("
    SELECT * FROM db_Players
    WHERE dbPlayers_GGID = :ggid
    ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos, dbPlayers_MatchID, dbPlayers_MatchPos
  ");
  $st->execute([":ggid" => $ggid]);
  $players = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($players as &$p) {
    if (isset($p["dbPlayers_TeeSetDetails"]) && is_string($p["dbPlayers_TeeSetDetails"])) {
      $decoded = json_decode($p["dbPlayers_TeeSetDetails"], true);
      if (is_array($decoded)) $p["dbPlayers_TeeSetDetails"] = $decoded;
    }

    foreach (["dbPlayers_Scores", "dbPlayers_ScoreJson", "dbPlayers_ScoreJSON", "dbPlayers_ScoreCard"] as $k) {
      if (isset($p[$k]) && is_string($p[$k]) && trim($p[$k]) !== "") {
        $decoded = json_decode($p[$k], true);
        if (is_array($decoded)) { $p["dbPlayers_Scores"] = $decoded; break; }
      }
    }
  }
  unset($p);

  return $players;
}

/**
 * fetchHoleChampionsRound($ggid)
 *
 * One round's worth of PH-forced, phStrokeMarks-renamed player data.
 * Shared by the event-level pooling loop below AND
 * initScoreSkins.php's single game-level call — the one place this
 * logic exists.
 *
 * Returns null if the ggid doesn't resolve to a real game.
 * Returns ["game" => array, "players" => array] otherwise — $game
 * already carries event columns merged via hydrateForUi() when
 * dbGames_EID is set (additive only), and $players is the flat,
 * ungrouped list (pairing/group structure already flattened out) with
 * each hole cell's "strokeMarks" renamed to "phStrokeMarks".
 */
function fetchHoleChampionsRound(string $ggid): ?array {
  $game = ServiceDbGames::getGameByGGID((int)$ggid);
  if (!$game) return null;
  $game = ServiceContextGame::hydrateForUi($game); // event columns merged — additive only

  $players = fetchSkinsPlayers($ggid);

  $rotation    = strtoupper(trim((string)($game["dbGames_RotationMethod"] ?? "")));
  $strokeDist  = trim((string)($game["dbGames_StrokeDistribution"] ?? "Standard"));
  $useBalanced = ($rotation !== "" && $rotation !== "NONE" && $strokeDist !== "Standard");

  // Hole Champions always uses Playing Handicap, per club policy,
  // regardless of what this game's own dbGames_HCMethod says (which may
  // be "SO" and would otherwise flow through as the shared strokeMarks
  // field the real scorecard's Net column uses). See chat: the
  // handicapBasis param on ServiceScoreCard::buildGameScorecardsPayload()
  // (threaded down to calculateEffectiveHandicap()) makes the ENTIRE
  // payload build PH-based when requested — not a second, parallel
  // computation.
  $built = ServiceScoreCard::buildGameScorecardsPayload($game, $players, $useBalanced, "PH");

  $roundPlayers = [];
  foreach (($built["rows"] ?? []) as $row) {
    foreach (($row["players"] ?? []) as $p) {
      // Rename on output only, here — not in service_ScoreCard.php's own
      // decorateScoredPlayers(), which every other consumer of
      // buildGameScorecardsPayload() still expects to return
      // "strokeMarks". This is the one place the value is guaranteed
      // PH-based, so it gets a name that says so.
      if (isset($p["holes"]) && is_array($p["holes"])) {
        foreach ($p["holes"] as $holeKey => &$cell) {
          if (is_array($cell) && array_key_exists("strokeMarks", $cell)) {
            $cell["phStrokeMarks"] = $cell["strokeMarks"];
            unset($cell["strokeMarks"]);
          }
        }
        unset($cell);
      }
      $roundPlayers[] = $p;
    }
  }

  return ["game" => $game, "players" => $roundPlayers];
}

/**
 * resolveHoleChampionsMeta($game, $event)
 *
 * {cardRanges, flightActive, flightConfig} for ONE round's own game
 * record — used both for a single-round selection here and for the
 * standalone game-level page, which only ever has one round. NOT used
 * for pooled "ALL" (see buildHoleChampionsPayload() below, which has
 * its own always-both-9s card-range rule since pooled rounds can have
 * different hole windows).
 *
 * $event may be null (a flat game with no dbGames_EID) —
 * ServiceDbEvents::isDimensionActive() already handles that.
 */
function resolveHoleChampionsMeta(array $game, ?array $event): array {
  $holesStr = trim((string)($game["dbGames_Holes"] ?? "All 18"));
  if ($holesStr === "F9") {
    $cardRanges = [["start" => 1, "end" => 9, "title" => "Front 9 Champions"]];
  } elseif ($holesStr === "B9") {
    $cardRanges = [["start" => 10, "end" => 18, "title" => "Back 9 Champions"]];
  } else {
    $cardRanges = [
      ["start" => 1, "end" => 9,  "title" => "Front 9 Champions"],
      ["start" => 10, "end" => 18, "title" => "Back 9 Champions"],
    ];
  }

  $flightActive = ServiceDbEvents::isDimensionActive("flight", $game, $event);
  $flightConfig = null;
  if ($flightActive) {
    $raw = (string)(($event["dbEvents_FlightConfig"] ?? null) ?? ($game["dbGames_FlightConfig"] ?? ""));
    if ($raw !== "" && strtoupper($raw) !== "NULL") {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) $flightConfig = $decoded;
    }
  }

  return ["cardRanges" => $cardRanges, "flightActive" => $flightActive, "flightConfig" => $flightConfig];
}

/**
 * buildHoleChampionsPayload($selection, $eid, $event)
 *
 * $selection: "ALL" or a specific ggid (string). Caller is responsible
 * for validating $selection against this event's own round list before
 * calling this — this function does not re-check.
 *
 * Returns the same shape whether $selection is one round or pooled:
 * {ok, selection, game, players, cardRanges, flightActive, flightConfig}
 */
function buildHoleChampionsPayload(string $selection, int $eid, array $event): array {
  $roundsResult = ServiceDbGames::queryEventGames($eid);
  $rounds = $roundsResult["games"]["vm"] ?? [];
  $validGgids = array_map(static fn($r) => (string)($r["ggid"] ?? ""), $rounds);

  if ($selection !== "ALL" && !in_array($selection, $validGgids, true)) {
    return ["ok" => false, "error" => "ggid_not_in_event"];
  }

  $ggidsToLoad = ($selection === "ALL") ? $validGgids : [$selection];
  if (!$ggidsToLoad) {
    return ["ok" => false, "error" => "no_rounds_found"];
  }

  $allPlayers = [];
  $firstGame  = null;

  foreach ($ggidsToLoad as $ggid) {
    $round = fetchHoleChampionsRound($ggid);
    if (!$round) continue;
    if ($firstGame === null) $firstGame = $round["game"];
    foreach ($round["players"] as $p) {
      $allPlayers[] = $p;
    }
  }

  if (!$firstGame) {
    return ["ok" => false, "error" => "no_rounds_found"];
  }

  if ($selection === "ALL") {
    // Pooled: always both 9s — different rounds in an event can have
    // different hole windows, so there's no one window to key off.
    $cardRanges = [
      ["start" => 1, "end" => 9,  "title" => "Front 9 Champions"],
      ["start" => 10, "end" => 18, "title" => "Back 9 Champions"],
    ];
    $flightActive = ServiceDbEvents::isDimensionActive("flight", $firstGame, $event);
    $flightConfig = null;
    if ($flightActive) {
      $raw = (string)($event["dbEvents_FlightConfig"] ?? $firstGame["dbGames_FlightConfig"] ?? "");
      if ($raw !== "" && strtoupper($raw) !== "NULL") {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $flightConfig = $decoded;
      }
    }
  } else {
    $meta = resolveHoleChampionsMeta($firstGame, $event);
    $cardRanges   = $meta["cardRanges"];
    $flightActive = $meta["flightActive"];
    $flightConfig = $meta["flightConfig"];
  }

  return [
    "ok"           => true,
    "selection"    => $selection,
    "game"         => $firstGame,
    "players"      => $allPlayers,
    "cardRanges"   => $cardRanges,
    "flightActive" => $flightActive,
    "flightConfig" => $flightConfig,
  ];
}

if (php_sapi_name() !== "cli" && basename($_SERVER["SCRIPT_NAME"] ?? "") === "initEventSkins.php") {

  header("Content-Type: application/json; charset=utf-8");

  if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    echo json_encode(["ok" => false, "message" => "Method not allowed."]);
    exit;
  }

  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc["ok"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "message" => "Session expired."]);
    exit;
  }

  try {
    $in        = ma_json_in();
    $selection = trim((string)($in["selection"] ?? ""));
    if ($selection === "") {
      echo json_encode(["ok" => false, "error" => "missing_selection"]);
      exit;
    }

    $ec    = ServiceContextEvent::getEventContext();
    $eid   = (int)($ec["eid"] ?? 0);
    $event = $ec["event"] ?? [];
    if ($eid <= 0) {
      echo json_encode(["ok" => false, "error" => "no_event_selected"]);
      exit;
    }

    $out = buildHoleChampionsPayload($selection, $eid, $event);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);

  } catch (Throwable $e) {
    Logger::error("INIT_EVENT_SKINS_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}
