<?php
declare(strict_types=1);
// /public_html/api/score_skins/initScoreSkins.php
//
// Game-level Hole Champions. Single ggid (session-derived, never
// trusted from the client), no round selector — reuses
// fetchHoleChampionsRound()/resolveHoleChampionsMeta() from
// initEventSkins.php rather than duplicating that logic (same
// "one function, shared" principle used throughout this project).
//
// Not currently wired to a client-side fetch — module_renderScoreCards.js
// style pages hydrate once server-side via the controller and never
// re-fetch (no round to switch, flight filtering is entirely client-side
// inside module_renderHoleChampions.js). This POST entrypoint exists so
// scoreskins.php has one shared function to call for its own first-paint
// hydration, AND so a future config/criteria layer (flagged in chat,
// deliberately deferred) has a real endpoint to extend rather than
// retrofitting one in later.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/event_skins/initEventSkins.php"; // fetchHoleChampionsRound(), resolveHoleChampionsMeta()

/**
 * buildGameHoleChampionsPayload($ggid)
 *
 * Shared by the controller (scoreskins.php, first paint) and this
 * file's own POST entrypoint below — same "one function, two entry
 * points" pattern as every other page in this project.
 *
 * No separate event fetch needed even when the game belongs to one —
 * fetchHoleChampionsRound() already runs ServiceContextGame::hydrateForUi(),
 * which merges dbEvents_* columns directly onto $game when dbGames_EID
 * is set. Passing $game for both the game and event params below is
 * correct, not a shortcut: isDimensionActive()'s event-authoritative
 * check reads dbEvents_FlightMode either way, and hydrateForUi() already
 * put it there.
 */
function buildGameHoleChampionsPayload(string $ggid): array {
  $round = fetchHoleChampionsRound($ggid);
  if (!$round) {
    return ["ok" => false, "error" => "game_not_found"];
  }

  $game = $round["game"];
  $meta = resolveHoleChampionsMeta($game, $game);

  return [
    "ok"           => true,
    "game"         => $game,
    "players"      => $round["players"],
    "cardRanges"   => $meta["cardRanges"],
    "flightActive" => $meta["flightActive"],
    "flightConfig" => $meta["flightConfig"],
  ];
}

if (php_sapi_name() !== "cli" && basename($_SERVER["SCRIPT_NAME"] ?? "") === "initScoreSkins.php") {

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
    // ggid from session, not from the client — same principle as every
    // other endpoint in this project.
    $ggid = ServiceContextGame::getStoredGGID();
    if (!$ggid) {
      echo json_encode(["ok" => false, "error" => "no_game_selected"]);
      exit;
    }

    $out = buildGameHoleChampionsPayload((string)$ggid);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);

  } catch (Throwable $e) {
    Logger::error("INIT_SCORE_SKINS_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}
