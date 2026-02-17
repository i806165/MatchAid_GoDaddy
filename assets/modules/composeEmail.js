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

  /**
   * Compose an email.
   * @param {object} options
   * @param {Array} [options.to] - Array of {name, email}
   * @param {Array} [options.bcc] - Array of {name, email}
   * @param {string} [options.subject]
   * @param {string} [options.body]
   * @param {boolean} [options.bodyIsHtml] - If true, would use server send (not implemented yet).
   */
  MA.email.compose = function (options) {
    const opts = options || {};
    
    // For now, we only support client-side mailto: (plain text)
    // If HTML is requested, we warn or fallback.
    if (opts.bodyIsHtml) {
      console.warn("HTML email sending not yet implemented. Falling back to mailto (plain text).");
    }

    const subject = encodeURIComponent(opts.subject || "");
    const body = encodeURIComponent(opts.body || "");

    // Build recipient strings
    const formatRecipients = (list) => {
      if (!Array.isArray(list)) return "";
      // mailto supports "Name <email>" in some clients, but simple email list is safest
      // We'll try the "Name <email>" format but fallback to just email if needed.
      // Actually, for mailto, comma-separated emails is standard.
      return list
        .map(r => r.email)
        .filter(e => e && e.trim())
        .join(", ");
    };

    const to = formatRecipients(opts.to);
    const bcc = formatRecipients(opts.bcc);

    let link = `mailto:${to}?subject=${subject}&body=${body}`;
    if (bcc) {
      link += `&bcc=${bcc}`;
    }

    // Check length limit heuristic (approx 2000 chars is safe limit for some browsers)
    if (link.length > 2000) {
      console.warn("mailto link exceeds 2000 chars. Some recipients may be truncated.");
    }

    window.location.href = link;
  };

})();