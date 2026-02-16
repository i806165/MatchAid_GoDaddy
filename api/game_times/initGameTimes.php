<?php
// /public_html/api/game_times/initGameTimes.php
declare(strict_types=1);

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

/**
 * initGameTimes
 * Returns INIT payload contract:
 *  { ok:true, payload:{ meta:{...}, groups:[...] }, message:"" }
 */
function initGameTimes(string $ggid, array $userContext): array {
  
  // 1. Load Game Data via Service
  $game = ServiceDbGames::getGameByGGID((int)$ggid);
  if (!$game) {
    return ["ok" => false, "message" => "Game not found for GGID.", "payload" => null];
  }

  // 2. Load Players via Service
  $players = ServiceDbPlayers::getGamePlayers($ggid);

  // 3. Prepare Meta
  $toMethod = strval($game["dbGames_TOMethod"] ?? "TeeTimes");
  $holesSetting = strval($game["dbGames_Holes"] ?? "All 18");
  $competition = strval($game["dbGames_Competition"] ?? "");

  $availableTimes = gt_generateTimesPicklist(
    strval($game["dbGames_PlayTime"] ?? ""),
    intval($game["dbGames_TeeTimeInterval"] ?? 0),
    intval($game["dbGames_TeeTimeCnt"] ?? 0)
  );

  $availableHoles = gt_generateHolesPicklist($holesSetting);
  $availableSuffixes = ["A","B","C","D"];

  $meta = [
    "ggid" => $ggid,
    "title" => strval($game["dbGames_Title"] ?? ""),
    "toMethod" => $toMethod,
    "holesSetting" => $holesSetting,
    "competition" => $competition,
    "availableTimes" => $availableTimes,
    "availableHoles" => $availableHoles,
    "availableSuffixes" => $availableSuffixes,
  ];

  // 4. Build Groups
  $groups = gt_buildGroups($players, $meta);

  return [
    "ok" => true,
    "message" => "",
    "payload" => [
      "meta" => $meta,
      "groups" => $groups,
      "userName" => strval($userContext["userName"] ?? $userContext["name"] ?? ""),
    ],
  ];
}

// ---------------------------
// Helpers (Internal to workflow)
// ---------------------------

function gt_generateTimesPicklist(string $start, int $intervalMin, int $count): array {
  $start = trim($start);
  if ($start === "" || $intervalMin <= 0 || $count <= 0) return [];

  $fmts = ["g:i A", "g:ia", "h:i A", "H:i", "G:i", "H:i:s"];
  $dt = null;
  foreach ($fmts as $f) {
    $d = DateTime::createFromFormat($f, $start);
    if ($d instanceof DateTime) { $dt = $d; break; }
  }
  if (!$dt) return [];

  $out = [];
  for ($i = 0; $i < $count; $i++) {
    $t = clone $dt;
    if ($i > 0) $t->modify(sprintf("+%d minutes", $i * $intervalMin));
    $out[] = $t->format("g:i A");
  }
  return $out;
}

function gt_generateHolesPicklist(string $holesSetting): array {
  $hs = strtolower(trim($holesSetting));
  if ($hs === "f9" || $hs === "front" || $hs === "front 9") return range(1, 9);
  if ($hs === "b9" || $hs === "back" || $hs === "back 9") return range(10, 18);
  return range(1, 18);
}

function gt_buildGroups(array $players, array $meta): array {
  $competition = strval($meta["competition"] ?? "");
  $isPairPair = (strtolower($competition) === "pairpair");

  $groups = [];
  foreach ($players as $p) {
    $pid = strval($p["dbPlayers_PairingID"] ?? "");
    $fid = strval($p["dbPlayers_FlightID"] ?? "");
    $ghin = strval($p["dbPlayers_PlayerGHIN"] ?? "");
    
    // 1. Unpaired (Singleton) -> Group by GHIN
    if ($pid === "" || $pid === "000") {
      $k = "U:" . $ghin;
    }
    // 2. Match Play: Unmatched Pairing -> Group by PairingID
    else if ($isPairPair && ($fid === "" || $fid === "0")) {
      $k = "P:" . $pid;
    }
    // 3. Match Play: Matched Flight -> Group by FlightID
    else if ($isPairPair) {
      $k = "F:" . $fid;
    }
    // 4. Stroke Play: Pairing -> Group by PairingID
    else {
      $k = "P:" . $pid;
    }

    if (!isset($groups[$k])) $groups[$k] = [];
    $groups[$k][] = $p;
  }

  $out = [];
  $idx = 0;
  foreach ($groups as $k => $rows) {
    $idx++;
    $isFlightGroup = (strpos($k, "F:") === 0);
    $id = substr($k, 2);
    $isSingleton = (strpos($k, "U:") === 0);

    // Sort players within the group based on competition type
    usort($rows, function($a, $b) use ($isPairPair) {
        if ($isPairPair) {
            // Match Play: FlightPos (A vs B), then PairingID, then PairingPos
            $fpA = strtoupper(trim(strval($a["dbPlayers_FlightPos"] ?? "")));
            $fpB = strtoupper(trim(strval($b["dbPlayers_FlightPos"] ?? "")));
            if ($fpA !== $fpB) return strcmp($fpA, $fpB);

            $pidA = (int)($a["dbPlayers_PairingID"] ?? 0);
            $pidB = (int)($b["dbPlayers_PairingID"] ?? 0);
            if ($pidA !== $pidB) return $pidA - $pidB;
        }
        // Default/Secondary sort: PairingPos
        $ppA = (int)($a["dbPlayers_PairingPos"] ?? 0);
        $ppB = (int)($b["dbPlayers_PairingPos"] ?? 0);
        return $ppA - $ppB;
    });

    $pairingIdsSet = [];
    $teeTime = "";
    $startHole = "";
    $suffix = "";
    $teamA = [];
    $teamB = [];
    $names = [];

    foreach ($rows as $r) {
      $pid = strval($r["dbPlayers_PairingID"] ?? "");
      $ghin = strval($r["dbPlayers_PlayerGHIN"] ?? "");

      if ($isSingleton) {
        // For singletons, use special GHIN key for saving
        $pairingIdsSet["GHIN:" . $ghin] = true;
      } else if ($pid !== "") {
        $pairingIdsSet[$pid] = true;
      }

      if ($teeTime === "" && trim(strval($r["dbPlayers_TeeTime"] ?? "")) !== "") $teeTime = trim(strval($r["dbPlayers_TeeTime"] ?? ""));
      if ($startHole === "" && trim(strval($r["dbPlayers_StartHole"] ?? "")) !== "") $startHole = trim(strval($r["dbPlayers_StartHole"] ?? ""));
      if ($suffix === "" && trim(strval($r["dbPlayers_StartHoleSuffix"] ?? "")) !== "") $suffix = trim(strval($r["dbPlayers_StartHoleSuffix"] ?? ""));
      
      $ln = trim(strval($r["dbPlayers_LName"] ?? $r["dbPlayers_Name"] ?? ""));
      if ($ln !== "") $names[] = $ln;

      // Populate Teams for Match Play
      if ($isPairPair) {
          $fp = strtoupper(trim(strval($r["dbPlayers_FlightPos"] ?? "")));
          // Heuristic: A/1 => Team A; B/2 => Team B
          if ($fp === "A" || $fp === "1") $teamA[] = $ln;
          else if ($fp === "B" || $fp === "2") $teamB[] = $ln;
      }
    }

    // Title logic
    if ($isSingleton) {
      $displayTitle = "Unpaired";
    } else {
      $displayTitle = $isPairPair ? ($isFlightGroup ? "Match " . $id : "Pairing " . $id) : ("Group " . $id);
    }

    $out[] = [
      "id" => $id,
      "displayTitle" => $displayTitle,
      "isFlightGroup" => $isFlightGroup,
      "pairingIds" => array_values(array_keys($pairingIdsSet)),
      "size" => count($rows),
      "teeTime" => $teeTime,
      "startHole" => $startHole,
      "startHoleSuffix" => (strtolower(strval($meta["toMethod"] ?? "")) === "shotgun") ? $suffix : "",
      "playerLastNames" => $names,
      "teamA" => $teamA,
      "teamB" => $teamB,
    ];
  }

  usort($out, fn($a, $b) => strval($a["id"] ?? "") <=> strval($b["id"] ?? ""));
  return $out;
}