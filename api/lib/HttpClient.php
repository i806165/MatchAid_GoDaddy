<?php
// /public_html/api/lib/HttpClient.php
declare(strict_types=1);

final class HttpClient
{
    public static function postJson(
        string $url,
        array $payload,
        array $headers = [],
        int $timeoutSeconds = 30
    ): array {
        $ch = curl_init($url);

        $allHeaders = array_merge(
            ["Content-Type: application/json"],
            $headers
        );

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => $allHeaders,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);

        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException("Network error: " . $err);
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = ["raw" => $raw];
        }

        if ($code < 200 || $code >= 300) {
            $msg = $data["message"] ?? $data["error"] ?? "HTTP $code";
            throw new RuntimeException("Fetch did not succeed: " . $msg);
        }

        return $data;
    }

    public static function getJson(
        string $url,
        array $headers = [],
        int $timeoutSeconds = 30
    ): array {
        $ch = curl_init($url);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);

        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException("Network error: " . $err);
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = ["raw" => $raw];
        }

        if ($code < 200 || $code >= 300) {
            $msg = $data["message"] ?? $data["error"] ?? "HTTP $code";
            throw new RuntimeException("Fetch did not succeed: " . $msg);
        }

        return $data;
    }
}
