<?php
// /public_html/api/admin_home/setPanelView.php
// Persists the user's Admin Portal panel-view preference (Games/Events/Both)
// to session. Called by admin_home.js whenever the user switches tabs.
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

ma_api_require_auth();

$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;

$view = strtolower(trim((string)($payload["view"] ?? "")));

if (!in_array($view, ["games", "events", "both"], true)) {
  ma_respond(400, ["ok" => false, "error" => "Invalid view. Must be 'games', 'events', or 'both'."]);
}

$_SESSION["ADMIN_PANEL_VIEW"] = $view;

ma_respond(200, ["ok" => true, "payload" => ["view" => $view]]);
