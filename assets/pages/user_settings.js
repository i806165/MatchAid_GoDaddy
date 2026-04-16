/* /assets/pages/user_settings.js */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const routes = MA.routes || {};
  const usApiBase = routes.apiUserSettings || MA.paths?.apiUserSettings || "/api/user_settings";

  function apiCall(endpointFile, payloadObj) {
    const baseClean = String(usApiBase || "").replace(/\/$/, "");
    const fileClean = String(endpointFile || "").replace(/^\//, "");
    return postJson(`${baseClean}/${fileClean}`, { payload: payloadObj || {} });
  }

  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : (msg, level) => {
        const el = document.getElementById("chromeStatusLine");
        if (!el) return;
        el.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
        el.textContent = msg || "";
      };

  const el = {
    fName: document.getElementById("usFName"),
    lName: document.getElementById("usLName"),
    email: document.getElementById("usEMail"),
    mobilePhone: document.getElementById("usMobilePhone"),
    mobileCarrier: document.getElementById("usMobileCarrier"),
    smsHint: document.getElementById("usSmsHint"),
  };

  const state = {
    fields: {
      dbUser_FName: "",
      dbUser_LName: "",
      dbUser_EMail: "",
      dbUser_MobilePhone: "",
      dbUser_MobileCarrier: "",
    },
    carrierOptions: [],
    sourceProfile: {},
    busy: false,
    dirty: false,
  };

  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["User Settings", "Profile & Contact", ""]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Exit", onClick: onBack },
        right: { show: true, label: "Save", onClick: doSave }
      });
      syncActionDisabled();
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["home", "player"],
        active: "home",
        onNavigate: (id) => {
          if (typeof MA.routerGo === "function") MA.routerGo(id);
        }
      });
    }
  }

  function syncActionDisabled() {
    const rightBtn = document.getElementById("chromeBtnRight");
    if (rightBtn) {
      const disabled = !!state.busy || !state.dirty;
      rightBtn.disabled = disabled;
      rightBtn.classList.toggle("is-disabled", disabled);
    }
  }

  function setBusy(on) {
    state.busy = !!on;
    syncActionDisabled();
  }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) setStatus("Unsaved changes.", "warn");
    else setStatus("", "");
    syncActionDisabled();
  }

  function onBack() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
      if (!ok) return;
    }

    if (typeof MA.routerGo === "function") {
      MA.routerGo("home");
      return;
    }
    window.location.assign("/");
  }

  function normalizePhoneForStore(raw) {
    return String(raw || "").replace(/\D+/g, "");
  }

  function formatPhoneForInput(raw) {
    const digits = normalizePhoneForStore(raw);
    if (digits.length !== 10) return digits;
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  function populateCarrierOptions() {
    const opts = Array.isArray(state.carrierOptions) ? state.carrierOptions : [];
    el.mobileCarrier.innerHTML = `<option value="">Select carrier</option>`;
    opts.forEach(opt => {
      const o = document.createElement("option");
      o.value = String(opt.value || "");
      o.textContent = String(opt.label || opt.value || "");
      el.mobileCarrier.appendChild(o);
    });
  }

  function renderSmsHint() {
    const carrier = String(el.mobileCarrier.value || "");
    const phone = normalizePhoneForStore(el.mobilePhone.value);
    const match = (state.carrierOptions || []).find(o => String(o.value || "") === carrier);
    if (phone && carrier && match && match.gateway) {
      el.smsHint.textContent = `SMS email gateway: ${phone}${match.gateway}`;
    } else {
      el.smsHint.textContent = "";
    }
  }

  function render() {
    el.fName.value = state.fields.dbUser_FName || "";
    el.lName.value = state.fields.dbUser_LName || "";
    el.email.value = state.fields.dbUser_EMail || "";
    el.mobilePhone.value = formatPhoneForInput(state.fields.dbUser_MobilePhone || "");
    populateCarrierOptions();
    el.mobileCarrier.value = state.fields.dbUser_MobileCarrier || "";
    renderSmsHint();
  }

  function wireInputs() {
    const markDirty = () => {
      state.fields.dbUser_FName = String(el.fName.value || "").trim();
      state.fields.dbUser_LName = String(el.lName.value || "").trim();
      state.fields.dbUser_EMail = String(el.email.value || "").trim();
      state.fields.dbUser_MobilePhone = normalizePhoneForStore(el.mobilePhone.value || "");
      state.fields.dbUser_MobileCarrier = String(el.mobileCarrier.value || "").trim();
      renderSmsHint();
      setDirty(true);
    };

    [el.fName, el.lName, el.email, el.mobilePhone, el.mobileCarrier].forEach(node => {
      if (!node) return;
      node.addEventListener("input", markDirty);
      node.addEventListener("change", markDirty);
    });
  }

  function readInit() {
    return window.__MA_INIT__ || window.__INIT__ || null;
  }

  async function loadContext() {
    setBusy(true);
    try {
      const init = readInit();
      if (!init || !init.ok) throw new Error("Missing or invalid __INIT__ payload.");

      const res = await apiCall("initUserSettings.php", {});
      if (!res || !res.ok) throw new Error(res?.message || "Could not load user settings.");

      const payload = res.payload || {};
      state.fields = Object.assign({}, state.fields, payload.fields || {});
      state.carrierOptions = Array.isArray(payload.carrierOptions) ? payload.carrierOptions : [];
      state.sourceProfile = payload.sourceProfile || {};

      render();
      setDirty(false);
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
      applyChrome();
    }
  }

  function buildPatchFromUI() {
    return {
      dbUser_FName: String(el.fName.value || "").trim(),
      dbUser_LName: String(el.lName.value || "").trim(),
      dbUser_EMail: String(el.email.value || "").trim(),
      dbUser_MobilePhone: normalizePhoneForStore(el.mobilePhone.value || ""),
      dbUser_MobileCarrier: String(el.mobileCarrier.value || "").trim(),
    };
  }

  async function doSave() {
    if (state.busy) return;

    const patch = buildPatchFromUI();

    if (!patch.dbUser_FName) return setStatus("First name is required.", "error");
    if (!patch.dbUser_LName) return setStatus("Last name is required.", "error");
    if (patch.dbUser_MobilePhone && !patch.dbUser_MobileCarrier) {
      return setStatus("Select a mobile carrier.", "error");
    }

    setBusy(true);
    try {
      const res = await apiCall("saveUserSettings.php", { patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      const payload = res.payload || {};
      state.fields = Object.assign({}, state.fields, payload.fields || {});
      state.carrierOptions = Array.isArray(payload.carrierOptions) ? payload.carrierOptions : state.carrierOptions;
      render();
      setDirty(false);
      setStatus("User settings saved.", "success");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
    }
  }

  function init() {
    applyChrome();
    wireInputs();
    loadContext();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();