<?php
// /public_html/api/import_games/executeImportWorkflow.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbFavAdmins.php";
require_once MA_SERVICES . "/workflows/workflow_ImportGames.php";

header("Content-Type: application/json; charset=utf-8");

try {
    // 1) Auth
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "error" => "AUTH_REQUIRED"]);
        exit;
    }

    // 2) Decode payload
    $raw     = json_decode(file_get_contents("php://input") ?: "{}", true);
    $payload = $raw["payload"] ?? [];
    if (!is_array($payload)) $payload = [];

    $title    = trim((string)($payload["title"]    ?? ""));
    $admin    = $payload["admin"]    ?? [];
    $rows     = $payload["rows"]     ?? [];
    $defaults = $payload["defaults"] ?? [];
    $courseConfirmed = isset($payload["courseConfirmed"]) ? (int)$payload["courseConfirmed"] : 1;

    if ($title === "")                      throw new RuntimeException("Missing title.");
    if (!is_array($admin))                  $admin = [];
    if (!is_array($rows) || !count($rows))  throw new RuntimeException("No rows to import.");

    $adminGhin = trim((string)($admin["ghin"] ?? ""));
    $adminName = trim((string)($admin["name"] ?? $adminGhin));
    if ($adminGhin === "") throw new RuntimeException("Missing admin.");

    // 3) Resolve admin assoc metadata from favorites
    $favs  = ServiceDbFavAdmins::getFavoriteAdmins([
        "userGHIN" => strval($_SESSION["SessionGHINLogonID"] ?? "")
    ]);
    $match = null;
    foreach ($favs as $fa) {
        if (strval($fa["key"] ?? "") === $adminGhin) { $match = $fa; break; }
    }
    if (!$match) {
        throw new RuntimeException("Selected admin is not a Favorite (missing assoc metadata).");
    }

    $sessionCtx = [
        "adminGhin"      => $adminGhin,
        "adminName"      => $adminName,
        "adminAssocId"   => strval($match["assocId"]   ?? ""),
        "adminAssocName" => strval($match["assocName"] ?? ""),
        "adminClubId"    => $_SESSION["SessionClubID"]   ?? null,
        "adminClubName"  => $_SESSION["SessionClubName"] ?? null,
    ];

    Logger::info("IMPORT_EXEC_START", [
        "title"     => $title,
        "adminGhin" => $adminGhin,
        "rowCount"  => count($rows),
    ]);

    // 4) Delegate to workflow
    $result = be_importGames($title, $admin, $defaults, $rows, $sessionCtx, $courseConfirmed);

    echo json_encode($result, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    Logger::error("IMPORT_EXEC_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => $e->getMessage()]);
    exit;
}