const { clearSessionCookie, isSameOrigin } = require("../../server/admin-auth");
const { methodNotAllowed, noStore } = require("../../server/http");

module.exports = function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Yêu cầu không hợp lệ." });
  clearSessionCookie(res);
  return res.status(200).json({ authenticated: false });
};
