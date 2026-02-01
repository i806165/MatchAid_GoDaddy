<?php
// /services/workflows/hydrateAdminGamesList.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once __DIR__ . '/../database/service_dbFavAdmins.php';
require_once __DIR__ . '/../database/service_dbGames.php';

/**
 * hydrateAdminGamesList
 * Builds the INIT payload for Admin Games List.
 *
 * @param array $context  user context (must include userGHIN, clubId, clubName)
 * @param array $filters  mode/dateFrom/dateTo/selectedAdminKeys
 * @return array INIT payload (matches existing HTML contract)
 */
function hydrateAdminGamesList(array $context, array $filters): array {
  $pdo = Db::pdo();

  $userGhin = strval($context["userGHIN"] ?? "");
  $clubId   = strval($context["clubId"] ?? ($context["clubID"] ?? ""));

  // normalize filters
  $dateFrom = strval($filters["dateFrom"] ?? "");
  $dateTo   = strval($filters["dateTo"] ?? "");
  $selected = $filters["selectedAdminKeys"] ?? [$userGhin];

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



  if (!is_array($selected)) $selected = [$userGhin];

  $adminsAll = ServiceDbFavAdmins::queryFavoriteAdmins($pdo, [
    "userGHIN" => $userGhin,
    "clubId" => $clubId,
    "selectedAdminKeys" => $selected,
  ]);

//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  error_log("[MA][HYDRATE] clubId={$clubId} userGHIN={$userGhin} dateFrom={$dateFrom} dateTo={$dateTo} selectedCount=" . (is_array($selected) ? count($selected) : 0));
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

  $games = ServiceDbGames::queryGames($pdo, [
    "clubId" => $clubId,
    "dateFrom" => $dateFrom,
    "dateTo" => $dateTo,
    "selectedAdminKeys" => $selected,
    "includePlayerCounts" => true,
  ]);

  //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  $vmLen  = isset($games["games"]["vm"])  && is_array($games["games"]["vm"])  ? count($games["games"]["vm"])  : 0;
$rawLen = isset($games["games"]["raw"]) && is_array($games["games"]["raw"]) ? count($games["games"]["raw"]) : 0;
error_log("[MA][HYDRATE] games.vm={$vmLen} games.raw={$rawLen}");
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  $subtitle = trim("Game List for " . substr(strval($context["clubName"] ?? ""), 0, 25) . " " . $clubId);

  return [
    "currentUserAdminKey" => $userGhin,
    "filters" => [
      "mode" => strval($filters["mode"] ?? "current"),
      "dateFrom" => $dateFrom,
      "dateTo" => $dateTo,
      "selectedAdminKeys" => array_values(array_filter($selected, fn($x)=>$x!=="" && $x!==null)),
    ],
    "admins" => [
      "all" => $adminsAll["adminsAll"] ?? [],
      "favorites" => $adminsAll["favorites"] ?? [],
      "selected" => array_values(array_filter($selected)),
    ],
    "games" => $games["games"] ?? ["raw"=>[], "vm"=>[]],
    "header" => [
      "title" => "Administrators Portal",
      "subtitle" => $subtitle,
    ],
  ];
}