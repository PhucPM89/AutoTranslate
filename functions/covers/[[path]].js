// Cloudflare Pages Function: High-performance Same-Origin Cover Proxy
// Serves book covers directly under /covers/* from Google Drive / R2 with immutable edge caching.

import { serveDriveFile } from "../_drive.js";

const CDN_BASE = "https://cdn.tram-chu.online";

export async function onRequest(context) {
  const { request, env, params } = context;
  const pathSegments = params?.path || [];
  const filename = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments || "");

  if (!filename || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  // 1. Direct R2 binding if configured and active
  if (env && env.NOVEL_STORAGE && env.STORAGE_DRIVER !== "drive") {
    try {
      const object = await env.NOVEL_STORAGE.get(`covers/${filename}`);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "public, max-age=31536000, immutable");
        headers.set("access-control-allow-origin", "*");
        if (!headers.get("content-type")) {
          headers.set("content-type", filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg");
        }
        return new Response(object.body, { headers });
      }
    } catch {}
  }

  // 2. Serve from Google Drive via Edge Proxy (includes live Fanqie/Qidian fallbacks)
  if (env && (env.STORAGE_DRIVER === "drive" || env.GOOGLE_DRIVE_REFRESH_TOKEN)) {
    try {
      const defaultMime = filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
      const driveRes = await serveDriveFile(context, `covers/${filename}`, defaultMime);
      if (driveRes && driveRes.status === 200) return driveRes;
    } catch (err) {
      console.warn("Drive cover fetch failed:", err.message);
    }
  }

  // 3. Fallback CDN proxy (legacy)
  const cdnUrl = `${CDN_BASE}/covers/${filename}`;
  try {
    const cdnRes = await fetch(cdnUrl, {
      cf: {
        cacheEverything: true,
        cacheTtl: 31536000
      }
    });

    if (cdnRes.ok) {
      const headers = new Headers(cdnRes.headers);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("access-control-allow-origin", "*");
      if (!headers.get("content-type")) {
        headers.set("content-type", filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg");
      }
      return new Response(cdnRes.body, { status: 200, headers });
    }
  } catch (err) {
    console.warn("Cover proxy fetch failed:", err.message);
  }

  // 4. Safe redirect to default asset so image NEVER breaks on UI
  return Response.redirect("https://tram-chu.online/library/covers/misty-pagoda.webp", 302);
}
