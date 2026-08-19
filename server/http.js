"use strict";

function readJsonBody(req, limit = 64 * 1024) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
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
