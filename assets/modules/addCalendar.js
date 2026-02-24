/* /assets/modules/addCalendar.js
 * MatchAid calendaring module (single file, multiple concerns)
 *
 * Public API:
 *   1) Generic canonical API:
 *      MA.calendar.addCalendarEventFromObject(calendarObject)
 *
 *   2) MatchAid game wrapper:
 *      MA.calendar.addCalendarEventFromGame(gameRecord)
 *
 * Notes:
 * - addCalendarEventFromObject(...) expects a normalized event object:
 *     {
 *       id, title, location,
 *       startDate, startTime,
 *       endDate, endTime,
 *       description
 *     }
 * - addCalendarEventFromGame(...) accepts a MatchAid game row/object and maps it.
 * - ICS is downloaded in-browser (no server round-trip required).
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  MA.calendar = MA.calendar || {};

  // ===========================================================================
  // Generic helpers (shared across calendaring concerns)
  // ===========================================================================

  function readField(row, keys) {
    const obj = row || {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (let i = 0; i < list.length; i += 1) {
      const k = list[i];
      if (!k) continue;
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return String(v).trim();
      }
    }
    return "";
  }

  function fmtUtc(d) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function escapeIcs(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }

  function sanitizeUidPart(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9._-]/g, "");
  }

  function buildUidFromId(idValue) {
    const part = sanitizeUidPart(idValue);
    return part ? `matchaid-${part}@matchaid` : `matchaid-${Date.now()}@matchaid`;
  }

  function parseDateTimeFromParts(dateStr, timeStr, fallbackHour, fallbackMinute) {
    const datePart = String(dateStr || "").trim();
    const timePart = String(timeStr || "").trim();

    if (!datePart) return null;

    let hh = fallbackHour;
    let mm = fallbackMinute;

    // Strict HH:mm parsing (allows H:mm too)
    if (/^\d{1,2}:\d{2}$/.test(timePart)) {
      const pieces = timePart.split(":").map(Number);
      const h = pieces[0];
      const m = pieces[1];
      if (
        Number.isInteger(h) && h >= 0 && h <= 23 &&
        Number.isInteger(m) && m >= 0 && m <= 59
      ) {
        hh = h;
        mm = m;
      }
    }

    // Local browser time (same intent as Wix-side Date construction)
    const dt = new Date(`${datePart}T${pad2(hh)}:${pad2(mm)}:00`);
    return isValidDate(dt) ? dt : null;
  }

  function resolveEventTimes(calendarObject) {
    let start = parseDateTimeFromParts(
      calendarObject.startDate,
      calendarObject.startTime,
      8,
      0
    );

    if (!start) start = new Date();

    let end = parseDateTimeFromParts(
      calendarObject.endDate,
      calendarObject.endTime,
      12,
      0
    );

    if (!end) {
      end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    }

    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  function htmlToPlainText(html) {
    let s = String(html || "");
    if (!s) return "";

    // Common rich-text line breaks first
    s = s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ");

    // Strip remaining tags
    s = s.replace(/<[^>]*>/g, "");

    // Light entity decode (safe + practical)
    s = s
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");

    // Normalize whitespace/newlines
    s = s
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();

    return s;
  }

  function downloadIcsText(icsText, fileName) {
    const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "matchaid-game.ics";
    document.body.appendChild(a);
    a.click();

    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function buildIcsFromCalendarObject(calendarObject) {
    const cfg = calendarObject || {};
    const title = String(cfg.title || "Golf Game");
    const location = String(cfg.location || "");
    const description = String(cfg.description || "");
    const uid = buildUidFromId(cfg.id);
    const now = new Date();

    const times = resolveEventTimes(cfg);
    const start = times.start;
    const end = times.end;

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MatchAid//Player Portal//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeIcs(uid)}`,
      `DTSTAMP:${fmtUtc(now)}`,
      `DTSTART:${fmtUtc(start)}`,
      `DTEND:${fmtUtc(end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  // ===========================================================================
  // Concern #1 (Generic canonical API): normalized object -> ICS download
  // ===========================================================================

  MA.calendar.addCalendarEventFromObject = function (calendarObject) {
    const ics = buildIcsFromCalendarObject(calendarObject || {});
    downloadIcsText(ics, "matchaid-game.ics");
  };

  // ===========================================================================
  // Concern #2 (MatchAid wrapper): game record -> normalized object -> ICS
  // ===========================================================================

  MA.calendar.addCalendarEventFromGame = function (gameRecord) {
    const g = gameRecord || {};

    const gameTitle = readField(g, ["title", "dbGames_Title"]) || "Golf Game";
    const adminName = readField(g, ["adminName", "dbGames_AdminName"]);
    const playDate = readField(g, ["playDate", "dbGames_PlayDate"]);
    const playTime = readField(g, ["playTimeText", "dbGames_PlayTime"]) || "08:00";
    const courseName = readField(g, ["courseName", "dbGames_CourseName"]);
    const facilityName = readField(g, ["facilityName", "dbGames_FacilityName"]);
    const gameId = readField(g, ["ggid", "dbGames_GGID", "_id"]) || Date.now();

    const holes = readField(g, ["holes", "dbGames_Holes"]);
    const teeTimeList = readField(g, ["teeTimeList", "dbGames_TeeTimeList"]);
    const commentsRich = readField(g, ["comments", "dbGames_Comments"]);
    const commentsPlain = htmlToPlainText(commentsRich);

    // Normalize HH:mm for the canonical event object
    const normalizedStartTime = /^\d{1,2}:\d{2}$/.test(String(playTime).trim())
      ? String(playTime).trim()
      : "08:00";

    // Compute explicit end date/time (+4h) for parity with Wix caller pattern
    let endDate = playDate || "";
    let endTime = "12:00";

    if (playDate) {
      const startDateObj = new Date(`${playDate}T${normalizedStartTime}:00`);
      if (isValidDate(startDateObj)) {
        const endDateObj = new Date(startDateObj.getTime() + 4 * 60 * 60 * 1000);
        if (isValidDate(endDateObj)) {
          endDate = endDateObj.toISOString().split("T")[0];
          endTime = endDateObj.toTimeString().substring(0, 5);
        }
      }
    }

    const hostedTitle = adminName
      ? `${gameTitle} golf hosted by ${adminName}`
      : gameTitle;

    const summaryParts = [];
    if (holes) summaryParts.push(`Playing ${holes} holes`);
    if (teeTimeList) summaryParts.push(`Tee Times ${teeTimeList}`);

    let description = summaryParts.join(" with ");
    if (commentsPlain) {
      description += (description ? "\n\n" : "") + commentsPlain;
    }

    const calendarObject = {
      id: `game-${gameId}`,
      title: hostedTitle,
      location: [facilityName, courseName].filter(Boolean).join(" "),
      startDate: playDate || "",
      startTime: normalizedStartTime,
      endDate: endDate,
      endTime: endTime,
      description: description
    };

    MA.calendar.addCalendarEventFromObject(calendarObject);
  };

  // Optional alias for page code readability (same MatchAid wrapper behavior)
  MA.calendar.downloadIcsForGame = function (gameRecord) {
    MA.calendar.addCalendarEventFromGame(gameRecord || {});
  };

  window.MA = MA;
})();