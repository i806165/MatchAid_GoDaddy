<?php
// /public_html/api/session/pageRouter.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

session_start();

/**
 * Reads input from either:
 * - GET:  ?action=...&ggid=...&mode=...
 * - JSON: {"action":"...","ggid":"...","mode":"..."}
 */
function pr_input(): array {
    $data = [];

    // JSON POST takes precedence
    if ($_SERVER["REQUEST_METHOD"] === "POST") {
        $raw = file_get_contents("php://input");
        $json = json_decode($raw ?: "{}", true);
        if (is_array($json)) {
            $data = (isset($json['payload']) && is_array($json['payload'])) ? $json['payload'] : $json;
        }
    }

    // Merge GET
    foreach (["action","ggid","mode","returnTo","redirect","favPlayerGHIN"] as $k) {
        if (isset($_GET[$k]) && $_GET[$k] !== "") $data[$k] = $_GET[$k];
    }

    return $data;
}

$in = pr_input();

$action   = trim((string)($in["action"] ?? ""));
$ggid     = trim((string)($in["ggid"] ?? ""));
$mode     = trim((string)($in["mode"] ?? ""));
$returnTo = trim((string)($in["returnTo"] ?? ""));
$doRedirect = (string)($in["redirect"] ?? "") === "1";
$favPlayerGHIN = trim((string)($in["favPlayerGHIN"] ?? ""));

// ----------------------------
// EDIT THESE ROUTES TO MATCH YOUR /app FILES
// ----------------------------
$ROUTES = [
    // General
    "home"  => "/",
    "login" => "/app/login.php",
    "admin"    => "/app/admin_games/gameslist.php",
    "favorites"   => "/app/favorite_players/favoriteplayers.php",
    "edit"     => "/app/game_maintenance/gamemaint.php",   // expects mode=add|edit (if your router appends it)
    "roster"   => "/app/game_players/gameplayers.php",
    "pairings" => "/app/game_pairings/gamepairings.php",
    "teetimes" => "/app/game_times/gametimes.php",
    "summary"  => "/app/game_review/gameReview.php",
    "import" => "/app/game_import/import_games.php",
    "gameReview"  => "/app/game_summary/gamesummary.php",  //Legacy remove.
    "summary"  => "/app/game_summary/gamesummary.php",
    "scorecard"   => "/app/game_scorecard/scorecard.php",
    "settings"    => "/app/game_settings/gamesettings.php",
];


// Unknown action guard
if ($action === "" || !isset($ROUTES[$action])) {
    error_log("[MA][pageRouter] UNKNOWN action=" . ($action ?? "") .
          " method=" . ($_SERVER["REQUEST_METHOD"] ?? "") .
          " uri=" . ($_SERVER["REQUEST_URI"] ?? "") .
          " userGHIN=" . ($_SESSION["SessionGHINLogonID"] ?? ""));

    ma_respond(400, [
        "ok" => false,
        "error" => "Unknown or missing action",
        "action" => $action
    ]);
}

// Favorites launch context
if ($action === "favorites") {
    $_SESSION["SessionFavLaunchMode"] = ($mode !== "") ? $mode : "favorites";
    $_SESSION["SessionFavReturnAction"] = ($returnTo !== "") ? $returnTo : "favorites";
    $_SESSION["SessionFavPlayerGHIN"] = $favPlayerGHIN;
}

// ----------------------------
// 3) Build redirect URL (carry params like mode/ggid)
// ----------------------------
$url = $ROUTES[$action];

// append query params
$q = [];
if ($ggid !== "") $q["ggid"] = $ggid;
if ($mode !== "") $q["mode"] = $mode;
if ($returnTo !== "") $q["returnTo"] = $returnTo;

if (!empty($q)) {
    $sep = (strpos($url, "?") === false) ? "?" : "&";
    $url .= $sep . http_build_query($q);
}

if ($doRedirect) {
    header("Location: " . $url);
    exit;
}

ma_respond(200, [
    "ok" => true,
    "redirectUrl" => $url,
    "action" => $action,
    "ggid" => $ggid,
    "mode" => $mode
]);