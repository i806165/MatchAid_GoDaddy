/* /assets/modules/module_parseImportPlayers.js
   Shared parser for mixed GHIN / email import input.
   Supports:
     - Plain GHINs:               6105388
     - Plain emails:              speedracer5873@gmail.com
     - Outlook paste:             [email@domain.com](mailto:email@domain.com); ...
     - Display name + brackets:   Sean Truskowski <strus211@gmail.com>
     - Gmail paste:               email1@domain.com,email2@domain.com,...
     - Mixed delimiters:          newline, semicolon, comma
     - Mixed GHINs and emails in same input

   Exposes: window.MA.parseImportPlayers(rawText)
   Returns: Array of { raw, type, value }
     type: "ghin"  — numeric string, pass through to GHIN API
           "email" — plain email address, needs resolveImportIdentifiers.php lookup
           "unknown" — could not classify, surface to user as unresolved
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;

  // ── Regexes ────────────────────────────────────────────────────────────────

  // Basic email validator — intentionally permissive (real validation is server-side)
  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Markdown mailto link: [visible@text.com](mailto:actual@email.com)
  // Capture group 1 = the mailto address
  const RE_MARKDOWN = /\[([^\]]*)\]\(mailto:([^)]+)\)/i;

  // Display name + angle brackets: Name <email@domain.com>
  // or just <email@domain.com>
  // Capture group 1 = email inside brackets
  const RE_ANGLE = /<([^>]+)>/;

  // Pure numeric — GHIN
  const RE_GHIN = /^\d+$/;

  // ── Token splitter ─────────────────────────────────────────────────────────
  // Split on semicolons, commas, or newlines.
  // We do NOT split on spaces — display names contain spaces.
  // After splitting we trim each token.
  function splitRaw(text) {
    return String(text || "")
      .split(/[;\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // ── Single token classifier ────────────────────────────────────────────────
  function classifyToken(raw) {
    const token = raw.trim();

    // 1. Markdown mailto link — extract the mailto address (most specific, check first)
    //    e.g. [thompsonrj@icloud.com](mailto:thompsonrj@icloud.com)
    const mdMatch = token.match(RE_MARKDOWN);
    if (mdMatch) {
      const email = (mdMatch[2] || mdMatch[1]).trim().toLowerCase();
      if (RE_EMAIL.test(email)) {
        return { raw, type: "email", value: email };
      }
    }

    // 2. Angle bracket format — extract email from Name <email> or <email>
    //    e.g. Sean Truskowski <strus211@gmail.com>
    //    Also handles markdown inside brackets: Name <[email](mailto:email)>
    const angleMatch = token.match(RE_ANGLE);
    if (angleMatch) {
      let inner = angleMatch[1].trim();

      // Inner may itself be a markdown link
      const innerMd = inner.match(RE_MARKDOWN);
      if (innerMd) {
        inner = (innerMd[2] || innerMd[1]).trim();
      }

      const email = inner.toLowerCase();
      if (RE_EMAIL.test(email)) {
        return { raw, type: "email", value: email };
      }
    }

    // 3. Pure numeric — treat as GHIN
    if (RE_GHIN.test(token)) {
      return { raw, type: "ghin", value: token };
    }

    // 4. Plain email address
    const plain = token.toLowerCase();
    if (RE_EMAIL.test(plain)) {
      return { raw, type: "email", value: plain };
    }

    // 5. Nothing matched
    return { raw, type: "unknown", value: token };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * parseImportPlayers(rawText)
   *
   * Accepts raw text pasted from any mail client or typed manually.
   * Returns a deduplicated array of classified tokens:
   *   [{ raw, type: "ghin"|"email"|"unknown", value }, ...]
   *
   * Deduplication is on the normalized value (lowercased email / numeric GHIN).
   * The first occurrence wins; subsequent duplicates are dropped silently.
   */
  function parseImportPlayers(rawText) {
    const tokens = splitRaw(rawText);
    const seen = new Set();
    const results = [];

    for (const token of tokens) {
      const classified = classifyToken(token);
      const key = classified.value.toLowerCase();

      if (seen.has(key)) continue; // silent dedup
      seen.add(key);

      results.push(classified);
    }

    return results;
  }

  MA.parseImportPlayers = parseImportPlayers;

})();
