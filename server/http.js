"use strict";

function readJsonBody(req, limit = 64 * 1024) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      byteLength += buf.length;
      if (byteLength > limit) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks, byteLength).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("JSON không hợp lệ.");
        error.status = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed);
  return res.status(405).json({ error: "Method not allowed." });
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

module.exports = { readJsonBody, methodNotAllowed, noStore };
