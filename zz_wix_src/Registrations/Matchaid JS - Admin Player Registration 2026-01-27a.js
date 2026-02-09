import wixData from 'wix-data';
import wixWindowFrontend from "wix-window-frontend";
import { session } from 'wix-storage';
import wixLocation from 'wix-location';
import { be_buildTeeSetTags, be_getCoursePHSO } from 'backend/GHIN_API_Handicaps.jsw';
import { be_getPlayersByName, be_getPlayersByID } from 'backend/GHIN_API_Players.jsw';
import { be_getCourseTeeSets } from 'backend/GHIN_API_Courses.jsw';

import { getGamePlayer, deleteGamePlayer, insertGamePlayer } from 'public/Game_Players'
import { getStoredGameData } from 'backend/gameStorage.jsw';
import { initializeUserContext } from 'public/User_Access'
import { wireNavigationButtons, renderNavigationButtons } from 'public/Page_Rendering'

//HTML Variables
let pendingNonRatedDraft = null; // { ghin, firstName, lastName, gender, hiText }

//LEGACY VARIABLES
let globalAdminToken;
let globalUserProfile;
let globalUserID
let globalUserName
let globalAssocID
let globalAssocName
let globalFacilityID
let globalClubID
let globalState
let globalUserHI

let storedGameData
let globalGGID
let arrayPlayerTeeSets
let globalTeeSetData
let globalSelectedPlayer
let globalGamePlayers

$w.onReady(function () {
    const sessionGGID = session.getItem("SessionStoredGGID");
    if (!sessionGGID) {
        wixLocation.to("/");
        return;
    }
    launchPage_v2();

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    //  ONREADY CODE FOR GAME SETTINGS
    //////////////////////////////////////////////////////////////////////////////////////////////////////////   
    /*
        $w('#btnGameOptions').onClick(async (event) => {
            $w('#frmErrMsgBox').hide();
            wixWindow.openLightbox("Game Settings", {
                GGID: storedGameData.dbGames_GGID
            }).then(async (updatedGameData) => {  // 👈 make this async
                if (updatedGameData) {
                    //console.log("Game updated:", updatedGameData);
                    storedGameData = updatedGameData;
                    $w('#frmAllowance').text = "HCP: " + storedGameData.dbGames_Allowance.toString() + "%";
                    //await processRefreshRoster()
                    await initializeTabElements("tabPlayers")
                    let txtMessage = "Game Options Updated and Handicaps Recalculated";
                    DisplayMessage(txtMessage, "green")
                }
            });
        });
    */

});

function postToRegistrations(msg) {
    $w("#htmlRegistrations").postMessage(msg);
}

async function wireRegistrationsHtmlMessaging() {
    let txtMessage = ""
    $w("#htmlRegistrations").onMessage(async (event) => {
        const msg = event.data || {};
        console.log("message from HTML", msg)
        try {
            if (msg.type === "NAV") {
                return
            }
            if (msg.type === "LOAD_FAVORITES") {
                let txtMessage = "Favorite player failed to load failed"
                const favItems = await loadFavoritesItems();
                postToRegistrations({ type: "FAVORITES_UPDATE", favorites: favItems });
                return;
            }

            if (msg.type === "SELECT_PLAYER") {
                let txtMessage = "Player selection failed"
                const ghin = String(msg.ghin || "").trim();
                if (!ghin) throw new Error("SELECT_PLAYER missing GHIN");
                const isNH = String(ghin).startsWith("NH");
                const o = isNH ? (msg.overlay || {}) : null;

                const overlay = isNH ? {
                    fullName: String(o.fullName || "").trim(),
                    firstName: String(o.firstName || "").trim(),
                    lastName: String(o.lastName || "").trim(),
                    handicap_index: (o.handicap_index ?? o.hiText ?? ""),
                    gender: String(o.gender || "").trim()
                } : null;
                pendingNonRatedDraft = isNH ? { ghin, ...overlay } : null;
                /*
                                const overlay = String(ghin).startsWith("NH") ?
                                    {
                                        fullName: (msg.fullName || "").trim(),
                                        firstName: (msg.firstName || "").trim(),
                                        lastName: (msg.lastName || "").trim(),
                                        handicap_index: (msg.handicap_index ?? msg.hiText ?? ""),
                                        gender: (msg.gender || "").trim()
                                    } :
                                    null;
                */
                await mapGlobalSelectedPlayerFromSource({ ghin, overlay });
                //console.log("Global Selected Player", globalSelectedPlayer)
                const teeOptions = await buildTeeOptionsForSelectedPlayer();
                //console.log("Tee Options", teeOptions)
                const rosterItems = await loadRosterItems();
                const selectedTeeSetId =
                    rosterItems.find(p => String(p.dbPlayers_PlayerGHIN) === String(ghin))
                        ?.dbPlayers_TeeSetID || null;
                postToRegistrations({ type: "TEE_OPTIONS", title: "Pick tee set", teeOptions, selectedTeeSetId });
                return;
            }

            if (msg.type === "ASSIGN_TEE") {
                let txtMessage = "Tee assignment failed"
                const result = await commitSelectedPlayerTee(msg.teeSetId); // wrapper around your tagSelectionHandler logic
                const rosterItems = await loadRosterItems();
                postToRegistrations({
                    type: "ROSTER_UPDATE",
                    roster: mapRosterForHtml(rosterItems),
                    enrolledGhinSet: rosterItems.map(p => p.dbPlayers_PlayerGHIN)
                });
                postToRegistrations({
                    type: "STATUS",
                    message: (result?.status === "SUCCESS") ? "Saved" : "Save failed"
                });

                // optional auto-return if quick enroll
                if ((session.getItem("EnrollIntent") || "") === "quickEnrollSelf") {
                    const returnUrl = session.getItem("EnrollReturnUrl");
                    if (returnUrl) wixLocation.to(returnUrl);
                }
                return;
            }

            if (msg.type === "FAVORITE_TAP") {
                let txtMessage = "Favorite processing failed"
                const ghin = String(msg.ghin || "").trim();
                if (!ghin) throw new Error("FAVORITE_TAP missing GHIN");

                const playerEnvelope = {
                    golfers: [{
                        ghin,
                        first_name: (msg.firstName || "").trim(),
                        last_name: (msg.lastName || "").trim(),
                        player_name: (msg.fullName || "").trim(),
                        handicap_index: (msg.handicap_index ?? msg.hiText ?? ""),
                        gender: (msg.gender || "").trim(),

                        // optional fields (only if HTML has them; safe to be blank)
                        email: (msg.email || "").trim(),
                        phone_number: (msg.phone_number || msg.mobile || "").trim(),
                        local_number: (msg.local_number || msg.memberId || "").trim(),
                        club_name: (msg.club_name || "").trim(),
                    }]
                };

                // Save return routing + payload for the Favorites page
                session.setItem("FavoritesLaunchSource", "registrations");
                session.setItem("FavoritesReturnUrl", wixLocation.url); // come back here after Save/Cancel
                session.setItem("FavPlayerGHIN", String(ghin)); // new: GHIN transport (PII)
                session.setItem("FavPlayerEnvelope", JSON.stringify(playerEnvelope.golfers[0])); // optional
                wixLocation.to("/favoritesv2");
                return;
            }
            if (msg.type === "REMOVE_PLAYER") {
                let txtMessage = "Player removal failed"
                const rosterItems = await loadRosterItems();
                const row = rosterItems.find(x => (x.dbPlayers_PlayerKey || x._id) === msg.playerKey);
                if (!row) throw new Error("Player not found");
                await deleteGamePlayer(row._id);

                const rosterItems2 = await loadRosterItems();
                postToRegistrations({
                    type: "ROSTER_UPDATE",
                    roster: mapRosterForHtml(rosterItems2),
                    enrolledGhinSet: rosterItems2.map(p => p.dbPlayers_PlayerGHIN)
                });
                return;
            }
            if (msg.type === "SEARCH_GHIN") {
                let txtMessage = "GHIN search failed to return records"
                const lastName = (msg.lastName || "").trim();
                const firstName = (msg.firstName || "").trim();
                const st = (msg.state || globalState || "").trim();

                if (!lastName) {
                    postToRegistrations({ type: "STATUS", message: "Last name required" });
                    return;
                }
                // Pull a lot on page 1; HTML list handles dozens fine
                let isTruncated = false;
                const recCnt = 100;
                const pageNum = 1;
                let jsonData = {}
                if (/^\d+$/.test(lastName.trim())) {
                    jsonData = await be_getPlayersByID(lastName.trim(), globalAdminToken);
                } else {
                    jsonData = await be_getPlayersByName(recCnt, pageNum, st, lastName, firstName, globalClubID, globalAdminToken);
                }
                const golfers = Array.isArray(jsonData?.golfers) ? jsonData.golfers : [];
                const GHINPlayersTotal = golfers.length;
                //const GHINPlayersTotal = jsonData.golfers.length;
                const totalPages = Math.ceil(GHINPlayersTotal / recCnt);
                //console.log("Total Pages", GHINPlayersTotal, totalPages)
                if (GHINPlayersTotal >= 80) {
                    isTruncated = true;
                }

                //const golfers = jsonData?.golfers || [];
                const results = golfers.map(g => ({
                    ghin: String(g.ghin ?? g.golfer_id ?? ""),
                    name: `${g.last_name ?? ""}, ${g.first_name ?? ""}`.replace(/^,\s*/, "").trim(),
                    hi: g.handicap_index ?? "",
                    gender: g.gender ?? "",
                    city: g.club_name ?? "",
                    state: g.primary_club_state ?? g.state ?? ""
                })).filter(r => r.ghin);

                postToRegistrations({ type: "GHIN_RESULTS", results, isTruncated });
                return;
            }

            if (msg.type === "DONE") {
                const returnUrl = session.getItem("EnrollReturnUrl");
                if (returnUrl) wixLocation.to(returnUrl);
                return;
            }
            displayStatusMessage("Invalid Message handshake" + msg.type, "warn")

        } catch (e) {
            displayStatusMessage(txtMessage, "warn")
            //postToRegistrations({ type: "STATUS", message: e?.message || "Error" });
        }
    });
}
///////////////////////////////////////////////////////////////////////////////////////////////////////////
//  PAGE INITIALIZATION FUNCTIONS
//////////////////////////////////////////////////////////////////////////////////////////////////////////
async function launchPage_v2() {
    const context = await initializeUserContext();
    if (!context) {
        const txtNAVPage = wixLocation.path[0] || "home";
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
        globalUserHI = golfer.handicap_index
    }
    await InitializePage(); // page-specific logic
}
async function InitializePage() {
    await wireNavigationButtons($w);
    storedGameData = await getStoredGameData(session.getItem("SessionStoredGGID"));
    if (!storedGameData) {
        const txtMessage = "System Error: GameData parameters are invalid " + session.getItem("SessionStoredGGID");
        //DisplayMessage(txtMessage, "red");
        wixLocation.to("/");
        return;
    }
    globalGGID = storedGameData.dbGames_GGID;
    //import {wireNavigationButtons, renderNavigationButtons} from 'public/Page_Rendering'
    renderNavigationButtons($w);

    $w("#frmStateBox").changeState("tabRegistration");

    globalTeeSetData = await be_getCourseTeeSets(storedGameData.dbGames_CourseID, globalAdminToken);

    await wireRegistrationsHtmlMessaging();
    await pushInitToRegistrationsHtml();
}

async function pushInitToRegistrationsHtml() {
    const rosterItems = await loadRosterItems();
    const favItems = await loadFavoritesItems();
    postToRegistrations({
        type: "INIT",
        mode: (session.getItem("SessionPortal") === "PLAYER PORTAL") ? "player" : "admin",
        selfGhin: globalUserID, //←ADDTHISLINE
        selfName: globalUserName,
        intent: session.getItem("EnrollIntent") || "",
        game: mapGameForHtml(storedGameData),
        userState: globalState,
        roster: mapRosterForHtml(rosterItems),
        enrolledGhinSet: rosterItems.map(p => p.dbPlayers_PlayerGHIN),
        favorites: favItems
    });
    postToRegistrations({ type: "STATUS", message: "Ready" });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//  GENERIC CODE FOR ALL
//////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function queryCollection(queryString) {
    //console.log("QueryString: ", queryString);
    try {
        //const results = await queryString.find();
        const results = await queryString.find({ consistentRead: true });
        if (results.items.length > 0) {
            //console.log("results:", results.items);
            return results.items;
        } else {
            //console.log('No items found', queryString);
            return [];
        }
    } catch (err) {
        displayStatusMessage("Collection query failed", "error")
        console.log(err, queryString);
        return [];
    }
}

function displayStatusMessage(parmMessage, parmSeverity) {
    // level = "success", "warn", "error"
    postToRegistrations({ type: "STATUS", message: parmMessage, level: parmSeverity });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

async function loadRosterItems() {
    const res = await wixData.query("db_Players")
        .eq("dbPlayers_GGID", globalGGID)
        .ascending("dbPlayers_LName")
        .find({ consistentRead: true });
    return res.items || [];
}

async function loadFavoritesItems() {
    const res = await wixData.query("db_FavPlayers")
        .eq("dbFav_UserGHIN", globalUserID)
        .limit(1000)
        .ascending("dbFav_PlayerLName")
        .find({ consistentRead: true });
    //return res.items || [];

    const favItems = res.items || [];
    return await attachLastCoursePlayToFavorites(favItems);   // Future 
}

async function attachLastCoursePlayToFavorites(favItems) {
    //Future code to attach the teebox and tee name to the favorite
    const courseId = storedGameData?.dbGames_CourseID;
    if (!courseId || !Array.isArray(favItems) || favItems.length === 0) return favItems;

    // For each favorite, find the most recent db_Players row for THIS course
    const enriched = await Promise.all(favItems.map(async (f) => {
        const ghin = String(f.dbFav_PlayerGHIN || "").trim();
        if (!ghin) return f;

        const res = await wixData.query("db_Players")
            .eq("dbPlayers_PlayerGHIN", ghin)
            .eq("dbPlayers_CourseID", courseId)
            .descending("_createdDate") // newest roster-row on this course
            .limit(1)
            .find({ consistentRead: true });

        const last = (res.items && res.items[0]) ? res.items[0] : null;

        // Append a small, HTML-friendly “history” object
        return {
            ...f,
            lastCourse: last ? {
                ggid: last.dbPlayers_GGID,
                teeSetId: last.dbPlayers_TeeSetID,
                teeSetName: last.dbPlayers_TeeSetName,
                // “last played” approximation (see note below)
                when: last._createdDate
            } : null
        };
    }));

    return enriched;
}

function mapGameForHtml(game) {
    return {
        gameId: game.dbGames_GGID,
        title: game.dbGames_Title,
        playDate: game.dbGames_PlayDate,
        playTime: game.dbGames_PlayTime,
        facilityName: game.dbGames_FacilityName,
        courseName: game.dbGames_CourseName,
        courseId: game.dbGames_CourseID,
        holes: game.dbGames_Holes,
        allowance: game.dbGames_Allowance,
        privacy: game.dbGames_Privacy,
        adminGHIN: game.dbGames_AdminGHIN
    };
}

function mapRosterForHtml(items) {
    return (items || []).map(p => ({
        playerKey: p.dbPlayers_PlayerKey || p._id,
        _id: p._id,
        ggid: p.dbPlayers_GGID,
        ghin: p.dbPlayers_PlayerGHIN,
        localId: p.dbPlayers_LocalID,
        firstName: p.dbPlayers_Name,
        lastName: p.dbPlayers_LName,
        displayName: p.dbPlayers_Name,
        gender: p.dbPlayers_Gender,
        hi: p.dbPlayers_HI,
        ch: p.dbPlayers_CH,
        ph: p.dbPlayers_PH,
        so: p.dbPlayers_SO,
        teeSetId: p.dbPlayers_TeeSetID,
        teeSetName: p.dbPlayers_TeeSetName,
        teeSetSlope: p.dbPlayers_TeeSetSlope,
        teeSetDetails: p.dbPlayers_TeeSetDetails,
        pairingId: p.dbPlayers_PairingID,
        pairingPos: p.dbPlayers_PairingPos,
        flightId: p.dbPlayers_FlightID,
        flightPos: p.dbPlayers_FlightPos,
        clubId: p.dbPlayers_ClubID,
        clubName: p.dbPlayers_ClubName,
        creatorId: p.dbPlayers_CreatorID,
        creatorName: p.dbPlayers_CreatorName
    }));
}

async function buildTeeOptionsForSelectedPlayer() {
    if (!globalSelectedPlayer?.golfers?.length) {
        throw new Error("No selected player (globalSelectedPlayer is empty)");
    }

    const player = globalSelectedPlayer.golfers[0];
    const txtGHIN = player.ghin;
    const txtHI = player.handicap_index;
    const txtGender = player.gender;
    const txtCourseID = storedGameData.dbGames_CourseID;
    const txtHoles = storedGameData.dbGames_Holes;
    //console.log("player", player)

    if (String(txtGHIN).startsWith("NH")) {
        //console.log("building tee sets by Index")
        arrayPlayerTeeSets = await be_buildTeeSetTags("Index", txtHI, txtGender, storedGameData, globalAdminToken);
    } else {
        //console.log("building tee sets by Player")
        arrayPlayerTeeSets = await be_buildTeeSetTags("Player", txtGHIN, txtGender, storedGameData, globalAdminToken);
        //console.log("Array Player Tee Sets", arrayPlayerTeeSets)
    }

    // Normalize to HTML format
    return (arrayPlayerTeeSets || []).map(t => ({
        teeSetId: String(t.teeSetID ?? t.value), // handle either shape
        name: t.teeSetName ?? t.label,
        ch: t.playerCH,
        yards: t.teeSetYards,
        slope: t.teeSetSlope,
        rating: t.teeSetRating
    }));
}

async function commitSelectedPlayerTee(teeSetId) {
    if (!globalSelectedPlayer?.golfers?.length) {
        throw new Error("No selected player (globalSelectedPlayer is empty)");
    }
    if (!teeSetId) {
        throw new Error("teeSetId missing");
    }

    const player = globalSelectedPlayer.golfers[0];
    const txtGHIN = String(player.ghin);
    const txtGGID = globalGGID;

    const existingRecord = await getGamePlayer(txtGGID, txtGHIN);
    const existingTeeSetID = existingRecord?.dbPlayers_TeeSetID?.toString() || null;

    // If already assigned to the same tee, treat as success/no-op
    if (existingTeeSetID && String(existingTeeSetID) === String(teeSetId)) {
        return { status: "SUCCESS", message: "No change" };
    }

    const selectedTeeSet = (arrayPlayerTeeSets || []).find(t => String(t.teeSetID ?? t.value) === String(teeSetId));
    if (!selectedTeeSet) throw new Error("Selected tee set not found in arrayPlayerTeeSets");

    if (existingRecord) {
        await deleteGamePlayer(existingRecord._id);
    }

    // PH/SO
    let valPH = selectedTeeSet.playerCH;
    let valSO = 0;
    const selectedAllowance = storedGameData.dbGames_Allowance.toString();

    if (!(txtGHIN.startsWith("NH") || storedGameData.dbGames_CourseID.slice(0, 2) === "NC")) {
        const parmGolfers = [{ golfer_id: txtGHIN, tee_set_id: String(teeSetId), tee_set_side: storedGameData.dbGames_Holes }];
        const playerPHSO = await be_getCoursePHSO(parmGolfers, globalAdminToken);
        const golferID = txtGHIN.toString();
        valPH = playerPHSO?.[selectedAllowance]?.[golferID]?.playing_handicap_display ?? "0";
        valSO = playerPHSO?.[selectedAllowance]?.[golferID]?.shots_off ?? "0";
    }

    // Tee set details blob (same as your tagSelectionHandler)
    const teeSetObject = globalTeeSetData?.TeeSets?.find(ts => ts.TeeSetRatingId.toString() === String(teeSetId));
    const arrayTeeSetDetails = teeSetObject ? {
        TeeSetRatingName: teeSetObject.TeeSetRatingName,
        TotalPar: teeSetObject.TotalPar,
        TotalYardage: teeSetObject.TotalYardage,
        Ratings: teeSetObject.Ratings,
        Holes: teeSetObject.Holes
    } : {};

    const teeSetName = selectedTeeSet.teeSetName;
    const playerCH = selectedTeeSet.playerCH;
    const teeSetSlope = selectedTeeSet.teeSetSlope;

    const newData = {
        ...existingRecord,
        dbPlayers_GGID: txtGGID,
        dbPlayers_PlayerGHIN: txtGHIN,
        dbPlayers_Name: `${player.first_name} ${player.last_name}`,
        dbPlayers_LName: player.last_name,
        dbPlayers_LocalID: player.local_number,
        dbPlayers_HI: String(player.handicap_index ?? ""),
        dbPlayers_CH: String(playerCH ?? "0"),
        dbPlayers_PH: String(valPH ?? "0"),
        dbPlayers_SO: String(valSO ?? "0"),
        dbPlayers_CourseID: storedGameData.dbGames_CourseID, //(Future)
        dbPlayers_TeeSetID: String(teeSetId),
        dbPlayers_TeeSetName: teeSetName,
        dbPlayers_TeeSetSlope: String(teeSetSlope ?? ""),
        dbPlayers_PairingID: existingRecord?.dbPlayers_PairingID ?? "000",
        dbPlayers_PairingPos: existingRecord?.dbPlayers_PairingPos ?? "",
        dbPlayers_FlightID: existingRecord?.dbPlayers_FlightID ?? "",
        dbPlayers_FlightPos: existingRecord?.dbPlayers_FlightPos ?? "",
        dbPlayers_Gender: player.gender,
        dbPlayers_ClubID: player.club_id?.toString(),
        dbPlayers_ClubName: player.club_name,
        dbPlayers_CreatorID: globalUserID,
        dbPlayers_CreatorName: globalUserName,
        dbPlayers_TeeSetDetails: arrayTeeSetDetails,
        dbPlayers_PlayerKey: existingRecord?.dbPlayers_PlayerKey ?? ""
    };

    return await insertGamePlayer(newData);
}

async function mapGlobalSelectedPlayerFromSource({ ghin, overlay }) {
    /**
     * Build a valid globalSelectedPlayer from GHIN. For NH players, uses admin GHIN as template and overlays supplied fields.
     * @param {Object} params
     * @param {string} params.ghin              // required (real or NHxxxx)
     * @param {Object} [params.overlay]          // required for NH players
     * @param {string} [params.overlay.fullName]
     * @param {string} [params.overlay.firstName]
     * @param {string} [params.overlay.lastName]
     * @param {string|number} [params.overlay.handicap_index]
     * @param {string} [params.overlay.gender]
     */
    if (!ghin) {
        throw new Error("mapGlobalSelectedPlayerFromSource: missing GHIN");
    }

    const isNH = String(ghin).startsWith("NH");
    // ---- Step 1: determine which GHIN we can actually fetch ----
    const fetchGHIN = isNH ? globalUserID : ghin;
    // ---- Step 2: fetch GHIN profile (template for NH) ----
    globalSelectedPlayer = await be_getPlayersByID(fetchGHIN, globalAdminToken);
    if (!globalSelectedPlayer?.golfers?.length) {
        throw new Error(`GHIN lookup failed for ${fetchGHIN}`);
    }
    // ---- Step 3: real GHIN players are done ----
    if (!isNH) {
        return;
    }
    // ---- Step 4: NH overlay ----
    if (!overlay) {
        throw new Error(`NH player ${ghin} requires overlay data`);
    }

    const golfer = globalSelectedPlayer.golfers[0];
    // Resolve name fields
    const fullName =
        overlay.fullName || [overlay.firstName, overlay.lastName].filter(Boolean).join(" ");
    if (fullName) {
        const parts = fullName.trim().split(" ");
        golfer.first_name = overlay.firstName || parts[0] || "";
        golfer.last_name =
            overlay.lastName || (parts.length > 1 ? parts.slice(-1)[0] : "");
        golfer.player_name = fullName;
    }
    // Overlay NH identity + attributes
    golfer.ghin = ghin;
    golfer.handicap_index = overlay.handicap_index ?? "";
    golfer.gender = overlay.gender ?? "";
}