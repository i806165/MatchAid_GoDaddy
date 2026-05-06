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
 *   1. Resolve the signed-in user's responsible facility/facilities from db_UserRoles
 *   2. Query games for the selected facility within the date range
 *   3. Bulk-fetch player rows for all GGIDs in one query
 *
 * Everything else (grouping, sorting, filtering, player aggregation)
 * is handled client-side in club_demand.js.
 *
 * Important business rule:
 *   Club Demand always reports on exactly one real facility.
 *   dbUserRoles_FacilityID = "00000" means the user may choose a facility;
 *   it is never passed through as an unconstrained game query.
 *
 * @param array $context  userGHIN / clubId / clubName
 * @param array $filters  dateFrom / dateTo / facilityId
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

  // Default to user's home facility from session if none explicitly selected
  $facilityIdFromFilter  = trim(strval($filters["facilityId"] ?? ""));
  if (empty($filters["facilityId"])) {
      $filters["facilityId"] = trim(strval($_SESSION["SessionFacilityID"] ?? ""));
  }

  Logger::debug("CLUB_DEMAND_FACILITY_RESOLVE_INPUT", [
    "facilityId_from_filter"  => $facilityIdFromFilter,
    "facilityId_from_session" => trim(strval($_SESSION["SessionFacilityID"] ?? "")),
    "facilityId_resolved"     => $filters["facilityId"],
    "userGHIN"                => $userGHIN,
  ]);

  // Resolve facility access / selected facility
  $facilityCtx = cdResolveClubDemandFacilityContext($userGHIN, $filters);

  if (empty($facilityCtx["authorized"])) {
    $message = strval($facilityCtx["message"] ?? "Club Demand is not configured for this user.");

    return cdBuildEmptyClubDemandPayload(
      $clubId,
      $clubName,
      $dateFrom,
      $dateTo,
      $message
    );
  }

  $facilityId      = strval($facilityCtx["facilityId"] ?? "");
  $facilityName    = strval($facilityCtx["facilityName"] ?? "");
  $facilityOptions = is_array($facilityCtx["facilityOptions"] ?? null)
    ? $facilityCtx["facilityOptions"]
    : [];

  if ($facilityId === "" || $facilityId === "00000") {
    return ["ok" => false, "message" => "Missing valid facility selection."];
  }

  // ----------------------------------------------------------------
  // Step 1 — Query games for selected facility + date range
  // ----------------------------------------------------------------
  $gamesResult = ServiceDbGames::queryGames([
    // Keep clubId for compatibility, but ServiceDbGames should prefer
    // facilityId when provided.
    "clubId"              => $clubId,
    "facilityId"          => $facilityId,
    "dateFrom"            => $dateFrom,
    "dateTo"              => $dateTo,
    "adminScope"          => "ALL",
    "selectedAdminKeys"   => [],
    "includePlayerCounts" => false,
  ]);

  $gamesRaw = $gamesResult["games"]["raw"] ?? [];

  Logger::info("CLUB_DEMAND_GAMES", [
    "userGHIN"      => $userGHIN,
    "clubId"        => $clubId,
    "facilityId"    => $facilityId,
    "facilityName"  => $facilityName,
    "dateFrom"      => $dateFrom,
    "dateTo"        => $dateTo,
    "gameCount"     => count($gamesRaw),
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

      // Individual player rows for client-side detail view + counts.
      // Player count is derived from count($playersByGGID[$ggid]).
      $sqlPlayers = "
        SELECT
          CAST(dbPlayers_GGID       AS CHAR) AS ggid,
          CAST(dbPlayers_PlayerGHIN AS CHAR) AS ghin,
          CAST(dbPlayers_LocalID    AS CHAR) AS localId,
          dbPlayers_Name                      AS fullName,
          dbPlayers_LName                     AS lastName,
          dbPlayers_HI                        AS hi,
          dbPlayers_TeeTime AS teetime,
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
          "ghin"      => strval($row["ghin"]      ?? ""),
          "localId"   => strval($row["localId"]   ?? ""),
          "fullName" => strval($row["fullName"] ?? ""),
          "lastName"  => strval($row["lastName"]  ?? ""),
          "registeredDate" => strval($row["registeredDate"] ?? ""),
          "teetime" => strval($row["teetime"] ?? ""),
          "hi"        => strval($row["hi"]        ?? ""),
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

  Logger::info("CLUB_DEMAND_HYDRATE_COMPLETE", [
    "facilityId"   => $facilityId,
    "facilityName" => $facilityName,
    "gameCount"    => $gameCount,
    "totalRounds"  => $totalRounds,
    "totalSlots"   => $totalSlots,
  ]);

  return [
    "ok"      => true,
    "authorized" => true,
    "filters" => [
      "dateFrom"   => $dateFrom,
      "dateTo"     => $dateTo,
      "facilityId" => $facilityId,
    ],
    "context" => [
      "clubId"            => $clubId,
      "clubName"          => $clubName,
      "facilityId"        => $facilityId,
      "facilityName"      => $facilityName,
      "facilityOptions"   => $facilityOptions,
      "canSelectFacility" => !empty($facilityCtx["canSelectFacility"]),
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
 * Resolve the facility context for Club Demand.
 *
 * Rules:
 * - A real FacilityID means the user may report on that facility.
 * - FacilityID "00000" means all-facility permission, but is not a query value.
 * - For "00000", load all real facilities and default to the first one.
 * - The selected facility must be one of the available real facilities.
 */
function cdResolveClubDemandFacilityContext(string $userGHIN, array $filters): array {
  try {
    $userRoles = cdLoadUserFacilityRoles($userGHIN);

    if (empty($userRoles)) {
      return [
        "ok"         => true,
        "authorized" => false,
        "message"    => "Club Demand is not configured for this user.",
      ];
    }

    $hasAllAccess = false;
    $realOptions  = [];

    foreach ($userRoles as $role) {
      $fid = cdNormalizeFacilityId($role["facilityId"] ?? "");
      $fn  = trim(strval($role["facilityName"] ?? ""));

      if ($fid === "00000") {
        $hasAllAccess = true;
        continue;
      }

      if ($fid !== "") {
        cdAddFacilityOption($realOptions, $fid, $fn);
      }
    }

    // Site Admin / All Facilities users may choose from all real facilities.
    // Do not include "00000" as an option.
    if ($hasAllAccess) {
      $allOptions = cdLoadAllRealFacilityOptions();
      if (!empty($allOptions)) {
        $realOptions = $allOptions;
      }
    }

    cdSortFacilityOptions($realOptions);
    if (empty($realOptions)) {
      return [
        "ok"         => true,
        "authorized" => false,
        "message"    => "Club Demand is not configured for this user.",
      ];
    }

    $requestedId = cdNormalizeFacilityId($filters["facilityId"] ?? "");
    $selected    = cdFindFacilityOption($realOptions, $requestedId);

    Logger::info("CLUB_DEMAND_FACILITY_MATCH", [
      "requestedId"    => $requestedId,
      "matched"        => $selected ? $selected["facilityId"] : null,
      "fallback"       => $selected ? null : ($realOptions[0]["facilityId"] ?? null),
      "availableIds"   => array_column($realOptions, "facilityId"),
    ]);

    // Never allow blank or 00000 to drive this report. Default to first real facility.
    if (!$selected) {
      $selected = $realOptions[0];
    }

    return [
      "ok"                => true,
      "authorized"        => true,
      "facilityId"        => strval($selected["facilityId"] ?? ""),
      "facilityName"      => strval($selected["facilityName"] ?? ""),
      "facilityOptions"   => array_values($realOptions),
      "canSelectFacility" => count($realOptions) > 1,
      "hasAllAccess"      => $hasAllAccess,
    ];

  } catch (Throwable $e) {
    Logger::error("CLUB_DEMAND_FACILITY_RESOLVE_FAIL", [
      "userGHIN" => $userGHIN,
      "err"      => $e->getMessage(),
    ]);

    return [
      "ok"         => true,
      "authorized" => false,
      "message"    => "Club Demand is not configured for this user.",
    ];
  }
}

/**
 * Load facility roles for the signed-in user.
 */
function cdLoadUserFacilityRoles(string $userGHIN): array {
  $pdo = Db::pdo();

  $sql = "
    SELECT DISTINCT
      CAST(dbUserRoles_FacilityID AS CHAR) AS facilityId,
      dbUserRoles_FacilityName             AS facilityName,
      dbUserRoles_RoleID                   AS roleId
    FROM db_UserRoles
    WHERE CAST(dbUserRoles_UserGHIN AS CHAR) = :ghin
    ORDER BY dbUserRoles_FacilityName ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute([":ghin" => $userGHIN]);

  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/**
 * Load all real facilities from db_UserRoles.
 *
 * Used only when the signed-in user has FacilityID "00000".
 * This intentionally excludes "00000" so Club Demand always runs
 * for one actual facility.
 */
function cdLoadAllRealFacilityOptions(): array {
  $pdo = Db::pdo();

  $sql = "
    SELECT DISTINCT
      CAST(dbUserRoles_FacilityID AS CHAR) AS facilityId,
      dbUserRoles_FacilityName             AS facilityName
    FROM db_UserRoles
    WHERE TRIM(CAST(dbUserRoles_FacilityID AS CHAR)) <> ''
      AND TRIM(CAST(dbUserRoles_FacilityID AS CHAR)) <> '00000'
    ORDER BY dbUserRoles_FacilityName ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute();

  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  $out  = [];

  foreach ($rows as $row) {
    $fid = cdNormalizeFacilityId($row["facilityId"] ?? "");
    $fn  = trim(strval($row["facilityName"] ?? ""));

    if ($fid !== "") {
      cdAddFacilityOption($out, $fid, $fn);
    }
  }

  cdSortFacilityOptions($out);

  return array_values($out);
}

function cdNormalizeFacilityId($value): string {
  return trim(strval($value ?? ""));
}

function cdAddFacilityOption(array &$options, string $facilityId, string $facilityName): void {
  if ($facilityId === "" || $facilityId === "00000") return;

  if ($facilityName === "") {
    $facilityName = "Facility " . $facilityId;
  }

  foreach ($options as $existing) {
    if (strval($existing["facilityId"] ?? "") === $facilityId) {
      return;
    }
  }

  $options[] = [
    "facilityId"   => $facilityId,
    "facilityName" => $facilityName,
  ];
}

function cdFindFacilityOption(array $options, string $facilityId): ?array {
  if ($facilityId === "" || $facilityId === "00000") return null;

  foreach ($options as $option) {
    if (strval($option["facilityId"] ?? "") === $facilityId) {
      return $option;
    }
  }

  return null;
}

function cdSortFacilityOptions(array &$options): void {
  usort($options, function(array $a, array $b): int {
    return strcasecmp(
      strval($a["facilityName"] ?? ""),
      strval($b["facilityName"] ?? "")
    );
  });
}
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
    "filters" => [
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
    "games" => [],
    "header" => [
      "title"    => "Club Demand",
      "subtitle" => trim($clubName),
    ],
  ];
}