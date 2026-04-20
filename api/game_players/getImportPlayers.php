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

    $sourcePlayers = ServiceDbPlayers::getGamePlayers($sourceGGID);
    $destPlayers   = ServiceDbPlayers::getGamePlayers($destGGID);

    $destGhinSet = [];
    foreach ($destPlayers as $p) {
        $g = trim((string)($p["dbPlayers_PlayerGHIN"] ?? ""));
        if ($g !== "") $destGhinSet[$g] = true;
    }

    $rows = [];
    foreach ($sourcePlayers as $p) {
        $ghin = trim((string)($p["dbPlayers_PlayerGHIN"] ?? ""));
        $sourceTeeName = trim((string)($p["dbPlayers_TeeSetName"] ?? ""));
        $sourceTeeDetailsRaw = (string)($p["dbPlayers_TeeSetDetails"] ?? "");
        $sourceTeeDetails = json_decode($sourceTeeDetailsRaw, true);
        $sourceYards = is_array($sourceTeeDetails) ? (int)($sourceTeeDetails["TotalYardage"] ?? 0) : 0;

        // phase-1 placeholder assignment
        $assignedTeeText = $sourceTeeName;
        if ($sourceYards > 0) {
            $assignedTeeText = $sourceTeeName . " • " . number_format($sourceYards) . " yds";
        }

        $rows[] = [
            "ghin" => $ghin,
            "playerName" => trim((string)($p["dbPlayers_Name"] ?? "")),
            "hi" => (string)($p["dbPlayers_HI"] ?? ""),
            "gender" => (string)($p["dbPlayers_Gender"] ?? ""),
            "sourceTeeId" => (string)($p["dbPlayers_TeeSetID"] ?? ""),
            "sourceTeeText" => $sourceYards > 0
                ? ($sourceTeeName . " • " . number_format($sourceYards) . " yds")
                : $sourceTeeName,
            "assignedTeeId" => (string)($p["dbPlayers_TeeSetID"] ?? ""),
            "assignedTeeText" => $assignedTeeText,
            "alreadyOnRoster" => isset($destGhinSet[$ghin]),
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