<?php
// /public_html/services/GHIN/GHIN_API_Login.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/HttpClient.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

/**
 * PHP refactor of Wix be_loginGHIN(GHIN, PASSCODE)
 * - Same parameters
 * - Returns decoded GHIN JSON array (same as Wix httpResponse.json())
 * - Throws RuntimeException on network/HTTP errors (controller can catch)
 */
function be_loginGHIN(string $GHIN, string $PASSCODE): array
{
    $GHIN = trim($GHIN);
    if ($GHIN === "" || $PASSCODE === "") {
        throw new RuntimeException("Missing GHIN or PASSCODE.");
    }

    $config = ma_config();
    $loginUrl = (string)($config["ghin"]["login_url"] ?? "");

    if ($loginUrl === "") {
        throw new RuntimeException("GHIN login_url missing in config.php");
    }

    // Match your Wix payload EXACTLY:
    // {"user":{"email_or_ghin":"...","password":"...","remember_me":"true"},"token":"nonblank"}
    $payload = [
        "user" => [
            "email_or_ghin" => $GHIN,
            "password" => $PASSCODE,
            "remember_me" => "true",
        ],
        "token" => "nonblank",
    ];
    
    $payloadForLog = $payload;
    $payloadForLog["user"]["password"] = "********";
    error_log("[be_loginGHIN] url=" . $loginUrl);
    error_log("[be_loginGHIN] payload=" . json_encode($payloadForLog));

    return HttpClient::postJson($loginUrl, $payload, [
        "accept: application/json",
        "Content-Type: application/json",
    ]);
}

/**
 * PHP refactor of Wix be_getAdminCredentialsByClub(clubId)
 * - Same parameter
 * - Returns { ghin, password } or null
 *
 * Wix used wix-secrets-backend:
 *   secretKey = `GHIN_ADMIN_CREDENTIALS_${clubId}`
 *
 * GoDaddy equivalent:
 * - look up key: ADMIN_<clubId> in db_secrets (per your schema decision)
 * - columns: dbsecrets_adminuser, dbsecrets_adminpassword, dbsecrets_key
 */
function be_getAdminCredentialsByClub(string $clubId): ?array
{
    $clubId = trim($clubId);
    if ($clubId === "") return null;

    require_once __DIR__ . "/../_core/secrets.php";

    $secretName = "GHIN_ADMIN_CREDENTIALS_" . $clubId;

    $creds = ma_secret_json($secretName);
    if (!$creds) {
        error_log("[be_getAdminCredentialsByClub] NOT FOUND secret={$secretName}");
        return null;
    }

    $u = trim((string)($creds["ghin"] ?? ""));
    $p = (string)($creds["password"] ?? "");

    if ($u === "" || $p === "") {
        error_log("[be_getAdminCredentialsByClub] EMPTY secret={$secretName}");
        return null;
    }

    error_log("[be_getAdminCredentialsByClub] FOUND secret={$secretName} ghin={$u}");
    return ["ghin" => $u, "password" => $p];
}
