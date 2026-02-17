<?php
// /public_html/api/GHIN/searchPlayers.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
//require_once __DIR__ . "/../../../bootstrap.php";
//require_once MA_SVC_GHIN . "/GHIN/GHIN_API_Players.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

header("Content-Type: application/json; charset=utf-8");

// Must be POST (MA.postJson)
if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed. Use POST."]);
  exit;
}

// Read JSON body
$raw = file_get_contents("php://input");
$in = json_decode($raw ?: "{}", true);
if (!is_array($in)) $in = [];

// Session-driven auth (your standard)
$userToken  = (string)($_SESSION["SessionUserToken"]  ?? "");
$adminToken = (string)($_SESSION["SessionAdminToken"] ?? "");
$token = $adminToken !== "" ? $adminToken : $userToken;

if ($token === "") {
  http_response_code(401);
  echo json_encode(["ok" => false, "message" => "Not authenticated (missing GHIN token)."]);
  exit;
}

// Club ID is used by be_getPlayersByName() for de-dupe preference
$clubId = $_SESSION["SessionClubID"] ?? "";

// Inputs
$mode = strtolower(trim((string)($in["mode"] ?? "")));

Logger::info("GHIN_SEARCH_REQ", ["mode" => $mode, "ghin" => $in["ghin"] ?? "", "last" => $in["lastName"] ?? "", "state" => $in["state"] ?? ""]);

try {
  $rows = [];
  $truncated = false;

  if ($mode === "id") {
    $ghin = trim((string)($in["ghin"] ?? ""));
    if ($ghin === "") {
      http_response_code(400);
      echo json_encode(["ok" => false, "message" => "Missing ghin for mode=id."]);
      exit;
    }

    $out = be_getPlayersByID($ghin, $token);
    $golfers = $out["golfers"] ?? [];
    if (!is_array($golfers)) $golfers = [];

    foreach ($golfers as $g) {
      if (!is_array($g)) continue;

      $gh = trim((string)($g["ghin"] ?? ($g["golfer_id"] ?? "")));
      $first = trim((string)($g["first_name"] ?? ""));
      $last  = trim((string)($g["last_name"] ?? ""));
      $name  = trim(($first . " " . $last));

      $hi = (string)($g["handicap_index"] ?? ($g["hi"] ?? ""));
      $gender = (string)($g["gender"] ?? ($g["gender_code"] ?? ""));
      $city = (string)($g["city"] ?? "");
      $st   = (string)($g["state"] ?? "");
      $club = (string)($g["club_name"] ?? "");

      $rows[] = [
        "ghin" => $gh,
        "name" => $name !== "" ? $name : $gh,
        "hi" => trim($hi),
        "gender" => trim($gender),
        "city" => trim($city),
        "state" => trim($st),
        "club_name" => trim($club),
      ];
    }

  } elseif ($mode === "name") {
    $state = strtoupper(trim((string)($in["state"] ?? "")));
    $last  = trim((string)($in["lastName"] ?? ""));
    $first = trim((string)($in["firstName"] ?? ""));

    if ($state === "" || $last === "") {
      http_response_code(400);
      echo json_encode(["ok" => false, "message" => "Missing state or lastName for mode=name."]);
      exit;
    }

    // Keep aligned with overlay truncation policy
    $recCnt = 90;
    $pageNum = 1;

    $out = be_getPlayersByName($recCnt, $pageNum, $state, $last, ($first !== "" ? $first : null), $clubId, $token);

    $golfers = $out["golfers"] ?? [];
    if (!is_array($golfers)) $golfers = [];

    foreach ($golfers as $g) {
      if (!is_array($g)) continue;

      $gh = trim((string)($g["ghin"] ?? ($g["golfer_id"] ?? "")));
      $firstN = trim((string)($g["first_name"] ?? ""));
      $lastN  = trim((string)($g["last_name"] ?? ""));
      $name   = trim(($firstN . " " . $lastN));

      $hi = (string)($g["handicap_index"] ?? ($g["hi"] ?? ""));
      $gender = (string)($g["gender"] ?? ($g["gender_code"] ?? ""));
      $city = (string)($g["city"] ?? "");
      $st   = (string)($g["state"] ?? $state);
      $club = (string)($g["club_name"] ?? "");

      $rows[] = [
        "ghin" => $gh,
        "name" => $name !== "" ? $name : $gh,
        "hi" => trim($hi),
        "gender" => trim($gender),
        "city" => trim($city),
        "state" => trim($st),
        "club_name" => trim($club),
      ];
    }

    // Truncation flag for UI banner
    $truncated = (count($rows) >= 90);

  } else {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Invalid mode. Use 'id' or 'name'."]);
    exit;
  }

  Logger::info("GHIN_SEARCH_RES", [
    "count" => count($rows), 
    "truncated" => $truncated,
    "sample" => $rows[0] ?? null
  ]);

  echo json_encode([
    "ok" => true,
    "payload" => [
      "rows" => $rows,
      "truncated" => $truncated,
    ],
  ]);

} catch (Throwable $e) {
  Logger::error("GHIN_SEARCH_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "GHIN search error."]);
}
