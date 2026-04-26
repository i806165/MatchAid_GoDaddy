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
          await routerGo(out.needsSettings ? "usersettings" : state.returnAction);
        } else {
          window.location.assign(out?.nextUrl || "/");
        }
        return;
      }

      const msg = (out && out.message) ? String(out.message) : "Invalid credentials";
      showError(msg);

      if (el.inputPassword) {
        el.inputPassword.focus();
        el.inputPassword.select();
      }
    } catch (err) {
      console.error("Login failed:", err);
      showError("Network error or unexpected server response. Please try again.");

      if (el.inputPassword) {
        el.inputPassword.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (state.busy) return;

    try {
      if (postJson && paths.apiLogout) {
        await postJson(paths.apiLogout, {});
      }
    } catch (_) {
      // Ignore logout errors and continue navigation
    }

    if (routerGo) {
      routerGo(state.cancelAction);
    } else {
      window.location.assign("/");
    }
  }

  function onEnterSubmit(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      doLogin();
    }
  }

  function wireEvents() {
    if (el.btnCancel) el.btnCancel.addEventListener("click", doCancel);
    if (el.btnLogin) el.btnLogin.addEventListener("click", doLogin);

    if (el.inputUserId) {
      el.inputUserId.addEventListener("keydown", onEnterSubmit);
    }

    if (el.inputPassword) {
      el.inputPassword.addEventListener("keydown", onEnterSubmit);
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

  function applyChrome() {
    if (chrome.setHeaderLines) {
      chrome.setHeaderLines([
        init.title || "MatchAid Login",
        init.subtitle || "Sign in to continue"
      ]);
    }
  }

  function initialize() {
    applyChrome();
    wireEvents();

    if (el.inputUserId) el.inputUserId.focus();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();