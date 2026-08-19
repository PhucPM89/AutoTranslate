const {
  verifyPassword,
  issueSessionToken,
  setSessionCookie,
  clearSessionCookie,
  isAdmin,
  isSameOrigin,
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures
} = require("../../server/admin-auth");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

// Handles the whole admin session on one function (the Hobby plan allows only 12):
//   GET    -> is this browser signed in
//   POST   -> sign in
//   DELETE -> sign out (also reachable as POST /api/admin/logout via a rewrite,
//             so a browser holding the previous bundle keeps working)
module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method === "GET") return res.status(200).json({ authenticated: isAdmin(req), storageReady: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });

  const loggingOut = req.method === "DELETE" || queryParam(req, "action") === "logout";
  if (loggingOut) {
    if (!isSameOrigin(req)) return res.status(403).json({ error: "Yêu cầu không hợp lệ." });
    clearSessionCookie(res);
    return res.status(200).json({ authenticated: false });
  }

  if (req.method !== "POST") return methodNotAllowed(res, "GET, POST, DELETE");
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Yêu cầu không hợp lệ." });

  const passwordHash = process.env.LIBRARY_UPLOAD_PASSWORD_HASH;
  const sessionSecret = process.env.LIBRARY_SESSION_SECRET;
  if (!passwordHash || !sessionSecret) return res.status(503).json({ error: "Chức năng quản trị chưa được cấu hình." });
  if (!canAttemptLogin(req)) return res.status(429).json({ error: "Thử quá nhiều lần. Hãy đợi 15 phút." });

  try {
    const body = await readJsonBody(req, 8 * 1024);
    if (!verifyPassword(body?.password, passwordHash)) {
      recordLoginFailure(req);
      await delay(350);
      return res.status(401).json({ error: "Mật khẩu không đúng." });
    }
    clearLoginFailures(req);
    setSessionCookie(res, issueSessionToken(sessionSecret));
    return res.status(200).json({ authenticated: true, expiresIn: 1800 });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Yêu cầu không hợp lệ." });
  }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Works under both the Vercel runtime (req.query) and the local Express server.
function queryParam(req, name) {
  if (req.query && typeof req.query === "object" && req.query[name] !== undefined) {
    return String(req.query[name]);
  }
  try {
    return new URL(req.url || "", "http://localhost").searchParams.get(name) || "";
  } catch {
    return "";
  }
}
