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
    let json = "";
    if (typeof atob === "function") {
      const binary = atob(base64);
      if (typeof TextDecoder !== "undefined") {
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        json = new TextDecoder().decode(bytes);
      } else if (typeof decodeURIComponent === "function" && typeof escape === "function") {
        json = decodeURIComponent(escape(binary));
      } else {
        json = binary;
      }
    } else if (typeof Buffer !== "undefined") {
      json = Buffer.from(base64, "base64").toString("utf8");
    }
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
  refresh_token_already_used: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  disabled_client: "Google OAuth Client đã bị vô hiệu hóa hoặc chưa kích hoạt trong Google Cloud Console.",
  invalid_client: "Google Client ID hoặc Secret không hợp lệ trong Supabase Auth."
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

// Checks both URL fragment (#) and query params (?) for session tokens.
function sessionFromUrl(hash = "", search = "", now = Date.now()) {
  const sources = [
    String(hash || "").replace(/^#/, ""),
    String(search || "").replace(/^\?/, "")
  ];
  for (const raw of sources) {
    if (!raw || !raw.includes("access_token=")) continue;
    const params = new URLSearchParams(raw);
    const at = params.get("access_token");
    if (!at) continue;
    return normalizeSession(
      {
        access_token: at,
        refresh_token: params.get("refresh_token") || "",
        expires_in: params.get("expires_in"),
        expires_at: params.get("expires_at")
      },
      now
    );
  }
  return null;
}

function sessionFromUrlHash(hash, now = Date.now()) {
  return sessionFromUrl(hash, "", now);
}

// Checks both URL fragment (#) and query params (?) for OAuth errors.
function errorFromUrl(hash = "", search = "") {
  const sources = [
    String(hash || "").replace(/^#/, ""),
    String(search || "").replace(/^\?/, "")
  ];
  for (const raw of sources) {
    if (!raw || !raw.includes("error")) continue;
    const params = new URLSearchParams(raw);
    const err = params.get("error");
    const code = params.get("error_code") || "";
    const desc = params.get("error_description") || "";
    if (!err && !code) continue;
    const detail = `${code} ${desc} ${err}`.toLowerCase();
    if (detail.includes("disabled_client") || detail.includes("oauth client was disabled")) {
      return "Google OAuth Client đã bị vô hiệu hóa trong Google Cloud Console. Vui lòng kiểm tra lại cấu hình.";
    }
    if (detail.includes("access_denied")) {
      return "Đã hủy đăng nhập Google.";
    }
    if (detail.includes("expired")) {
      return "Phiên đăng nhập đã hết hạn. Hãy thử lại.";
    }
    if (detail.includes("redirect_uri_mismatch")) {
      return "Lỗi redirect_uri_mismatch: Chưa cấu hình đúng Redirect URL trong Google Cloud Console.";
    }
    if (detail.includes("invalid_client")) {
      return "Google Client ID hoặc Secret không hợp lệ.";
    }
    return desc ? `Đăng nhập Google thất bại: ${desc}` : "Đăng nhập Google không thành công. Hãy thử lại.";
  }
  return "";
}

function errorFromUrlHash(hash) {
  return errorFromUrl(hash, "");
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
  sessionFromUrl,
  sessionFromUrlHash,
  errorFromUrl,
  errorFromUrlHash,
  accountLabel,
  accountInitial
};
