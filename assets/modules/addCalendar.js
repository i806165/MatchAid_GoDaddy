/* /assets/modules/addCalendar.js
 * Shared ICS generation logic.
 * Usage:
 *   MA.calendar.downloadIcs({
 *     title: "Game Title",
 *     start: "2023-12-25T08:00:00", // ISO string or Date object
 *     end: "2023-12-25T12:00:00",   // Optional (defaults to start + 4h)
 *     location: "Course Name",
 *     description: "Game details...",
 *     uid: "unique-id"              // Optional
 *   });
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  MA.calendar = MA.calendar || {};

  function fmtUtc(d) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function escapeIcs(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  MA.calendar.downloadIcs = function (cfg) {
    const title = cfg.title || "Golf Game";
    const location = cfg.location || "";
    const description = cfg.description || "";
    
    let start = cfg.start ? new Date(cfg.start) : new Date();
    if (Number.isNaN(start.getTime())) start = new Date();

    let end = cfg.end ? new Date(cfg.end) : null;
    if (!end || Number.isNaN(end.getTime())) {
      // Default duration: 4 hours
      end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    }

    const uid = cfg.uid || `matchaid-${Date.now()}@matchaid`;
    const now = new Date();

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MatchAid//Player Portal//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${fmtUtc(now)}`,
      `DTSTART:${fmtUtc(start)}`,
      `DTEND:${fmtUtc(end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "matchaid-game.ics";
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  };

  window.MA = MA;
})();
