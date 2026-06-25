<?php
// /public_html/services/workflows/workflow_hydrateEventsList.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbEvents.php";

/**
 * Builds the INIT payload for Events Home.
 *
 * @param array $context user context from session/user context
 * @param array $filters mode=current|past|all
 * @return array INIT payload
 */
function hydrateEventsList(array $context, array $filters): array
{
  $userGHIN = strval($context["userGHIN"] ?? "");
  $clubId = strval($context["clubId"] ?? "");
  $clubName = strval($context["clubName"] ?? "");

  $mode = strtolower(trim(strval($filters["mode"] ?? "current")));
  if (!in_array($mode, ["current", "past", "all"], true)) $mode = "current";

  $events = ServiceDbEvents::queryEvents([
    "clubId" => $clubId,
    "adminGHIN" => $userGHIN,
    "mode" => $mode,
    "includeCounts" => true
  ]);

  return [
    "header" => [
      "title" => "Events",
      "subtitle" => $clubName,
      "currentUserAdminKey" => $userGHIN
    ],
    "filters" => [
      "mode" => $mode
    ],
    "events" => $events["events"] ?? ["raw" => [], "vm" => []]
  ];
}
