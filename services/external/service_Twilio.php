<?php
// /public_html/services/external/service_Twilio.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/_core/secrets.php";

/**
 * service_Twilio
 *
 * Wraps the Twilio Lookup v2 API for phone number validation and
 * carrier detection via the Line Type Intelligence package.
 *
 * Public API:
 *   service_TwilioLookup::lookup(string $mobile): array
 *
 * Returns:
 *   [
 *     "valid"   => bool,         // true = valid mobile number
 *     "e164"    => string|null,  // e.g. "+15550100100"
 *     "carrier" => string|null,  // Twilio carrier_name, e.g. "Verizon Wireless"
 *     "gateway" => string|null,  // SMS gateway domain, e.g. "@vtext.com"
 *     "type"    => string|null,  // "mobile", "landline", "voip", etc.
 *     "error"   => string|null,  // human-readable error if valid === false
 *   ]
 *
 * Never throws — all errors are caught and returned as valid => false.
 * Callers do not need try/catch.
 *
 * Notes:
 *   - Input mobile should be digits only (scrubbed by caller).
 *   - US numbers are assumed; prefix "+1" is added if not present.
 *   - Line Type Intelligence is a paid Twilio feature (~$0.005/lookup).
 *   - Carrier name is mapped to SMS gateway via mobile_carriers.php.
 *   - Only "mobile" line types are considered valid for SMS delivery.
 *     Landline, VoIP, toll-free etc. return valid => false.
 */
final class service_Twilio
{
    private const LOOKUP_BASE = "https://lookups.twilio.com/v2/PhoneNumbers/";
    private const TIMEOUT_SEC = 10;

    // ── Public ────────────────────────────────────────────────────────────────

    public static function mobileLookup(string $mobile): array
    {
        $mobile = preg_replace('/\D/', '', trim($mobile));

        if ($mobile === "") {
            return self::_fail("Mobile number is empty.");
        }

        // Normalize to E.164 — assume US if no country code
        $e164 = self::_toE164($mobile);
        if ($e164 === null) {
            return self::_fail("Mobile number is too short to be valid.");
        }

        // Load Twilio credentials
        $twilio = ma_secret_json("TWILIO");
        if (!is_array($twilio) ||
            empty($twilio["account_sid"]) ||
            empty($twilio["auth_token"])) {
            error_log("[service_TwilioLookup] Twilio credentials missing or incomplete.");
            return self::_fail("Twilio credentials not configured.");
        }

        $accountSid = $twilio["account_sid"];
        $authToken  = $twilio["auth_token"];

        // Build request URL with Line Type Intelligence package
        $url = self::LOOKUP_BASE
             . rawurlencode($e164)
             . "?Fields=line_type_intelligence";

        // Execute cURL request
        $raw = self::_get($url, $accountSid, $authToken);
        if ($raw === null) {
            return self::_fail("Twilio API request failed.");
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            error_log("[service_TwilioLookup] Unexpected response body: " . $raw);
            return self::_fail("Twilio API returned an unexpected response.");
        }

        // Basic validation result
        $valid = (bool)($data["valid"] ?? false);
        if (!$valid) {
            $errors = $data["validation_errors"] ?? null;
            $msg    = is_array($errors) ? implode(", ", $errors) : "Invalid phone number.";
            return self::_fail($msg);
        }

        // Line type check — only mobile numbers can receive SMS via gateway
        $lti      = $data["line_type_intelligence"] ?? null;
        $lineType = is_array($lti) ? trim((string)($lti["type"] ?? "")) : "";

        if ($lineType !== "" && $lineType !== "mobile") {
            return self::_fail(
                "Phone number is not a mobile number ({$lineType}). SMS delivery is not possible."
            );
        }

        // Carrier detection
        $carrierName = is_array($lti)
            ? trim((string)($lti["carrier_name"] ?? ""))
            : "";

        $gateway = $carrierName !== ""
            ? self::_resolveGateway($carrierName)
            : null;

        return [
            "valid"   => true,
            "e164"    => (string)($data["phone_number"] ?? $e164),
            "carrier" => $carrierName !== "" ? $carrierName : null,
            "gateway" => $gateway,
            "type"    => $lineType !== "" ? $lineType : null,
            "error"   => null,
        ];
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Convert a digits-only string to E.164 format.
     * Assumes US (+1) if no country code prefix is present.
     */
    private static function _toE164(string $digits): ?string
    {
        $len = strlen($digits);

        // Already has country code: 11 digits starting with 1
        if ($len === 11 && $digits[0] === "1") {
            return "+" . $digits;
        }

        // Standard 10-digit US number
        if ($len === 10) {
            return "+1" . $digits;
        }

        // Too short to be valid
        if ($len < 10) {
            return null;
        }

        // Longer number — pass through with + prefix and let Twilio validate
        return "+" . $digits;
    }

    /**
     * Map Twilio carrier_name to SMS gateway domain via mobile_carriers.php.
     * Returns null if no mapping found — caller stores null, SMS not available.
     */
    private static function _resolveGateway(string $carrierName): ?string
    {
        $path = MA_INCLUDES . "/mobile_carriers.php";
        if (!is_file($path)) {
            error_log("[service_TwilioLookup] mobile_carriers.php not found at: {$path}");
            return null;
        }

        $carriers = require $path;
        if (!is_array($carriers)) return null;

        return $carriers[$carrierName] ?? null;
    }

    /**
     * Execute a GET request with HTTP Basic auth via cURL.
     * Returns raw response body string, or null on failure.
     */
    private static function _get(
        string $url,
        string $accountSid,
        string $authToken
    ): ?string {
        $ch = curl_init($url);
        if ($ch === false) {
            error_log("[service_TwilioLookup] curl_init failed for URL: {$url}");
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_USERPWD        => $accountSid . ":" . $authToken,
            CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
            CURLOPT_TIMEOUT        => self::TIMEOUT_SEC,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER     => ["Accept: application/json"],
        ]);

        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== "") {
            error_log("[service_TwilioLookup] cURL error: {$curlErr} URL: {$url}");
            return null;
        }

        if ($httpCode !== 200) {
            error_log("[service_TwilioLookup] HTTP {$httpCode} from Twilio. URL: {$url} Body: {$body}");
            return null;
        }

        return is_string($body) ? $body : null;
    }

    /**
     * Build a consistent failure response.
     */
    private static function _fail(string $reason): array
    {
        return [
            "valid"   => false,
            "e164"    => null,
            "carrier" => null,
            "gateway" => null,
            "type"    => null,
            "error"   => $reason,
        ];
    }
}