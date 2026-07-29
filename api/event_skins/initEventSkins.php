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
    $game = ServiceDbGames::getGameByGGID((int)$ggid);
    if (!$game) continue;
    $game = ServiceContextGame::hydrateForUi($game); // event columns merged — additive only

    if ($firstGame === null) $firstGame = $game;

    $players = fetchSkinsPlayers($ggid);

    $rotation    = strtoupper(trim((string)($game["dbGames_RotationMethod"] ?? "")));
    $strokeDist  = trim((string)($game["dbGames_StrokeDistribution"] ?? "Standard"));
    $useBalanced = ($rotation !== "" && $rotation !== "NONE" && $strokeDist !== "Standard");

    $built = ServiceScoreCard::buildGameScorecardsPayload($game, $players, $useBalanced);
    foreach (($built["rows"] ?? []) as $row) {
      foreach (($row["players"] ?? []) as $p) {
        $allPlayers[] = $p;
      }
    }
  }

  if (!$firstGame) {
    return ["ok" => false, "error" => "no_rounds_found"];
  }

  // Card ranges: a single round respects its own F9/B9/All-18 window;
  // "ALL" always shows both — different rounds in an event can have
  // different hole windows, so there's no one window to key off when
  // pooling.
  if ($selection === "ALL") {
    $cardRanges = [
      ["start" => 1, "end" => 9,  "title" => "Front 9 Champions"],
      ["start" => 10, "end" => 18, "title" => "Back 9 Champions"],
    ];
  } else {
    $holesStr = trim((string)($firstGame["dbGames_Holes"] ?? "All 18"));
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
  }

  // Flight determination — checked against the EVENT's own fields plus
  // $firstGame's, mirroring ServiceDbEvents::isDimensionActive()'s
  // event-then-round hierarchy. When pooling ("ALL"), the event's own
  // FlightMode/FlightConfig is the one consistent source across
  // potentially-differing per-round configs — a known simplification,
  // deferred per the same reasoning as the same-course clamp (see chat).
  $flightActive = ServiceDbEvents::isDimensionActive("flight", $firstGame, $event);
  $flightConfig = null;
  if ($flightActive) {
    $raw = (string)($event["dbEvents_FlightConfig"] ?? $firstGame["dbGames_FlightConfig"] ?? "");
    if ($raw !== "" && strtoupper($raw) !== "NULL") {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) $flightConfig = $decoded;
    }
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
