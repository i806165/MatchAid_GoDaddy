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
     * @return array An associative array with 'ok' status, 'message', and 'needsSettings' on success.
     * @throws RuntimeException On critical errors during the login process.
     */
    public static function processLogin(string $userId, string $password, array $config): array
    {
        $userId   = trim($userId);
        $password = trim($password);

        if ($userId === "" || $password === "") {
            return ["ok" => false, "message" => "Please enter Email/GHIN and Password."];
        }

        $errInd = "000"; // Error indicator for debugging

        try {
            // Step 1: Login as user (via GHIN_API_Login.php)
            $errInd = "100";
            $login = be_loginGHIN($userId, $password);

            // Extract fields
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
                return [
                    "ok"      => false,
                    "message" => "Sign-in failed: your Golf Network profile has a blank club. Please contact your club professional.",
                ];
            }

            $userName = trim($first . " " . $last);

            // Step 2: Get admin creds by club (via GHIN_API_Login.php)
            $errInd     = "200";
            $adminToken = $userToken;

            $adminCreds = be_getAdminCredentialsByClub($clubId);
            if ($adminCreds) {
                $adminLogin = be_loginGHIN($adminCreds["ghin"], $adminCreds["password"]);
                $adminToken = (string)($adminLogin["golfer_user"]["golfer_user_token"] ?? $adminToken);
            }

            // Step 3: Store session immediately
            $errInd = "300";
            session_regenerate_id(true);
            $_SESSION["SessionGHINLogonID"] = $ghinId;
            $_SESSION["SessionUserToken"]   = $userToken;
            $_SESSION["SessionAdminToken"]  = $adminToken;
            $_SESSION["SessionLoginTime"]   = time();
            $_SESSION["SessionUserName"]    = $userName;
            $_SESSION["SessionUserLName"]   = $last;
            $_SESSION["SessionClubID"]      = $clubId;

            ServiceUserContext::storeGHINUser(
                $ghinId,
                $userName,
                ["loginTime" => $_SESSION["SessionLoginTime"]],
                $adminToken,
                $userToken
            );

            // Step 4: Secure GHIN calls (profile + facility) using admin token
            // If this fails the app cannot function, so we block entry and clean up the session.
            $errInd = "400";

            $profile  = be_getPlayersByID($ghinId, $adminToken);
            $facility = be_getUserFacility($ghinId, $adminToken);

            ServiceUserContext::storeGHINUser(
                $ghinId,
                $userName,
                [
                    "loginTime"    => $_SESSION["SessionLoginTime"],
                    "profileJson"  => $profile,
                    "facilityJson" => $facility,
                ],
                $adminToken,
                $userToken
            );

            // Step 5: Determine if user needs to complete settings
            $needsSettings = !ServiceUserContext::hasCompletedSettings($ghinId);
            return ["ok" => true, "needsSettings" => $needsSettings];

        } catch (Throwable $e) {

            // If we fail after the session was written (stage 400+), clean it up.
            // The app cannot function without profile/facility data, so we block entry.
            if (str_starts_with($errInd, "4") && session_status() === PHP_SESSION_ACTIVE) {
                $_SESSION = [];
                if (ini_get("session.use_cookies")) {
                    $p = session_get_cookie_params();
                    setcookie(
                        session_name(), "", time() - 42000,
                        $p["path"], $p["domain"], $p["secure"], $p["httponly"]
                    );
                }
                session_destroy();
            }

            Logger::error("LOGIN_PROCESS_FAIL", [
                "errInd"  => $errInd,
                "message" => $e->getMessage(),
                "trace"   => $e->getTraceAsString(),
                "userId"  => $userId,
            ]);

            $exMsg = $e->getMessage();

            $userMessage = match(true) {

                // Stage 100: GHIN authentication call
                str_starts_with($errInd, "1") => match(true) {
                    str_contains($exMsg, "HTTP 401"),
                    str_contains($exMsg, "HTTP 403") => "Incorrect UserID or Password. Please check your credentials and try again.",
                    str_contains($exMsg, "HTTP 400")  => "Invalid login format. Please check your credentials and try again.",
                    str_contains($exMsg, "HTTP 404")  => "No account found with that UserID.",
                    str_contains($exMsg, "HTTP 500")  => "The back end service is temporarily unavailable. Please try again shortly.",
                    str_contains($exMsg, "Network error") => "Could not reach the back end service. Please check your connection and try again.",
                    default => "We couldn't verify your credentials. Please try again.",
                },

                // Stage 200: Admin credentials/token retrieval
                str_starts_with($errInd, "2") => "Sign-in succeeded but your club is not yet authorized for MatchAid.",

                // Stage 300: Session setup
                str_starts_with($errInd, "3") => "A session error occurred. Please clear your browser cookies and try again.",

                // Stage 400: Profile/facility load — session cleaned up above
                str_starts_with($errInd, "4") => "Sign-in succeeded but we couldn't load your profile. Please try again shortly.",

                default => "An unexpected error occurred. Please try again or contact support.",
            };

            return ["ok" => false, "message" => $userMessage, "errCode" => $errInd];
        }
    }
}