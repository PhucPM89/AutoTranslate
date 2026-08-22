// Cloudflare Pages Function: High-performance Same-Origin Cover Proxy
// Serves book covers directly under /covers/* from R2 / CDN with immutable edge caching.

const CDN_BASE = "https://cdn.tram-chu.online";

export async function onRequest(context) {
  const { request, env, params } = context;
  const pathSegments = params?.path || [];
  const filename = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments || "");

  if (!filename || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  // 1. Direct R2 binding if configured on Cloudflare Pages
  if (env && env.NOVEL_STORAGE) {
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

  // 2. Fast CDN proxy with Cloudflare Edge Caching
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

  return new Response("Cover not found", { status: 404 });
}
