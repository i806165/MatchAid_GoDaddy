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
        if (is_array($json)) $data = $json;
    }

    // Merge GET
    foreach (["action","ggid","mode","returnTo","redirect"] as $k) {
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

// ----------------------------
// EDIT THESE ROUTES TO MATCH YOUR /app FILES
// ----------------------------
$ROUTES = [
    // General
    "home"        => "/",
    "login"       => "/app/login/login.php",            // <-- set to your actual login page
    "adminGames"  => "/app/admin_games/gameslist.php",  // <-- Games List page (shell that loads your HTML)
    "importGames" => "/app/admin/importGames.php",
    "gameReview"  => "/app/game/gameReview.php",
    "scorecard"   => "/app/game/scorecard.php",

    // Admin maintenance
    "gameMaintenance" => "/app/admin/gameMaintenance.php", // expects mode=add|edit

    // Stages
    "roster"    => "/app/game/roster.php",
    "pairings"  => "/app/game/pairings.php",
    "teetimes"  => "/app/game/teetimes.php",

    // Optional
    "settings"  => "/app/game/settings.php",
];

// Unknown action guard
if ($action === "" || !isset($ROUTES[$action])) {
    ma_respond(400, [
        "ok" => false,
        "error" => "Unknown or missing action",
        "action" => $action
    ]);
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