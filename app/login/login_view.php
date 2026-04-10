<?php
// /public_html/app/login/login_view.php
?>

<main class="maPage maLoginPage" role="main">
  <div class="maLoginShell">
    <div class="maLoginIntro">Access your MatchAid tools, games, and scoring pages.</div>

    <div class="maCards">
      <section class="maCard maLoginCard" aria-label="MatchAid login form">
        <header class="maCard__hdr maLoginCard__hdr">
          <div class="maCard__title">Credentials</div>
          <div class="maCard__actions">
            <div id="busyBadge" class="maPill" aria-live="polite" style="display:none;">
              <span>Working…</span>
            </div>
          </div>
        </header>

        <div class="maCard__body maLoginCard__body">
          <div class="maField">
            <label class="maLabel" for="inputUserId">Email or User-ID</label>
            <input
              id="inputUserId"
              class="maTextInput"
              type="text"
              autocomplete="username"
              inputmode="email"
            />
          </div>

          <div class="maField">
            <label class="maLabel" for="inputPassword">Password</label>

            <div class="maLoginInputShell">
              <input
                id="inputPassword"
                class="maTextInput maLoginPasswordInput"
                type="password"
                autocomplete="current-password"
                aria-describedby="pwdToggleHint"
              />

              <button
                id="btnPwdToggle"
                class="iconBtn maLoginPwdToggle"
                type="button"
                aria-label="Show password"
                title="Show password"
              >
                <svg id="icoEye" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                  <path fill="currentColor"
                    d="M12 5c-5.05 0-9.27 3.11-11 7 1.73 3.89 5.95 7 11 7s9.27-3.11 11-7c-1.73-3.89-5.95-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                </svg>

                <svg id="icoEyeOff" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" style="display:none;">
                  <path fill="currentColor"
                    d="M2.1 3.51 3.51 2.1l18.38 18.38-1.41 1.41-2.06-2.06A11.93 11.93 0 0 1 12 20C6.95 20 2.73 16.89 1 13c.88-1.98 2.29-3.7 4.06-4.99L2.1 3.51Zm5.7 5.7A3.99 3.99 0 0 0 8 12a4 4 0 0 0 6.79 2.79l-1.51-1.51A2 2 0 0 1 10.72 10.72L7.8 7.8ZM12 6c5.05 0 9.27 3.11 11 7-.68 1.52-1.63 2.88-2.79 4.01l-1.43-1.43A10.45 10.45 0 0 0 21 13c-1.73-3.89-5.95-7-11-7-1.4 0-2.74.24-3.99.68L4.64 5.31A12.85 12.85 0 0 1 12 6Z" />
                </svg>
              </button>
            </div>

            <span id="pwdToggleHint" style="display:none;">Toggle password visibility</span>
          </div>

          <div id="loginErrorMsg" class="maPill maPill--danger maLoginError" role="alert" style="display:none;"></div>

          <div class="maLoginActions">
            <button id="btnCancel" class="btn btnPrimary" type="button">Cancel</button>
            <button id="btnLogin" class="btn btnSecondary" type="button">Log In</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</main>