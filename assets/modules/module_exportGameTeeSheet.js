/* /assets/modules/module_exportGameTeeSheet.js
 *
 * MA.exportGameTeeSheet() — downloads the Game Tee Sheet (.xlsx, tabs
 * "By Playing Group" and "By Individual") for the session game.
 *
 * Shared module: any page can offer it from its ACTIONS menu. Pages load
 * this script and pass the endpoint as MA.paths.apiGameTeeSheet
 * (MA_ROUTE_API_GAME_TEE_SHEET); the literal below is the fallback — same
 * pattern recalculate_handicaps.js uses with MA.paths.apiGHIN.
 *
 * Deliberately knows nothing about page state:
 *   - Unsaved edits are the CALLING PAGE's check (pages that keep ACTIONS
 *     visible while dirty show an OK-only MA.ui.confirm and don't call this).
 *   - No completeness gate or prompt: an incomplete game still exports,
 *     labelled "*Partial Tee Sheet" in the sheet's own heading.
 *
 * Spec: templates/excel/MatchAid_GameTeeSheet_Template_Spec.md
 *
 * Returns Promise<boolean> — true when the file was downloaded.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;

  const DEFAULT_ENDPOINT = "/api/shared/sharedapi_exportGameTeeSheet.php";
  let inFlight = false;

  function notify(message, level) {
    if (MA.ui && typeof MA.ui.notify === "function") MA.ui.notify(message, level);
    else if (typeof MA.setStatus === "function") MA.setStatus(message, level);
    else if (message) console.log("[STATUS]", level || "info", message);
  }

  async function readErrorMessage(response) {
    const fallback = "Could not create the tee sheet.";
    const contentType = response.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        const code = String(payload?.error || "");
        if (code.startsWith("AUTH_")) return "Your session has expired. Please sign in again.";
        return payload?.message || payload?.error || fallback;
      }
      const text = (await response.text()).trim();
      return text || fallback;
    } catch (e) {
      return fallback;
    }
  }

  MA.exportGameTeeSheet = async function () {
    if (inFlight) return false;
    inFlight = true;

    const endpoint = String((MA.paths && MA.paths.apiGameTeeSheet) || DEFAULT_ENDPOINT).trim();

    try {
      notify("Creating tee sheet…", "info");

      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/vnd.openxmlformats-officedocument")) {
        throw new Error("The server did not return an Excel workbook.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || "MatchAid_TeeSheet.xlsx";

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      notify("Tee sheet downloaded.", "success");
      return true;

    } catch (error) {
      console.error("[MA][GAME_TEE_SHEET_EXPORT]", error);
      notify(String(error?.message || "Tee sheet export failed."), "error");
      return false;

    } finally {
      inFlight = false;
    }
  };
})();
