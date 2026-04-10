<?php
// /public_html/app/login/login_view.php
// This file provides the HTML structure for the login form.
// It is included by login.php and uses ma_shared.css for styling.
?>

<main class="maPage" role="main">
    <div class="maCards">
        <section class="maCard maLoginCard" aria-label="MatchAid login form">
            <header class="maCard__hdr">
                <div class="maCard__title">Credentials</div>
                <div class="maCard__actions">
                    <div id="busyBadge" class="maHint maHint--info hidden" aria-live="polite">
                        <span class="maSpinner" aria-hidden="true"></span>
                        <span>Working…</span>
                    </div>
                </div>
            </header>

            <div class="maCard__body">
                <div class="maFormGrid" aria-label="Login fields">
                    <div class="maLabel">Email or User-ID</div>
                    <input id="inputUserId" class="maTextInput" type="text" autocomplete="username" inputmode="email" />

                    <div class="maLabel">Password</div>
                    <div class="maPwdWrap">
                        <input id="inputPassword" class="maTextInput" type="password" autocomplete="current-password"
                            aria-describedby="pwdToggleHint" />
                        <button id="btnPwdToggle" class="maPwdToggle" type="button" aria-label="Show password"
                            title="Show password">
                            <!-- eye -->
                            <svg id="icoEye" class="maPwdIco" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M12 5c-5.05 0-9.27 3.11-11 7 1.73 3.89 5.95 7 11 7s9.27-3.11 11-7c-1.73-3.89-5.95-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                            </svg>
                            <!-- eye-off -->
                            <svg id="icoEyeOff" class="maPwdIco hidden" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M2.1 3.51 3.51 2.1l18.38 18.38-1.41 1.41-2.06-2.06A11.93 11.93 0 0 1 12 20C6.95 20 2.73 16.89 1 13c.88-1.98 2.29-3.7 4.06-4.99L2.1 3.51Zm5.7 5.7A3.99 3.99 0 0 0 8 12a4 4 0 0 0 6.79 2.79l-1.51-1.51A2 2 0 0 1 10.72 10.72L7.8 7.8ZM12 6c5.05 0 9.27 3.11 11 7-.68 1.52-1.63 2.88-2.79 4.01l-1.43-1.43A10.45 10.45 0 0 0 21 13c-1.73-3.89-5.95-7-11-7-1.4 0-2.74.24-3.99.68L4.64 5.31A12.85 12.85 0 0 1 12 6Z" />
                            </svg>
                        </button>
                        <span id="pwdToggleHint" class="hidden">Toggle password visibility</span>
                    </div>
                </div>

                <div id="loginErrorMsg" class="maHint maHint--danger" style="display:none;" role="alert"></div>

                <div class="maActionsRow">
                    <button id="btnCancel" class="btn btn--ghost" type="button">Cancel</button>
                    <button id="btnLogin" class="btn btn--primary" type="button">Log In</button>
                </div>
            </div>
        </section>
    </div>
</main>