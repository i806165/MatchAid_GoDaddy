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
    fName:          document.getElementById("usFName"),
    lName:          document.getElementById("usLName"),
    email:          document.getElementById("usEMail"),
    mobilePhone:    document.getElementById("usMobilePhone"),
    carrierDisplay: document.getElementById("usCarrierDisplay"),
    carrierName:    document.getElementById("usCarrierName"),
    carrierEmpty:   document.getElementById("usCarrierEmpty"),
    contactMethod:  document.getElementById("usContactMethod"),
    preferenceYards:document.getElementById("usPreferenceYards"),
    smsHint:        document.getElementById("usSmsHint"),
    hcClubName:     document.getElementById("hcClubName"),
    hcAssocName:    document.getElementById("hcAssocName"),
    hcLocation:     document.getElementById("hcLocation"),
    hcStatus:       document.getElementById("hcStatus"),
    hcHandicap:     document.getElementById("hcHandicap"),
    hcLowHi:        document.getElementById("hcLowHi"),
    hcRevDate:      document.getElementById("hcRevDate"),
    hcCourses:      document.getElementById("hcCourses"),
    duGames:        document.getElementById("duGames"),
    duFavPlayers:   document.getElementById("duFavPlayers"),
    ssGrid:         document.getElementById("ssGrid"),
  };

  const state = {
    fields: {
      dbUser_FName:           "",
      dbUser_LName:           "",
      dbUser_EMail:           "",
      dbUser_MobilePhone:     "",
      dbUser_MobileCarrier:   "",
      dbUser_ContactMethod:   "",
      dbUser_PreferenceYards: null,
    },
    // ── Twilio lookup cache ──────────────────────────────────────────────────
    // Populated on successful mobile validation during doSave().
    // If phone hasn't changed since last lookup, cached result is reused —
    // no second Twilio call on retry.
    twilioResult: null,   // { phone, valid, carrier, gateway, type, error }

    contactMethodOptions:  [],
    sourceProfile:         {},
    dataUsage:             {},
    sessionInfo:           [],
    busy:  false,
    dirty: false,
  };

  // ── Chrome ──────────────────────────────────────────────────────────────────

  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["User Settings", "Profile & Contact", ""]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: false },
        right: { show: true, label: "Close", onClick: onBack },
        footer: state.dirty
          ? {
              save:   { label: "Save",   onClick: doSave },
              cancel: { label: "Cancel", onClick: onBack }
            }
          : null
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "admin", "player"],
        active:     "",
        onNavigate: (id) => { if (typeof MA.routerGo === "function") MA.routerGo(id); }
      });
    }
  }

  function setBusy(on) {
    state.busy = !!on;
    if (typeof MA.chrome.setFooterSaveDisabled === "function") {
      MA.chrome.setFooterSaveDisabled(!!on);
    }
  }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) setStatus("Unsaved changes.", "warn");
    else             setStatus("", "");
    applyChrome();
  }

  function onBack() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
      if (!ok) return;
    }
    if (typeof MA.routerGo === "function") { MA.routerGo("home"); return; }
    window.location.assign("/");
  }

  // ── Phone helpers ───────────────────────────────────────────────────────────

  function normalizePhoneForStore(raw) {
    return String(raw || "").replace(/\D+/g, "");
  }

  function formatPhoneForInput(raw) {
    const digits = normalizePhoneForStore(raw);
    if (digits.length !== 10) return digits;
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  // ── Carrier display ─────────────────────────────────────────────────────────

  function renderCarrierDisplay(carrier) {
    if (!el.carrierName || !el.carrierEmpty) return;

    if (carrier && carrier.trim() !== "") {
      el.carrierName.textContent = carrier;
      el.carrierName.style.display  = "";
      el.carrierEmpty.style.display = "none";
      if (el.carrierDisplay) el.carrierDisplay.classList.remove("usCarrier--error");
    } else {
      el.carrierName.textContent    = "";
      el.carrierName.style.display  = "none";
      el.carrierEmpty.style.display = "";
      if (el.carrierDisplay) el.carrierDisplay.classList.remove("usCarrier--error");
    }
  }

  function renderCarrierError() {
    if (!el.carrierName || !el.carrierEmpty) return;
    el.carrierName.textContent    = "";
    el.carrierName.style.display  = "none";
    el.carrierEmpty.style.display = "";
    if (el.carrierDisplay) el.carrierDisplay.classList.add("usCarrier--error");
  }

  // ── SMS hint ────────────────────────────────────────────────────────────────

  function renderSmsHint() {
    if (!el.smsHint) return;
    const phone   = normalizePhoneForStore(el.mobilePhone?.value || "");
    const carrier = state.fields.dbUser_MobileCarrier || "";
    const gateway = state.twilioResult?.gateway || "";

    el.smsHint.textContent = (phone && carrier && gateway)
      ? `SMS gateway: ${phone}${gateway}`
      : "";
  }

  // ── Contact method dropdown ─────────────────────────────────────────────────

  function populateContactMethodOptions() {
    const opts = Array.isArray(state.contactMethodOptions) ? state.contactMethodOptions : [];
    el.contactMethod.innerHTML = `<option value="">Select method</option>`;
    opts.forEach(opt => {
      const o = document.createElement("option");
      o.value       = String(opt.value || "");
      o.textContent = String(opt.label || opt.value || "");
      el.contactMethod.appendChild(o);
    });
  }

  // ── Preference yards ────────────────────────────────────────────────────────

  function populatePreferenceYardsOptions() {
    el.preferenceYards.innerHTML = `<option value="">Select yardage</option>`;
    PREFERENCE_YARDS_OPTIONS.forEach(opt => {
      const o = document.createElement("option");
      o.value       = String(opt.value || "");
      o.textContent = String(opt.label || opt.value || "");
      el.preferenceYards.appendChild(o);
    });
  }

  function preferenceYardsValueFromObject(pref) {
    if (!pref || typeof pref !== "object") return "";
    const min = Number(pref.min || 0);
    const max = Number(pref.max || 0);
    if (!min || !max) return "";
    const match = PREFERENCE_YARDS_OPTIONS.find(opt => Number(opt.min) === min && Number(opt.max) === max);
    return match ? String(match.value) : "";
  }

  function preferenceYardsObjectFromValue(value) {
    const match = PREFERENCE_YARDS_OPTIONS.find(opt => String(opt.value) === String(value || ""));
    if (!match) return null;
    return { min: Number(match.min), max: Number(match.max) };
  }

  // ── Home Club section ───────────────────────────────────────────────────────

  function renderHomeClub(profile) {
    if (!profile) return;

    const g0         = profile?.profileJson?.golfers?.[0] ?? profile?.golfers?.[0] ?? profile;
    const facilities = profile?.facilityJson?.facilities ?? [];

    const set = (node, val) => { if (node) node.textContent = val || "—"; };

    set(el.hcClubName,  g0?.club_name);
    set(el.hcAssocName, g0?.association_name);
    set(el.hcStatus,    g0?.status);
    set(el.hcHandicap,  g0?.handicap_index ? `${g0.handicap_index}` : null);
    set(el.hcLowHi,     g0?.low_hi         ? `${g0.low_hi}`         : null);

    const city  = g0?.city  ?? "";
    const st    = g0?.state ?? "";
    set(el.hcLocation, [city, st].filter(Boolean).join(", "));

    const rev = g0?.rev_date ?? "";
    if (rev && el.hcRevDate) {
      const d = new Date(rev + "T00:00:00");
      el.hcRevDate.textContent = isNaN(d)
        ? rev
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    const seen = new Set();
    const courses = [];
    facilities.forEach(f => {
      (f.home_courses ?? []).forEach(c => {
        if (c.name && !seen.has(c.name)) { seen.add(c.name); courses.push(c.name); }
      });
    });
    set(el.hcCourses, courses.length ? courses.join(", ") : null);
  }

  // ── Data Usage section ──────────────────────────────────────────────────────

  function renderDataUsage(dataUsage) {
    if (!dataUsage || !el.duGames || !el.duFavPlayers) return;
    el.duGames.textContent      = Number.isFinite(dataUsage.totalGames)
      ? dataUsage.totalGames.toLocaleString()
      : "—";
    el.duFavPlayers.textContent = Number.isFinite(dataUsage.favoritePlayers)
      ? dataUsage.favoritePlayers.toLocaleString()
      : "—";
  }

  // ── System Settings section ─────────────────────────────────────────────────

  function renderSystemSettings(sessionInfo) {
    if (!el.ssGrid) return;
    el.ssGrid.innerHTML = "";

    const items = Array.isArray(sessionInfo) ? sessionInfo : [];
    if (!items.length) {
      el.ssGrid.innerHTML = '<div class="ssEmpty">No session data available.</div>';
      return;
    }

    items.forEach(({ label, value }) => {
      const wrap  = document.createElement("div");
      const lbl   = document.createElement("div");
      const val   = document.createElement("div");

      lbl.className   = "maLabel";
      val.className   = "usReadOnly";
      lbl.textContent = String(label || "");
      val.textContent = String(value || "—");

      wrap.appendChild(lbl);
      wrap.appendChild(val);
      el.ssGrid.appendChild(wrap);
    });
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  function render() {
    el.fName.value       = state.fields.dbUser_FName || "";
    el.lName.value       = state.fields.dbUser_LName || "";
    el.email.value       = state.fields.dbUser_EMail || "";
    el.mobilePhone.value = formatPhoneForInput(state.fields.dbUser_MobilePhone || "");

    // Carrier is read-only — rendered from stored state, not a dropdown
    renderCarrierDisplay(state.fields.dbUser_MobileCarrier || "");

    populateContactMethodOptions();
    el.contactMethod.value = state.fields.dbUser_ContactMethod || "";

    populatePreferenceYardsOptions();
    el.preferenceYards.value = preferenceYardsValueFromObject(state.fields.dbUser_PreferenceYards);

    renderSmsHint();
    renderHomeClub(state.sourceProfile?.profile ?? null);
    renderDataUsage(state.dataUsage);
    renderSystemSettings(state.sessionInfo);
  }

  // ── Input wiring ────────────────────────────────────────────────────────────

  function wireInputs() {
    const markDirty = () => {
      state.fields.dbUser_FName           = String(el.fName.value         || "").trim();
      state.fields.dbUser_LName           = String(el.lName.value         || "").trim();
      state.fields.dbUser_EMail           = String(el.email.value         || "").trim();
      state.fields.dbUser_MobilePhone     = normalizePhoneForStore(el.mobilePhone.value || "");
      state.fields.dbUser_ContactMethod   = String(el.contactMethod.value  || "").trim();
      state.fields.dbUser_PreferenceYards = preferenceYardsObjectFromValue(el.preferenceYards.value);

      // If phone changed since last Twilio lookup, invalidate cache
      if (state.twilioResult && state.twilioResult.phone !== state.fields.dbUser_MobilePhone) {
        state.twilioResult = null;
        renderCarrierDisplay("");  // clear displayed carrier until re-validated
        state.fields.dbUser_MobileCarrier = "";
      }

      renderSmsHint();
      setDirty(true);
    };

    // Carrier field removed from dirty tracking — it is system-resolved
    [el.fName, el.lName, el.email, el.mobilePhone, el.contactMethod, el.preferenceYards]
      .forEach(node => {
        if (!node) return;
        node.addEventListener("input",  markDirty);
        node.addEventListener("change", markDirty);
      });
  }

  // ── Load context ────────────────────────────────────────────────────────────

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

      state.fields               = Object.assign({}, state.fields, payload.fields || {});
      state.contactMethodOptions = Array.isArray(payload.contactMethodOptions) ? payload.contactMethodOptions : [];
      state.sourceProfile        = payload.sourceProfile || {};
      state.dataUsage            = payload.dataUsage     || {};
      state.sessionInfo          = Array.isArray(payload.sessionInfo) ? payload.sessionInfo : [];

      // Seed Twilio cache from stored carrier so save doesn't re-lookup
      // if the user hasn't changed their phone number
      const storedPhone   = String(state.fields.dbUser_MobilePhone   || "");
      const storedCarrier = String(state.fields.dbUser_MobileCarrier || "");
      if (storedPhone && storedCarrier) {
        state.twilioResult = {
          phone:   storedPhone,
          valid:   true,
          carrier: storedCarrier,
          gateway: null,   // gateway not critical for display; resolved server-side on send
          type:    "mobile",
          error:   null,
        };
      }

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

  // ── Save ────────────────────────────────────────────────────────────────────

  function buildPatchFromUI() {
    return {
      dbUser_FName:           String(el.fName.value         || "").trim(),
      dbUser_LName:           String(el.lName.value         || "").trim(),
      dbUser_EMail:           String(el.email.value         || "").trim(),
      dbUser_MobilePhone:     normalizePhoneForStore(el.mobilePhone.value || ""),
      dbUser_MobileCarrier:   state.fields.dbUser_MobileCarrier || "",  // system-resolved
      dbUser_ContactMethod:   String(el.contactMethod.value  || "").trim(),
      dbUser_PreferenceYards: preferenceYardsObjectFromValue(el.preferenceYards.value),
    };
  }

  async function doSave() {
    if (state.busy) return;

    const patch = buildPatchFromUI();

    // ── Phase 1: Required field validation (no API calls) ──────────────────
    if (!patch.dbUser_FName)
      return setStatus("First name is required.", "error");

    if (!patch.dbUser_LName)
      return setStatus("Last name is required.", "error");

    if (!patch.dbUser_ContactMethod)
      return setStatus("Select a preferred contact method.", "error");

    if (patch.dbUser_ContactMethod === "Email" && !patch.dbUser_EMail)
      return setStatus("Email is required when contact method is Email.", "error");

    if (patch.dbUser_ContactMethod === "SMS") {
      if (!patch.dbUser_MobilePhone)
        return setStatus("Mobile phone is required when contact method is SMS.", "error");
    }

    // ── Phase 2: Twilio mobile validation (only if mobile is present) ──────
    if (patch.dbUser_MobilePhone) {

      // Use cached result if phone hasn't changed since last lookup
      const cached = state.twilioResult;
      const needsLookup = !cached || cached.phone !== patch.dbUser_MobilePhone;

      if (needsLookup) {
        setBusy(true);
        setStatus("Validating mobile number...", "info");

        try {
          const res = await apiCall("validateMobile.php", { mobile: patch.dbUser_MobilePhone });

          if (!res || !res.valid) {
            renderCarrierError();
            setBusy(false);
            return setStatus(res?.message || "Mobile number is invalid.", "error");
          }

          // Cache the result
          state.twilioResult = {
            phone:   patch.dbUser_MobilePhone,
            valid:   true,
            carrier: res.carrier || "",
            gateway: res.gateway || "",
            type:    res.type    || "mobile",
            error:   null,
          };

          // Update carrier in fields and display
          state.fields.dbUser_MobileCarrier = res.carrier || "";
          patch.dbUser_MobileCarrier        = res.carrier || "";
          renderCarrierDisplay(res.carrier || "");
          renderSmsHint();

        } catch (e) {
          setBusy(false);
          return setStatus("Mobile validation failed. Please try again.", "error");
        }

        setBusy(false);

      } else {
        // Use cached — ensure patch carries the resolved carrier
        patch.dbUser_MobileCarrier = cached.carrier || "";
      }
    } else {
      // No mobile — clear carrier
      state.fields.dbUser_MobileCarrier = "";
      patch.dbUser_MobileCarrier        = "";
      state.twilioResult                = null;
      renderCarrierDisplay("");
    }

    // ── Phase 3: Server save ───────────────────────────────────────────────
    setBusy(true);
    try {
      const res = await apiCall("saveUserSettings.php", { patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      const payload = res.payload || {};
      state.fields               = Object.assign({}, state.fields, payload.fields || {});
      state.contactMethodOptions = Array.isArray(payload.contactMethodOptions)
        ? payload.contactMethodOptions
        : state.contactMethodOptions;

      render();
      setDirty(false);
      setStatus("User settings saved.", "success");

      const postSaveAction = (window.__MA_INIT__?.postSaveAction) || "home";
      setTimeout(() => {
        if (typeof MA.routerGo === "function") MA.routerGo(postSaveAction);
      }, 800);

    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────────

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