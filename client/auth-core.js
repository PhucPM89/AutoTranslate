"use strict";

// Session bookkeeping and error wording for the reader login, kept free of DOM
// and network so node can test it. These are the parts that fail quietly: a
// token treated as fresh a second before it expires, or a GoTrue error code
// shown to a reader as raw English.

// Refresh a minute early. A token that expires mid-flight looks exactly like a
// revoked one from inside the browser.
const EXPIRY_SKEW_MS = 60 * 1000;
const SESSION_KEY = "tramChu.auth";

// GoTrue rejects anything under 6 - verified against the live project, which
// answered 422 weak_password. bcrypt ignores bytes past 72, so a longer password
// would appear to be accepted and then not match on the next login.
const MIN_PASSWORD = 6;
const MAX_PASSWORD_BYTES = 72;

// GoTrue returns expires_in (seconds from now) and usually expires_at (absolute,
// seconds). Prefer the absolute one: it comes from the server clock, and a
// browser clock several minutes fast would otherwise refresh far too late.
function normalizeSession(payload, now = Date.now()) {
  if (!payload || !payload.access_token) return null;
  const lifetimeMs = Number(payload.expires_in) > 0 ? Number(payload.expires_in) * 1000 : 3600 * 1000;
  const absolute = Number(payload.expires_at) > 0 ? Number(payload.expires_at) * 1000 : 0;
  const user = payload.user || {};
  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token || ""),
    expiresAt: absolute || now + lifetimeMs,
    user: {
      id: String(user.id || ""),
      email: String(user.email || "")
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
      user: { id: String(parsed.user?.id || ""), email: String(parsed.user?.email || "") }
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

function isValidEmail(value) {
  const email = String(value || "").trim();
  // Deliberately loose. The server is the authority on what it accepts; this
  // only catches an obvious typo before spending a request on it.
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function passwordByteLength(value) {
  const text = String(value || "");
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, "utf8");
}

// Local checks so a mistyped form costs no round trip, and so the byte limit is
// explained rather than discovered.
function validateCredentials({ email, password }) {
  if (!isValidEmail(email)) return "Email chưa đúng định dạng.";
  const value = String(password || "");
  if (value.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (passwordByteLength(value) > MAX_PASSWORD_BYTES) {
    return "Mật khẩu quá dài. Chữ có dấu tính nhiều hơn một ký tự, hãy đặt ngắn lại.";
  }
  return "";
}

// Every code below was observed against the live project, not copied from docs.
const ERROR_MESSAGES = {
  invalid_credentials: "Email hoặc mật khẩu không đúng.",
  email_not_confirmed: "Email chưa được xác nhận. Mở hộp thư và bấm liên kết kích hoạt.",
  weak_password: `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`,
  user_already_exists: "Email này đã có tài khoản. Hãy đăng nhập.",
  email_exists: "Email này đã có tài khoản. Hãy đăng nhập.",
  email_address_invalid: "Email chưa đúng định dạng.",
  over_email_send_rate_limit: "Đã gửi quá nhiều email. Đợi vài phút rồi thử lại.",
  over_request_rate_limit: "Bạn thử quá nhiều lần. Đợi một chút rồi thử lại.",
  signup_disabled: "Đăng ký đang tạm đóng.",
  user_banned: "Tài khoản này đang bị khóa.",
  same_password: "Mật khẩu mới trùng mật khẩu cũ.",
  validation_failed: "Thông tin chưa hợp lệ.",
  refresh_token_not_found: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  refresh_token_already_used: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
};

function authErrorMessage(status, body) {
  const payload = body || {};
  const code = String(payload.error_code || payload.code || "");
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  // Rate limiting arrives as 429 with free-text often enough that the status is
  // the more reliable signal.
  if (status === 429) return ERROR_MESSAGES.over_request_rate_limit;
  if (status >= 500) return "Máy chủ đăng nhập đang lỗi. Thử lại sau ít phút.";

  // Older GoTrue builds send only msg. Passing English straight through is worse
  // than a generic Vietnamese line, except where the message carries a number a
  // reader can actually act on.
  const message = String(payload.msg || payload.error_description || payload.message || "");
  const minimum = message.match(/at least (\d+) characters/i);
  if (minimum) return `Mật khẩu cần ít nhất ${minimum[1]} ký tự.`;
  if (/already registered|already been registered/i.test(message)) return ERROR_MESSAGES.user_already_exists;
  return "Không đăng nhập được. Kiểm tra lại email và mật khẩu.";
}

// Signup answers two different ways depending on one dashboard switch, and the
// difference is the whole flow. With confirmation off the response carries a
// session and the reader is simply logged in. With it on - how the project is
// configured today - the response is a bare user record and the reader has to
// open an email first. access_token is what tells them apart: confirmed_at is
// null in both cases, so it cannot be used for this.
function describeSignup(payload, now = Date.now()) {
  const session = normalizeSession(payload, now);
  if (session) return { session, needsConfirmation: false, email: session.user.email };
  const email = String(payload?.email || payload?.user?.email || "");
  return { session: null, needsConfirmation: true, email };
}

// The confirmation link lands back on the site with tokens in the URL fragment.
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

// Supabase reports link failures in the fragment too, so an expired link should
// say so instead of appearing to do nothing at all.
function errorFromUrlHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw || !raw.includes("error")) return "";
  const params = new URLSearchParams(raw);
  if (!params.get("error") && !params.get("error_code")) return "";
  const detail = `${params.get("error_code") || ""} ${params.get("error_description") || ""}`;
  if (/expired/i.test(detail)) return "Liên kết xác nhận đã hết hạn. Hãy yêu cầu gửi lại.";
  return "Liên kết xác nhận không dùng được. Hãy yêu cầu gửi lại.";
}

// Shown on the header button. The local part is usually a name; the domain never
// is, and a full email in a 32px circle is unreadable anyway.
function accountLabel(user) {
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
  MIN_PASSWORD,
  MAX_PASSWORD_BYTES,
  normalizeSession,
  isExpired,
  canRefresh,
  readSession,
  writeSession,
  isValidEmail,
  validateCredentials,
  authErrorMessage,
  describeSignup,
  sessionFromUrlHash,
  errorFromUrlHash,
  accountLabel,
  accountInitial
};
