<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ImportGames.php
// Workflow: Bulk game import.
// Called by /api/import_games/executeImportWorkflow.php (thin API controller).
// Mirrors workflow_CourseChange.php pattern.

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

/**
 * Execute a bulk game import from a pre-validated row payload.
 *
 * @param  string $title      Game title applied to all imported rows.
 * @param  array  $admin      { ghin, name, assocId, assocName }
 * @param  array  $defaults   { teeTimeInterval, holes, privacy, hcEffectivity }
 * @param  array  $rows       Pre-evaluated rows from the client evaluate step.
 * @param  array  $sessionCtx Session context passed through to ServiceDbGames.
 * @return array  { ok, requestedCount, insertedCount, results[] }
 */
function be_importGames(
    string $title,
    array  $admin,
    array  $defaults,
    array  $rows,
    array  $sessionCtx,
    int    $courseConfirmed = 1
): array {
    $teeInterval = (int)($defaults["teeTimeInterval"] ?? 9);
    if ($teeInterval < 1 || $teeInterval > 60) $teeInterval = 9;

    $holes   = trim((string)($defaults["holes"]   ?? "All 18")) ?: "All 18";
    $privacy = trim((string)($defaults["privacy"] ?? "Club"))   ?: "Club";

    $pdo = \Db::pdo();
    // Merge selected admin identity into sessionCtx so applyDefaultsForAdd
    // stamps the correct admin on every imported game, not the session user.
    $sessionCtx["adminGhin"]      = trim((string)($admin["ghin"]      ?? ""));
    $sessionCtx["adminName"]      = trim((string)($admin["name"]      ?? ""));
    $sessionCtx["adminAssocId"]   = trim((string)($admin["assocId"]   ?? ""));
    $sessionCtx["adminAssocName"] = trim((string)($admin["assocName"] ?? ""));
    
    $pdo->beginTransaction();
    $results  = [];
    $inserted = 0;

    try {
        foreach ($rows as $r) {
            $idx = (int)($r["idx"] ?? 0);

            $playDateISO  = trim((string)($r["playDateISO"]  ?? ""));
            $playTimeHHMM = trim((string)($r["playTimeHHMM"] ?? ""));
            $teeCnt       = (int)($r["teeTimeCnt"] ?? 0);
            $course       = is_array($r["course"] ?? null) ? $r["course"] : [];

            // Row-level guards (Evaluate should have caught these, but be safe)
            if ($playDateISO === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $playDateISO)) {
                throw new \RuntimeException("Row {$idx}: Invalid playDateISO.");
            }
            if ($playTimeHHMM === "" || !preg_match('/^\d{2}:\d{2}$/', $playTimeHHMM)) {
                throw new \RuntimeException("Row {$idx}: Invalid playTimeHHMM.");
            }
            if ($teeCnt < 1 || $teeCnt > 60) {
                throw new \RuntimeException("Row {$idx}: Invalid teeTimeCnt.");
            }

            $facilityId   = trim((string)($course["facilityId"]   ?? ""));
            $facilityName = trim((string)($course["facilityName"] ?? ""));
            $courseId     = trim((string)($course["courseId"]     ?? ""));
            $courseName   = trim((string)($course["courseName"]   ?? ""));

            if ($courseId === "" || $courseName === "") {
                throw new \RuntimeException("Row {$idx}: Missing course resolution.");
            }

            // Imported games have a known, resolved course — mark as Confirmed.
            $patch = [
                "dbGames_Title"              => $title,
                "dbGames_PlayDate"           => $playDateISO,
                "dbGames_PlayTime"           => $playTimeHHMM,
                "dbGames_TeeTimeCnt"         => (string)$teeCnt,
                "dbGames_TeeTimeInterval"    => (string)$teeInterval,
                "dbGames_Holes"              => $holes,
                "dbGames_Privacy"            => $privacy,
                "dbGames_FacilityID"         => $facilityId,
                "dbGames_FacilityName"       => $facilityName,
                "dbGames_CourseID"           => $courseId,
                "dbGames_CourseName"         => $courseName,
                "dbGames_HCEffectivity"      => "PlayDate",
                "dbGames_HCEffectivityDate"  => $playDateISO,
                "dbGames_CourseConfirmed"    => $courseConfirmed,
            ];

            Logger::info("IMPORT_ROW_SAVE_BEGIN", [
                "idx"         => $idx,
                "playDateISO" => $playDateISO,
                "courseId"    => $courseId,
            ]);

            $saved  = ServiceDbGames::saveGame("add", $patch, $sessionCtx);
            $newGgid = (int)($saved["ggid"] ?? 0);

            Logger::info("IMPORT_ROW_SAVE_OK", ["idx" => $idx, "ggid" => $newGgid]);

            $results[] = ["idx" => $idx, "ok" => true, "ggid" => $newGgid];
            $inserted++;
        }

        $pdo->commit();

    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        Logger::error("IMPORT_WORKFLOW_FAIL", ["err" => $e->getMessage()]);
        throw $e;
    }

    return [
        "ok"             => true,
        "requestedCount" => count($rows),
        "insertedCount"  => $inserted,
        "results"        => $results,
    ];
}