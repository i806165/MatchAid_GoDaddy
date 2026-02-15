<?php
// /public_html/workflows/WorkFlow_Handicaps.php
declare(strict_types=1);

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../lib/Db.php";
require_once __DIR__ . "/../lib/HttpClient.php";

require_once __DIR__ . "/../repo/RepoPlayers.php";
require_once __DIR__ . "/../services/GHIN_API_Players.php";
require_once __DIR__ . "/../services/GHIN_API_Handicaps.php"; // the file we created earlier

/**
 * Port of Wix:
 * export async function be_recalculateGameHandicaps(parmGGID, parmPlayerGHIN, parmGameData, parmToken)
 */
function be_recalculateGameHandicaps(string $parmGGID, string $parmPlayerGHIN, array $parmGameData, string $parmToken): array
{
    $cfg = require __DIR__ . "/../config.php";
    $pdo = Db::pdo($cfg["db"]);
    $repo = new RepoPlayers($pdo);

    try {
        $txtHoles   = (string)($parmGameData["dbGames_Holes"] ?? "");
        $txtCourseID = (string)($parmGameData["dbGames_CourseID"] ?? "");
        $varAllowance = (string)($parmGameData["dbGames_Allowance"] ?? "100");

        $ggid = trim($parmGGID);
        if ($ggid === "") throw new RuntimeException("Missing GGID");

        $players = ($parmPlayerGHIN !== "allPlayers")
            ? $repo->listByGameAndPlayer($ggid, $parmPlayerGHIN)
            : $repo->listByGame($ggid);

        // Exclude non-rated players "NH..."
        $rated = array_values(array_filter($players, function($p){
            $ghin = (string)($p["dbPlayers_PlayerGHIN"] ?? "");
            return $ghin !== "" && !str_starts_with($ghin, "NH");
        }));

        if (!count($rated)) {
            return [
                "status" => "ok",
                "message" => "Handicap calculation skipped-No rated players.",
                "groups" => 0,
                "updated" => 0,
                "allowance" => $varAllowance
            ];
        }

        $isNetPlay = ((string)($parmGameData["dbGames_ScoringMethod"] ?? "") !== "ADJ GROSS");

        $updatedCount = 0;
        $errorCount = 0;

        foreach ($rated as $player) {
            try {
                $txtGHIN = (string)($player["dbPlayers_PlayerGHIN"] ?? "");
                $txtGender = (string)($player["dbPlayers_Gender"] ?? "");
                $txtTeeSetSide = $txtHoles;
                $txtTeeSetID = (int)($player["dbPlayers_TeeSetID"] ?? 0);

                $txtTeeSetName = (string)($player["dbPlayers_TeeSetName"] ?? "");
                $valCH = 0;
                $txtPlayerHI = "0";

                // 1) Determine HI (Net play only)
                if ($isNetPlay) {
                    $hce = (string)($parmGameData["dbGames_HCEffectivity"] ?? "");

                    $jsonPlayerHI = null;

                    if ($hce === "Low3" || $hce === "Low6" || $hce === "Low12") {
                        $jsonPlayerHI = be_getHandicapbyPeriod($hce, null, null, $txtGHIN, $parmToken);
                    } elseif ($hce === "PlayDate") {
                        $d = toYMD($parmGameData["dbGames_PlayDate"] ?? null);
                        $jsonPlayerHI = be_getHandicapbyPeriod("Range", $d, $d, $txtGHIN, $parmToken);
                    } elseif ($hce === "Date") {
                        $d = toYMD($parmGameData["dbGames_HCEffectivityDate"] ?? null);
                        $jsonPlayerHI = be_getHandicapbyPeriod("Range", $d, $d, $txtGHIN, $parmToken);
                    } else {
                        // unknown => fallback
                        $jsonPlayerHI = null;
                    }

                    $row = null;
                    if (is_array($jsonPlayerHI) && isset($jsonPlayerHI["d"]) && is_array($jsonPlayerHI["d"]) && isset($jsonPlayerHI["d"][0])) {
                        $row = $jsonPlayerHI["d"][0];
                    }

                    if (is_array($row) && array_key_exists("LowHIValue", $row) && $row["LowHIValue"] !== null) {
                        $txtPlayerHI = (string)$row["LowHIValue"];
                    } else {
                        // fallback: players-by-id
                        $playerGHINData = be_getPlayersByID($txtGHIN, $parmToken);
                        $txtPlayerHI = (string)($playerGHINData["golfers"][0]["handicap_index"] ?? "0");
                    }
                }

                // 2) Get Course Handicap
                $json = be_getCourseHandicap("Index", $txtPlayerHI, $txtCourseID, $parmToken);

                $foundCH = false;
                if (is_array($json) && isset($json["tee_sets"]) && is_array($json["tee_sets"])) {
                    foreach ($json["tee_sets"] as $set) {
                        if (!is_array($set)) continue;

                        if ((string)($set["gender"] ?? "") === $txtGender && (int)($set["tee_set_id"] ?? 0) === $txtTeeSetID) {
                            $ratings = $set["ratings"] ?? [];
                            if (is_array($ratings)) {
                                foreach ($ratings as $r) {
                                    if (!is_array($r)) continue;
                                    if ((string)($r["tee_set_side"] ?? "") === $txtTeeSetSide) {
                                        $foundCH = true;
                                        if ($isNetPlay) $valCH = (int)($r["course_handicap"] ?? 0);
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }

                if (!$foundCH) {
                    $txtTeeSetName = "ReSelect Tee";
                }

                // Calculate Baseline PH (Pass-A)
                $valPH = (int)round($valCH * ((float)$varAllowance / 100.0));

                // 3) Update record by (GGID, PlayerGHIN)
                $repo->updateHandicapFields($ggid, $txtGHIN, [
                    "dbPlayers_TeeSetName" => $txtTeeSetName,
                    "dbPlayers_HI" => $txtPlayerHI,
                    "dbPlayers_CH" => (string)$valCH,
                    "dbPlayers_PH" => (string)$valPH,
                    "dbPlayers_SO" => "0",
                ]);

                $updatedCount++;
            } catch (Throwable $e) {
                $errorCount++;
            }
        }

        return [
            "status" => "ok",
            "message" => "Handicaps calculated for {$updatedCount} players",
            "groups" => 0,
            "updated" => $updatedCount,
            "allowance" => (string)($parmGameData["dbGames_Allowance"] ?? "100"),
            "errors" => $errorCount
        ];

    } catch (Throwable $e) {
        return [
            "status" => "error",
            "message" => "Handicap calculation failed: " . ($e->getMessage() ?: (string)$e),
            "groups" => 0,
            "updated" => 0,
            "allowance" => (string)($parmGameData["dbGames_Allowance"] ?? "100")
        ];
    }
}

/**
 * Port of Wix:
 * export async function be_calculateGamePHSO(action, id, parmGameData, parmToken)
 */
function be_calculateGamePHSO(string $action, ?string $id, array $parmGameData, string $parmToken): array
{
    $cfg = require __DIR__ . "/../config.php";
    $pdo = Db::pdo($cfg["db"]);
    $repo = new RepoPlayers($pdo);

    $myToken = $parmToken;

    $txtHoles = (string)($parmGameData["dbGames_Holes"] ?? "");
    $varAllowance = (string)($parmGameData["dbGames_Allowance"] ?? "100");
    $txtCompetition = (string)($parmGameData["dbGames_Competition"] ?? ""); // PairPair | PairField
    $txtGGID = (string)($parmGameData["dbGames_GGID"] ?? "");
    $isGrossPlay = ((string)($parmGameData["dbGames_ScoringMethod"] ?? "") === "ADJ GROSS");

    if ($isGrossPlay) {
        return [
            "status" => "ok",
            "message" => "PH/SO skipped, Gross Play.",
            "groups" => 0,
            "updated" => 0,
            "allowance" => $varAllowance
        ];
    }

    // 1) Acquire players based on Action/Scope
    // Actions: "all" (or "game"), "player", "pairing", "flight"
    $allPlayers = $repo->listByGame($txtGGID);
    $players = [];

    if ($action === "all" || $action === "game") {
        $players = $allPlayers;
    } 
    elseif ($action === "player" && $id) {
        // Smart Scope: Find player's group based on competition type
        $target = null;
        foreach ($allPlayers as $p) {
            if (($p["dbPlayers_PlayerGHIN"] ?? "") === $id) { $target = $p; break; }
        }
        if ($target) {
            if ($txtCompetition === "PairPair") {
                $fid = (string)($target["dbPlayers_FlightID"] ?? "");
                if ($fid !== "" && $fid !== "0") {
                    $players = array_filter($allPlayers, fn($p) => ((string)($p["dbPlayers_FlightID"] ?? "") === $fid));
                }
            } else {
                // PairField (or others) use PairingID
                $pid = (string)($target["dbPlayers_PairingID"] ?? "");
                if ($pid !== "" && $pid !== "000") {
                    $players = array_filter($allPlayers, fn($p) => ((string)($p["dbPlayers_PairingID"] ?? "") === $pid));
                }
            }
        }
    }
    elseif ($action === "pairing" && $id) {
        $players = array_filter($allPlayers, fn($p) => ((string)($p["dbPlayers_PairingID"] ?? "") === $id));
    }
    elseif ($action === "flight" && $id) {
        $players = array_filter($allPlayers, fn($p) => ((string)($p["dbPlayers_FlightID"] ?? "") === $id));
    }

    // If scoped lookup found nothing (e.g. player not in a group), return early
    if (empty($players)) {
        return ["status" => "ok", "message" => "No players in scope.", "updated" => 0];
    }

    // 2) Eligible: tee set must be valid
    $eligible = array_values(array_filter($players, function($p){
        return trim((string)($p["dbPlayers_TeeSetName"] ?? "")) !== "ReSelect Tee";
    }));

    // 3) Group players
    $groups = []; // key => [players...]

    foreach ($eligible as $p) {
        $key = "ALL";

        if ($txtCompetition === "PairPair") {
            $flight = trim((string)($p["dbPlayers_FlightID"] ?? ""));
            if ($flight !== "" && $flight !== "0") $key = $flight; else continue;
        } elseif ($txtCompetition === "PairField") {
            $pair = trim((string)($p["dbPlayers_PairingID"] ?? ""));
            if ($pair !== "" && $pair !== "000") $key = $pair; else continue;
        }

        if (!isset($groups[$key])) $groups[$key] = [];
        $groups[$key][] = $p;
    }

    if (!count($groups)) {
        return [
            "status" => "ok",
            "message" => "PH/SO Skipped. No pairings/matches.",
            "groups" => 0,
            "updated" => 0,
            "allowance" => $varAllowance
        ];
    }

    $GHINurl = "https://api.ghin.com/api/v1/playing_handicaps.json";

    $updatedCount = 0;
    $groupCount = 0;

    foreach ($groups as $groupPlayers) {
        $groupCount++;

        $parmGolfers = array_map(function($p) use ($txtHoles){
            return [
                "handicap_index" => (float)((string)($p["dbPlayers_HI"] ?? "0")),
                "tee_set_id" => (int)($p["dbPlayers_TeeSetID"] ?? 0),
                "tee_set_side" => $txtHoles
            ];
        }, $groupPlayers);

        $phso = HttpClient::postJson($GHINurl, ["golfers" => $parmGolfers], [
            "accept: application/json",
            "Authorization: Bearer " . $myToken,
        ]);

        $bucket = $phso[$varAllowance] ?? [];

        foreach ($groupPlayers as $idx => $p) {
            $key = "manual_golfer_" . ($idx + 1);
            $phsoData = is_array($bucket) ? ($bucket[$key] ?? null) : null;

            $ph = (string)($phsoData["playing_handicap"] ?? "0");
            $so = (string)($phsoData["shots_off"] ?? "0");

            $playerGhin = (string)($p["dbPlayers_PlayerGHIN"] ?? "");
            if ($playerGhin !== "") {
                $repo->updatePHSOFields($txtGGID, $playerGhin, $ph, $so);
                $updatedCount++;
            }
        }
    }

    return [
        "status" => "ok",
        "message" => "PH/SO calculated for {$updatedCount} players",
        "groups" => $groupCount,
        "updated" => $updatedCount,
        "allowance" => $varAllowance
    ];
}

/**
 * Port of Wix: be_checkHandicapDataFactors(original, revised)
 */
function be_checkHandicapDataFactors(array $orig, array $rev): bool
{
    if ($orig === $rev) return false;

    $keys = [
        "dbGames_HCMethod",
        "dbGames_Competition",
        "dbGames_CourseID",
        "dbGames_Holes",
        "dbGames_StrokeDistribution",
        "dbGames_ScoringMethod",
        "dbGames_HCEffectivity",
        "dbGames_HCEffectivityDate",
        "dbGames_Allowance",
    ];

    foreach ($keys as $k) {
        $a = (string)($orig[$k] ?? "");
        $b = (string)($rev[$k] ?? "");
        if ($a !== $b) return true;
    }

    return false;
}
