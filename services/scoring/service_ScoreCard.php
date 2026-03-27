<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreCard.php

/**
 * ServiceScoreCard
 * Pure scorecard builder logic (no echo/header/exit).
 * Ported from Wix reusable module patterns.
 */
final class ServiceScoreCard {

  // ==========================================================================
  // 1. Public Payload Builders
  // ==========================================================================

  /**
   * Build blank scorecard payload for pre-round printing.
   */
  public static function buildBlankScorecardPayload(array $gameRow, array $players): array {
    if (!$gameRow) throw new RuntimeException("buildBlankScorecardPayload: missing gameRow");
    $players = is_array($players) ? $players : [];

    $groupingMode = self::determineGroupingModeFromGame($gameRow);
    $groupsMap = self::buildGroupsMap($players, $groupingMode);
    $groupIds = self::buildGroupIds($groupsMap);

    $rows = [];
    foreach ($groupIds as $id) {
      $playersInGroup = self::sortPlayersForScorecard($groupsMap[$id] ?? []);
      $rows[] = self::buildGroupRowPayload($gameRow, $playersInGroup, $id, $groupingMode);
    }

    return [
      "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
      "grouping" => $groupingMode,
      "rows" => $rows
    ];
  }

  // ==========================================================================
  // 2. Scorecard Scope Orchestration
  // ==========================================================================

  private static function determineGroupingModeFromGame(array $gameRow): string {
    return (trim((string)($gameRow["dbGames_Competition"] ?? "")) === "PairPair") ? "flight" : "pairing";
  }

  public static function buildGroupsMap(array $players, string $mode): array {
    $map = [];
    foreach ($players as $p) {
      $id = ($mode === "flight") ? self::normStr($p["dbPlayers_FlightID"] ?? "", "1") : self::normStr($p["dbPlayers_PairingID"] ?? "", "000");
      if (!isset($map[$id])) $map[$id] = [];
      $map[$id][] = $p;
    }
    return $map;
  }

  public static function buildGroupIds(array $map): array {
    $keys = array_keys($map);
    usort($keys, fn($a, $b) => strcmp((string)$a, (string)$b));
    return $keys;
  }

  public static function sortPlayersForScorecard(array $players): array {
    usort($players, function($a, $b) {
      $aFlight = self::normStr($a["dbPlayers_FlightID"] ?? "", "ZZZ");
      $bFlight = self::normStr($b["dbPlayers_FlightID"] ?? "", "ZZZ");
      if ($aFlight !== $bFlight) return strcmp($aFlight, $bFlight);
      $aPairPos = self::normInt($a["dbPlayers_PairingPos"] ?? null, 999);
      $bPairPos = self::normInt($b["dbPlayers_PairingPos"] ?? null, 999);
      if ($aPairPos !== $bPairPos) return $aPairPos <=> $bPairPos;
      return strcmp(self::normStr($a["dbPlayers_LName"] ?? ""), self::normStr($b["dbPlayers_LName"] ?? ""));
    });
    return $players;
  }

  // ==========================================================================
  // 3. Header and Meta Assembly
  // ==========================================================================

  private static function buildCourseName(array $gameRow): string {
    $fac = trim((string)($gameRow["dbGames_FacilityName"] ?? ""));
    $crs = trim((string)($gameRow["dbGames_CourseName"] ?? ""));
    return preg_replace('/\b(.+)\b \1/', '$1', trim("$fac $crs"));
  }

  private static function buildGameHeader(array $gameRow, array $firstPlayer, string $courseName): array {
    return array_merge($gameRow, [
      "gameTitle" => (string)($gameRow["dbGames_Title"] ?? ""),
      "GGID" => (string)($gameRow["dbGames_GGID"] ?? ""),
      "courseName" => $courseName,
      "playDate" => (string)($gameRow["dbGames_PlayDate"] ?? ""),
      "holesPlayed" => (string)($gameRow["dbGames_Holes"] ?? "All 18"),
      "playerKey" => (string)($firstPlayer["dbPlayers_PlayerKey"] ?? ""),
    ]);
  }

  // ==========================================================================
  // 4. Course Info Assembly
  // ==========================================================================

  public static function getCourseInfoMap(array $gameRow, array $player): array {
    $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
    $holes = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? []) : [];
    $teeSetId = $player["dbPlayers_TeeSetID"] ?? null;
    $teeSetLabel = $player["dbPlayers_TeeSetName"] ?? null;
    $gender = $player["dbPlayers_Gender"] ?? null;

    $map = [];
    foreach ($holes as $h) {
      if (!is_array($h)) continue;
      $hole = intval($h["Number"] ?? $h["number"] ?? 0);
      if ($hole > 0) {
        $map[$hole] = [
          "par" => $h["Par"] ?? $h["par"] ?? null,
          "hcp" => $h["Allocation"] ?? $h["allocation"] ?? null,
          "yardage" => $h["Length"] ?? $h["length"] ?? null,
          "teeSetId" => $teeSetId,
          "teeSetLabel" => $teeSetLabel,
          "gender" => $gender,
        ];
      }
    }

    $spinSize = 6;
    $numSpins = (int)ceil(18 / $spinSize);
    for ($spinIndex=0;$spinIndex<$numSpins;$spinIndex++){
      $start = $spinIndex*$spinSize + 1;
      $end = min(($spinIndex+1)*$spinSize, 18);
      $spin = [];
      foreach ($map as $hn=>$data){
        if ($hn >= $start && $hn <= $end) $spin[$hn] = $data;
      }
      uasort($spin, function($a,$b){
        $ah = intval($a["hcp"] ?? 100);
        $bh = intval($b["hcp"] ?? 100);
        return $ah <=> $bh;
      });
      $rank=1;
      foreach ($spin as $hn=>$data){
        $map[$hn]["hcpSpin"] = $rank;
        $rank++;
      }
    }

    $rotation = (string)($gameRow["dbGames_RotationMethod"] ?? "");
    $strokeDist = (string)($gameRow["dbGames_StrokeDistribution"] ?? "Standard");
    if ($rotation === "COD" && $strokeDist !== "Standard") {
      foreach ($map as $hn=>$data){
        $map[$hn]["hcp"] = $data["hcpSpin"] ?? $data["hcp"];
      }
    }
    return $map;
  }

  public static function getTeeSetIdsUsed(array $playersInGroup): array {
    $set = [];
    foreach ($playersInGroup as $p) {
      $id = trim((string)($p["dbPlayers_TeeSetID"] ?? ""));
      if ($id !== "") $set[$id] = true;
    }
    return $set;
  }

  public static function filterCourseRowsToTeeSetsUsed(array $courseRows, array $teeSetIdsUsedSet): array {
    $out = [];
    foreach ($courseRows as $row) {
      $label = (string)($row["label"] ?? "");
      if ($label === "Par" || $label === "HCP") {
        $out[] = $row;
        continue;
      }
      $teeSetId = (string)($row["teeSetId"] ?? "");
      if ($teeSetId !== "" && isset($teeSetIdsUsedSet[$teeSetId])) {
        $out[] = $row;
      }
    }
    return $out;
  }

  public static function buildCourseInfoTableRows(array $gameRow, array $players): array {
    $holesStd = self::holesStandard();
    $allYards = []; $allHcp = []; $allPar = [];

    foreach ($players as $player) {
      $teeSetID = $player["dbPlayers_TeeSetID"] ?? null;
      $teeLabel = $player["dbPlayers_TeeSetName"] ?? null;
      $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
      if (!$teeSetID || !$teeLabel || !is_array($teeDetails)) continue;

      $courseMap = self::getCourseInfoMap($gameRow, $player);
      $yardages = []; $pars = []; $hcp = [];
      foreach ($courseMap as $hole => $info) {
        $h = intval($hole);
        $yardages[$h] = $info["yardage"] ?? 0;
        $pars[$h] = $info["par"] ?? 0;
        $hcp[$h] = $info["hcp"] ?? 0;
      }

      $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
      $gender = (string)($player["dbPlayers_Gender"] ?? "Unknown");
      $ratings = is_array($teeDetails["Ratings"] ?? null) ? $teeDetails["Ratings"] : ($teeDetails["ratings"] ?? []);
      $ratingEntry = null;
      foreach ($ratings as $r) {
        $rt = $r["RatingType"] ?? $r["rating_type"] ?? "";
        if ($holesToPlay === "F9" && $rt === "Front") $ratingEntry = $r;
        else if ($holesToPlay === "B9" && $rt === "Back") $ratingEntry = $r;
        else if (!in_array($holesToPlay, ["F9","B9"]) && $rt === "Total") $ratingEntry = $r;
      }
      $slope = floatval($ratingEntry["SlopeRating"] ?? $ratingEntry["slope_rating"] ?? 0);
      $rating = floatval($ratingEntry["CourseRating"] ?? $ratingEntry["course_rating"] ?? 0);

      $allYards[] = self::buildCourseRow((string)$teeLabel, (string)$teeSetID, "Yards", array_map(fn($h)=> (string)($yardages[$h] ?? 0), $holesStd), self::splitTotalFromMap($yardages), "Yards", 1, $slope, $rating, $gender);
      $allHcp[] = self::buildCourseRow("HCP", (string)$teeSetID, "HCP", array_map(fn($h)=> (string)($hcp[$h] ?? 0), $holesStd), self::splitTotalFromMap($hcp), "HCP", 2, $slope, $rating, $gender);
      $allPar[] = self::buildCourseRow("Par", (string)$teeSetID, "Par", array_map(fn($h)=> (string)($pars[$h] ?? 0), $holesStd), self::splitTotalFromMap($pars), "Par", 3, $slope, $rating, $gender);
    }

    $dedupY = self::dedupeCourseRows($allYards);
    $dedupH = self::dedupeCourseRows($allHcp);
    $dedupP = self::dedupeCourseRows($allPar);

    $final = [];
    foreach ($dedupY as $yardRow) {
      $teeSetId = (string)($yardRow["teeSetId"] ?? "");
      $final[] = $yardRow;
      if (count($dedupH) > 1) { foreach ($dedupH as $r) if ((string)($r["teeSetId"] ?? "") === $teeSetId) { $final[] = $r; break; } }
      if (count($dedupP) > 1) { foreach ($dedupP as $r) if ((string)($r["teeSetId"] ?? "") === $teeSetId) { $final[] = $r; break; } }
    }
    if (count($dedupP) === 1) $final[] = $dedupP[0];
    if (count($dedupH) === 1) $final[] = $dedupH[0];

    return $final;
  }

  private static function buildCourseRow(string $label, string $teeSetId, string $teeLabel, array $values, array $totals, string $lineType, int $lineSeq, float $slope, float $rating, string $gender): array {
    $row = [
      "rowType" => "Course",
      "label" => $label,
      "tee" => $teeLabel,
      "teeSetId" => $teeSetId,
      "cols" => array_map('strval', $values),
      "lineType" => $lineType,
      "lineSeq" => $lineSeq,
      "slope" => $slope,
      "rating" => $rating,
      "gender" => $gender,
    ];
    foreach (self::holesStandard() as $num) {
      $row["h".$num] = (string)($values[$num-1] ?? "");
    }
    $subtotalFields = ["3a","3b","3c","3d","3e","3f","6a","6b","6c","9a","9b","9c"];
    foreach ($subtotalFields as $k) {
      $row[$k] = ($label === "HCP") ? "" : (string)($totals[$k] ?? "-");
    }
    return $row;
  }

  private static function dedupeCourseRows(array $courseRows): array {
    $grouped = [];
    foreach ($courseRows as $row) {
      $key = (string)($row["label"] ?? "");
      if (!isset($grouped[$key])) $grouped[$key] = [];
      $grouped[$key][] = $row;
    }
    $result = [];
    foreach ($grouped as $rows) {
      $unique = [];
      foreach ($rows as $r) {
        $found = false;
        foreach ($unique as $u) { if (self::courseRowEquals($u, $r)) { $found = true; break; } }
        if (!$found) $unique[] = $r;
      }
      foreach ($unique as $u) $result[] = $u;
    }
    return $result;
  }

  private static function courseRowEquals(array $a, array $b): bool {
    foreach (self::holesStandard() as $h) {
      if (($a["h".$h] ?? null) !== ($b["h".$h] ?? null)) return false;
    }
    return true;
  }

  private static function splitTotalFromMap(array $kpiMap): array {
    $vals = [];
    foreach (self::holesStandard() as $i) $vals[] = intval($kpiMap[$i] ?? 0);
    $sum = fn($arr) => array_sum($arr);

    return [
      "3a" => (string)$sum(array_slice($vals,0,3)),
      "3b" => (string)$sum(array_slice($vals,3,3)),
      "3c" => (string)$sum(array_slice($vals,6,3)),
      "3d" => (string)$sum(array_slice($vals,9,3)),
      "3e" => (string)$sum(array_slice($vals,12,3)),
      "3f" => (string)$sum(array_slice($vals,15,3)),
      "6a" => (string)$sum(array_slice($vals,0,6)),
      "6b" => (string)$sum(array_slice($vals,6,6)),
      "6c" => (string)$sum(array_slice($vals,12,6)),
      "9a" => (string)$sum(array_slice($vals,0,9)),
      "9b" => (string)$sum(array_slice($vals,9,9)),
      "9c" => (string)$sum($vals),
    ];
  }

  // ==========================================================================
  // 5. Player Scorecard Context Assembly
  // ==========================================================================

  public static function buildGroupRowPayload(array $gameRow, array $players, $groupId, string $mode): array {
    $first = $players[0] ?? [];
    $courseName = self::buildCourseName($gameRow);
    $teeSetIdsUsed = self::getTeeSetIdsUsed($players);
    $courseRows = self::filterCourseRowsToTeeSetsUsed(self::buildCourseInfoTableRows($gameRow, $players), $teeSetIdsUsed);
    return [
      "groupId" => (string)$groupId,
      "grouping" => $mode,
      "pairingID" => (string)($first["dbPlayers_PairingID"] ?? ""),
      "flightID" => (string)($first["dbPlayers_FlightID"] ?? ""),
      "teeTime" => (string)($first["dbPlayers_TeeTime"] ?? ""),
      "startHole" => (string)($first["dbPlayers_StartHole"] ?? ""),
      "courseInfo" => $courseRows,
      "players" => self::buildPlayersArray($players, $gameRow),
      "gameHeader" => self::buildGameHeader($gameRow, $first, $courseName),
    ];
  }

  public static function buildPlayersArray(array $playersInGroup, array $gameRow): array {
    $isAdjGross = (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")) === "ADJ GROSS");
    $out = [];
    foreach ($playersInGroup as $player) {
      $playerHC = self::calculateEffectiveHandicap($gameRow, $player);
      $strokes = [];
      if (!$isAdjGross && $playerHC != 0) {
        $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
        $teeHoles = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? []) : [];
        $allocMap = self::buildStrokeAllocationMap($gameRow, $playerHC, $teeHoles);
        foreach ($allocMap as $holeNum => $v) {
          if (intval($v) !== 0) $strokes["h".$holeNum] = intval($v);
        }
      }
      $out[] = array_merge($player, [
        "playerName" => (string)($player["dbPlayers_Name"] ?? ""),
        "playerHC" => $playerHC,
        "tee" => (string)($player["dbPlayers_TeeSetName"] ?? ""),
        "teeSetId" => trim((string)($player["dbPlayers_TeeSetID"] ?? "")),
        "strokes" => $strokes,
      ]);
    }
    return $out;
  }

  // ==========================================================================
  // 6. Handicap and Stroke Allocation
  // ==========================================================================

  public static function calculateEffectiveHandicap(array $gameRow, array $playerRow): float {
    if (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "")) === "ADJ GROSS") return 0.0;
    $useSO = str_starts_with(trim((string)($gameRow["dbGames_HCMethod"] ?? "CH")), "SO");
    $raw = $useSO ? ($playerRow["dbPlayers_SO"] ?? 0) : ($playerRow["dbPlayers_PH"] ?? 0);
    return is_numeric($raw) ? (float)$raw : 0.0;
  }

  public static function buildStrokeAllocationMap(array $gameRow, $playerHC, array $teeSetHoles = []): array {
    $holes = [];
    foreach ($teeSetHoles as $h) {
      if (!is_array($h)) continue;
      $holes[] = [
        "Number" => intval($h["Number"] ?? $h["number"] ?? 0),
        "Allocation" => intval($h["Allocation"] ?? $h["allocation"] ?? 99),
        "hcpSpin" => intval($h["hcpSpin"] ?? ($h["Allocation"] ?? $h["allocation"] ?? 99)),
      ];
    }
    $filtered = array_values(array_filter($holes, function($h) use ($gameRow){
      $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
      if ($holesToPlay === "F9") return $h["Number"] >= 1 && $h["Number"] <= 9;
      if ($holesToPlay === "B9") return $h["Number"] >= 10 && $h["Number"] <= 18;
      return true;
    }));
    $strokeMap = [];
    foreach ($holes as $h) $strokeMap[$h["Number"]] = 0;
    if (!is_numeric($playerHC) || floatval($playerHC) == 0) return $strokeMap;
    $hc = floatval($playerHC);
    $rotation = (string)($gameRow["dbGames_RotationMethod"] ?? "");
    $strokeMode = (string)($gameRow["dbGames_StrokeDistribution"] ?? "Standard");
    if ($rotation !== "COD" || $strokeMode === "Standard") {
      if ($hc < 0) {
        $giveBack = (int)abs($hc);
        usort($filtered, fn($a,$b) => $b["Allocation"] <=> $a["Allocation"]);
        for ($i=0;$i<$giveBack;$i++) if ($h = $filtered[$i % count($filtered)]) $strokeMap[$h["Number"]] = -1;
      } else {
        $base = (int)floor($hc / 18); $rem = (int)($hc % 18);
        foreach ($filtered as $h) $strokeMap[$h["Number"]] = $base;
        usort($filtered, fn($a,$b) => $a["Allocation"] <=> $b["Allocation"]);
        for ($i=0;$i<$rem;$i++) if ($h = $filtered[$i % count($filtered)]) $strokeMap[$h["Number"]] += 1;
      }
      return $strokeMap;
    }
    if ($rotation === "COD" && $strokeMode === "Balanced-Rounded") {
      $isPlus = ($hc < 0); $total = (int)abs($hc);
      $basePer = (int)floor($total / 3); $rem = $total % 3;
      $spins = [[],[],[]];
      foreach ($filtered as $h){
        if ($h["Number"] <= 6) $spins[0][]=$h; else if ($h["Number"] <= 12) $spins[1][]=$h; else $spins[2][]=$h;
      }
      foreach ($spins as $idx=>$spin){
        usort($spin, fn($a,$b) => $isPlus ? ($b["hcpSpin"] <=> $a["hcpSpin"]) : ($a["hcpSpin"] <=> $b["hcpSpin"]));
        $count = $basePer + ($idx < $rem ? 1 : 0);
        for ($i=0;$i<$count;$i++) if ($h = $spin[$i % count($spin)]) $strokeMap[$h["Number"]] += $isPlus ? -1 : 1;
      }
      return $strokeMap;
    }
    return $strokeMap;
  }

  // ==========================================================================
  // 7. Future Scorecard View-Model Adapters
  // ==========================================================================

  // Stubs for later in-play/post-play summary logic

  // ==========================================================================
  // 8. Generic Utility Helpers
  // ==========================================================================

  public static function normStr($v, string $fallback=""): string {
    $s = trim((string)($v ?? ""));
    return $s !== "" ? $s : $fallback;
  }

  public static function normInt($v, int $fallback=0): int {
    $s = trim((string)($v ?? ""));
    return is_numeric($s) ? (int)$s : $fallback;
  }

  private static function holesStandard(): array {
    return range(1, 18);
  }
}
