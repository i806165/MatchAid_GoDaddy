<?php
// /public_html/api/game_summary/initGameSummary.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

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
      "ok" => false,
      "message" => "Missing game context (GGID).",
    ];
  }

  // Roster: select full rows to preserve schema flexibility (JS uses known keys)
  $roster = ServiceDbPlayers::getGamePlayers($ggid);

  return [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $game,
    "roster" => $roster,
    "header" => [
      "subtitle" => "GGID " . $ggid
    ]
  ];
}

/**
 * If called as a web endpoint, output JSON.
 * If included by a page controller, only the buildGameSummaryInit() function is used.
 */
$isDirect = (basename($_SERVER["SCRIPT_NAME"] ?? "") === basename(__FILE__));
if ($isDirect) {
  header("Content-Type: application/json; charset=utf-8");

  try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
      echo json_encode(["ok" => false, "message" => "Not authorized."], JSON_UNESCAPED_SLASHES);
      exit;
    }

    $gc = ServiceContextGame::getGameContext();
    if (!$gc || empty($gc["ok"])) {
      echo json_encode(["ok" => false, "message" => "Missing game context."], JSON_UNESCAPED_SLASHES);
      exit;
    }

    $raw = file_get_contents("php://input");
    $body = json_decode($raw ?: "{}", true) ?: [];
    $action = strtoupper(strval($body["action"] ?? "INIT"));

    if ($action !== "INIT") {
      echo json_encode(["ok" => false, "message" => "Unsupported action."], JSON_UNESCAPED_SLASHES);
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
