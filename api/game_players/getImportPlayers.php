<?php
declare(strict_types=1);
// /api/game_players/getImportPlayers.php

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

try {
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        http_response_code(405);
        echo json_encode(["ok" => false, "message" => "Method not allowed."]);
        exit;
    }

    $in = ma_json_in();
    $sourceGGID = trim((string)($in["sourceGGID"] ?? ""));
    if ($sourceGGID === "") {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Missing source game id."]);
        exit;
    }

    $gc = ServiceContextGame::getGameContext();
    $destGGID = trim((string)($gc["ggid"] ?? ""));
    $destGame = is_array($gc["game"] ?? null) ? $gc["game"] : [];

    if ($destGGID === "") {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Missing current game context."]);
        exit;
    }

    $sourceGame = ServiceDbGames::getGameByGGID((int)$sourceGGID);
    if (!$sourceGame) {
        http_response_code(404);
        echo json_encode(["ok" => false, "message" => "Source game not found."]);
        exit;
    }

// ── Destination course tee sets (for tee matching) ──────────────────────
    $destCourseId  = trim((string)($destGame["dbGames_CourseID"] ?? ""));
    $destTeeSets   = [];

    if ($destCourseId !== "") {
        try {
            $adminToken    = trim((string)($_SESSION["SessionAdminToken"] ?? ""));
            $coursePayload = be_getCourseTeeSets($destCourseId, $adminToken);
            foreach ((array)($coursePayload["TeeSets"] ?? []) as $ts) {
                if ((string)($ts["TeeSetStatus"] ?? "") !== "Active") continue;
                $destTeeSets[] = [
                    "teeSetID"   => (string)($ts["TeeSetRatingId"]   ?? ""),
                    "teeSetName" => (string)($ts["TeeSetRatingName"] ?? ""),
                    "gender"     => strtoupper(substr((string)($ts["Gender"] ?? ""), 0, 1)),
                    "yards"      => (int)($ts["TotalYardage"] ?? 0),
                ];
            }
        } catch (Throwable $ignored) {
            // Non-fatal — fall through to yardage-only matching below
        }
    }

    $sameCourse = (
        $destCourseId !== "" &&
        trim((string)($sourceGame["dbGames_CourseID"] ?? "")) === $destCourseId
    );

    // PHP handles Tier 1 only (same-course exact match).
    // Tiers 2 (last_played) and 3 (preferred_yardage) require per-player
    // DB and preference lookups — these are handled by getTeeSets.php
    // resolve mode called from runExistingGameResolve() on the JS side.
    // Rows returned with resolvedTeeSource = "" signal JS to run tiers 2 and 3.
    $resolveTier1 = static function(
        string $sourceTeeId,
        string $sourceTeeText,
        bool   $sameCourse,
        array  $destTeeSets
    ): array {
        if ($sameCourse && $sourceTeeId !== "") {
            foreach ($destTeeSets as $dt) {
                if ($dt["teeSetID"] === $sourceTeeId) {
                    $label = $dt["teeSetName"];
                    if ($dt["yards"] > 0) $label .= " • " . number_format($dt["yards"]) . " yds";
                    return [$dt["teeSetID"], $label, "same_course"];
                }
            }
        }
        // No Tier 1 match — return source values unchanged, empty source
        // so JS knows to run Tiers 2 and 3 for this player.
        return [$sourceTeeId, $sourceTeeText, ""];
    };

    $sourcePlayers = ServiceDbPlayers::getGamePlayers($sourceGGID);
    $destPlayers   = ServiceDbPlayers::getGamePlayers($destGGID);

    $destGhinSet = [];
    foreach ($destPlayers as $p) {
        $g = trim((string)($p["dbPlayers_PlayerGHIN"] ?? ""));
        if ($g !== "") $destGhinSet[$g] = true;
    }

    $rows = [];
    foreach ($sourcePlayers as $p) {
        $ghin          = trim((string)($p["dbPlayers_PlayerGHIN"] ?? ""));
        $sourceTeeName = trim((string)($p["dbPlayers_TeeSetName"]  ?? ""));
        $sourceTeeId   = (string)($p["dbPlayers_TeeSetID"] ?? "");
        $gender        = strtoupper(substr((string)($p["dbPlayers_Gender"] ?? ""), 0, 1));

        $sourceTeeDetailsRaw = (string)($p["dbPlayers_TeeSetDetails"] ?? "");
        $sourceTeeDetails    = json_decode($sourceTeeDetailsRaw, true);
        $sourceYards         = is_array($sourceTeeDetails) ? (int)($sourceTeeDetails["TotalYardage"] ?? 0) : 0;

        $sourceTeeText = $sourceYards > 0
            ? ($sourceTeeName . " • " . number_format($sourceYards) . " yds")
            : $sourceTeeName;

        [$assignedTeeId, $assignedTeeText, $resolvedTeeSource] = $resolveTier1(
            $sourceTeeId,
            $sourceTeeText,
            $sameCourse,
            $destTeeSets
        );

        $rows[] = [
            "ghin"              => $ghin,
            "playerName"        => trim((string)($p["dbPlayers_Name"] ?? "")),
            "hi"                => (string)($p["dbPlayers_HI"]     ?? ""),
            "gender"            => (string)($p["dbPlayers_Gender"] ?? ""),
            "sourceTeeId"       => $sourceTeeId,
            "sourceTeeText"     => $sourceTeeText,
            "assignedTeeId"     => $assignedTeeId,
            "assignedTeeText"   => $assignedTeeText,
            "resolvedTeeSource" => $resolvedTeeSource,
            "alreadyOnRoster"   => isset($destGhinSet[$ghin]),
        ];
    }

    echo json_encode([
        "ok" => true,
        "payload" => [
            "sourceGame" => [
                "ggid" => (string)($sourceGame["dbGames_GGID"] ?? ""),
                "playDate" => (string)($sourceGame["dbGames_PlayDate"] ?? ""),
                "title" => (string)($sourceGame["dbGames_Title"] ?? ""),
                "courseName" => (string)($sourceGame["dbGames_CourseName"] ?? ""),
            ],
            "playerCount" => count($rows),
            "rows" => $rows,
        ]
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("GAMEPLAYERS_GET_IMPORT_PLAYERS_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "message" => "Unable to load import players."
    ]);
}