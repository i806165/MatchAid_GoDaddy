<?php
// /api/game_times/hydrateGameTimes.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

/**
 * hydrateGameTimes_init
 * Returns INIT payload contract:
 *  { ok:true, payload:{ meta:{...}, groups:[...] }, message:"" }
 */
function hydrateGameTimes_init(string $ggid, array $userContext): array {
  $pdo = Db::pdo();

  // Load game row (minimal fields only)
  $stmt = $pdo->prepare("SELECT
      dbGames_GGID,
      dbGames_Title,
      dbGames_TOMethod,
      dbGames_Holes,
      dbGames_Competition,
      dbGames_PlayTime,
      dbGames_TeeTimeInterval,
      dbGames_TeeTimeCnt
    FROM db_Games
    WHERE dbGames_GGID = :ggid
    LIMIT 1");
  $stmt->execute([":ggid" => $ggid]);
  $game = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

  if (!$game) {
    return ["ok" => false, "message" => "Game not found for GGID.", "payload" => null];
  }

  // Load player rows required for grouping + schedule
  $stmt = $pdo->prepare("SELECT
      dbPlayers_PlayerGHIN,
      dbPlayers_Name,
      dbPlayers_LName,
      dbPlayers_PairingID,
      dbPlayers_FlightID,
      dbPlayers_FlightPos,
      dbPlayers_TeeTime,
      dbPlayers_StartHole,
      dbPlayers_StartHoleSuffix
    FROM db_Players
    WHERE dbPlayers_GGID = :ggid
    ORDER BY dbPlayers_FlightID, dbPlayers_PairingID, dbPlayers_FlightPos, dbPlayers_LName");
  $stmt->execute([":ggid" => $ggid]);
  $players = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $toMethod = strval($game["dbGames_TOMethod"] ?? "TeeTimes");
  $holesSetting = strval($game["dbGames_Holes"] ?? "All 18");
  $competition = strval($game["dbGames_Competition"] ?? "");

  $availableTimes = generateTimesPicklist(
    strval($game["dbGames_PlayTime"] ?? ""),
    intval($game["dbGames_TeeTimeInterval"] ?? 0),
    intval($game["dbGames_TeeTimeCnt"] ?? 0)
  );

  $availableHoles = generateHolesPicklist($holesSetting);
  $availableSuffixes = ["A","B","C","D"]; // canonical list (confirm if needs expansion)

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

  $groups = buildGroups($players, $meta);

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

/**
 * hydrateGameTimes_save
 * Persist assignments by pairingId(s). Parity rule: update ALL players in pairing for this GGID.
 */
function hydrateGameTimes_save(string $ggid, array $assignments): array {
  $pdo = Db::pdo();

  $sql = "UPDATE db_Players
          SET dbPlayers_TeeTime = :teeTime,
              dbPlayers_StartHole = :startHole,
              dbPlayers_StartHoleSuffix = :suffix
          WHERE dbPlayers_GGID = :ggid AND dbPlayers_PairingID = :pairingId";
  $stmt = $pdo->prepare($sql);

  $count = 0;
  foreach ($assignments as $a) {
    $pairingIds = is_array($a["pairingIds"] ?? null) ? $a["pairingIds"] : [];
    $teeTime = strval($a["teeTime"] ?? "");
    $startHole = strval($a["startHole"] ?? "");
    $suffix = strval($a["startHoleSuffix"] ?? "");

    foreach ($pairingIds as $pid) {
      $pidStr = strval($pid);
      if ($pidStr === "") continue;
      $stmt->execute([
        ":teeTime" => $teeTime,
        ":startHole" => $startHole,
        ":suffix" => $suffix,
        ":ggid" => $ggid,
        ":pairingId" => $pidStr,
      ]);
      $count += $stmt->rowCount();
    }
  }

  return ["ok" => true, "message" => "Saved.", "payload" => ["rowsAffected" => $count]];
}

// ---------------------------
// Helpers
// ---------------------------

function generateTimesPicklist(string $start, int $intervalMin, int $count): array {
  $start = trim($start);
  if ($start === "" || $intervalMin <= 0 || $count <= 0) return [];

  $dt = parseTimeToDateTime($start);
  if (!$dt) return [];

  $out = [];
  for ($i = 0; $i < $count; $i++) {
    $t = clone $dt;
    if ($i > 0) $t->modify(sprintf("+%d minutes", $i * $intervalMin));
    $out[] = $t->format("g:i A");
  }
  return $out;
}

function parseTimeToDateTime(string $s): ?DateTime {
  $s = trim($s);
  if ($s === "") return null;

  $fmts = ["g:i A", "g:ia", "h:i A", "H:i", "G:i"];
  foreach ($fmts as $f) {
    $dt = DateTime::createFromFormat($f, $s);
    if ($dt instanceof DateTime) return $dt;
  }
  return null;
}

function generateHolesPicklist(string $holesSetting): array {
  $hs = strtolower(trim($holesSetting));
  if ($hs === "f9" || $hs === "front" || $hs === "front 9") return range(1, 9);
  if ($hs === "b9" || $hs === "back" || $hs === "back 9") return range(10, 18);
  return range(1, 18);
}

/**
 * Build groups for INIT payload.
 * PairPair: group by FlightID when present else PairingID. PairField: group by PairingID.
 */
function buildGroups(array $players, array $meta): array {
  $competition = strval($meta["competition"] ?? "");
  $isPairPair = (strtolower($competition) === "pairpair");

  // helper: resolve group key for a player row
  $groupKeyFor = function(array $p) use ($isPairPair): string {
    $pid = strval($p["dbPlayers_PairingID"] ?? "");
    $fid = strval($p["dbPlayers_FlightID"] ?? "");
    if ($isPairPair && $fid !== "" && $fid !== "0") return "F:" . $fid;
    return "P:" . $pid;
  };

  $groups = [];
  foreach ($players as $p) {
    $k = $groupKeyFor($p);
    if (!isset($groups[$k])) $groups[$k] = [];
    $groups[$k][] = $p;
  }

  $out = [];
  $idx = 0;
  foreach ($groups as $k => $rows) {
    $idx++;

    $isFlightGroup = (strpos($k, "F:") === 0);
    $id = $isFlightGroup ? substr($k, 2) : substr($k, 2);

    // pairingIds included
    $pairingIdsSet = [];
    foreach ($rows as $r) {
      $pid = strval($r["dbPlayers_PairingID"] ?? "");
      if ($pid !== "") $pairingIdsSet[$pid] = true;
    }
    $pairingIds = array_values(array_keys($pairingIdsSet));

    // schedule fields: choose first non-empty among rows
    $teeTime = "";
    $startHole = "";
    $suffix = "";
    foreach ($rows as $r) {
      if ($teeTime === "" && trim(strval($r["dbPlayers_TeeTime"] ?? "")) !== "") $teeTime = trim(strval($r["dbPlayers_TeeTime"] ?? ""));
      if ($startHole === "" && trim(strval($r["dbPlayers_StartHole"] ?? "")) !== "") $startHole = trim(strval($r["dbPlayers_StartHole"] ?? ""));
      if ($suffix === "" && trim(strval($r["dbPlayers_StartHoleSuffix"] ?? "")) !== "") $suffix = trim(strval($r["dbPlayers_StartHoleSuffix"] ?? ""));
    }

    // names
    $teamA = [];
    $teamB = [];
    $names = [];

    foreach ($rows as $r) {
      $ln = trim(strval($r["dbPlayers_LName"] ?? $r["dbPlayers_Name"] ?? ""));
      if ($ln !== "") $names[] = $ln;

      $pos = strtoupper(trim(strval($r["dbPlayers_FlightPos"] ?? "")));
      // Heuristic parity with Wix: A/1/2 => Team A; B/3/4 => Team B
      if (in_array($pos, ["A","1","2"], true)) $teamA[] = $ln ?: $pos;
      else if (in_array($pos, ["B","3","4"], true)) $teamB[] = $ln ?: $pos;
    }

    $missingTeam = null;
    $isUnMatched = false;
    if ($isPairPair) {
      if (count($teamA) === 0) $missingTeam = "A";
      if (count($teamB) === 0) $missingTeam = "B";
      $isUnMatched = ($missingTeam !== null);
    }

    $displayTitle = $isPairPair ? ("Match " . $idx) : ("Group " . $idx);

    $out[] = [
      "id" => $id,
      "displayTitle" => $displayTitle,
      "isFlightGroup" => $isFlightGroup,
      "pairingIds" => $pairingIds,
      "size" => count($rows),
      "teeTime" => $teeTime,
      "startHole" => $startHole,
      "startHoleSuffix" => (strtolower(strval($meta["toMethod"] ?? "")) === "shotgun") ? $suffix : "",
      "teamA" => $teamA,
      "teamB" => $teamB,
      "missingTeam" => $missingTeam,
      "isUnMatched" => $isUnMatched,
      "playerLastNames" => $names,
    ];
  }

  // Stable ordering
  usort($out, function($a, $b) {
    return strval($a["id"] ?? "") <=> strval($b["id"] ?? "");
  });

  return $out;
}

// ---------------------------
// Endpoint handler (optional)
// ---------------------------
if (php_sapi_name() !== "cli") {
  header("Content-Type: application/json; charset=utf-8");

  try {
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
      http_response_code(401);
      echo json_encode(["ok" => false, "message" => "Not logged in."], JSON_UNESCAPED_SLASHES);
      exit;
    }

    $raw = file_get_contents("php://input") ?: "";
    $body = json_decode($raw, true);
    if (!is_array($body)) $body = [];

    $action = strtoupper(strval($body["action"] ?? "INIT"));
    $ggid = strval($body["ggid"] ?? ($_SESSION["SessionStoredGGID"] ?? ""));

    if ($ggid === "") throw new Exception("Missing GGID.");

    if ($action === "SAVE") {
      $assignments = is_array($body["assignments"] ?? null) ? $body["assignments"] : [];
      $saveRes = hydrateGameTimes_save($ggid, $assignments);
      if (empty($saveRes["ok"])) throw new Exception(strval($saveRes["message"] ?? "Save failed."));
      // return updated INIT after save (DB is truth)
      $initRes = hydrateGameTimes_init($ggid, $uc);
      echo json_encode($initRes, JSON_UNESCAPED_SLASHES);
      exit;
    }

    $initRes = hydrateGameTimes_init($ggid, $uc);
    echo json_encode($initRes, JSON_UNESCAPED_SLASHES);
    exit;

  } catch (Throwable $e) {
    Logger::error("[GAMETIMES_API_FAIL]", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => $e->getMessage()], JSON_UNESCAPED_SLASHES);
    exit;
  }
}
