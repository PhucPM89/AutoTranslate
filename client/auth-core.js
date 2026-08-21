"use strict";

// Session bookkeeping and error wording for the reader login, kept free of DOM
// and network so node can test it. These are the parts that fail quietly: a
// token treated as fresh a second before it expires, or an error code
// shown to a reader as raw English.

// Refresh a minute early. A token that expires mid-flight looks exactly like a
// revoked one from inside the browser.
const EXPIRY_SKEW_MS = 60 * 1000;
const SESSION_KEY = "tramChu.auth";

function decodeJwt(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const json =
      typeof atob === "function"
        ? typeof decodeURIComponent === "function" && typeof escape === "function"
          ? decodeURIComponent(escape(atob(base64)))
          : atob(base64)
        : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// GoTrue returns expires_in (seconds from now) and usually expires_at (absolute,
// seconds). Prefer the absolute one: it comes from the server clock, and a
// browser clock several minutes fast would otherwise refresh far too late.
function normalizeSession(payload, now = Date.now()) {
  if (!payload || !payload.access_token) return null;
  const lifetimeMs = Number(payload.expires_in) > 0 ? Number(payload.expires_in) * 1000 : 3600 * 1000;
  const absolute = Number(payload.expires_at) > 0 ? Number(payload.expires_at) * 1000 : 0;
  let user = payload.user || {};
  if (!user.id || !user.email) {
    const jwt = decodeJwt(payload.access_token);
    if (jwt) {
      user = {
        id: jwt.sub || user.id || "",
        email: jwt.email || user.email || "",
        user_metadata: jwt.user_metadata || user.user_metadata || {}
      };
    }
  }
  const meta = user.user_metadata || {};
  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token || ""),
    expiresAt: absolute || now + lifetimeMs,
    user: {
      id: String(user.id || ""),
      email: String(user.email || ""),
      fullName: String(meta.full_name || meta.name || user.fullName || ""),
      avatarUrl: String(meta.avatar_url || meta.picture || user.avatarUrl || "")
    }
  };
}

function isExpired(session, now = Date.now()) {
  if (!session || !session.accessToken) return true;
  return now + EXPIRY_SKEW_MS >= Number(session.expiresAt || 0);
}

// A session with no refresh token cannot be renewed, so once it expires the only
// honest move is to sign out rather than keep a dead token around.
function canRefresh(session) {
  return Boolean(session && session.refreshToken);
}

function readSession(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken) return null;
    return {
      accessToken: String(parsed.accessToken),
      refreshToken: String(parsed.refreshToken || ""),
      expiresAt: Number(parsed.expiresAt) || 0,
      user: {
        id: String(parsed.user?.id || ""),
        email: String(parsed.user?.email || ""),
        fullName: String(parsed.user?.fullName || ""),
        avatarUrl: String(parsed.user?.avatarUrl || "")
      }
    };
  } catch {
    // Corrupt or foreign data under our key is not worth surfacing to a reader.
    return null;
  }
}

function writeSession(storage, session) {
  if (!storage) return;
  try {
    if (!session) storage.removeItem(SESSION_KEY);
    else storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing can refuse writes. Losing persistence is acceptable;
    // throwing here would break the login that just succeeded.
  }
}

// Every code below was observed against the live project, not copied from docs.
const ERROR_MESSAGES = {
  invalid_credentials: "Email hoặc mật khẩu không đúng.",
  email_not_confirmed: "Email chưa được xác nhận. Mở hộp thư và bấm liên kết kích hoạt.",
  user_already_exists: "Email này đã có tài khoản.",
  email_exists: "Email này đã có tài khoản.",
  over_request_rate_limit: "Bạn thử quá nhiều lần. Đợi một chút rồi thử lại.",
  user_banned: "Tài khoản này đang bị khóa.",
  validation_failed: "Thông tin chưa hợp lệ.",
  refresh_token_not_found: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  refresh_token_already_used: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
};

function authErrorMessage(status, body) {
  const payload = body || {};
  const code = String(payload.error_code || payload.code || "");
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  if (status === 429) return ERROR_MESSAGES.over_request_rate_limit;
  if (status >= 500) return "Máy chủ đăng nhập đang lỗi. Thử lại sau ít phút.";

  const message = String(payload.msg || payload.error_description || payload.message || "");
  if (/already registered|already been registered/i.test(message)) return ERROR_MESSAGES.user_already_exists;
  return "Không đăng nhập được. Vui lòng thử lại.";
}

// The OAuth redirect lands back on the site with tokens in the URL fragment.
// They have to be consumed and wiped before anything else reads the hash, or
// they sit in the address bar and travel into any link the reader shares.
function sessionFromUrlHash(hash, now = Date.now()) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw || !raw.includes("access_token=")) return null;
  const params = new URLSearchParams(raw);
  return normalizeSession(
    {
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: params.get("expires_in"),
      expires_at: params.get("expires_at")
    },
    now
  );
}

// Supabase reports OAuth failures in the fragment too.
function errorFromUrlHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw || !raw.includes("error")) return "";
  const params = new URLSearchParams(raw);
  if (!params.get("error") && !params.get("error_code")) return "";
  const detail = `${params.get("error_code") || ""} ${params.get("error_description") || ""}`;
  if (/access_denied/i.test(detail)) return "Đã hủy đăng nhập Google.";
  if (/expired/i.test(detail)) return "Phiên đăng nhập đã hết hạn. Hãy thử lại.";
  return "Đăng nhập Google không thành công. Hãy thử lại.";
}

// Shown on the header button and profile dialog.
function accountLabel(user) {
  if (user?.fullName && String(user.fullName).trim()) {
    return String(user.fullName).trim();
  }
  const email = String(user?.email || "").trim();
  if (!email) return "Tài khoản";
  return email.split("@")[0] || email;
}

function accountInitial(user) {
  const label = accountLabel(user);
  const first = label.replace(/[^\p{L}\p{N}]/gu, "").charAt(0);
  return (first || "?").toUpperCase();
}

module.exports = {
  SESSION_KEY,
  EXPIRY_SKEW_MS,
  decodeJwt,
  normalizeSession,
  isExpired,
  canRefresh,
  readSession,
  writeSession,
  authErrorMessage,
  sessionFromUrlHash,
  errorFromUrlHash,
  accountLabel,
  accountInitial
};
