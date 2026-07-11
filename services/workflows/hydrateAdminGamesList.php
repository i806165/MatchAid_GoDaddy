<?php
// /services/workflows/hydrateAdminGamesList.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once __DIR__ . '/../database/service_dbFavAdmins.php';
require_once __DIR__ . '/../database/service_dbGames.php';
require_once __DIR__ . '/../database/service_dbPlayers.php';

/**
 * Stamps 'yourPlayerKey' onto every row in $gamesResult['games']['raw'] —
 * the signed-in user's dbPlayers_PlayerKey for that game, or '' when they
 * have no player row there. One bulk lookup (ServiceDbPlayers::
 * getPlayersByGGIDSet()) covers every row in $gamesResult at once, rather
 * than a query per game. Field is always present (never an undefined key
 * client-side) so module_sourceGames.js's "Open Scoring Portal" menu item
 * can gate on it directly: !!row.yourPlayerKey.
 *
 * Called from both of this file's return paths (event mode and standalone)
 * rather than duplicated inline at each one — adminhome.php calls
 * hydrateAdminGamesList() directly for the initial page load, separately
 * from whatever query.php does for filter-refresh AJAX calls, so the fix
 * has to live in the one function both already share, not in either caller.
 */
function augmentGamesWithPlayerKey(array $gamesResult, string $ghin): array {
  $rows = $gamesResult["games"]["raw"] ?? null;
  if (!is_array($rows) || !$rows || trim($ghin) === "") {
    return $gamesResult;
  }

  $ggidSet = array_values(array_unique(array_filter(array_map(
    static fn($r) => trim((string)($r["dbGames_GGID"] ?? "")),
    $rows
  ))));

  $playerRowsByGgid = [];
  foreach (ServiceDbPlayers::getPlayersByGGIDSet($ggidSet, $ghin) as $p) {
    $playerRowsByGgid[(string)($p["dbPlayers_GGID"] ?? "")] = $p;
  }

  foreach ($rows as &$row) {
    $ggid = trim((string)($row["dbGames_GGID"] ?? ""));
    $row["yourPlayerKey"] = (string)($playerRowsByGgid[$ggid]["dbPlayers_PlayerKey"] ?? "");
  }
  unset($row);

  $gamesResult["games"]["raw"] = $rows;
  return $gamesResult;
}

/**
 * hydrateAdminGamesList
 * Builds the INIT payload for Admin Games List.
 *
 * @param array $context  user context (must include userGHIN, clubId, clubName)
 * @param array $filters  mode/dateFrom/dateTo/selectedAdminKeys
 * @return array INIT payload (matches existing HTML contract)
 */
function hydrateAdminGamesList(array $context, array $filters): array {
  $userGhin = strval($context["userGHIN"] ?? "");
  $clubId   = strval($context["clubId"] ?? ($context["clubID"] ?? ""));

  // ------------------------------------------------------------------
  // EVENT MODE: if an EID is present, bypass date/admin filter logic
  // entirely and scope the games list to this event only.
  // ------------------------------------------------------------------
  $eid = (int)($filters["eid"] ?? 0);
  if ($eid > 0) {
    require_once __DIR__ . '/../database/service_dbGames.php';
    require_once __DIR__ . '/../context/service_ContextEvent.php';

    $games = ServiceDbGames::queryEventGames($eid);
    $games = augmentGamesWithPlayerKey($games, $userGhin);
    $eventCtx = ServiceContextEvent::getEventContext($eid);
    $event = $eventCtx["event"] ?? [];

    $subtitle = trim((string)($event["dbEvents_Title"] ?? "Event Games"));

    return [
      "currentUserAdminKey" => $userGhin,
      "filters" => [
        "mode"               => "event",
        "dateFrom"           => "",
        "dateTo"             => "",
        "selectedAdminKeys"  => [],
        "adminScope"         => "EVENT",
        "eid"                => $eid,
      ],
      "admins" => [
        "all"      => [],
        "favorites"=> [],
        "selected" => [],
      ],
      "games"       => $games["games"] ?? ["raw" => [], "vm" => []],
      "eventContext"=> $eventCtx,
      "header"      => [
        "title"    => "Event Games",
        "subtitle" => $subtitle,
      ],
    ];
  }

  // normalize filters
  $dateFrom = strval($filters["dateFrom"] ?? "");
  $dateTo   = strval($filters["dateTo"] ?? "");

  // UI-selected keys (used to render checkmarks)
  $uiSelected = $filters["selectedAdminKeys"] ?? [$userGhin];
  if (!is_array($uiSelected)) $uiSelected = [$userGhin];

  // Optional: adminScope ("ME" | "ALL" | "CUSTOM")
  $adminScope = strtoupper(trim(strval($filters["adminScope"] ?? "ME")));
  if (!in_array($adminScope, ["ME", "ALL", "CUSTOM"], true)) $adminScope = "ME";

  // Keys used for the games query:
  // - If scope = ALL, do NOT filter by admin (empty list)
  // - Else use the UI-selected list (multi-admin)
  $selectedForQuery = ($adminScope === "ALL") ? [] : $uiSelected;

  // ----------------------------
  // Default date window (match Wix intent)
  // - current: today .. today+14
  // - past:    today-14 .. today
  // ----------------------------
  $mode = strval($filters["mode"] ?? "current");

  if ($dateFrom === "" || $dateTo === "") {
    $today = new DateTimeImmutable("today");

    if ($mode === "past") {
      $from = $today->modify("-14 days");
      $to   = $today;
    } else { // "current" (default)
      $from = $today;
      $to   = $today->modify("+14 days");
    }

    if ($dateFrom === "") $dateFrom = $from->format("Y-m-d");
    if ($dateTo === "")   $dateTo   = $to->format("Y-m-d");
  }

  // Dedup/sanitize UI keys for selection rendering
  $uiSelected = array_values(array_unique(array_filter(array_map("strval", $uiSelected))));


  $adminsAll = ServiceDbFavAdmins::queryFavoriteAdmins([
    "userGHIN" => $userGhin,
    "clubId" => $clubId,
    "selectedAdminKeys" => $uiSelected,
  ]);


  $games = ServiceDbGames::queryGames([
    "clubId" => $clubId,
    "dateFrom" => $dateFrom,
    "dateTo" => $dateTo,
    "adminScope" => $adminScope,
    "selectedAdminKeys" => $selectedForQuery,
    "includePlayerCounts" => true,
  ]);
  $games = augmentGamesWithPlayerKey($games, $userGhin);


  //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  $vmLen  = isset($games["games"]["vm"])  && is_array($games["games"]["vm"])  ? count($games["games"]["vm"])  : 0;
  $rawLen = isset($games["games"]["raw"]) && is_array($games["games"]["raw"]) ? count($games["games"]["raw"]) : 0;
  //error_log("[MA][HYDRATE] games.vm={$vmLen} games.raw={$rawLen}");
  //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  $subtitle = trim("Game List for " . substr(strval($context["clubName"] ?? ""), 0, 25) . " " . $clubId);

  return [
    "currentUserAdminKey" => $userGhin,
    "filters" => [
      "mode" => strval($filters["mode"] ?? "current"),
      "dateFrom" => $dateFrom,
      "dateTo" => $dateTo,
      "selectedAdminKeys" => array_values(array_filter($uiSelected, fn($x)=>$x!=="" && $x!==null)),
      "adminScope" => $adminScope,
    ],
    "admins" => [
      "all" => $adminsAll["adminsAll"] ?? [],
      "favorites" => $adminsAll["favorites"] ?? [],
      "selected" => array_values(array_filter($uiSelected)),
    ],
    "games" => $games["games"] ?? ["raw"=>[], "vm"=>[]],
    "header" => [
      "title" => "Administrators Portal",
      "subtitle" => $subtitle,
    ],
  ];
}