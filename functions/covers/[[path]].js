// Cloudflare Pages Function: High-performance Same-Origin Cover Proxy
// Serves book covers from Google Drive with immutable edge caching.

import { serveDriveFile } from "../_drive.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  const pathSegments = params?.path || [];
  const filename = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments || "");

  if (!filename || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  // Serve from Google Drive via Edge Proxy (includes live Fanqie/Qidian fallbacks).
  if (env?.GOOGLE_DRIVE_REFRESH_TOKEN) {
    try {
      const defaultMime = filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
      const driveRes = await serveDriveFile(context, `covers/${filename}`, defaultMime);
      if (driveRes && driveRes.status === 200) return driveRes;
    } catch (err) {
      console.warn("Drive cover fetch failed:", err.message);
    }
  }

  // Safe redirect to default asset so image NEVER breaks on UI.
  return Response.redirect("https://tram-chu.online/library/covers/misty-pagoda.webp", 302);
}
