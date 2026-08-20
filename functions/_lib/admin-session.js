// Admin session verification for the Workers runtime.
//
// Deliberately the same wire format as server/admin-auth.js:
//
//   base64url(JSON{exp,nonce}) "." base64url(HMAC-SHA256(payload, secret))
//
// so a session issued by the existing login endpoint is accepted here and no
// re-login is needed. Only verification lives in this file - issuing a session
// needs the password hash, which stays where the login handler is.

const encoder = new TextEncoder();

function base64UrlToBytes(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Web Crypto has no timingSafeEqual. Comparing every byte regardless of an early
// mismatch keeps this independent of how much of the signature was correct.
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function verifySessionToken(token, secret) {
  try {
    if (!token || !secret) return false;
    const [payload, signature] = String(token).split(".");
    if (!payload || !signature) return false;
    if (!constantTimeEqual(await sign(payload, secret), signature)) return false;
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    return Number.isFinite(session.exp) && session.exp > Date.now();
  } catch {
    return false;
  }
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return "";
}

export async function isAdmin(request, env) {
  return verifySessionToken(readCookie(request, "tangthu_admin"), env.LIBRARY_SESSION_SECRET);
}

// A cross-site POST carrying the session cookie would otherwise be accepted.
// A missing Origin is allowed because same-origin form posts may omit it.
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
