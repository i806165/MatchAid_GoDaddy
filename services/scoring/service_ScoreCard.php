<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreCard.php

/**
 * ServiceScoreCard
 * Pure scorecard builder logic (no echo/header/exit).
 * Ported from Wix reusable module patterns.
 */
final class ServiceScoreCard {

  private static function holesStandard(): array {
    return range(1, 18);
  }

  public static function acquireScorecardRosterFromPlayers(array $players, string $ggid): array {
    return ["ggid" => (string)$ggid, "players" => $players];
  }

  /**
   * Build blank scorecard payload.
   * Returns: ["competition"=>..., "grouping"=>..., "rows"=> [...]]
   */
  public static function buildBlankScorecardPayload(array $gameRow, array $players): array {
    if (!$gameRow) {
      throw new RuntimeException("buildBlankScorecardPayload: missing gameRow");
    }
    if (!is_array($players)) $players = [];

    $competition = trim((string)($gameRow["dbGames_Competition"] ?? "PairField")); // PairPair | PairField
    $grouping = ($competition === "PairPair") ? "flight" : "pairing";

    // 1) Group players
    $groupsMap = ($grouping === "flight")
      ? self::groupPlayersByFlight($players)
      : self::groupPlayersByPairing($players);

    // 2) Common course name formatting
    $facility = trim((string)($gameRow["dbGames_FacilityName"] ?? ""));
    $course = trim((string)($gameRow["dbGames_CourseName"] ?? ""));
    $rawCourseName = trim($facility . " " . $course);
    $courseName = preg_replace('/\b(.+)\b \1/', '$1', $rawCourseName);

    $rows = [];
    $groupIds = array_keys($groupsMap);
    usort($groupIds, fn($a,$b) => strcmp((string)$a, (string)$b));

    foreach ($groupIds as $groupId) {
      $playersInGroup = $groupsMap[$groupId] ?? [];

      // Sort stable: FlightID, FlightPos, PairingID, PairingPos, then last/name
      usort($playersInGroup, function($a,$b){
        $aFlight = self::normStr($a["dbPlayers_FlightID"] ?? "", "ZZZ");
        $bFlight = self::normStr($b["dbPlayers_FlightID"] ?? "", "ZZZ");
        if ($aFlight !== $bFlight) return strcmp($aFlight, $bFlight);

        $aFlightPos = self::normInt($a["dbPlayers_FlightPos"] ?? null, 999);
        $bFlightPos = self::normInt($b["dbPlayers_FlightPos"] ?? null, 999);
        if ($aFlightPos !== $bFlightPos) return $aFlightPos <=> $bFlightPos;

        $aPair = self::normStr($a["dbPlayers_PairingID"] ?? "", "ZZZ");
        $bPair = self::normStr($b["dbPlayers_PairingID"] ?? "", "ZZZ");
        if ($aPair !== $bPair) return strcmp($aPair, $bPair);

        $aPairPos = self::normInt($a["dbPlayers_PairingPos"] ?? null, 999);
        $bPairPos = self::normInt($b["dbPlayers_PairingPos"] ?? null, 999);
        if ($aPairPos !== $bPairPos) return $aPairPos <=> $bPairPos;

        $aName = self::normStr($a["dbPlayers_LName"] ?? ($a["dbPlayers_Name"] ?? ""), "ZZZ");
        $bName = self::normStr($b["dbPlayers_LName"] ?? ($b["dbPlayers_Name"] ?? ""), "ZZZ");
        return strcmp($aName, $bName);
      });

      $first = $playersInGroup[0] ?? [];
      $flightID = trim((string)($first["dbPlayers_FlightID"] ?? ""));
      $teeTime = trim((string)($first["dbPlayers_TeeTime"] ?? ""));

      $gameHeader = [
        "gameTitle" => (string)($gameRow["dbGames_Title"] ?? ""),
        "GGID" => (string)($gameRow["dbGames_GGID"] ?? ($gameRow["dbGames_GGIDNum"] ?? "")),
        "courseName" => (string)$courseName,
        "playDate" => (string)($gameRow["gameDateDDDMMDDYY"] ?? ($gameRow["dbGames_PlayDate"] ?? "")),
        "holesPlayed" => (string)($gameRow["dbGames_Holes"] ?? "All 18"),
        "summaryText" => (string)($gameRow["dbGames_SummaryText"] ?? ""),
        "playerKey" => (string)($first["dbPlayers_PlayerKey"] ?? ""),
      ];

      $teeSetIdsUsed = self::getTeeSetIdsUsed($playersInGroup);

      $courseInfoAllRows = self::buildCourseInfoTableRows($gameRow, $playersInGroup);
      $courseInfoFilteredRows = self::filterCourseRowsToTeeSetsUsed($courseInfoAllRows, $teeSetIdsUsed);

      $rows[] = [
        "competition" => $competition,
        "grouping" => $grouping,
        "groupId" => (string)$groupId,

        "pairingID" => trim((string)($first["dbPlayers_PairingID"] ?? ($groupId ?? ""))),
        "flightID" => $flightID,
        "teeTime" => $teeTime,

        "courseInfo" => $courseInfoFilteredRows,
        "players" => self::buildPlayersArray($playersInGroup, $gameRow),
        "gameHeader" => $gameHeader,
      ];
    }

    return ["competition" => $competition, "grouping" => $grouping, "rows" => $rows];
  }

  // ---------------- helpers ----------------

  private static function groupPlayersByFlight(array $players): array {
    $map = [];
    foreach ($players as $p) {
      $fid = trim((string)($p["dbPlayers_FlightID"] ?? ""));
      if ($fid === "") $fid = "1";
      if (!isset($map[$fid])) $map[$fid] = [];
      $map[$fid][] = $p;
    }
    return $map;
  }

  public static function groupPlayersByPairing(array $players): array {
    $map = [];
    foreach ($players as $p) {
      $pid = (string)($p["dbPlayers_PairingID"] ?? "000");
      if ($pid === "") $pid = "000";
      if (!isset($map[$pid])) $map[$pid] = [];
      $map[$pid][] = $p;
    }
    // stable order by PairingPos
    foreach ($map as &$arr) {
      usort($arr, fn($a,$b) => self::normInt($a["dbPlayers_PairingPos"] ?? 0,0) <=> self::normInt($b["dbPlayers_PairingPos"] ?? 0,0));
    }
    unset($arr);
    return $map;
  }

  private static function normStr($v, string $fallback=""): string {
    $s = trim((string)($v ?? ""));
    return $s !== "" ? $s : $fallback;
  }

  private static function normInt($v, int $fallback=0): int {
    $n = intval(trim((string)($v ?? "")));
    return is_numeric($v) ? $n : $fallback;
  }

  public static function getTeeSetIdsUsed(array $playersInGroup): array {
    $set = [];
    foreach ($playersInGroup as $p) {
      $id = trim((string)($p["dbPlayers_TeeSetID"] ?? ""));
      if ($id !== "") $set[$id] = true;
    }
    return $set; // associative set
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

  public static function buildPlayersArray(array $playersInGroup, array $gameRow): array {
    $scoringMethod = trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")); // NET | ADJ GROSS
    $hcMethod = trim((string)($gameRow["dbGames_HCMethod"] ?? "CH")); // CH | SO-*
    $isAdjGross = ($scoringMethod === "ADJ GROSS");

    $out = [];
    foreach ($playersInGroup as $player) {
      $tee = (string)($player["dbPlayers_TeeSetName"] ?? "");
      $playerHC = 0;

      if (!$isAdjGross) {
        $useSO = ($hcMethod === "SO" || str_starts_with($hcMethod, "SO"));
        $raw = $useSO ? ($player["dbPlayers_SO"] ?? 0) : ($player["dbPlayers_PH"] ?? 0);
        $playerHC = is_numeric($raw) ? floatval($raw) : 0;
      }

      $strokes = [];
      if (!$isAdjGross && $playerHC != 0) {
        $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
        $teeHoles = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? []) : [];
        $allocMap = self::buildStrokeAllocationMap($gameRow, $playerHC, $teeHoles);

        foreach ($allocMap as $holeNum => $v) {
          $num = intval($v);
          if ($num !== 0) $strokes["h".$holeNum] = $num;
        }
      }

      $out[] = [
        "playerName" => (string)($player["dbPlayers_Name"] ?? ""),
        "playerHC" => $playerHC,
        "tee" => $tee,
        "teeSetId" => trim((string)($player["dbPlayers_TeeSetID"] ?? "")),
        "playerKey" => (string)($player["dbPlayers_PlayerKey"] ?? ""),
        "strokes" => $strokes,
      ];
    }
    return $out;
  }

  // ---------------- Course table rows ----------------

  public static function buildCourseInfoTableRows(array $gameRow, array $players): array {
    $holesStd = self::holesStandard();
    $allYards = [];
    $allHcp = [];
    $allPar = [];

    foreach ($players as $player) {
      $teeSetID = $player["dbPlayers_TeeSetID"] ?? null;
      $teeLabel = $player["dbPlayers_TeeSetName"] ?? null;
      $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
      $holes = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? null) : null;
      if (!$teeSetID || !$teeLabel || !is_array($holes)) continue;

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
      $ratings = is_array($teeDetails) ? ($teeDetails["Ratings"] ?? []) : [];
      if (empty($ratings)) $ratings = is_array($teeDetails) ? ($teeDetails["ratings"] ?? []) : [];

      $ratingEntry = null;
      foreach ($ratings as $r) {
        if (!is_array($r)) continue;
        $rt = $r["RatingType"] ?? $r["rating_type"] ?? "";
        if ($holesToPlay === "F9" && $rt === "Front") $ratingEntry = $r;
        else if ($holesToPlay === "B9" && $rt === "Back") $ratingEntry = $r;
        else if ($holesToPlay !== "F9" && $holesToPlay !== "B9" && $rt === "Total") $ratingEntry = $r;
      }
      $slope = is_array($ratingEntry) ? floatval($ratingEntry["SlopeRating"] ?? $ratingEntry["slope_rating"] ?? 0) : 0;
      $rating = is_array($ratingEntry) ? floatval($ratingEntry["CourseRating"] ?? $ratingEntry["course_rating"] ?? 0) : 0;

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

      if (count($dedupH) > 1) {
        foreach ($dedupH as $r) if ((string)($r["teeSetId"] ?? "") === $teeSetId) { $final[] = $r; break; }
      }
      if (count($dedupP) > 1) {
        foreach ($dedupP as $r) if ((string)($r["teeSetId"] ?? "") === $teeSetId) { $final[] = $r; break; }
      }
    }

    if (count($dedupP) === 1) $final[] = $dedupP[0];
    if (count($dedupH) === 1) $final[] = $dedupH[0];

    return $final;
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
        foreach ($unique as $u) {
          if (self::courseRowEquals($u, $r)) { $found = true; break; }
        }
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

    $holesStd = self::holesStandard();
    foreach ($holesStd as $idx => $num) {
      $row["h".$num] = (string)($values[$idx] ?? "");
    }

    $subtotalFields = ["3a","3b","3c","3d","3e","3f","6a","6b","6c","9a","9b","9c"];
    foreach ($subtotalFields as $k) {
      $row[$k] = ($label === "HCP") ? "" : (string)($totals[$k] ?? "-");
    }
    return $row;
  }

  private static function splitTotalFromMap(array $kpiMap): array {
    $vals = [];
    for ($i=1;$i<=18;$i++) $vals[] = intval($kpiMap[$i] ?? 0);
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

    // spin-based hcp rank (default spin size 6)
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

  // ---------------- Stroke allocation (dots) ----------------

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
    $holes = array_values(array_filter($holes, fn($h) => $h["Number"] > 0));

    $strokeMap = [];
    foreach ($holes as $h) $strokeMap[$h["Number"]] = 0;

    $strokeMode = (string)($gameRow["dbGames_StrokeDistribution"] ?? "Standard");
    $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
    $rotation = (string)($gameRow["dbGames_RotationMethod"] ?? "");

    // Filter holes for F9/B9
    $filtered = array_values(array_filter($holes, function($h) use ($holesToPlay){
      if ($holesToPlay === "F9") return $h["Number"] >= 1 && $h["Number"] <= 9;
      if ($holesToPlay === "B9") return $h["Number"] >= 10 && $h["Number"] <= 18;
      return true;
    }));

    if (!is_numeric($playerHC) || floatval($playerHC) == 0) return $strokeMap;

    $hc = floatval($playerHC);

    // Standard allocation unless COD+nonstandard
    if ($rotation !== "COD" || $strokeMode === "Standard") {
      // Plus handicap: give back -1 to easiest holes
      if ($hc < 0) {
        $giveBack = (int)abs($hc);
        $sortedEasy = $filtered;
        usort($sortedEasy, fn($a,$b) => $b["Allocation"] <=> $a["Allocation"]); // 18..1
        for ($i=0;$i<$giveBack;$i++){
          $hole = $sortedEasy[$i % max(1,count($sortedEasy))] ?? null;
          if ($hole) $strokeMap[$hole["Number"]] = -1;
        }
        return $strokeMap;
      }

      $base = (int)floor($hc / 18);
      $remainder = (int)($hc % 18);

      foreach ($filtered as $h) $strokeMap[$h["Number"]] = $base;

      $sortedHardest = $filtered;
      usort($sortedHardest, fn($a,$b) => $a["Allocation"] <=> $b["Allocation"]); // 1..18
      for ($i=0;$i<$remainder;$i++){
        $hole = $sortedHardest[$i % max(1,count($sortedHardest))] ?? null;
        if ($hole) $strokeMap[$hole["Number"]] += 1;
      }
      return $strokeMap;
    }

    // Balanced-Rounded (COD + Balanced-Rounded)
    if ($rotation === "COD" && $strokeMode === "Balanced-Rounded") {
      $isPlus = ($hc < 0);
      $total = (int)abs($hc);
      $strokesPerSpin = (int)floor($total / 3);
      $extra = $total % 3;

      $spins = [[],[],[]];
      foreach ($filtered as $h){
        if ($h["Number"] >= 1 && $h["Number"] <= 6) $spins[0][] = $h;
        else if ($h["Number"] >= 7 && $h["Number"] <= 12) $spins[1][] = $h;
        else $spins[2][] = $h;
      }

      foreach ($spins as $idx=>$spin){
        $sorted = $spin;
        usort($sorted, function($a,$b) use ($isPlus){
          return $isPlus ? ($b["hcpSpin"] <=> $a["hcpSpin"]) : ($a["hcpSpin"] <=> $b["hcpSpin"]);
        });
        $count = $strokesPerSpin + ($idx < $extra ? 1 : 0);
        for ($i=0;$i<$count;$i++){
          $hole = $sorted[$i % max(1,count($sorted))] ?? null;
          if ($hole) $strokeMap[$hole["Number"]] += $isPlus ? -1 : 1;
        }
      }
      return $strokeMap;
    }

    // Balanced (non-rounded)
    if ($strokeMode === "Balanced") {
      $isPlus = ($hc < 0);
      $strokes = (int)abs($hc);
      $basePer = (int)floor($strokes / 3);
      $extra = $strokes % 3;

      $spins = [[],[],[]];
      foreach ($filtered as $h){
        if ($h["Number"] >= 1 && $h["Number"] <= 6) $spins[0][] = $h;
        else if ($h["Number"] >= 7 && $h["Number"] <= 12) $spins[1][] = $h;
        else $spins[2][] = $h;
      }

      foreach ($spins as $spin){
        $sorted = $spin;
        usort($sorted, function($a,$b) use ($isPlus){
          return $isPlus ? ($b["hcpSpin"] <=> $a["hcpSpin"]) : ($a["hcpSpin"] <=> $b["hcpSpin"]);
        });
        for ($i=0;$i<$basePer;$i++){
          $hole = $sorted[$i % max(1,count($sorted))] ?? null;
          if ($hole) $strokeMap[$hole["Number"]] += $isPlus ? -1 : 1;
        }
      }

      // distribute remainder to untouched holes hardest/easiest by Allocation
      $assigned = [];
      foreach ($strokeMap as $hn=>$val) if ($val != 0) $assigned[intval($hn)] = true;

      $remaining = array_values(array_filter($filtered, fn($h)=> !isset($assigned[$h["Number"]])));
      usort($remaining, function($a,$b) use ($isPlus){
        return $isPlus ? ($b["Allocation"] <=> $a["Allocation"]) : ($a["Allocation"] <=> $b["Allocation"]);
      });
      for ($i=0;$i<$extra;$i++){
        $hole = $remaining[$i] ?? null;
        if ($hole) $strokeMap[$hole["Number"]] += $isPlus ? -1 : 1;
      }
      return $strokeMap;
    }

    return $strokeMap;
  }
}
