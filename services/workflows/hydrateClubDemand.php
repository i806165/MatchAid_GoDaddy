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
 *
 * Data acquisition flow:
 *   1. Read resolved facility from session (set by club_home.php)
 *   2. Query games for the selected facility within the date range
 *   3. Bulk-fetch player rows for all GGIDs in one query
 *
 * Everything else (grouping, sorting, filtering, player aggregation)
 * is handled client-side in club_demand.js.
 *
 * Important business rule:
 *   Facility context is resolved once at club_home.php via
 *   service_ContextFacility and stored in session. This file
 *   trusts that value — no re-resolution here.
 *
 * @param array $context  userGHIN / clubId / clubName
 * @param array $filters  dateFrom / dateTo
 * @return array          INIT payload for the Club Demand page
 */
function hydrateClubDemand(array $context, array $filters): array {

  $userGHIN = trim(strval($context["userGHIN"] ?? ""));
  $clubId   = trim(strval($context["clubId"]   ?? ""));
  $clubName = trim(strval($context["clubName"] ?? ""));

  if ($userGHIN === "") {
    return ["ok" => false, "message" => "Missing user context."];
  }

  // ----------------------------------------------------------------
  // Normalize + default date range — today → today+30
  // ----------------------------------------------------------------
  $dateFrom = trim(strval($filters["dateFrom"] ?? ""));
  $dateTo   = trim(strval($filters["dateTo"]   ?? ""));

  if ($dateFrom === "" || $dateTo === "") {
    $today  = new DateTimeImmutable("today");
    $plus30 = $today->modify("+30 days");

    if ($dateFrom === "") $dateFrom = $today->format("Y-m-d");
    if ($dateTo   === "") $dateTo   = $plus30->format("Y-m-d");
  }

  // ----------------------------------------------------------------
  // Read facility from session — resolved by club_home.php
  // ----------------------------------------------------------------
  $facilityId   = trim(strval($_SESSION["SessionFacilityID"]   ?? ""));
  $facilityName = trim(strval($_SESSION["SessionFacilityName"] ?? ""));

  if ($facilityId === "" || $facilityId === "00000") {
    return cdBuildEmptyClubDemandPayload(
      $clubId,
      $clubName,
      $dateFrom,
      $dateTo,
      "No facility selected. Return to Club Home and select a facility."
    );
  }

  // ----------------------------------------------------------------
  // Step 1 — Query games for selected facility + date range
  // ----------------------------------------------------------------
  $gamesResult = ServiceDbGames::queryGames([
    "clubId"              => $clubId,
    "facilityId"          => $facilityId,
    "dateFrom"            => $dateFrom,
    "dateTo"              => $dateTo,
    "adminScope"          => "ALL",
    "selectedAdminKeys"   => [],
    "includePlayerCounts" => false,
  ]);

  $gamesRaw = $gamesResult["games"]["raw"] ?? [];


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
  // Step 3 — Bulk player query
  // ----------------------------------------------------------------
  $playersByGGID = [];

  if (!empty($ggids)) {
    try {
      $pdo = Db::pdo();

      $in = [];
      $ps = [];

      foreach ($ggids as $i => $ggid) {
        $ph      = ":g{$i}";
        $in[]    = $ph;
        $ps[$ph] = $ggid;
      }

      $inClause = implode(",", $in);

      $sqlPlayers = "
        SELECT
          CAST(dbPlayers_GGID       AS CHAR) AS ggid,
          CAST(dbPlayers_PlayerGHIN AS CHAR) AS ghin,
          CAST(dbPlayers_LocalID    AS CHAR) AS localId,
          dbPlayers_Name                      AS fullName,
          dbPlayers_LName                     AS lastName,
          dbPlayers_HI                        AS hi,
          dbPlayers_TeeTime                   AS teetime,
          _createdDate                        AS registeredDate
        FROM db_Players
        WHERE CAST(dbPlayers_GGID AS CHAR) IN ({$inClause})
        ORDER BY dbPlayers_LName ASC, dbPlayers_Name ASC
      ";

      $stP = $pdo->prepare($sqlPlayers);
      $stP->execute($ps);

      foreach (($stP->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
        $g = strval($row["ggid"] ?? "");
        if ($g === "") continue;

        if (!isset($playersByGGID[$g])) $playersByGGID[$g] = [];

        $playersByGGID[$g][] = [
          "ghin"           => strval($row["ghin"]           ?? ""),
          "localId"        => strval($row["localId"]        ?? ""),
          "fullName"       => strval($row["fullName"]       ?? ""),
          "lastName"       => strval($row["lastName"]       ?? ""),
          "registeredDate" => strval($row["registeredDate"] ?? ""),
          "teetime"        => strval($row["teetime"]        ?? ""),
          "hi"             => strval($row["hi"]             ?? ""),
        ];
      }

    } catch (Throwable $e) {
      Logger::error("CLUB_DEMAND_PLAYERS_FAIL", [
        "err"        => $e->getMessage(),
        "facilityId" => $facilityId,
      ]);
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
    $gamePlayers = $playersByGGID[$ggid] ?? [];

    $teeTimeCnt  = max(0, (int)($g["dbGames_TeeTimeCnt"] ?? 0));
    $slotCount   = $teeTimeCnt * 4;
    $playerCount = count($gamePlayers);

    $totalRounds += $playerCount;
    $totalSlots  += $slotCount;

    $enriched[] = [
      "ggid"         => $ggid,
      "title"        => strval($g["dbGames_Title"]        ?? ""),
      "playDate"     => substr(strval($g["dbGames_PlayDate"]  ?? ""), 0, 10),
      "playTime"     => substr(strval($g["dbGames_PlayTime"]  ?? ""), 0, 5),
      "facilityName" => strval($g["dbGames_FacilityName"] ?? ""),
      "facilityId"   => strval($g["dbGames_FacilityID"]   ?? ""),
      "courseName"   => strval($g["dbGames_CourseName"]   ?? ""),
      "courseId"     => strval($g["dbGames_CourseID"]     ?? ""),
      "adminName"    => strval($g["dbGames_AdminName"]    ?? ""),
      "adminGHIN"    => strval($g["dbGames_AdminGHIN"]    ?? ""),
      "toMethod"     => strval($g["dbGames_TOMethod"]     ?? ""),
      "gameFormat"   => strval($g["dbGames_GameFormat"]   ?? ""),
      "holes"        => strval($g["dbGames_Holes"]        ?? ""),
      "slotCount"    => $slotCount,
      "playerCount"  => $playerCount,
      "players"      => $gamePlayers,
    ];
  }

  $gameCount  = count($enriched);
  $avgPerGame = $gameCount > 0 ? round($totalRounds / $gameCount, 1) : 0;


  return [
    "ok"         => true,
    "authorized" => true,
    "filters"    => [
      "dateFrom"   => $dateFrom,
      "dateTo"     => $dateTo,
      "facilityId" => $facilityId,
    ],
    "context" => [
      "clubId"            => $clubId,
      "clubName"          => $clubName,
      "facilityId"        => $facilityId,
      "facilityName"      => $facilityName,
      "facilityOptions"   => [],
      "canSelectFacility" => false,
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
      "subtitle" => trim($facilityName !== "" ? $facilityName : $clubName),
    ],
  ];
}

/**
 * Build an empty payload when no facility is available.
 */
function cdBuildEmptyClubDemandPayload(
  string $clubId,
  string $clubName,
  string $dateFrom,
  string $dateTo,
  string $message
): array {
  return [
    "ok"         => true,
    "authorized" => false,
    "message"    => $message,
    "filters"    => [
      "dateFrom"   => $dateFrom,
      "dateTo"     => $dateTo,
      "facilityId" => "",
    ],
    "context" => [
      "clubId"            => $clubId,
      "clubName"          => $clubName,
      "facilityId"        => "",
      "facilityName"      => "",
      "facilityOptions"   => [],
      "canSelectFacility" => false,
    ],
    "summary" => [
      "gameCount"   => 0,
      "totalRounds" => 0,
      "totalSlots"  => 0,
      "avgPerGame"  => 0,
    ],
    "games"  => [],
    "header" => [
      "title"    => "Club Demand",
      "subtitle" => trim($clubName),
    ],
  ];
}