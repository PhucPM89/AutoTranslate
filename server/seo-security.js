"use strict";

function escapeHtmlAttribute(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON-LD is appended inside a script element. JSON.stringify escapes quotes,
// but not a literal </script> supplied through book metadata.
function safeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

module.exports = { escapeHtmlAttribute, safeJsonLd };
