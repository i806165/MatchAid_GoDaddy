<?php
declare(strict_types=1);

// /public_html/services/database/service_dbGames.php
// db_Games access for Admin pages.
// Existing methods preserved; new save/get helpers added for Game Maintenance.

require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceDbGames
{
  // -----------------------------
  // Existing Admin Games List APIs
  // -----------------------------
public static function queryGames(PDO $pdo, array $args): array {
  // New-contract inputs (preferred)
  $clubId   = trim((string)($args["clubId"] ?? ""));
  $dateFrom = trim((string)($args["dateFrom"] ?? ""));
  $dateTo   = trim((string)($args["dateTo"] ?? ""));
  $adminScope = strtoupper(trim((string)($args["adminScope"] ?? "")));
  if (!in_array($adminScope, ["ME", "ALL", "CUSTOM"], true)) $adminScope = "";

  $selectedKeys = $args["selectedAdminKeys"] ?? [];
  if (!is_array($selectedKeys)) $selectedKeys = [];
  $selectedKeys = array_values(array_unique(array_filter(array_map("strval", $selectedKeys))));

  // Legacy inputs (fallback)
  $adminGhin = trim((string)($args["adminGhin"] ?? ""));
  $bucket    = trim((string)($args["bucket"] ?? "")); // current|past

  // Decide whether to run "new" logic:
  $hasNew = ($clubId !== "" || $dateFrom !== "" || $dateTo !== "" || $adminScope !== "" || !empty($selectedKeys));

  $today = (new DateTime("today", new DateTimeZone("America/New_York")))->format("Y-m-d");

  $where = [];
  $params = [];

  if ($hasNew) {
    // Club constraint (recommended)
    if ($clubId !== "") {
      $where[] = "dbGames_AdminClubID = :clubId";
      $params[":clubId"] = $clubId;
    }

    // Date range (inclusive)
    if ($dateFrom !== "" && $dateTo !== "") {
      $where[] = "dbGames_PlayDate BETWEEN :df AND :dt";
      $params[":df"] = $dateFrom;
      $params[":dt"] = $dateTo;
    } else if ($dateFrom !== "") {
      $where[] = "dbGames_PlayDate >= :df";
      $params[":df"] = $dateFrom;
    } else if ($dateTo !== "") {
      $where[] = "dbGames_PlayDate <= :dt";
      $params[":dt"] = $dateTo;
    }

    // Admin filter semantics:
    // - adminScope=ALL => NO admin filter
    // - otherwise, if selectedKeys present => IN (...)
    // - otherwise, if legacy adminGhin present => equals
    if ($adminScope !== "ALL") {
      if (!empty($selectedKeys)) {
        $in = [];
        foreach ($selectedKeys as $i => $k) {
          $ph = ":a{$i}";
          $in[] = $ph;
          $params[$ph] = $k;
        }
        $where[] = "dbGames_AdminGHIN IN (" . implode(",", $in) . ")";
      } else if ($adminGhin !== "") {
        $where[] = "dbGames_AdminGHIN = :admin";
        $params[":admin"] = $adminGhin;
      }
    }

    // Sort direction: if the selected window ends before today, show newest first
    $sortPast = ($dateTo !== "" && $dateTo < $today);
    $orderDir = $sortPast ? "DESC" : "ASC";

    $sql = "SELECT * FROM db_Games";
    if ($where) $sql .= " WHERE " . implode(" AND ", $where);
    $sql .= " ORDER BY dbGames_PlayDate {$orderDir}, dbGames_PlayTime ASC";
  } else {
    // Legacy behavior (bucket + adminGhin)
    $bucket = ($bucket === "past") ? "past" : "current";

    if ($adminGhin !== "") {
      $where[] = "dbGames_AdminGHIN = :admin";
      $params[":admin"] = $adminGhin;
    }

    if ($bucket === "past") {
      $where[] = "dbGames_PlayDate < :today";
    } else {
      $where[] = "dbGames_PlayDate >= :today";
    }
    $params[":today"] = $today;

    $sql = "SELECT * FROM db_Games";
    if ($where) $sql .= " WHERE " . implode(" AND ", $where);
    $sql .= " ORDER BY dbGames_PlayDate " . ($bucket === "past" ? "DESC" : "ASC") . ", dbGames_PlayTime ASC";
  }

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll() ?: [];

  // View model formatting (kept for compatibility)
  $vm = array_map(function($r){
    $playDate = (string)($r["dbGames_PlayDate"] ?? "");
    $playTime = (string)($r["dbGames_PlayTime"] ?? "");
    return [
      "ggid" => (int)($r["dbGames_GGID"] ?? 0),
      "title" => (string)($r["dbGames_Title"] ?? ""),
      "playDate" => $playDate,
      "playTimeText" => substr($playTime, 0, 5),
      "facilityName" => (string)($r["dbGames_FacilityName"] ?? ""),
      "courseName" => (string)($r["dbGames_CourseName"] ?? ""),
      "adminName" => (string)($r["dbGames_AdminName"] ?? ""),
      "adminGHIN" => (string)($r["dbGames_AdminGHIN"] ?? "")
    ];
  }, $rows);

  return [
    "games" => [
      "vm"  => $vm,
      "raw" => $rows
    ]
  ];
}


  public static function queryAdmins(PDO $pdo, array $args): array {
    // Placeholder: admin list is handled elsewhere in your stack.
    return [];
  }

  // -----------------------------
  // Game Maintenance Helpers
  // -----------------------------

  public static function getGameByGGID(PDO $pdo, int $ggid): ?array
  {
    $stmt = $pdo->prepare("SELECT * FROM db_Games WHERE dbGames_GGID = :ggid LIMIT 1");
    $stmt->execute([":ggid" => $ggid]);
    $row = $stmt->fetch();
    return $row ? $row : null;
  }

  public static function saveGame(PDO $pdo, string $mode, array $patch, array $sessionCtx): array
  {
    $mode = strtolower($mode) === "add" ? "add" : "edit";

    // Load existing or create shell
    if ($mode === "edit") {
      $ggid = (int)($sessionCtx["ggid"] ?? 0);
      if ($ggid <= 0) throw new RuntimeException("Missing GGID in session context.");
      $existing = self::getGameByGGID($pdo, $ggid);
      if (!$existing) throw new RuntimeException("Game not found.");
      $base = $existing;
    } else {
      $ggid = 0;
      $base = [];
    }

    // Apply patch (allowlist)
    $updated = self::applyPatch($base, $patch);

    // Normalize PlayDate (store as YYYY-MM-DD)
    if (!empty($updated["dbGames_PlayDate"])) {
      $updated["dbGames_PlayDate"] = self::normalizeDateYMD((string)$updated["dbGames_PlayDate"]);
    }

    // Normalize PlayTime (store as HH:MM:SS)
    self::normalizePlayTime($updated);

    if ($mode === "add") {
      self::applyDefaultsForAdd($updated, $sessionCtx);

      // Enforce HCEffectivity contract (no Latest; date must be set)
      self::enforceHcEffectivity($updated);

      // Build TeeTimeList after defaults + normalization
      $updated["dbGames_TeeTimeList"] = self::buildTeeTimeList(
        (string)($updated["dbGames_PlayTime"] ?? "08:00:00"),
        (int)($updated["dbGames_TeeTimeCnt"] ?? 16),
        (int)($updated["dbGames_TeeTimeInterval"] ?? 9)
      );

      $newGGID = self::insertGame($pdo, $updated);
      $saved = self::getGameByGGID($pdo, $newGGID) ?? $updated;
      $saved["dbGames_GGID"] = $newGGID;
      return ["ggid" => $newGGID, "game" => $saved, "mode" => "edit"];
    }

    // edit: enforce rules + derived fields
    self::enforceHcEffectivity($updated);

    $updated["dbGames_TeeTimeList"] = self::buildTeeTimeList(
      (string)($updated["dbGames_PlayTime"] ?? "08:00:00"),
      (int)($updated["dbGames_TeeTimeCnt"] ?? 16),
      (int)($updated["dbGames_TeeTimeInterval"] ?? 9)
    );

    // edit
    self::updateGame($pdo, $ggid, $updated);
    $saved = self::getGameByGGID($pdo, $ggid) ?? $updated;
    $saved["dbGames_GGID"] = $ggid;
    return ["ggid" => $ggid, "game" => $saved, "mode" => "edit"];
  }

  private static function applyPatch(array $base, array $patch): array
  {
    $allow = [
      "dbGames_Title",
      "dbGames_PlayDate",
      "dbGames_PlayTime",
      "dbGames_TeeTimeCnt",
      "dbGames_TeeTimeInterval",
      "dbGames_Holes",
      "dbGames_Privacy",
      "dbGames_Comments",
      "dbGames_HCEffectivity",
      "dbGames_HCEffectivityDate",
      "dbGames_FacilityID",
      "dbGames_FacilityName",
      "dbGames_CourseID",
      "dbGames_CourseName",
    ];

    foreach ($allow as $k) {
      if (array_key_exists($k, $patch)) {
        $base[$k] = $patch[$k];
      }
    }


    return $base;
  }

  private static function applyDefaultsForAdd(array &$g, array $ctx): void
  {
    // UI usually supplies PlayDate, but defaulting keeps DB constraints happy
    if (empty($g["dbGames_PlayDate"])) {
      $g["dbGames_PlayDate"] = (new DateTime("today", new DateTimeZone("America/New_York")))->format("Y-m-d");
    }

    $g["dbGames_AdminGHIN"] = (string)($ctx["adminGhin"] ?? "");
    $g["dbGames_AdminName"] = (string)($ctx["adminName"] ?? "");

    // Stamp assoc/club identity (Wix parity)
    if (empty($g["dbGames_AdminAssocID"]) && !empty($ctx["adminAssocId"])) $g["dbGames_AdminAssocID"] = (string)$ctx["adminAssocId"];
    if (empty($g["dbGames_AdminAssocName"]) && !empty($ctx["adminAssocName"])) $g["dbGames_AdminAssocName"] = (string)$ctx["adminAssocName"];
    if (empty($g["dbGames_AdminClubID"]) && !empty($ctx["adminClubId"])) $g["dbGames_AdminClubID"] = (string)$ctx["adminClubId"];
    if (empty($g["dbGames_AdminClubName"]) && !empty($ctx["adminClubName"])) $g["dbGames_AdminClubName"] = (string)$ctx["adminClubName"];

    // Required hidden defaults from spec / legacy
    $g["dbGames_Allowance"] = $g["dbGames_Allowance"] ?? 100;
    $g["dbGames_BestBall"] = $g["dbGames_BestBall"] ?? "4";
    $g["dbGames_PlayerDeclaration"] = $g["dbGames_PlayerDeclaration"] ?? "11";
    $g["dbGames_Segments"] = $g["dbGames_Segments"] ?? "9";

    // Ensure stepper fields exist (stored as text in schema)
    $g["dbGames_TeeTimeCnt"] = $g["dbGames_TeeTimeCnt"] ?? "16";
    $g["dbGames_TeeTimeInterval"] = $g["dbGames_TeeTimeInterval"] ?? "9";

    // Ensure a PlayTime exists (stored as TIME)
    if (empty($g["dbGames_PlayTime"])) {
      $g["dbGames_PlayTime"] = "08:00:00";
    }

    // Legacy defaults (match Wix orchestrator)
    $g["dbGames_TOMethod"] = $g["dbGames_TOMethod"] ?? "TeeTimes";
    $g["dbGames_GameFormat"] = $g["dbGames_GameFormat"] ?? "StrokePlay";
    $g["dbGames_ScoringBasis"] = $g["dbGames_ScoringBasis"] ?? "Strokes";
    $g["dbGames_ScoringMethod"] = $g["dbGames_ScoringMethod"] ?? "NET";
    $g["dbGames_Competition"] = $g["dbGames_Competition"] ?? "PairField";
    $g["dbGames_RotationMethod"] = $g["dbGames_RotationMethod"] ?? "None";
    $g["dbGames_HCMethod"] = $g["dbGames_HCMethod"] ?? "CH";
    $g["dbGames_ScoringSystem"] = $g["dbGames_ScoringSystem"] ?? "BestBall";
    $g["dbGames_StrokeDistribution"] = $g["dbGames_StrokeDistribution"] ?? "Standard";
    $g["dbGames_BlindPlayers"] = $g["dbGames_BlindPlayers"] ?? "[]";
    $g["dbGames_HoleDeclaration"] = $g["dbGames_HoleDeclaration"] ?? "[]";
    $g["dbGames_StablefordPoints"] = $g["dbGames_StablefordPoints"] ?? "[]";
    $g["dbGames_TeeTimeList"] = $g["dbGames_TeeTimeList"] ?? "[]";

    // Handicap defaults (new contract)
    $g["dbGames_HCEffectivity"] = $g["dbGames_HCEffectivity"] ?? "PlayDate";

    // Visibility / holes defaults
    $g["dbGames_Privacy"] = $g["dbGames_Privacy"] ?? "Club";
    $g["dbGames_Holes"] = $g["dbGames_Holes"] ?? "All 18";

    // Comments should exist (avoid null surprises downstream)
    if (!array_key_exists("dbGames_Comments", $g) || $g["dbGames_Comments"] === null) {
      $g["dbGames_Comments"] = "";
    }
  }

  // -----------------------------
  // Normalization + rules
  // -----------------------------

  private static function normalizeDateYMD(string $s): string
  {
    $s = trim($s);
    if ($s === "") return "";

    // Accept YYYY-MM-DD, YYYY-MM-DDTHH:MM..., or YYYY-MM-DD HH:MM...
    $s10 = substr($s, 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s10)) {
      throw new RuntimeException("Invalid PlayDate format; expected YYYY-MM-DD.");
    }
    return $s10;
  }

  private static function normalizePlayTime(array &$g): void
  {
    if (!empty($g["dbGames_PlayTime"])) {
      $t = (string)$g["dbGames_PlayTime"];
      if (preg_match('/^\d{2}:\d{2}$/', $t)) $g["dbGames_PlayTime"] = $t . ":00";
      if (preg_match('/^\d{2}:\d{2}:\d{2}\.\d+$/', $t)) $g["dbGames_PlayTime"] = substr($t, 0, 8);
    }
  }


  private static function enforceHcEffectivity(array &$g): void
  {
    $playDate = trim((string)($g["dbGames_PlayDate"] ?? ""));
    if ($playDate !== "") {
      $playDate = self::normalizeDateYMD($playDate);
      $g["dbGames_PlayDate"] = $playDate;
    }

    $eff = trim((string)($g["dbGames_HCEffectivity"] ?? ""));
    $dt  = trim((string)($g["dbGames_HCEffectivityDate"] ?? ""));

    if ($eff !== "Date") {
      // New contract: default/force PlayDate
      $g["dbGames_HCEffectivity"] = "PlayDate";
      $g["dbGames_HCEffectivityDate"] = $playDate;
      return;
    }

    // eff == Date
    if ($dt === "") $dt = $playDate;
    $dt = self::normalizeDateYMD($dt);
    if ($playDate !== "" && $dt > $playDate) $dt = $playDate; // clamp
    $g["dbGames_HCEffectivityDate"] = $dt;
  }

  private static function insertGame(PDO $pdo, array $g): int
  {
    // Build insert columns from $g, but exclude null GGID.
    // Keep it safe by inserting only known keys present in $g.
    $cols = [];
    $vals = [];
    $params = [];

    foreach ($g as $k => $v) {
      if ($k === "dbGames_GGID") continue;
      if (!str_starts_with($k, "dbGames_")) continue;
      $cols[] = $k;
      $vals[] = ":" . $k;
      $params[":" . $k] = $v;
    }

    if (!$cols) throw new RuntimeException("No fields to insert.");

    $sql = "INSERT INTO db_Games (" . implode(",", $cols) . ") VALUES (" . implode(",", $vals) . ")";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return (int)$pdo->lastInsertId();
  }

  private static function updateGame(PDO $pdo, int $ggid, array $g): void
  {
    $sets = [];
    $params = [":ggid" => $ggid];

    foreach ($g as $k => $v) {
      if ($k === "dbGames_GGID") continue;
      if (!str_starts_with($k, "dbGames_")) continue;
      $sets[] = "$k = :" . $k;
      $params[":" . $k] = $v;
    }

    if (!$sets) return;

    $sql = "UPDATE db_Games SET " . implode(", ", $sets) . " WHERE dbGames_GGID = :ggid LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
  }

  private static function buildTeeTimeList(string $playTime, int $cnt, int $intervalMin): string
  {
    // Returns JSON array of strings to match legacy storage
    $cnt = max(1, $cnt);
    $intervalMin = max(1, $intervalMin);

    $m = [];
    if (!preg_match('/^(\d{2}):(\d{2})/', $playTime, $m)) {
      return "[]";
    }

    $hh = (int)$m[1];
    $mm = (int)$m[2];

    $base = new DateTimeImmutable("2000-01-01 " . sprintf("%02d:%02d:00", $hh, $mm), new DateTimeZone("America/New_York"));

    $out = [];
    for ($i=0; $i<$cnt; $i++) {
      $t = $base->modify("+" . ($i * $intervalMin) . " minutes");
      $out[] = $t->format("h:i A"); // "08:00 AM"
    }

    return json_encode($out);
  }
}
