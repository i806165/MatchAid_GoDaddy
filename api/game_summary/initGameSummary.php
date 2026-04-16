<?php
// /public_html/api/game_summary/initGameSummary.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbFavPlayers.php";

/**
 * buildGameSummaryInit
 * Shared builder used by both the page (gamesummary.php) and this API endpoint.
 *
 * @param array $ctx User context (must be ok)
 * @param array $gc  Game context (must include ggid + game)
 * @return array INIT payload for the Game Summary page
 */

function buildSmsEmailAddress(string $mobile, string $carrier): string {
  $mobile = preg_replace('/\D+/', '', trim($mobile)) ?? '';
  $carrier = trim($carrier);

  if ($mobile === '' || strlen($mobile) !== 10 || $carrier === '') return '';

  $gateways = [
    "AT&T" => "@txt.att.net",
    "Verizon" => "@vtext.com",
    "T-Mobile" => "@tmomail.net",
  ];

  if (!isset($gateways[$carrier])) return '';
  return $mobile . $gateways[$carrier];
}

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

  // Enrich roster with contact info
  // Priority:
  // 1) MatchAid user settings from db_Users
  // 2) Favorites/address-book fallback
  $userGHIN = (string)($ctx["ghinId"] ?? $_SESSION["SessionGHINLogonID"] ?? "");
  $contacts = [];

  if ($userGHIN !== "") {
      $ghins = array_map(fn($p) => (string)($p["dbPlayers_PlayerGHIN"] ?? ""), $roster);
      $contacts = service_dbFavPlayers::getContactsForGame($userGHIN, $ghins);
  }

  foreach ($roster as &$p) {
      $playerGHIN = (string)($p["dbPlayers_PlayerGHIN"] ?? "");

      // Favorites fallback
      $favEmail = "";
      $favMobile = "";
      if ($playerGHIN !== "" && isset($contacts[$playerGHIN])) {
          $favEmail = trim((string)($contacts[$playerGHIN]["email"] ?? ""));
          $favMobile = preg_replace('/\D+/', '', (string)($contacts[$playerGHIN]["mobile"] ?? "")) ?? "";
      }

      $userRow = null;
      try {
          if ($playerGHIN !== "") {
              $userRow = ServiceUserContext::retrieveGHINUser($playerGHIN);
          }
      } catch (Throwable $e) {
          $userRow = null;
      }

      $contactMethod = "Email";
      $contactEmail = $favEmail;
      $contactMobile = $favMobile;
      $contactCarrier = "";
      $contactSmsEmail = "";

      if (is_array($userRow)) {
          $userEmail = trim((string)($userRow["dbUser_EMail"] ?? ""));
          $userMobile = preg_replace('/\D+/', '', (string)($userRow["dbUser_MobilePhone"] ?? "")) ?? "";
          $userCarrier = trim((string)($userRow["dbUser_MobileCarrier"] ?? ""));
          $userMethod = trim((string)($userRow["dbUser_ContactMethod"] ?? ""));

          if ($userEmail !== "") $contactEmail = $userEmail;
          if ($userMobile !== "") $contactMobile = $userMobile;
          if ($userCarrier !== "") $contactCarrier = $userCarrier;

          $contactSmsEmail = buildSmsEmailAddress($contactMobile, $contactCarrier);

          if ($userMethod === "SMS" || $userMethod === "Email") {
              $contactMethod = $userMethod;
          }
      }

      // Fallback default if SMS preference is impossible to satisfy
      if ($contactMethod === "SMS" && $contactSmsEmail === "") {
          $contactMethod = "Email";
      }

      $p["contactMethod"] = $contactMethod;
      $p["contactEmail"] = $contactEmail;
      $p["contactMobile"] = $contactMobile;
      $p["contactCarrier"] = $contactCarrier;
      $p["contactSmsEmail"] = $contactSmsEmail;
  }
  unset($p);

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
