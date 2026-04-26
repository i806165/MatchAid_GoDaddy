<?php
// /public_html/services/context/service_Login.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Login.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Users.php";

final class ServiceLogin
{
    /**
     * Processes a user login, interacts with GHIN API, and manages session state.
     *
     * @param string $userId The user's GHIN ID or email.
     * @param string $password The user's password.
     * @param array $config Application configuration.
     * @return array An associative array with 'ok' status, 'message', and 'nextUrl' on success.
     * @throws RuntimeException On critical errors during the login process.
     */
    public static function processLogin(string $userId, string $password, array $config): array
    {
        $userId = trim($userId);
        $password = trim($password);

        if ($userId === "" || $password === "") {
            return ["ok" => false, "message" => "Please enter Email/GHIN and Password."];
        }

        $errInd = "000"; // Error indicator for debugging

        try {
            // Step 1: Login as user (via GHIN_API_Login.php)
            $errInd = "100";
            $login = be_loginGHIN($userId, $password);

            // Extract fields (keep your existing keys, but add fallbacks)
            $userToken = (string)($login["golfer_user"]["golfer_user_token"] ?? "");
            $ghinId    = (string)(
                $login["golfer_user"]["golfer_id"]
                ?? ($login["golfer_user"]["golfers"][0]["ghin"] ?? "")
            );
            $first  = (string)($login["golfer_user"]["golfers"][0]["first_name"] ?? "");
            $last   = (string)($login["golfer_user"]["golfers"][0]["last_name"] ?? "");
            $clubId = (string)($login["golfer_user"]["golfers"][0]["club_id"] ?? "");

            if ($ghinId === "" || $userToken === "") {
                throw new RuntimeException("Invalid login response: missing GHIN ID or user token.");
            }
            if ($clubId === "") {
                return ["ok" => false, "message" => "101 Login Failed: GHIN Club Null"];
            }

            $userName = trim($first . " " . $last);

            // Step 2: get admin creds by club (via GHIN_API_Login.php)
            // Use the user's token as admin token initially, then try to get a specific admin token
            $errInd = "200";
            $adminToken = $userToken;

            $adminCreds = be_getAdminCredentialsByClub($clubId);
            if ($adminCreds) {
                $adminLogin = be_loginGHIN($adminCreds["ghin"], $adminCreds["password"]);
                $adminToken = (string)($adminLogin["golfer_user"]["golfer_user_token"] ?? $adminToken);
            }

            // Step 3: store session immediately (equivalent to storeGHINUser initial save)
            session_regenerate_id(true);
            $errInd = "300";
            $_SESSION["SessionGHINLogonID"] = $ghinId;
            $_SESSION["SessionUserToken"]   = $userToken;
            $_SESSION["SessionAdminToken"]  = $adminToken;
            $_SESSION["SessionLoginTime"]   = gmdate("c");
            $_SESSION["SessionUserName"]    = $userName;
            $_SESSION["SessionClubID"]      = $clubId;
            ServiceUserContext::storeGHINUser(
                $ghinId,
                $userName,
                ["loginTime" => $_SESSION["SessionLoginTime"]], // minimal, but non-empty
                $adminToken,
                $userToken
            );

            // Step 4: secure GHIN calls (profile + facility) using admin token
            $errInd = "400";

            $profile = be_getPlayersByID($ghinId, $adminToken);
            $facility = be_getUserFacility($ghinId, $adminToken);

            ServiceUserContext::storeGHINUser(
                $ghinId,
                $userName,
                [
                    "loginTime"    => $_SESSION["SessionLoginTime"],
                    "profileJson"  => $profile,
                    "facilityJson" => $facility
                ],
                $adminToken,
                $userToken
            );

            // Step 5: Session variables for UI context (no client trust)
            // These are set by ServiceUserContext::getUserContext() on subsequent requests,
            // but we can set some here for immediate use if needed.
            // The user explicitly requested no SessionPortal setting here.
            // The user explicitly requested no pre-filling of userid/password.

            // Determine next URL (default to home)
            //$nextUrl = "/"; // Default home route
            // You might want to add logic here to determine a specific landing page
            // based on user role or a 'returnAction' parameter if passed to this service.
            // For now, it defaults to the root.

            $needsSettings = !ServiceUserContext::hasCompletedSettings($ghinId);
            return ["ok" => true, "needsSettings" => $needsSettings];

        } catch (Throwable $e) {
            Logger::error("LOGIN_PROCESS_FAIL", [
                "errInd" => $errInd,
                "message" => $e->getMessage(),
                "trace" => $e->getTraceAsString(),
                "userId" => $userId // Log userId for debugging, but be mindful of PII
            ]);
            // Generic error message for the user, specific for logs
            return ["ok" => false, "message" => "Login Failed: Invalid credentials or server error."];
        }
    }
}