// Cloudflare Pages Functions: Shared Google Drive Client & Edge Caching Helper
// Supports hierarchical subfolders, CORS, Edge Caching, and smart Cover fallbacks.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DEFAULT_FOLDER_ID = "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";
const FALLBACK_COVER_URL = "https://tram-chu.online/library/covers/misty-pagoda.webp";

export function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function getAccessToken(env) {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google Drive credentials in environment.");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth error: ${data.error || response.status}`);
  }
  return data.access_token;
}

// Files in Drive are addressed by their immutable storage key, never by their
// display name. Names such as index.json and 1.json repeat in every book folder
// and a name-based query can therefore return another novel's data.
export async function findDriveFileByKey(env, key) {
  const token = await getAccessToken(env);
  const q = `trashed = false and appProperties has { key='relPath' and value='${escapeDriveQuery(key)}' }`;
  const findUrl = new URL(DRIVE_FILES_URL);
  findUrl.searchParams.set("q", q);
  findUrl.searchParams.set("fields", "files(id,name,size,mimeType,appProperties)");
  findUrl.searchParams.set("pageSize", "2");
  const response = await fetch(findUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Drive search failed (${response.status}).`);
  const files = (await response.json()).files || [];
  if (files.length > 1) throw new Error(`Duplicate Drive storage key: ${key}`);
  return { token, file: files[0] || null };
}

export async function readDriveFile(env, key) {
  const { token, file } = await findDriveFileByKey(env, key);
  if (!file) return null;
  const response = await fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Google Drive download failed (${response.status}).`);
  return { file, body: await response.arrayBuffer() };
}

export async function serveDriveFile(context, key, defaultContentType = "application/json; charset=utf-8") {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  // 1. Check Cloudflare Edge Cache
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  let cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2. Fetch from Drive
  try {
    const { token, file } = await findDriveFileByKey(env, key);

    if (file) {
      const contentRes = await fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (contentRes.ok) {
        let contentType = file.mimeType || defaultContentType;
        if (key.endsWith(".json")) contentType = "application/json; charset=utf-8";
        else if (key.endsWith(".webp")) contentType = "image/webp";
        else if (key.endsWith(".jpg") || key.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (key.endsWith(".png")) contentType = "image/png";

        const isCatalog = key.startsWith("catalog/") || key.endsWith("/index.json");
        const cacheControl = isCatalog
          ? "public, max-age=60, stale-while-revalidate=300"
          : "public, max-age=604800, stale-while-revalidate=86400, immutable";

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        if (file.size) headers.set("Content-Length", String(file.size));

        const response = new Response(contentRes.body, { status: 200, headers });
        context.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
    }

    // 2b. Fallback: If chapter .json not found, try .original.json
    if (key.includes("/ch/") && key.endsWith(".json") && !key.endsWith(".original.json")) {
      const origKey = key.replace(/\.json$/, ".original.json");
      const { token: origToken, file: origFile } = await findDriveFileByKey(env, origKey);
      if (origFile) {
        const origRes = await fetch(`${DRIVE_FILES_URL}/${origFile.id}?alt=media`, {
          headers: { Authorization: `Bearer ${origToken}` }
        });
        if (origRes.ok) {
          const origDoc = await origRes.json();
          const wrapped = {
            schema: 1,
            bookId: origDoc.bookId || "",
            revision: origDoc.revision || 1,
            chapterNumber: origDoc.chapterNumber || Number(key.match(/\/(\d+)\.json$/)?.[1] || 1),
            title: origDoc.title || `Chương ${origDoc.chapterNumber || 1}`,
            content: origDoc.content || "",
            translationStatus: "pending",
            characters: origDoc.characters || (origDoc.content ? origDoc.content.length : 0),
            updatedAt: new Date().toISOString()
          };
          const headers = new Headers();
          headers.set("Content-Type", "application/json; charset=utf-8");
          headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          const response = new Response(JSON.stringify(wrapped), { status: 200, headers });
          context.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }
      }
    }

    // 2c. Fallback: If books/<id>/index.json not found, try books/<id>/r1/index.json
    if (key.endsWith("/index.json") && !key.includes("/r1/")) {
      const r1Key = key.replace(/\/index\.json$/, "/r1/index.json");
      const { token: r1Token, file: r1File } = await findDriveFileByKey(env, r1Key);
      if (r1File) {
        const r1Res = await fetch(`${DRIVE_FILES_URL}/${r1File.id}?alt=media`, {
          headers: { Authorization: `Bearer ${r1Token}` }
        });
        if (r1Res.ok) {
          const headers = new Headers();
          headers.set("Content-Type", "application/json; charset=utf-8");
          headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          const response = new Response(r1Res.body, { status: 200, headers });
          context.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }
      }
    }

    // 3. Smart fallback for covers
    if (key.startsWith("covers/")) {
      const filename = key.replace(/^covers\//, "");
      const qidianMatch = filename.match(/^qidian-(\d+)\.(jpg|jpeg|webp|png)$/);
      if (qidianMatch) {
        // Fetch from Qidian CDN directly
        const qidianCoverUrl = `https://bookcover.yuewen.com/qdbimg/349573/${qidianMatch[1]}/600`;
        const qRes = await fetch(qidianCoverUrl);
        if (qRes.ok) {
          const headers = new Headers();
          headers.set("Content-Type", "image/jpeg");
          headers.set("Cache-Control", "public, max-age=2592000, immutable");
          headers.set("Access-Control-Allow-Origin", "*");
          const response = new Response(qRes.body, { status: 200, headers });
          context.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }
      }

      // Fanqie book cover lookup fallback
      const fanqieMatch = filename.match(/^fanqie-(\d+)\.(jpg|jpeg|webp|png)$/);
      if (fanqieMatch) {
        try {
          const pageRes = await fetch(`https://fanqienovel.com/page/${fanqieMatch[1]}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const imgMatch = html.match(/https:\/\/[^"']*(?:novel-pic|novel-images)[^"']*/);
            if (imgMatch) {
              const imgUrl = imgMatch[0].replace(/&amp;/g, "&");
              const imgRes = await fetch(imgUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Referer": "https://fanqienovel.com/"
                }
              });
              if (imgRes.ok) {
                const headers = new Headers();
                headers.set("Content-Type", imgRes.headers.get("content-type") || "image/jpeg");
                headers.set("Cache-Control", "public, max-age=2592000, immutable");
                headers.set("Access-Control-Allow-Origin", "*");
                const response = new Response(imgRes.body, { status: 200, headers });
                context.waitUntil(cache.put(cacheKey, response.clone()));
                return response;
              }
            }
          }
        } catch {}
      }

      // Bianhua special fallback (Huyền Giám Tiên Tộc)
      if (filename.startsWith("bianhua-6269")) {
        try {
          const qRes = await fetch("https://bookcover.yuewen.com/qdbimg/349573/1036329718/600");
          if (qRes.ok) {
            const headers = new Headers();
            headers.set("Content-Type", "image/jpeg");
            headers.set("Cache-Control", "public, max-age=2592000, immutable");
            headers.set("Access-Control-Allow-Origin", "*");
            const response = new Response(qRes.body, { status: 200, headers });
            context.waitUntil(cache.put(cacheKey, response.clone()));
            return response;
          }
        } catch {}
      }

      // Default cover fallback so NO COVER EVER BREAKS
      const fallbackRes = await fetch(FALLBACK_COVER_URL);
      if (fallbackRes.ok) {
        const headers = new Headers();
        headers.set("Content-Type", "image/webp");
        headers.set("Cache-Control", "public, max-age=86400");
        headers.set("Access-Control-Allow-Origin", "*");
        const response = new Response(fallbackRes.body, { status: 200, headers });
        context.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
    }

    return new Response("Not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (err) {
    return new Response(`Drive Proxy Error: ${err.message}`, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
}
