<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/initGameTimes.php"; // For re-init return
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
    
    // Prepare update statement (ServiceDbPlayers doesn't have bulk update by PairingID yet, so we do it here or loop upsert)
    // For efficiency with pairing-level updates, a direct SQL is acceptable here or we add a method to Service.
    // Let's use direct SQL for batch efficiency as per original design, but cleaner.
    $sql = "UPDATE db_Players 
            SET dbPlayers_TeeTime = :teeTime, 
                dbPlayers_StartHole = :startHole, 
                dbPlayers_StartHoleSuffix = :suffix 
            WHERE dbPlayers_GGID = :ggid AND dbPlayers_PairingID = :pairingId";
    $stmt = $pdo->prepare($sql);

    foreach ($assignments as $a) {
        $pids = is_array($a["pairingIds"] ?? null) ? $a["pairingIds"] : [];
        foreach ($pids as $pid) {
            $stmt->execute([
                ":teeTime" => (string)($a["teeTime"] ?? ""),
                ":startHole" => (string)($a["startHole"] ?? ""),
                ":suffix" => (string)($a["startHoleSuffix"] ?? ""),
                ":ggid" => $ggid,
                ":pairingId" => (string)$pid
            ]);
            $count += $stmt->rowCount();
        }
    }

    ma_respond(200, ["ok" => true, "message" => "Saved.", "payload" => ["rowsAffected" => $count]]);

} catch (Throwable $e) {
    ma_respond(500, ["ok" => false, "message" => $e->getMessage()]);
}