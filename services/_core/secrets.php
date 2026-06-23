<?php

function ma_secrets_all(): array
{
    static $cache = null;
    if (is_array($cache)) return $cache;

    $path = "/home/wvq7mv6kutbx/_secrets/matchaid_secrets.php";
    if (!file_exists($path)) {
        error_log("[secrets] Missing secrets file: {$path}");
        return $cache = [];
    }

    $data = require $path;
    return $cache = (is_array($data) ? $data : []);
}

function ma_secret_json(string $name): ?array
{
    $all = ma_secrets_all();
    $raw = $all[$name] ?? null;

    if ($raw === null) return null;

    // If stored as JSON string, decode it
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    // If you ever store it as an array directly
    if (is_array($raw)) return $raw;

    return null;
}