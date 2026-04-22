<?php
declare(strict_types=1);
// /api/game_players/getImportSourceGames.php

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

try {
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    $adminGhin = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
    $clubId    = trim((string)($_SESSION["SessionAdminClubID"] ?? ""));

    if ($adminGhin === "") {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "Missing signed-in admin context."]);
        exit;
    }

    $result = ServiceDbGames::queryGames([
        "clubId"      => $clubId,
        "adminScope"  => "ME",
        "adminGhin"   => $adminGhin,
        // no date filters so both past and future games are available
        "includePlayerCounts" => true,
    ]);

    $rawGames = is_array($result["games"]["raw"] ?? null) ? $result["games"]["raw"] : [];

    // Only include games that have at least one player — empty games
    // are not useful as import sources.
    $games = [];
    foreach ($rawGames as $g) {
        $playerCount = (int)($g["playerCount"] ?? 0);
        if ($playerCount < 1) continue;
        $games[] = [
            "ggid"        => (string)($g["dbGames_GGID"]       ?? ""),
            "playDate"    => (string)($g["dbGames_PlayDate"]    ?? ""),
            "title"       => (string)($g["dbGames_Title"]       ?? ""),
            "courseName"  => (string)($g["dbGames_CourseName"]  ?? ""),
            "playerCount" => $playerCount,
        ];
    }

    Logger::info("IMPORT_SOURCE_GAMES_DEBUG", [
        "adminGhin"   => $adminGhin,
        "clubId"      => $clubId,
        "rawCount"    => count($rawGames),
        "gamesCount"  => count($games),
        "firstRaw"    => !empty($rawGames) ? array_slice($rawGames[0], 0, 5) : null,
    ]);

    echo json_encode([
        "ok" => true,
        "payload" => [
            "games" => $games,
        ]
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("GAMEPLAYERS_IMPORT_SOURCE_GAMES_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "message" => "Unable to load source games."
    ]);
}