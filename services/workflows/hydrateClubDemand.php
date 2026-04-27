<?php
declare(strict_types=1);
// /services/workflows/hydrateClubDemand.php
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

/**
 * hydrateClubDemand
 *
 * First-class data acquisition for the Club Demand page.
 * Performs two DB operations in sequence:
 *   1. Query games for the club within the date range (all admins)
 *   2. Bulk-fetch player stats + player rows for all GGIDs in one query each
 *
 * Everything else (admin filtering, course filtering, grouping,
 * sorting, player aggregation) is handled client-side in club_demand.js.
 *
 * @param array $context  userGHIN / clubId / clubName
 * @param array $filters  dateFrom / dateTo
 * @return array          INIT payload for the Club Demand page
 */
function hydrateClubDemand(array $context, array $filters): array {

  $clubId   = strval($context["clubId"]   ?? "");
  $clubName = strval($context["clubName"] ?? "");

  // ----------------------------------------------------------------
  // Normalize + default date range — today-30 → today
  // ----------------------------------------------------------------
  $dateFrom = trim(strval($filters["dateFrom"] ?? ""));
  $dateTo   = trim(strval($filters["dateTo"]   ?? ""));

  if ($dateFrom === "" || $dateTo === "") {
    $today   = new DateTimeImmutable("today");
    $minus30 = $today->modify("-30 days");
    if ($dateFrom === "") $dateFrom = $minus30->format("Y-m-d");
    if ($dateTo   === "") $dateTo   = $today->format("Y-m-d");
  }

  if ($clubId === "") {
    return ["ok" => false, "message" => "Missing club context."];
  }

  // ----------------------------------------------------------------
  // Step 1 — Query games for club + date range (all admins)
  // ----------------------------------------------------------------
  $gamesResult = ServiceDbGames::queryGames([
    "clubId"              => $clubId,
    "dateFrom"            => $dateFrom,
    "dateTo"              => $dateTo,
    "adminScope"          => "ALL",
    "selectedAdminKeys"   => [],
    "includePlayerCounts" => false,  // we run our own player query below
  ]);

  $gamesRaw = $gamesResult["games"]["raw"] ?? [];

  Logger::info("CLUB_DEMAND_GAMES", [
    "clubId"    => $clubId,
    "dateFrom"  => $dateFrom,
    "dateTo"    => $dateTo,
    "gameCount" => count($gamesRaw),
  ]);

  // ----------------------------------------------------------------
  // Step 2 — Extract unique GGIDs
  // ----------------------------------------------------------------
  $ggids = [];
  foreach ($gamesRaw as $g) {
    $ggid = trim(strval($g["dbGames_GGID"] ?? ""));
    if ($ggid !== "") $ggids[] = $ggid;
  }
  $ggids = array_values(array_unique($ggids));

  // ----------------------------------------------------------------
  // Step 3 — Bulk player queries — two queries, one round trip each
  // ----------------------------------------------------------------
  $statsByGGID   = [];
  $playersByGGID = [];

  if (!empty($ggids)) {
    try {
      $pdo = Db::pdo();

      // Build IN clause params (shared by both queries)
      $in = [];
      $ps = [];
      foreach ($ggids as $i => $ggid) {
        $ph      = ":g{$i}";
        $in[]    = $ph;
        $ps[$ph] = $ggid;
      }
      $inClause = implode(",", $in);

      // -- 3a: Aggregate stats per game (count, HI min/avg/max) ----
      $sqlStats = "
        SELECT
          CAST(dbPlayers_GGID AS CHAR)                                AS ggid,
          COUNT(*)                                                     AS playerCount,
          MIN(CASE
            WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
            THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END)              AS minHI,
          AVG(CASE
            WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
            THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END)              AS avgHI,
          MAX(CASE
            WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
            THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END)              AS maxHI
        FROM db_Players
        WHERE CAST(dbPlayers_GGID AS CHAR) IN ({$inClause})
        GROUP BY CAST(dbPlayers_GGID AS CHAR)
      ";
      $st = $pdo->prepare($sqlStats);
      $st->execute($ps);
      foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
        $statsByGGID[strval($row["ggid"])] = [
          "playerCount" => (int)$row["playerCount"],
          "minHI"       => $row["minHI"] !== null ? round((float)$row["minHI"], 1) : null,
          "avgHI"       => $row["avgHI"] !== null ? round((float)$row["avgHI"], 1) : null,
          "maxHI"       => $row["maxHI"] !== null ? round((float)$row["maxHI"], 1) : null,
        ];
      }

      // -- 3b: Individual player rows for client-side detail view ---
      // Minimal field set — only what demand analysis needs
      $sqlPlayers = "
        SELECT
          CAST(dbPlayers_GGID       AS CHAR) AS ggid,
          CAST(dbPlayers_PlayerGHIN AS CHAR) AS ghin,
          dbPlayers_Name                      AS firstName,
          dbPlayers_LName                     AS lastName,
          dbPlayers_HI                        AS hi
        FROM db_Players
        WHERE CAST(dbPlayers_GGID AS CHAR) IN ({$inClause})
        ORDER BY dbPlayers_LName ASC, dbPlayers_Name ASC
      ";
      $stP = $pdo->prepare($sqlPlayers);
      $stP->execute($ps);
      foreach (($stP->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
        $g = strval($row["ggid"]);
        if (!isset($playersByGGID[$g])) $playersByGGID[$g] = [];
        $playersByGGID[$g][] = [
          "ghin"      => strval($row["ghin"]      ?? ""),
          "firstName" => strval($row["firstName"] ?? ""),
          "lastName"  => strval($row["lastName"]  ?? ""),
          "hi"        => strval($row["hi"]        ?? ""),
        ];
      }

    } catch (Throwable $e) {
      Logger::error("CLUB_DEMAND_PLAYERS_FAIL", ["err" => $e->getMessage()]);
    }
  }

  // ----------------------------------------------------------------
  // Step 4 — Enrich game records + derive summary metrics
  // ----------------------------------------------------------------
  $enriched    = [];
  $totalRounds = 0;
  $totalSlots  = 0;

  foreach ($gamesRaw as $g) {
    $ggid        = trim(strval($g["dbGames_GGID"] ?? ""));
    $stats       = $statsByGGID[$ggid] ?? ["playerCount" => 0, "minHI" => null, "avgHI" => null, "maxHI" => null];
    $teeTimeCnt  = max(0, (int)($g["dbGames_TeeTimeCnt"] ?? 0));
    $slotCount   = $teeTimeCnt * 4;
    $playerCount = (int)($stats["playerCount"] ?? 0);

    $totalRounds += $playerCount;
    $totalSlots  += $slotCount;

    $enriched[] = [
      "ggid"         => $ggid,
      "title"        => strval($g["dbGames_Title"]        ?? ""),
      "playDate"     => substr(strval($g["dbGames_PlayDate"]  ?? ""), 0, 10),
      "playTime"     => substr(strval($g["dbGames_PlayTime"]  ?? ""), 0, 5),
      "facilityName" => strval($g["dbGames_FacilityName"] ?? ""),
      "courseName"   => strval($g["dbGames_CourseName"]   ?? ""),
      "courseId"     => strval($g["dbGames_CourseID"]     ?? ""),
      "adminName"    => strval($g["dbGames_AdminName"]    ?? ""),
      "adminGHIN"    => strval($g["dbGames_AdminGHIN"]    ?? ""),
      "toMethod"     => strval($g["dbGames_TOMethod"]     ?? ""),
      "gameFormat"   => strval($g["dbGames_GameFormat"]   ?? ""),
      "holes"        => strval($g["dbGames_Holes"]        ?? ""),
      "slotCount"    => $slotCount,
      "playerCount"  => $playerCount,
      "minHI"        => $stats["minHI"],
      "avgHI"        => $stats["avgHI"],
      "maxHI"        => $stats["maxHI"],
      "players"      => $playersByGGID[$ggid] ?? [],
    ];
  }

  $gameCount  = count($enriched);
  $avgPerGame = $gameCount > 0 ? round($totalRounds / $gameCount, 1) : 0;

  Logger::info("CLUB_DEMAND_HYDRATE_COMPLETE", [
    "gameCount"   => $gameCount,
    "totalRounds" => $totalRounds,
    "totalSlots"  => $totalSlots,
  ]);

  return [
    "ok"      => true,
    "filters" => [
      "dateFrom" => $dateFrom,
      "dateTo"   => $dateTo,
    ],
    "context" => [
      "clubId"   => $clubId,
      "clubName" => $clubName,
    ],
    "summary" => [
      "gameCount"   => $gameCount,
      "totalRounds" => $totalRounds,
      "totalSlots"  => $totalSlots,
      "avgPerGame"  => $avgPerGame,
    ],
    "games"  => $enriched,
    "header" => [
      "title"    => "Club Demand",
      "subtitle" => trim($clubName),
    ],
  ];
}