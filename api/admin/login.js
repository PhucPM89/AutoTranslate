const {
  verifyPassword,
  issueSessionToken,
  setSessionCookie,
  isSameOrigin,
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures
} = require("../../server/admin-auth");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
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
