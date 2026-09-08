/* /assets/modules/composeEmail.js
 * Shared Email Composition module.
 * - Handles mailto: links for plain text.
 * - Future: Server-side sending for HTML.
 * - Exposed as MA.email.compose(options)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.email = MA.email || {};

  function setStatus(m, lvl) {
    if (MA.ui && typeof MA.ui.notify === "function") MA.ui.notify(m, lvl);
    else if (typeof MA.setStatus === "function") MA.setStatus(m, lvl);
    else if (m) console.log("[STATUS]", lvl || "info", m);
  }

  /**
   * Compose an email.
   * @param {object} options
   * @param {Array} [options.to] - Array of {name, email}
   * @param {Array} [options.bcc] - Array of {name, email}
   * @param {string} [options.subject]
   * @param {string} [options.body]
   * @param {boolean} [options.bodyIsHtml] - If true, would use server send (not implemented yet).
   * @param {string} [options.recipientSeparator] - "," (default) or ";" (Outlook).
   *   Previously accepted but silently ignored — formatRecipients() always
   *   joined with ", " regardless of what callers (e.g. player_notifications.js's
   *   comma/semicolon toggle) passed in.
   */
  MA.email.compose = async function (options) {
    const opts = options || {};
    
    // For now, we only support client-side mailto: (plain text)
    // If HTML is requested, we warn or fallback.
    if (opts.bodyIsHtml) {
      console.warn("HTML email sending not yet implemented. Falling back to mailto (plain text).");
    }

    const separator = (opts.recipientSeparator === ";") ? "; " : ", ";

    const subject = encodeURIComponent(opts.subject || "");
    const body = encodeURIComponent(opts.body || "");

    // Build recipient strings
    const formatRecipients = (list) => {
      if (!Array.isArray(list)) return "";
      // mailto supports "Name <email>" in some clients, but simple email list is safest
      // We'll try the "Name <email>" format but fallback to just email if needed.
      // Actually, for mailto, comma/semicolon-separated emails is standard.
      return list
        .map(r => r.email)
        .filter(e => e && e.trim())
        .join(separator);
    };

    const to = formatRecipients(opts.to);
    const bcc = formatRecipients(opts.bcc);

    let link = `mailto:${to}?subject=${subject}&body=${body}`;
    if (bcc) {
      link += `&bcc=${bcc}`;
    }

    // Check length limit heuristic (approx 2000 chars is a safe limit for
    // some browsers/mail clients). Require acknowledgment before opening
    // the draft so the admin has a chance to split the group.
    if (link.length > 2000) {
      const warning =
        "The email draft is long enough that your email app may truncate it. " +
        "Consider shortening the message or sending it in smaller batches.";

      if (MA.ui && typeof MA.ui.confirm === "function") {
        await MA.ui.confirm({
          title: "Long email draft",
          message: warning,
          confirmLabel: "OK",
          okOnly: true,
          dismissible: false,
        });
      } else {
        setStatus(warning, "warn");
      }
    }

    //window.location.href = link;  removed in favor of code below.
    const a = document.createElement("a");
    a.href = link;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

})();