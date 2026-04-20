/* /assets/pages/user_settings.js */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const routes = MA.routes || {};
  const usApiBase = routes.apiUserSettings || MA.paths?.apiUserSettings || "/api/user_settings";

  const PREFERENCE_YARDS_OPTIONS = [
    { value: "0-4799",    min: 0,    max: 4799, label: "Under 4,800" },
    { value: "4800-5099", min: 4800, max: 5099, label: "4,800-5,099" },
    { value: "5100-5399", min: 5100, max: 5399, label: "5,100-5,399" },
    { value: "5400-5699", min: 5400, max: 5699, label: "5,400-5,699" },
    { value: "5700-5999", min: 5700, max: 5999, label: "5,700-5,999" },
    { value: "6000-6299", min: 6000, max: 6299, label: "6,000-6,299" },
    { value: "6300-6599", min: 6300, max: 6599, label: "6,300-6,599" },
    { value: "6600-6899", min: 6600, max: 6899, label: "6,600-6,899" },
    { value: "6900-9999", min: 6900, max: 9999, label: "Over 6,900" }
  ];

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
    contactMethod: document.getElementById("usContactMethod"),
    preferenceYards: document.getElementById("usPreferenceYards"),
    smsHint: document.getElementById("usSmsHint"),
    };

  const state = {
        fields: {
        dbUser_FName: "",
        dbUser_LName: "",
        dbUser_EMail: "",
        dbUser_MobilePhone: "",
        dbUser_MobileCarrier: "",
        dbUser_ContactMethod: "",
        dbUser_PreferenceYards: null,
        },
        carrierOptions: [],
        contactMethodOptions: [],
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

  function populateContactMethodOptions() {
    const opts = Array.isArray(state.contactMethodOptions) ? state.contactMethodOptions : [];
    el.contactMethod.innerHTML = `<option value="">Select method</option>`;
    opts.forEach(opt => {
        const o = document.createElement("option");
        o.value = String(opt.value || "");
        o.textContent = String(opt.label || opt.value || "");
        el.contactMethod.appendChild(o);
    });
    }

  function populatePreferenceYardsOptions() {
    const opts = Array.isArray(PREFERENCE_YARDS_OPTIONS) ? PREFERENCE_YARDS_OPTIONS : [];
    el.preferenceYards.innerHTML = `<option value="">Select yardage</option>`;
    opts.forEach(opt => {
      const o = document.createElement("option");
      o.value = String(opt.value || "");
      o.textContent = String(opt.label || opt.value || "");
      el.preferenceYards.appendChild(o);
    });
  }

  function preferenceYardsValueFromObject(pref) {
    if (!pref || typeof pref !== "object") return "";
    const min = Number(pref.min || 0);
    const max = Number(pref.max || 0);
    if (!min || !max) return "";

    const match = PREFERENCE_YARDS_OPTIONS.find(opt =>
      Number(opt.min) === min && Number(opt.max) === max
    );
    return match ? String(match.value) : "";
  }

  function preferenceYardsObjectFromValue(value) {
    const match = PREFERENCE_YARDS_OPTIONS.find(opt => String(opt.value) === String(value || ""));
    if (!match) return null;

    return {
      min: Number(match.min),
      max: Number(match.max),
    };
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

        populateContactMethodOptions();
        el.contactMethod.value = state.fields.dbUser_ContactMethod || "";

        populatePreferenceYardsOptions();
        el.preferenceYards.value = preferenceYardsValueFromObject(state.fields.dbUser_PreferenceYards);

        renderSmsHint();
    }

  function wireInputs() {
    const markDirty = () => {
        state.fields.dbUser_FName = String(el.fName.value || "").trim();
        state.fields.dbUser_LName = String(el.lName.value || "").trim();
        state.fields.dbUser_EMail = String(el.email.value || "").trim();
        state.fields.dbUser_MobilePhone = normalizePhoneForStore(el.mobilePhone.value || "");
        state.fields.dbUser_MobileCarrier = String(el.mobileCarrier.value || "").trim();
        state.fields.dbUser_ContactMethod = String(el.contactMethod.value || "").trim();
        state.fields.dbUser_PreferenceYards = preferenceYardsObjectFromValue(el.preferenceYards.value);
        renderSmsHint();
        setDirty(true);
    };

    [el.fName, el.lName, el.email, el.mobilePhone, el.mobileCarrier, el.contactMethod, el.preferenceYards].forEach(node => { 
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
        state.contactMethodOptions = Array.isArray(payload.contactMethodOptions) ? payload.contactMethodOptions : [];
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
            dbUser_ContactMethod: String(el.contactMethod.value || "").trim(),
            dbUser_PreferenceYards: preferenceYardsObjectFromValue(el.preferenceYards.value),
        };
    }

  async function doSave() {
    if (state.busy) return;

    const patch = buildPatchFromUI();

    if (!patch.dbUser_FName) return setStatus("First name is required.", "error");
    if (!patch.dbUser_LName) return setStatus("Last name is required.", "error");
    if (!patch.dbUser_ContactMethod) return setStatus("Select a preferred contact method.", "error");

    if (patch.dbUser_MobilePhone && !patch.dbUser_MobileCarrier) {
    return setStatus("Select a mobile carrier.", "error");
    }

    if (patch.dbUser_ContactMethod === "Email" && !patch.dbUser_EMail) {
    return setStatus("Email is required when contact method is Email.", "error");
    }

    if (patch.dbUser_ContactMethod === "SMS") {
    if (!patch.dbUser_MobilePhone) return setStatus("Mobile phone is required when contact method is SMS.", "error");
    if (!patch.dbUser_MobileCarrier) return setStatus("Mobile carrier is required when contact method is SMS.", "error");
    }

    setBusy(true);
    try {
      const res = await apiCall("saveUserSettings.php", { patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      const payload = res.payload || {};
        state.fields = Object.assign({}, state.fields, payload.fields || {});
        state.carrierOptions = Array.isArray(payload.carrierOptions) ? payload.carrierOptions : state.carrierOptions;
        state.contactMethodOptions = Array.isArray(payload.contactMethodOptions) ? payload.contactMethodOptions : state.contactMethodOptions;
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