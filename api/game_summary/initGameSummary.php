<?php
// /public_html/api/game_summary/initGameSummary.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbEvents.php";
require_once MA_SERVICES . "/roster/service_GameRosterViews.php";

/**
 * buildGameSummaryInit
 * Shared builder used by both the page (gamesummary.php) and this API endpoint.
 *
 * @param array $ctx User context (must be ok)
 * @param array $gc  Game context (must include ggid + game)
 * @return array INIT payload for the Game Summary page
 */
function buildGameSummaryInit(array $ctx, array $gc): array {
  $ggid = strval($gc["ggid"] ?? "");
  $game = $gc["game"] ?? null;

  if (!$ggid || !$game) {
    return [
      "ok"      => false,
      "message" => "Missing game context (GGID).",
    ];
  }

  // Roster: select full rows to preserve schema flexibility (JS uses known keys)
  //
  // NOTE: this used to enrich every roster row with contact info
  // (contactMethod / contactEmail / contactSmsEmail, via one
  // ServiceUserContext::retrieveGHINUser() query per player plus a
  // favorites lookup). Nothing consumed those fields — messaging resolves
  // contacts itself in initPlayerNotifications.php with a single JOIN — so
  // the enrichment was removed rather than paying an N+1 query cost on
  // every Summary load.
  $roster = ServiceDbPlayers::getGamePlayers($ggid);

  // $game comes from ServiceContextGame::getGameContext(), which already
  // merges the event's fields onto the game record (hydrateForUi()) when
  // this game belongs to one — so, unlike initPlayerNotifications.php
  // (which calls ServiceDbGames::getGameByGGID() directly and never gets
  // that merge), passing $game for both params here is correct, not a
  // shortcut taken on faith — same pattern game_summary.js's own
  // teamsActive()/flightsActive() already rely on for the same reason.
  $teamsActive   = ServiceDbEvents::isDimensionActive("team",   $game, $game);
  $flightsActive = ServiceDbEvents::isDimensionActive("flight", $game, $game);

  $views = [
    "byPlayer"      => ServiceGameRosterViews::buildByPlayerView($roster),
    "byPairing"     => ServiceGameRosterViews::buildByPairingView($roster, $game, $teamsActive, $flightsActive),
    "byPlayingGroup" => ServiceGameRosterViews::buildByPlayingGroupView($roster, $game, $teamsActive, $flightsActive),
  ];

  return [
    "ok"     => true,
    "ggid"   => $ggid,
    "game"   => $game,
    "roster" => $roster, // kept for now — game_summary.js's render paths
                          // haven't been rewritten to consume `views` yet;
                          // removing this would break the page. Retire once
                          // that rewrite lands.
    "views"  => $views,
    "header" => [
      "subtitle" => "GGID " . $ggid,
    ],
  ];
}

/**
 * If called as a web endpoint, output JSON.
 * If included by a page controller, only buildGameSummaryInit() is used.
 */
$isDirect = (basename($_SERVER["SCRIPT_NAME"] ?? "") === basename(__FILE__));
if ($isDirect) {
  header("Content-Type: application/json; charset=utf-8");

  try {
    $ctx = ma_api_require_auth();
    if (!$ctx || empty($ctx["ok"])) {
      echo json_encode(["ok" => false, "message" => "Not authorized."], JSON_UNESCAPED_SLASHES);
      exit;
    }

    $gc = ServiceContextGame::getGameContext();
    if (!$gc || empty($gc["ok"])) {
      echo json_encode(["ok" => false, "message" => "Missing game context."], JSON_UNESCAPED_SLASHES);
      exit;
    }

    $out = buildGameSummaryInit($ctx, $gc);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);
    exit;

  } catch (Throwable $e) {
    Logger::error("GAME_SUMMARY_INIT_FAIL", ["err" => $e->getMessage()]);
    echo json_encode(["ok" => false, "message" => "Server error."], JSON_UNESCAPED_SLASHES);
    exit;
  }
}