<?php
// /public_html/api/import_games/executeImportWorkflow.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbFavAdmins.php";

header("Content-Type: application/json; charset=utf-8");

try {
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc["ok"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }

  $raw = json_decode(file_get_contents("php://input") ?: "{}", true);
  $payload = $raw["payload"] ?? [];
  if (!is_array($payload)) $payload = [];

  $title = trim((string)($payload["title"] ?? ""));
  $admin = $payload["admin"] ?? [];
  $rows  = $payload["rows"] ?? [];
  $defaults = $payload["defaults"] ?? [];

  if ($title === "") throw new RuntimeException("Missing title.");
  if (!is_array($admin)) $admin = [];
  if (!is_array($rows) || !count($rows)) throw new RuntimeException("No rows to import.");

  $adminGhin = trim((string)($admin["ghin"] ?? ""));
  $adminName = trim((string)($admin["name"] ?? $adminGhin));
  if ($adminGhin === "") throw new RuntimeException("Missing admin.");
  Logger::info("IMPORT_EXEC_START", [
    "title" => $title,
    "adminGhin" => $adminGhin,
    "rowCount" => is_array($rows) ? count($rows) : 0
  ]);

  $teeInterval = (int)($defaults["teeTimeInterval"] ?? 9);
  if ($teeInterval < 1 || $teeInterval > 60) $teeInterval = 9;

  $holes = trim((string)($defaults["holes"] ?? "All 18")) ?: "All 18";
  $privacy = trim((string)($defaults["privacy"] ?? "Club")) ?: "Club";

  $config = ma_config();
  $pdo = Db::pdo($config["db"]);
  $pdo->beginTransaction();

  $favs = ServiceDbFavAdmins::getFavoriteAdmins([
      "userGHIN" => strval($_SESSION["SessionGHINLogonID"] ?? "")
  ]);

  

  $match = null;
  foreach ($favs as $fa) {
    if (strval($fa["key"] ?? "") === $adminGhin) { $match = $fa; break; }
  }
  if (!$match) {
    throw new RuntimeException("Selected admin is not a Favorite (missing assoc metadata).");
  }
  $adminAssocId = strval($match["assocId"] ?? "");
  $adminAssocName = strval($match["assocName"] ?? "");

  $sessionCtx = [
    "adminGhin" => $adminGhin,
    "adminName" => $adminName,
    "adminAssocId" => $adminAssocId,
    "adminAssocName" => $adminAssocName,
    "adminClubId" => $_SESSION["SessionClubID"] ?? null,
    "adminClubName" => $_SESSION["SessionClubName"] ?? null,
  ];

  $results = [];
  $inserted = 0;

  foreach ($rows as $r) {
    $idx = (int)($r["idx"] ?? 0);
    try {
      if (!is_array($r)) throw new RuntimeException("Row not an object.");

      $playDateISO = trim((string)($r["playDateISO"] ?? ""));
      $playTimeHHMM = trim((string)($r["playTimeHHMM"] ?? ""));
      $teeCnt = (int)($r["teeTimeCnt"] ?? 0);
      $course = $r["course"] ?? [];

      if ($playDateISO === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $playDateISO)) {
        throw new RuntimeException("Invalid playDateISO.");
      }
      if ($playTimeHHMM === "" || !preg_match('/^\d{2}:\d{2}$/', $playTimeHHMM)) {
        throw new RuntimeException("Invalid playTimeHHMM.");
      }
      if ($teeCnt < 1 || $teeCnt > 60) throw new RuntimeException("Invalid teeTimeCnt.");

      if (!is_array($course)) $course = [];
      $facilityId = trim((string)($course["facilityId"] ?? ""));
      $facilityName = trim((string)($course["facilityName"] ?? ""));
      $courseId = trim((string)($course["courseId"] ?? ""));
      $courseName = trim((string)($course["courseName"] ?? ""));

      if ($courseId === "" || $courseName === "") throw new RuntimeException("Missing course resolution.");

      // Patch that mirrors Add Game fields
      $patch = [
        "dbGames_Title" => $title,
        "dbGames_PlayDate" => $playDateISO,
        "dbGames_PlayTime" => $playTimeHHMM,            // saveGame will normalize to HH:MM:SS
        "dbGames_TeeTimeCnt" => (string)$teeCnt,
        "dbGames_TeeTimeInterval" => (string)$teeInterval,
        "dbGames_Holes" => $holes,
        "dbGames_Privacy" => $privacy,

        "dbGames_FacilityID" => $facilityId,
        "dbGames_FacilityName" => $facilityName,
        "dbGames_CourseID" => $courseId,
        "dbGames_CourseName" => $courseName,

        // Handicap effectivity contract (saveGame enforces)
        "dbGames_HCEffectivity" => "PlayDate",
        "dbGames_HCEffectivityDate" => $playDateISO,
      ];

      Logger::info("IMPORT_ROW_SAVE_BEGIN", [
        "idx" => $idx,
        "playDateISO" => $playDateISO,
        "playTimeHHMM" => $playTimeHHMM,
        "teeTimeCnt" => $teeCnt,
        "courseId" => $courseId,
        "facilityId" => $facilityId
      ]);

      try {
        $saved = ServiceDbGames::saveGame("add", $patch, $sessionCtx);
      } catch (Throwable $saveEx) {
        Logger::error("IMPORT_ROW_SAVE_FAIL", [
          "idx" => $idx,
          "err" => $saveEx->getMessage(),
          // Keep this lean; do NOT log massive payloads or secrets.
          "patchKeys" => array_keys($patch),
          "patch" => [
            "dbGames_Title" => $patch["dbGames_Title"] ?? null,
            "dbGames_PlayDate" => $patch["dbGames_PlayDate"] ?? null,
            "dbGames_PlayTime" => $patch["dbGames_PlayTime"] ?? null,
            "dbGames_CourseID" => $patch["dbGames_CourseID"] ?? null,
            "dbGames_CourseName" => $patch["dbGames_CourseName"] ?? null
          ]
        ]);
        throw $saveEx;
      }

      Logger::info("IMPORT_ROW_SAVE_OK", [
        "idx" => $idx,
        "ggid" => (int)($saved["ggid"] ?? 0)
      ]);

      $newGgid = (int)($saved["ggid"] ?? 0);

      $results[] = ["idx" => $idx, "ok" => true, "ggid" => $newGgid];
      $inserted++;

    } catch (Throwable $rowEx) {
      $results[] = ["idx" => $idx, "ok" => false, "error" => $rowEx->getMessage()];
      // With Evaluate blocking import, we prefer all-or-nothing:
      // any row error should rollback and return as system-style error.
      throw $rowEx;
    }
  }

  $pdo->commit();

  echo json_encode([
    "ok" => true,
    "requestedCount" => count($rows),
    "insertedCount" => $inserted,
    "results" => $results
  ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  Logger::error("IMPORT_EXEC_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => $e->getMessage()]);
  exit;
}
