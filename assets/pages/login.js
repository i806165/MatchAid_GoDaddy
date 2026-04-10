/* /assets/pages/login.js
 * MatchAid Login Page (GoDaddy PHP version)
 * - Uses ma_shared.css for chrome/cards/buttons.
 * - View provides DOM (login_view.php); JS hydrates from window.__MA_INIT__.
 * - Interacts with /api/auth/login.php (now a thin API layer).
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  const routerGo = typeof MA.routerGo === "function" ? MA.routerGo : null;

  const init = window.__MA_INIT__ || {};
  const paths = MA.paths || {};

  const state = {
    busy: false,
    returnAction: init.returnAction || "home",
    cancelAction: init.cancelAction || "home",
  };

  // ---- DOM Elements ----
  const el = {
    inputUserId: document.getElementById("inputUserId"),
    inputPassword: document.getElementById("inputPassword"),
    btnLogin: document.getElementById("btnLogin"),
    btnCancel: document.getElementById("btnCancel"),
    btnPwdToggle: document.getElementById("btnPwdToggle"),
    icoEye: document.getElementById("icoEye"),
    icoEyeOff: document.getElementById("icoEyeOff"),
    busyBadge: document.getElementById("busyBadge"),
    loginErrorMsg: document.getElementById("loginErrorMsg"),
  };

  // ---- Helpers ----
  function setBusy(on) {
    state.busy = !!on;
    if (el.busyBadge) el.busyBadge.classList.toggle("hidden", !state.busy);
    if (el.btnLogin) el.btnLogin.disabled = state.busy;
    if (el.btnCancel) el.btnCancel.disabled = state.busy;
    if (el.inputUserId) el.inputUserId.disabled = state.busy;
    if (el.inputPassword) el.inputPassword.disabled = state.busy;
    if (el.btnPwdToggle) el.btnPwdToggle.disabled = state.busy;
  }

  function showError(msg) {
    if (el.loginErrorMsg) {
      el.loginErrorMsg.textContent = msg || "";
      el.loginErrorMsg.style.display = msg ? "block" : "none";
    }
    // Also log to console for debugging, as chrome footer is not present
    if (msg) console.error("[LOGIN_ERROR]", msg);
  }

  function validate() {
    const rawUserId = String(el.inputUserId?.value || "").trim();
    const password = String(el.inputPassword?.value || "").trim();

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawUserId);
    const isNumericId = /^\d+$/.test(rawUserId);

    if (!rawUserId) return { ok: false, msg: "Please enter a valid Email or User-ID." };
    if (!isEmail && !isNumericId) return { ok: false, msg: "Please enter a valid Email or User-ID." };
    if (!password) return { ok: false, msg: "Please enter a Password." };

    return { ok: true, userId: rawUserId, password };
  }

  // ---- Actions ----
  async function doLogin() {
    if (state.busy) return;

    showError(""); // Clear previous errors

    const v = validate();
    if (!v.ok) {
      showError(v.msg);
      return;
    }

    setBusy(true);
    showError("Signing in…"); // Use error area for info during busy state

    try {
      if (!postJson || !paths.apiLogin) {
        throw new Error("Login API path or postJson utility missing.");
      }

      const out = await postJson(paths.apiLogin, { userId: v.userId, password: v.password });

      if (out && out.ok) {
        showError(""); // Clear busy message
        if (routerGo) {
          routerGo(state.returnAction, { redirectUrl: out.nextUrl });
        } else {
          window.location.assign(out.nextUrl || "/");
        }
      } else {
        const msg = (out && out.message) ? String(out.message) : "Invalid credentials";
        showError(msg);
      }
    } catch (err) {
      console.error("Login failed:", err);
      showError("Network error or unexpected server response. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (state.busy) return;

    // Attempt to clear server session if a logout endpoint is defined
    try {
      if (postJson && paths.apiLogout) {
        await postJson(paths.apiLogout, {});
      }
    } catch (_) {
      // Ignore logout errors, proceed with navigation
    }

    if (routerGo) {
      routerGo(state.cancelAction);
    } else {
      window.location.assign("/"); // Fallback to home
    }
  }

  // ---- Event Wiring ----
  function wireEvents() {
    if (el.btnCancel) el.btnCancel.addEventListener("click", doCancel);
    if (el.btnLogin) el.btnLogin.addEventListener("click", doLogin);

    if (el.inputPassword) {
      el.inputPassword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault(); // Prevent form submission if it's implicitly a form
          doLogin();
        }
      });
    }

    if (el.btnPwdToggle) {
      el.btnPwdToggle.addEventListener("click", () => {
        if (state.busy) return;

        const input = el.inputPassword;
        if (!input) return;

        const willShow = (input.type === "password");
        input.type = willShow ? "text" : "password";

        if (el.icoEye) el.icoEye.classList.toggle("hidden", !willShow);
        if (el.icoEyeOff) el.icoEyeOff.classList.toggle("hidden", willShow);

        const label = willShow ? "Hide password" : "Show password";
        el.btnPwdToggle.setAttribute("aria-label", label);
        el.btnPwdToggle.setAttribute("title", label);
      });
    }
  }

  // ---- Chrome Integration ----
  function applyChrome() {
    // Only set header lines, no actions or bottom nav as per requirements
    if (chrome && typeof chrome.setHeaderLines === "function") {
      // The titles are set in login.php and passed to chromeHeader.php
      // No need to set them again here unless dynamic changes are required.
      // For now, ensure the brand is visible if it's hidden by default.
      if (chrome.showBrand) chrome.showBrand(true);
    }
  }

  // ---- Initialization ----
  function initialize() {
    applyChrome();
    wireEvents();

    // Focus on the user ID field on load
    if (el.inputUserId) el.inputUserId.focus();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();