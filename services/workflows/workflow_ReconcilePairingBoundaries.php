<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ReconcilePairingBoundaries.php
//
// Detect-and-correct pass for the team/flightKey boundary invariant that
// game_pairings.js's client-side clamps (assignSelectedPlayerToPairing,
// assignSelectedPairingToFlight) enforce at write time, but which can be
// silently broken by any OTHER write path that touches dbPlayers_TeamKey /
// dbPlayers_FlightKey after a pairing/match already exists — round-level
// Manage Teams / Define Flights (wired in below), the event-level cascade
// (on hold, revisit separately), and event-level pairings (on hold).
//
// No "who caused it" analysis, no partial fix — a violated pairing or
// match is fully reset: every member's pairingId/pairingPos/flightId/
// flightPos/teeTime/startHole/startHoleSuffix/playerKey are cleared,
// exactly the same 8 fields unpairGroup() clears client-side. One
// operation regardless of whether the violation was found at the pairing
// level or the match level — deliberately not split into "unpair" vs
// "unmatch": simpler to implement, simpler to reason about, per explicit
// direction ("unpair the group. much easier.").
//
// Stateless: this is a pure re-scan of current data, not a diff against
// prior state — there's no way to know WHICH player in a violating group
// actually caused the drift, so the whole group goes. Nominal overhead
// for a single game's ~100 player rows.

require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";

final class WorkflowReconcilePairingBoundaries
{
  private const RESET_FIELDS = [
    "dbPlayers_PairingID"       => "000",
    "dbPlayers_PairingPos"      => "",
    "dbPlayers_MatchID"         => "",
    "dbPlayers_MatchPos"        => "",
    "dbPlayers_TeeTime"         => "",
    "dbPlayers_StartHole"       => "",
    "dbPlayers_StartHoleSuffix" => "",
    "dbPlayers_PlayerKey"       => "",
  ];

  /**
   * Reconciles one game. Returns what was reset, for the caller to log or
   * surface — never a silent fix.
   *
   * @param  ?array $gameRow  Optional — pass the game's row if the caller
   *                          already has it (gamepairings.php, the
   *                          game_players flight-assignments save, and the
   *                          event cascade's per-game loop all do) to skip
   *                          teamsActive()'s own lookup. Only fetched
   *                          internally when omitted — currently just the
   *                          game_players team-assignments save, which
   *                          doesn't otherwise need the game row at all.
   * @return array  [{ type: "pairing"|"match", id: string, players: [{ghin,name}], reason: string }, ...]
   *                Empty array means the scan came back clean.
   */
  public static function reconcileGame(string $ggid, ?array $gameRow = null): array
  {
    $ggid = trim($ggid);
    if ($ggid === "") return [];

    $rows = ServiceDbPlayers::getGamePlayers($ggid);
    if (!$rows) return [];

    $teamsActive = self::teamsActive($ggid, $rows, $gameRow);

    // Group by pairingId (skip 000/blank)
    $byPairing = [];
    foreach ($rows as $r) {
      $pid = trim((string)($r["dbPlayers_PairingID"] ?? "000"));
      if ($pid === "" || $pid === "000") continue;
      $byPairing[$pid][] = $r;
    }

    $toReset = []; // ghin => row, deduped across both passes
    $report  = [];

    // Pass 1 — pairing-level: every member of a pairing must share both
    // team AND flightKey (mirrors assignSelectedPlayerToPairing's clamp).
    foreach ($byPairing as $pid => $members) {
      if (self::pairingViolates($members)) {
        $players = [];
        foreach ($members as $m) {
          $ghin = (string)($m["dbPlayers_PlayerGHIN"] ?? "");
          if ($ghin === "") continue;
          $toReset[$ghin] = true;
          $players[] = ["ghin" => $ghin, "name" => (string)($m["dbPlayers_Name"] ?? $ghin)];
        }
        $report[] = [
          "type"    => "pairing",
          "id"      => $pid,
          "players" => $players,
          "reason"  => "Pairing members no longer share team/flight.",
        ];
      }
    }

    // Pass 2 — match-level: the two pairings on a match's Side A / Side B
    // must share flightKey, and (only when teams are actually active) must
    // belong to different teams (mirrors assignSelectedPairingToFlight's
    // clamp). Only pairings that survived Pass 1 are considered — a
    // pairing already flagged doesn't need a second, redundant reason.
    $byMatch = [];
    foreach ($rows as $r) {
      $fid  = trim((string)($r["dbPlayers_MatchID"] ?? ""));
      $pid  = trim((string)($r["dbPlayers_PairingID"] ?? "000"));
      $ghin = (string)($r["dbPlayers_PlayerGHIN"] ?? "");
      if ($fid === "" || $pid === "" || $pid === "000") continue;
      if (isset($toReset[$ghin])) continue; // already being reset via Pass 1
      $pos = self::normFlightPos($r["dbPlayers_MatchPos"] ?? "");
      if ($pos !== "A" && $pos !== "B") continue;
      $byMatch[$fid][$pos][] = $r;
    }

    foreach ($byMatch as $fid => $sides) {
      $sideA = $sides["A"][0] ?? null; // representative — pairing already homogeneous post-Pass-1
      $sideB = $sides["B"][0] ?? null;
      if (!$sideA || !$sideB) continue; // only one side occupied — nothing to violate yet

      $sameFlight = (string)($sideA["dbPlayers_FlightKey"] ?? "") === (string)($sideB["dbPlayers_FlightKey"] ?? "");
      $sameTeam   = (string)($sideA["dbPlayers_TeamKey"]   ?? "") === (string)($sideB["dbPlayers_TeamKey"]   ?? "");
      $violates   = !$sameFlight || ($teamsActive && $sameTeam);

      if ($violates) {
        $pidA = (string)($sideA["dbPlayers_PairingID"] ?? "");
        $pidB = (string)($sideB["dbPlayers_PairingID"] ?? "");
        $allMembers = array_merge($byPairing[$pidA] ?? [], $byPairing[$pidB] ?? []);
        $players = [];
        foreach ($allMembers as $m) {
          $ghin = (string)($m["dbPlayers_PlayerGHIN"] ?? "");
          if ($ghin === "") continue;
          $toReset[$ghin] = true;
          $players[] = ["ghin" => $ghin, "name" => (string)($m["dbPlayers_Name"] ?? $ghin)];
        }
        $report[] = [
          "type"    => "match",
          "id"      => $fid,
          "players" => $players,
          "reason"  => "Matched pairings no longer share a flight, or belong to the same team.",
        ];
      }
    }

    foreach (array_keys($toReset) as $ghin) {
      ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, self::RESET_FIELDS);
    }

    return $report;
  }

  private static function pairingViolates(array $members): bool
  {
    if (count($members) < 2) return false;
    $ref       = $members[0];
    $refTeam   = (string)($ref["dbPlayers_TeamKey"]   ?? "");
    $refFlight = (string)($ref["dbPlayers_FlightKey"] ?? "");
    foreach ($members as $m) {
      if ((string)($m["dbPlayers_TeamKey"]   ?? "") !== $refTeam)   return true;
      if ((string)($m["dbPlayers_FlightKey"] ?? "") !== $refFlight) return true;
    }
    return false;
  }

  /**
   * Mirrors game_pairings.js's teamsActive(): config must actually specify
   * 2 teams AND at least one player must currently hold a non-blank team.
   * Config existing alone isn't enough — module_defineTeams.js's Clear All
   * leaves dbGames_TeamConfig in place while blanking every player's
   * TeamKey (documented there as an intentional floor state).
   */
  private static function teamsActive(string $ggid, array $rows, ?array $gameRow = null): bool
  {
    $game = $gameRow ?? ServiceDbGames::getGameByGGID((int)$ggid);
    $raw  = $game["dbGames_TeamConfig"] ?? null;
    $cfg  = $raw ? json_decode((string)$raw, true) : null;
    $hasConfig = is_array($cfg) && isset($cfg["teams"]) && is_array($cfg["teams"]) && count($cfg["teams"]) === 2;
    if (!$hasConfig) return false;

    foreach ($rows as $r) {
      if (trim((string)($r["dbPlayers_TeamKey"] ?? "")) !== "") return true;
    }
    return false;
  }

  private static function normFlightPos($v): string
  {
    $s = strtoupper(trim((string)($v ?? "")));
    if ($s === "1") return "A";
    if ($s === "2") return "B";
    return ($s === "A" || $s === "B") ? $s : "";
  }
}
