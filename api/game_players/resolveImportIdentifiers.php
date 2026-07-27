<?php
declare(strict_types=1);
// /api/game_players/resolveImportIdentifiers.php

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

    // ── Collect emails and GHINs for batch Favorites lookups ────────────────
    // Favorites-first for BOTH token types — this endpoint's job now
    // covers name/gender resolution, not just identity resolution, so
    // both paths get a shot at avoiding the live GHIN API call downstream.
    $emailInputs = [];
    $ghinInputs  = [];

    foreach ($identifiers as $item) {
        $type  = (string)($item["type"]  ?? "");
        $value = (string)($item["value"] ?? "");
        if ($type === "email" && $value !== "") {
            $emailInputs[strtolower($value)] = $item;
        } elseif ($type === "ghin" && $value !== "") {
            $ghinInputs[$value] = $item;
        }
    }

    // ── Batch Favorites lookups ──────────────────────────────────────────────
    $emailMatches = [];
    if (!empty($emailInputs)) {
        $emailMatches = service_dbFavPlayers::resolveEmailsToGHINs(array_keys($emailInputs));
    }

    $ghinMatches = [];
    if (!empty($ghinInputs)) {
        $ghinMatches = service_dbFavPlayers::resolveGHINsToNames(array_keys($ghinInputs));
    }

    // ── Build response arrays ─────────────────────────────────────────────────
    // "resolved" carries name/gender when Favorites had a match; the caller
    // (module_sourceImportPlayer.js) only falls back to a live GHIN API
    // lookup for rows still missing name/gender after this step — found-
    // but-incomplete never happens, since a Favorites match always carries
    // whatever the table has, even if a field is blank.
    $resolved   = [];
    $unresolved = [];

    foreach ($identifiers as $item) {
        $type  = (string)($item["type"]  ?? "unknown");
        $value = (string)($item["value"] ?? "");
        $raw   = (string)($item["raw"]   ?? $value);

        if ($type === "ghin") {
            $match = $ghinMatches[$value] ?? null;
            $resolved[] = [
                "input"  => $raw,
                "type"   => "ghin",
                "ghin"   => $value,
                "name"   => $match["name"]   ?? "",
                "gender" => $match["gender"] ?? "",
                "source" => $match ? "favorites" : "",
            ];
            continue;
        }

        if ($type === "email") {
            $email = strtolower($value);
            $match = $emailMatches[$email] ?? null;
            if ($match) {
                $resolved[] = [
                    "input"  => $raw,
                    "type"   => "email",
                    "value"  => $email,
                    "ghin"   => $match["ghin"],
                    "name"   => $match["name"]   ?? "",
                    "gender" => $match["gender"] ?? "",
                    "source" => "favorites",
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