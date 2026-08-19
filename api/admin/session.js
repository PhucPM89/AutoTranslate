const { isAdmin } = require("../../server/admin-auth");
const { methodNotAllowed, noStore } = require("../../server/http");

module.exports = function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  return res.status(200).json({ authenticated: isAdmin(req), storageReady: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
};
