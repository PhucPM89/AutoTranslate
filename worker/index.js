// Cloudflare Worker entry point, for a Workers project with static assets.
//
// Pages routes functions/ by file path automatically; a Worker does not, so this
// dispatches by path and hands everything else to the assets binding. The handler
// itself is imported from functions/ rather than copied, so a Pages deployment
// and a Workers deployment run the same code.
//
// Also note: `_headers` is a Pages feature. The security headers are applied here
// in code so they hold on either target rather than depending on which one is
// serving.

import { onRequestPost as adminUpload } from "../functions/api/admin/upload.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

function contentSecurityPolicy(env) {
  const cdn = originOf(env.R2_PUBLIC_BASE_URL);
  return [
    "default-src 'self'",
    `img-src 'self' data:${cdn ? ` ${cdn}` : ""}`,
    "script-src 'self'",
    "style-src 'self'",
    `connect-src 'self'${cdn ? ` ${cdn}` : ""} https://*.supabase.co https://*.r2.cloudflarestorage.com`,
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' mailto:"
  ].join("; ");
}

function originOf(value) {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin/upload") {
      if (request.method !== "POST") {
        return withHeaders(
          new Response(JSON.stringify({ error: "Method not allowed." }), {
            status: 405,
            headers: { "content-type": "application/json; charset=utf-8", allow: "POST" }
          }),
          env
        );
      }
      return withHeaders(await adminUpload({ request, env }), env);
    }

    if (!env.ASSETS) {
      return new Response("Assets binding chưa được cấu hình.", { status: 500 });
    }

    return withHeaders(await env.ASSETS.fetch(request), env);
  }
};

// Content-hashed bundles are already immutable via the build's query string; this
// only adds the headers that must hold for every response.
function withHeaders(response, env) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(env));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
