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
  if (el.busyBadge) el.busyBadge.style.display = state.busy ? "inline-flex" : "none";
  if (el.btnLogin) el.btnLogin.disabled = state.busy;
  if (el.btnCancel) el.btnCancel.disabled = state.busy;
  if (el.inputUserId) el.inputUserId.disabled = state.busy;
  if (el.inputPassword) el.inputPassword.disabled = state.busy;
  if (el.btnPwdToggle) el.btnPwdToggle.disabled = state.busy;
}

function showError(msg) {
  if (el.loginErrorMsg) {
    el.loginErrorMsg.textContent = msg || "";
    el.loginErrorMsg.style.display = msg ? "inline-flex" : "none";
  }
  if (msg) console.error("[LOGIN_ERROR]", msg);
}

  function validate() {
    const rawUserId = String(el.inputUserId?.value || "").trim();
    const password = String(el.inputPassword?.value || "").trim();

    if (!rawUserId) return { ok: false, msg: "Please enter Email or User-ID." };
    if (!password) return { ok: false, msg: "Please enter a Password." };

    return { ok: true, userId: rawUserId, password };
  }

  // ---- Actions ----
async function doLogin() {
  if (state.busy) return;

  showError("");

  const v = validate();
  if (!v.ok) {
    showError(v.msg);
    return;
  }

  setBusy(true);
  showError("");

  try {
    if (!postJson || !paths.apiLogin) {
      throw new Error("Login API path or postJson utility missing.");
    }

    const out = await postJson(paths.apiLogin, { userId: v.userId, password: v.password });

    if (out && out.ok) {
      showError("");
      if (routerGo) {
        await routerGo(state.returnAction);
      } else {
        window.location.assign(out?.nextUrl || "/");
      }
    } else {
      const msg = (out && out.message) ? String(out.message) : "Invalid credentials";
      showError(msg);

      try {
        if (postJson && paths.apiLogout) {
          await postJson(paths.apiLogout, {});
        }
      } catch (_) {
        // ignore logout failure
      }

      if (routerGo) {
        await routerGo("home");
      } else {
        window.location.assign("/");
      }
    }
  } catch (err) {
    console.error("Login failed:", err);
    showError("Network error or unexpected server response. Please try again.");

    try {
      if (postJson && paths.apiLogout) {
        await postJson(paths.apiLogout, {});
      }
    } catch (_) {
      // ignore logout failure
    }

    if (routerGo) {
      await routerGo("home");
    } else {
      window.location.assign("/");
    }
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

if (el.icoEye) el.icoEye.style.display = willShow ? "none" : "inline";
if (el.icoEyeOff) el.icoEyeOff.style.display = willShow ? "inline" : "none";

        const label = willShow ? "Hide password" : "Show password";
        el.btnPwdToggle.setAttribute("aria-label", label);
        el.btnPwdToggle.setAttribute("title", label);
      });
    }
  }

  // ---- Chrome Integration ----
  function applyChrome() {
    if (chrome.setHeaderLines) {
      chrome.setHeaderLines([
        init.title || "MatchAid Login",
        init.subtitle || "Sign in to continue"
      ]);
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