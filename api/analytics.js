"use strict";

const { recordEvent, cleanBookId } = require("../server/analytics-store");
const { readJsonBody, methodNotAllowed, noStore } = require("../server/http");

// Public beacon. The client fires it once per browser session and once per book
// opened, so this stays a handful of invocations per visitor rather than one per
// pageview. No IP, cookie or fingerprint is stored: the counters are anonymous.
module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  try {
    const body = await readJsonBody(req, 2 * 1024);
    const type = body?.type === "read" ? "read" : body?.type === "visit" ? "visit" : "";
    if (!type) return res.status(400).json({ error: "Loại sự kiện không hợp lệ." });

    await recordEvent({ type, bookId: cleanBookId(body?.bookId) });
    return res.status(204).end();
  } catch (error) {
    // A failed beacon must never surface to a reader, so this always answers 204.
    console.error("Analytics beacon error:", error.message);
    return res.status(204).end();
  }
};
