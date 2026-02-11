import wixData from 'wix-data';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import { session } from 'wix-storage';
import { getStoredGameData } from 'backend/gameStorage.jsw';
import { be_getCourseTeeSets } from 'backend/GHIN_API_Courses.jsw';
import { be_checkHandicapDataFactors, be_recalculateGameHandicaps, be_calculateGamePHSO } from 'backend/GHIN_API_Handicaps.jsw'


import { initializeUserContext } from 'public/User_Access';

let globalGGID = null;
let storedGameData = null;
let globalPlayers = [];
let globalAdminToken = null;
let originalGameData

let globalCourseInfo = null; // raw GHIN payload (optional to keep)
let globalCoursePars = null; // flattened array [{hole, par}, ...]
let courseParsCache = {}; // cache by courseId (since course info not dynamic)

let htmlReady = false;
let initPayload = null;

$w.onReady(async function () {
    const sessionGGID = session.getItem('SessionStoredGGID');
    if (!sessionGGID) {
        wixLocation.to('/');
        return;
    }

    const htmlComp = $w('#htmlSettings');
    if (htmlComp && typeof htmlComp.onMessage === 'function') {
        htmlComp.onMessage(async (event) => {
            await handleHtmlMessage(event);
        });
    } else {
        console.warn('[GameSettings] #htmlSettings not found or onMessage unsupported.');
    }

    // Load context + data (independent of READY)
    await launchPage();

    // If READY already happened, send INIT now
    sendInitIfReady();
});

// -------------------------
// Context + data loading
// -------------------------
async function launchPage() {
    // Prefer lightbox context GGID (canonical)
    const formContext = wixWindow.lightbox.getContext();
    if (!formContext?.GGID) {
        wixLocation.to('/gameslist');
        return;
    }
    globalGGID = formContext.GGID;

    // Admin token (kept for parity / possible downstream use)
    const context = await initializeUserContext();
    if (!context) {
        wixLocation.to('/gameslist');
        return;
    }
    globalAdminToken = context.adminToken;

    // Game + roster
    storedGameData = await getStoredGameData(globalGGID);
    if (!storedGameData) {
        wixLocation.to('/gameslist');
        return;
    }
    originalGameData = storedGameData

    globalPlayers = await getPlayersForGame(globalGGID);

    const courseId = storedGameData?.dbGames_CourseID;
    if (courseId) {
        try {
            const courseBundle = await getCoursePars();
            globalCourseInfo = courseBundle?.raw || null; // optional
            globalCoursePars = courseBundle?.pars || null; // [{hole, par}, ...]
        } catch (e) {
            console.warn("[GameSettings] Course pars fetch failed:", e);
            globalCourseInfo = null;
            globalCoursePars = null;
        }
    }

    // INIT payload expected by MatchAid_Game_Settings.html
    initPayload = {
        game: storedGameData,
        players: globalPlayers,
        coursePars: globalCoursePars || [] // ✅ flattened pars array for HTML
    };
}

// -------------------------
// HTML message router
// -------------------------
async function handleHtmlMessage(event) {
    const msg = event?.data || {};
    const type = msg?.type || '';
    const payload = msg?.payload || {};
    const requestId = msg?.requestId || null;

    switch (type) {
        case 'READY':
            htmlReady = true;
            sendInitIfReady();
            break;

        case 'CANCEL':
            wixWindow.lightbox.close();
            break;

        case 'SAVE':
            await handleSave(payload, requestId);
            break;

        case 'STATUS':
            //console.log('[GameSettings][STATUS]', payload?.level, payload?.message);
            break;

        default:
            console.log('[GameSettings] Unhandled message from HTML:', msg);
    }
}

// -------------------------
// Save handler
// -------------------------
async function handleSave(payload, requestId) {
    const updates = payload?.updates || {};
    if (!globalGGID) {
        postToHtml('SAVE_RESULT', { status: 'ERROR', message: 'Missing GGID context.' }, requestId);
        return;
    }

    try {
        switch (updates.dbGames_HCEffectivity) {
            case null:
            case undefined:
            case "":
                updates.dbGames_HCEffectivity = "PlayDate";
                updates.dbGames_HCEffectivityDate = toYMD(updates.dbGames_PlayDate);
                break;

            case "PlayDate":
                updates.dbGames_HCEffectivityDate = toYMD(updates.dbGames_PlayDate);
                break;

            case "Date": {
                const playYMD = toYMD(updates.dbGames_PlayDate);
                const effYMD = String(updates.dbGames_HCEffectivityDate || "")
                    .trim()
                    .replace(/^"+|"+$/g, "")
                    .slice(0, 10);

                if (!effYMD || (effYMD > playYMD)) {
                    updates.dbGames_HCEffectivityDate = playYMD;
                } else {
                    updates.dbGames_HCEffectivityDate = effYMD; // ensure stored as YYYY-MM-DD
                }
                break;
            }

            default:
                // safest fallback: treat as PlayDate, don't erase
                updates.dbGames_HCEffectivityDate = null
                break;
        }

        // 2) Blind players array shape
        if (!Array.isArray(updates.dbGames_BlindPlayers)) {
            updates.dbGames_BlindPlayers = [];
        }

        // 3) Allowance numeric
        if (typeof updates.dbGames_Allowance !== 'number') {
            const n = Number(updates.dbGames_Allowance);
            updates.dbGames_Allowance = Number.isFinite(n) ? n : 100;
        }

        // Persist
        //console.log("[BEFORE UPDATE] type:", typeof updates.dbGames_HCEffectivityDate,
        //    "isDate:", updates.dbGames_HCEffectivityDate instanceof Date,
        //    "value:", updates.dbGames_HCEffectivityDate);

        await updateGameByGGID(globalGGID, updates);

        // Refresh game bundle, Check to see if handicaps need to be refreshed.
        storedGameData = await getStoredGameData(globalGGID);
        const isHandicapRefreshNeeded = await be_checkHandicapDataFactors(originalGameData, storedGameData)
        if (isHandicapRefreshNeeded) {
            const resultHC = await be_recalculateGameHandicaps(storedGameData.dbGames_GGID, "allPlayers", storedGameData, globalAdminToken);
            const resultPHSO = await be_calculateGamePHSO("game", storedGameData.dbGames_GGID, storedGameData, globalAdminToken);
        }

        // Notify HTML (useful if you later choose not to auto-close)
        postToHtml('SAVE_RESULT', { status: 'OK', game: storedGameData }, requestId);

        // Legacy behavior: close lightbox and return updated game object
        wixWindow.lightbox.close(storedGameData);

    } catch (err) {
        console.error('[GameSettings] Save failed', err);
        postToHtml('SAVE_RESULT', {
            status: 'ERROR',
            message: 'Error updating game. Please try again.'
        }, requestId);
    }

}

// -------------------------
// Data helpers
// -------------------------
async function getPlayersForGame(ggid) {
    const result = await wixData.query('db_Players')
        .eq('dbPlayers_GGID', ggid)
        .ascending('dbPlayers_LName')
        .limit(1000)
        .find({ consistentRead: true });

    return result.items || [];
}

export async function updateGameByGGID(ggid, updates) {

    const result = await wixData.query('db_Games')
        .eq('dbGames_GGID', ggid)
        .limit(1)
        .find();

    if (!result.items || result.items.length === 0) {
        throw new Error(`No game found with GGID: ${ggid}`);
    }

    return await wixData.update('db_Games', { ...result.items[0], ...updates });
}
// -------------------------
// HTML messaging helpers
// -------------------------
function safeCloneForPostMessage(obj) {
    // Normalize Dates for predictable cross-frame payloads.
    return JSON.parse(JSON.stringify(obj, (_k, v) => {
        if (v instanceof Date) return v.toISOString();
        return v;
    }));
}

function postToHtml(type, payload = {}, requestId = null) {
    const htmlComp = $w('#htmlSettings');
    if (!htmlComp || typeof htmlComp.postMessage !== 'function') {
        console.warn('[GameSettings] htmlSettings component not found / postMessage unavailable');
        return;
    }

    const message = {
        type,
        payload: safeCloneForPostMessage(payload),
        requestId: requestId || undefined,
        version: '1.0'
    };

    try {
        htmlComp.postMessage(message);
    } catch (err) {
        console.error('[GameSettings] postMessage failed', err);
    }
}

function sendInitIfReady() {
    if (!htmlReady || !initPayload) return;
    postToHtml('INIT', initPayload);
}

function displayStatusMessage(parmMessage, parmSeverity) {
    // level = "success", "warn", "error"
    postToHtml({ type: "STATUS", message: parmMessage, level: parmSeverity });
}

async function getCoursePars() {
    const key = String(storedGameData.dbGames_CourseID);
    if (courseParsCache[key]) return courseParsCache[key];

    const raw = await be_getCourseTeeSets(storedGameData.dbGames_CourseID, globalAdminToken);
    const pars = flattenCoursePars(raw); // [{hole:1, par:4}, ...]

    const bundle = { raw, pars };
    courseParsCache[key] = bundle;
    return bundle;
}

function flattenCoursePars(raw) {
    // Returns:
    // [
    //   { hole: 1, par: 4, parM: 4, parF: 4, parText: "Par 4" },
    //   { hole: 2, par: 4, parM: 4, parF: 5, parText: "Par 4/5" },
    //   ...
    // ]
    //
    // par = default (prefer Male if present, else Female)

    const teeSets = raw?.TeeSets;
    if (!Array.isArray(teeSets) || teeSets.length === 0) return [];

    // --- hard-coded gender filters (no parameters) ---
    const maleSets = teeSets.filter(ts => String(ts?.Gender || "").toLowerCase() === "male");
    const femaleSets = teeSets.filter(ts => String(ts?.Gender || "").toLowerCase() === "female");

    // Prefer first full 18-hole set, else first with holes
    const malePreferred =
        maleSets.find(ts => Array.isArray(ts?.Holes) && ts.Holes.length >= 18) ||
        maleSets.find(ts => Array.isArray(ts?.Holes) && ts.Holes.length > 0) ||
        null;

    const femalePreferred =
        femaleSets.find(ts => Array.isArray(ts?.Holes) && ts.Holes.length >= 18) ||
        femaleSets.find(ts => Array.isArray(ts?.Holes) && ts.Holes.length > 0) ||
        null;

    const maleHoles = Array.isArray(malePreferred?.Holes) ? malePreferred.Holes : [];
    const femaleHoles = Array.isArray(femalePreferred?.Holes) ? femalePreferred.Holes : [];

    // Build maps: holeNum -> par
    const mMap = {};
    maleHoles.forEach(h => {
        const hole = Number(h?.Number);
        const par = Number(h?.Par);
        if (Number.isFinite(hole) && Number.isFinite(par)) mMap[hole] = par;
    });

    const fMap = {};
    femaleHoles.forEach(h => {
        const hole = Number(h?.Number);
        const par = Number(h?.Par);
        if (Number.isFinite(hole) && Number.isFinite(par)) fMap[hole] = par;
    });

    // Union of holes from both maps
    const holes = Array.from(new Set([
        ...Object.keys(mMap).map(Number),
        ...Object.keys(fMap).map(Number)
    ]))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);

    return holes.map(holeNum => {
        const parM = Number.isFinite(mMap[holeNum]) ? mMap[holeNum] : null;
        const parF = Number.isFinite(fMap[holeNum]) ? fMap[holeNum] : null;

        let parText = "Par ?";
        if (parM != null && parF != null) {
            parText = (parM === parF) ? `Par ${parM}` : `Par ${parM}/${parF}`;
        } else if (parM != null) {
            parText = `Par ${parM}`;
        } else if (parF != null) {
            parText = `Par ${parF}`;
        }

        const par = (parM != null) ? parM : ((parF != null) ? parF : null);

        return { hole: holeNum, par, parM, parF, parText };
    });
}

function toYMD(d) {
    //console.log("date", d)
    if (!d) return null;

    // Wix dbGames_PlayDate might be a Date, or sometimes a string.
    const dt = (d instanceof Date) ? d : new Date(d);

    // Guard: invalid date
    if (isNaN(dt.getTime())) return null;

    // Use LOCAL date parts (not UTC) to avoid day-shift surprises
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function parseYMDToLocalDate(ymd) {
    // Accepts "YYYY-MM-DD" and returns a local Date (set to noon to avoid TZ rollbacks)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d, 12, 0, 0, 0); // noon local
}

function toDateOnly(raw) {
    if (!raw) return null;
    if (raw instanceof Date) {
        const d = new Date(raw);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    const s = String(raw).trim(); // can be "YYYY-MM-DD" or ISO
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    const d = new Date(s); // ISO string path
    d.setHours(0, 0, 0, 0);
    return d;
}

function normalizeDateOnlyFromISO(isoYMD) {
    const s = String(isoYMD || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);

    return new Date(y, mo, d, 0, 0, 0, 0); // LOCAL midnight
}