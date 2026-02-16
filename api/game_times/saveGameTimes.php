<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once __DIR__ . "/initGameTimes.php"; // For re-init return
require_once MA_SERVICES . "/context/service_ContextUser.php";

session_start();
$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
    $ggid = (string)($_SESSION["SessionStoredGGID"] ?? "");
    if ($ggid === "") throw new RuntimeException("No active game session.");

    $assignments = is_array($payload["assignments"] ?? null) ? $payload["assignments"] : [];
    
    $count = 0;
    $pdo = Db::pdo();
    
    // Prepare two statements: one for PairingID, one for GHIN (unpaired singletons)
    $sqlPairing = "UPDATE db_Players 
            SET dbPlayers_TeeTime = :teeTime, 
                dbPlayers_StartHole = :startHole, 
                dbPlayers_StartHoleSuffix = :suffix 
            WHERE dbPlayers_GGID = :ggid AND dbPlayers_PairingID = :pairingId";
    $stmtPairing = $pdo->prepare($sqlPairing);

    $sqlGhin = "UPDATE db_Players 
            SET dbPlayers_TeeTime = :teeTime, 
                dbPlayers_StartHole = :startHole, 
                dbPlayers_StartHoleSuffix = :suffix 
            WHERE dbPlayers_GGID = :ggid AND dbPlayers_PlayerGHIN = :ghin";
    $stmtGhin = $pdo->prepare($sqlGhin);

    foreach ($assignments as $a) {
        $pids = is_array($a["pairingIds"] ?? null) ? $a["pairingIds"] : [];
        
        $params = [
            ":teeTime" => (string)($a["teeTime"] ?? ""),
            ":startHole" => (string)($a["startHole"] ?? ""),
            ":suffix" => (string)($a["startHoleSuffix"] ?? ""),
            ":ggid" => $ggid
        ];

        foreach ($pids as $pid) {
            $idStr = (string)$pid;
            if (str_starts_with($idStr, "GHIN:")) {
                // Singleton update by GHIN
                $params[":ghin"] = substr($idStr, 5);
                $stmtGhin->execute($params);
                $count += $stmtGhin->rowCount();
            } else {
                // Standard update by PairingID
                $params[":pairingId"] = $idStr;
                $stmtPairing->execute($params);
                $count += $stmtPairing->rowCount();
            }
        }
    }

    ma_respond(200, ["ok" => true, "message" => "Saved.", "payload" => ["rowsAffected" => $count]]);

} catch (Throwable $e) {
    ma_respond(500, ["ok" => false, "message" => $e->getMessage()]);
}