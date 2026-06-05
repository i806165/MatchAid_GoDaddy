<?php
declare(strict_types=1);
// /api/game_players/resolveImportIdentifiers.php
//
// Accepts a POST body: { "identifiers": ["6105388", "cdisney99@gmail.com", ...] }
// Each entry is already classified and normalized by module_parseImportPlayers.js.
//
// For each identifier:
//   - type "ghin"  → passed through as-is (GHIN API lookup happens later in the JS loop)
//   - type "email" → resolved to GHIN via db_FavPlayers; unresolved if no match found
//   - type "unknown" → immediately unresolved
//
// Returns:
// {
//   "ok": true,
//   "resolved": [
//     { "input": "6105388",            "type": "ghin",  "ghin": "6105388" },
//     { "input": "cdisney99@gmail.com","type": "email", "ghin": "9876543" }
//   ],
//   "unresolved": [
//     { "input": "notfound@x.com", "type": "email", "reason": "Email not found in favorites" }
//   ]
// }

require_once __DIR__ . "/../../bootstrap.php";

header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        http_response_code(405);
        echo json_encode(["ok" => false, "message" => "Method not allowed."]);
        exit;
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    $in          = ma_json_in();
    $identifiers = is_array($in["identifiers"] ?? null) ? $in["identifiers"] : [];

    if (empty($identifiers)) {
        http_response_code(400);
        echo json_encode(["ok" => false, "message" => "No identifiers provided."]);
        exit;
    }

    // ── Collect emails for batch DB lookup ───────────────────────────────────
    // Separate emails from GHINs in one pass so we can do a single
    // batch query rather than one query per email.
    $emailInputs = []; // [ lowercased_email => original_input_object ]

    foreach ($identifiers as $item) {
        $type  = (string)($item["type"]  ?? "");
        $value = (string)($item["value"] ?? "");
        if ($type === "email" && $value !== "") {
            $emailInputs[strtolower($value)] = $item;
        }
    }

    // ── Batch email → GHIN resolution ────────────────────────────────────────
    $emailToGhin = [];
    if (!empty($emailInputs)) {
        $emailToGhin = service_dbFavPlayers::resolveEmailsToGHINs(array_keys($emailInputs));
    }

    // ── Build response arrays ─────────────────────────────────────────────────
    $resolved   = [];
    $unresolved = [];

    foreach ($identifiers as $item) {
        $type  = (string)($item["type"]  ?? "unknown");
        $value = (string)($item["value"] ?? "");
        $raw   = (string)($item["raw"]   ?? $value);

        if ($type === "ghin") {
            // Pass numeric GHINs through — existence validated later by searchPlayers.php
            $resolved[] = [
                "input" => $raw,
                "type"  => "email",
                "value" => $email,
                "ghin"  => $emailToGhin[$email],
            ];
            continue;
        }

        if ($type === "email") {
            $email = strtolower($value);
            if (isset($emailToGhin[$email])) {
                $resolved[] = [
                    "input" => $raw,
                    "type"  => "email",
                    "ghin"  => $emailToGhin[$email],
                ];
            } else {
                $unresolved[] = [
                    "input"  => $raw,
                    "type"   => "email",
                    "reason" => "Email not found in favorites",
                ];
            }
            continue;
        }

        // type === "unknown"
        $unresolved[] = [
            "input"  => $raw,
            "type"   => "unknown",
            "reason" => "Unrecognized format — not a GHIN or email address",
        ];
    }

    echo json_encode([
        "ok"         => true,
        "resolved"   => $resolved,
        "unresolved" => $unresolved,
    ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    Logger::error("RESOLVE_IMPORT_IDENTIFIERS_FAIL", [
        "err" => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode([
        "ok"      => false,
        "message" => "Unable to resolve import identifiers."
    ]);
}
