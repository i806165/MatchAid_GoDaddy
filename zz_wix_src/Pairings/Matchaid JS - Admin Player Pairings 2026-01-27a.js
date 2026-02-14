import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { session } from 'wix-storage';
import wixLocation from 'wix-location';
import { getStoredGameData } from 'backend/gameStorage.jsw';
import { initializeUserContext } from 'public/User_Access'
import { wireNavigationButtons, renderNavigationButtons } from 'public/Page_Rendering';

let globalAdminToken;
let globalUserProfile;
let globalUserID
let globalUserName
let globalAssocID
let globalAssocName
let globalFacilityID
let globalClubID
let globalState

let allPlayers = []; // Array to store all players for the current game
let selectedPlayers = []; // Array to store selected players
let storedGameData
let globalGGID
let unpairedPlayerCnt
let htmlIsReady = false;
let htmlWired = false

$w.onReady(function () {
    $w("#frmStateBox").changeState("tabSplash");
    wireNavigationButtons($w);
    launchPage_v2();
});

/////////////////////////////////////////////////////////////////////////////////////////////////////
async function launchPage_v2() {
    const context = await initializeUserContext();
    if (!context) {
        const txtNAVPage = wixLocation.path[0] || "favorites";
        session.setItem("SessionNAVPage", txtNAVPage);
        wixLocation.to("/matchloginv2");
        return;
    }

    globalAdminToken = context.adminToken;
    globalUserProfile = context.userProfile;
    session.setItem("SessionNAVPage", "");
    const golfer = globalUserProfile.profileJson?.golfers?.[0];
    if (golfer) {
        globalUserName = golfer.first_name + " " + golfer.last_name;
        globalUserID = golfer.ghin
        globalAssocName = golfer.association_name
        globalAssocID = golfer.association_id
        globalFacilityID = globalUserProfile.facilityJson?.facilities?.[0]?.facility_id;
        globalClubID = golfer.club_id
        globalState = golfer.state
    }
    await InitializePage(); // page-specific logic
}

async function InitializePage() {
    wireHtmlMessaging()
    renderNavigationButtons($w);
    $w("#frmStateBox").changeState("tabPairings");

    storedGameData = await getStoredGameData(session.getItem("SessionStoredGGID")) //NEW!!
    if (!storedGameData) {
        let txtMessage = "System Error: GameData parameters are invalid";
        displayStatusMessage(txtMessage, "error")
        console.log("System Error: GameData parameters are invalid " + globalGGID);
        wixLocation.to("/");
        return;
    }
    globalGGID = storedGameData.dbGames_GGID

    //NOTE to CHATGPT: Legacy Function Calls below.  Need to evaluate applicability in new HTML version
    await loadAllPlayersForGame()
    await pushInitToGameHtml();
}

async function pushInitToGameHtml() {
    const mappedGamePlayers = (Array.isArray(allPlayers) ? allPlayers : []).map(mapGamePlayer);

    postToHTML({
        type: "INIT",
        selfGhin: globalUserID || "",
        selfName: globalUserName || "",
        userState: globalState || "",
        game: mapGameForHtml(storedGameData),
        gamePlayers: mappedGamePlayers
    });
    displayStatusMessage("READY", "")

    // Don’t send "READY" here — READY is the HTML handshake
}

function mapGameForHtml(gameRow) {
    // NOTE: This returns the UI/patch schema the HTML expects.
    // It is intentionally "date-only" and "HH:MM" for time.
    if (!gameRow) return null;

    // --- date-only: YYYY-MM-DD (ignore time) ---
    let playDateISO = "";
    try {
        const d = gameRow.dbGames_PlayDate ? new Date(gameRow.dbGames_PlayDate) : null;
        if (d && !isNaN(d.getTime())) {
            // Use UTC components to avoid drift
            const yyyy = d.getUTCFullYear();
            const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(d.getUTCDate()).padStart(2, "0");
            playDateISO = `${yyyy}-${mm}-${dd}`;
        }
    } catch (e) {
        playDateISO = "";
    }

    // --- timeHHMM: "HH:MM" (24h) derived from "HH:MM:SS.000" ---
    const pt = String(gameRow.dbGames_PlayTime || "").trim();
    let timeHHMM = "";
    const m = pt.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
        const hh = String(parseInt(m[1], 10)).padStart(2, "0");
        const mm = String(parseInt(m[2], 10)).padStart(2, "0");
        timeHHMM = `${hh}:${mm}`;
    }

    return {
        ggid: String(gameRow.dbGames_GGID || ""),
        title: gameRow.dbGames_Title || "",

        // date/time in HTML-friendly fields
        playDateISO, // <-- date-only, no time
        timeHHMM, // <-- "HH:MM" 24h

        holes: gameRow.dbGames_Holes || "All 18",
        privacy: gameRow.dbGames_Privacy || "Open",
        competition: gameRow.dbGames_Competition,

        // nested course object matches your SAVE comment schema
        course: {
            facilityId: String(gameRow.dbGames_FacilityID || ""),
            facilityName: gameRow.dbGames_FacilityName || "",
            courseId: String(gameRow.dbGames_CourseID || ""),
            courseName: gameRow.dbGames_CourseName || ""
        },

        teeTimeCnt: Number(gameRow.dbGames_TeeTimeCnt || 1),
        teeTimeInterval: Number(gameRow.dbGames_TeeTimeInterval || 10),

        // optional extras
        adminName: gameRow.dbGames_AdminName || "",
        allowance: gameRow.dbGames_Allowance ?? null
    };
}

function postToHTML(msg) {
    $w("#htmlPairings").postMessage(msg);
}

function wireHtmlMessaging() {
    if (htmlWired) return;
    htmlWired = true;

    $w("#htmlPairings").onMessage(async (event) => {
        displayStatusMessage("", "");
        const msg = event.data || {};

        try {
            if (msg.type === "READY") {
                htmlIsReady = true;
                return;
            }

            if (msg.type === "SAVE_PAIRINGS") {
                const payload = msg.payload || {};
                const ggid = String(payload.ggid || globalGGID || "");
                const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
                const matches = Array.isArray(payload.matches) ? payload.matches : [];

                if (!ggid) {
                    displayStatusMessage("Save failed: missing GGID.", "error");
                    return;
                }

                // If HTML says nothing changed, no-op (HTML already guards, but safe)
                if (assignments.length === 0) {
                    displayStatusMessage("No pairing changes to save.", "success");
                    return;
                }

                displayStatusMessage(`Saving ${assignments.length} change(s)…`, "warn");

                await savePairings(assignments);

                // Re-hydrate from DB and re-init HTML (canonical truth)
                await loadAllPlayersForGame();
                await pushInitToGameHtml();

                displayStatusMessage("Changes saved.", "success");
                return;
            }
            if (msg.type === "OPEN_GAME_OPTIONS") {
                wixWindow.openLightbox("Game Settings", {
                    GGID: storedGameData.dbGames_GGID
                }).then(async (updatedGameData) => {
                    if (updatedGameData) {
                        storedGameData = updatedGameData;
                        await loadAllPlayersForGame();
                        await pushInitToGameHtml();
                        displayStatusMessage("Game settings Updated", "success");
                    } else {
                        displayStatusMessage("Game settings not updated", "");
                    }
                });
                return;
            }
            if (msg.type === "RESET_REQUEST") {
                await loadAllPlayersForGame();
                await pushInitToGameHtml();
                displayStatusMessage("Groups restored to the last save.", "success");
                return;
            }
        } catch (e) {
            console.log("HTML Pairings message error:", e);
            displayStatusMessage(e?.message, "error");
        }
    });
}

function mapGamePlayer(p) {
    return {
        // identity
        playerGGID: p.dbPlayers_GGID,
        playerGHIN: p.dbPlayers_PlayerGHIN,
        localId: p.dbPlayers_LocalID,
        displayName: p.dbPlayers_Name,
        lastName: p.dbPlayers_LName,
        gender: p.dbPlayers_Gender,

        // handicap + tee (for tray + card summaries + autopair parity)
        hi: numOrNull(p.dbPlayers_HI),
        ch: numOrNull(p.dbPlayers_CH),
        ph: numOrNull(p.dbPlayers_PH),
        so: numOrNull(p.dbPlayers_SO),

        teeSetId: p.dbPlayers_TeeSetID,
        teeSetName: p.dbPlayers_TeeSetName,
        teeSetSlope: numOrNull(p.dbPlayers_TeeSetSlope),

        // pairing/match positioning (for hydration)
        pairingId: p.dbPlayers_PairingID || "000",
        pairingPos: numOrNull(p.dbPlayers_PairingPos), // (your schema uses PairingPos)
        flightId: p.dbPlayers_FlightID,
        flightPos: p.dbPlayers_FlightPos,
        startHole: p.dbPlayers_StartHole,

        // tee time preservation considerations later
        teeTime: p.dbPlayers_TeeTime,
        teeSetDetails: p.dbPlayers_TeeSetDetails ?? null
    };
}

///////////////////////////////////////////////////////////////////////
//// HELPERS 
///////////////////////////////////////////////////////////////////////
function displayStatusMessage(parmMessage, parmSeverity) {
    // level = "success", "warn", "error"
    postToHTML({ type: "STATUS", message: parmMessage, level: parmSeverity });
}

function numOrNull(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s.length) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
async function loadAllPlayersForGame() {
    const txtGGID = globalGGID
    const results = await wixData.query("db_Players")
        .eq("dbPlayers_GGID", txtGGID)
        .limit(1000)
        .find({ consistentRead: true });

    allPlayers = results.items;
}
async function savePairings(assignments) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
        return;
    }

    // 1) Requery canonical records to avoid Wix partial-update wipes
    const result = await wixData.query("db_Players")
        .eq("dbPlayers_GGID", String(globalGGID))
        .limit(1000)
        .find({ consistentRead: true });

    const dbRows = result.items || [];

    // 2) Apply payload changes
    const updates = [];

    assignments.forEach(a => {
        if (!a || !a.playerGHIN || a.isDirty !== true) return;

        const ghin = String(a.playerGHIN);
        const original = dbRows.find(
            r => String(r.dbPlayers_PlayerGHIN) === ghin
        );
        if (!original) return;

        const updated = { ...original };

        updated.dbPlayers_PairingID = String(a.pairingId ?? "000").padStart(3, "0");
        updated.dbPlayers_PairingPos =
            a.pairingId === "000" ? "" : String(a.pairingPos || "");

        // Apply scheduling + match fields (already inherited in HTML)
        updated.dbPlayers_FlightID = a.flightId || "";
        updated.dbPlayers_FlightPos = a.flightPos || "";
        updated.dbPlayers_TeeTime = a.teeTime || "";
        updated.dbPlayers_StartHole = a.startHole || "";
        updated.dbPlayers_StartHoleSuffix = a.startHoleSuffix || "";

        updates.push(wixData.update("db_Players", updated));
    });

    await Promise.all(updates);
}