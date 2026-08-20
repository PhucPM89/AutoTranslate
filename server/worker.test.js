"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const esbuild = require("esbuild");
const { createPasswordHash, issueSessionToken } = require("./admin-auth");

// worker/index.js is ESM for the Workers runtime while this package is CommonJS,
// so it is bundled the way wrangler bundles it and then imported. These tests
// therefore run the deployed artifact, imports included, rather than a copy.
let workerModule = null;
function loadWorker() {
  if (!workerModule) {
    // Bundled to CommonJS and required from a file, rather than imported as ESM.
    // The server modules this Worker reuses are CommonJS, and esbuild's ESM output
    // rewrites their require() calls into a shim that throws at runtime. wrangler
    // avoids that through nodejs_compat; here, CJS output keeps Node's own
    // require, so the test runs the same code the deploy bundles.
    const outfile = path.join(os.tmpdir(), `tram-chu-worker-${process.pid}.cjs`);
    esbuild.buildSync({
      entryPoints: [path.join(__dirname, "..", "worker", "index.js")],
      outfile,
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "es2022",
      write: true
    });
    workerModule = require(outfile).default;
    fs.rmSync(outfile, { force: true });
  }
  return workerModule;
}

const PASSWORD = "mat-khau-test";
const SESSION_SECRET = "secret-phien-test";
const PASSWORD_HASH = createPasswordHash(PASSWORD);

// Stands in for an R2 binding, so crawler config round-trips without network.
function bucket(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]));
  return {
    objects,
    async get(key) {
      if (!objects.has(key)) return null;
      const body = objects.get(key);
      return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
    },
    async put(key, body) {
      objects.set(key, Buffer.from(body));
    },
    async head(key) {
      return objects.has(key) ? {} : null;
    },
    async list() {
      return { objects: [], truncated: false };
    },
    async delete(key) {
      objects.delete(key);
    }
  };
}

function env(overrides = {}) {
  return {
    LIBRARY_UPLOAD_PASSWORD_HASH: PASSWORD_HASH,
    LIBRARY_SESSION_SECRET: SESSION_SECRET,
    R2_ACCOUNT_ID: "acct-test",
    R2_ACCESS_KEY_ID: "AKIDTEST",
    R2_SECRET_ACCESS_KEY: "SECRET-must-never-reach-a-browser",
    R2_BUCKET: "novel-storage",
    R2_ARCHIVE_BUCKET: "novel-archive",
    R2_PUBLIC_BASE_URL: "https://cdn.tram-chu.online",
    GITHUB_REPOSITORY: "PhucPM89/AutoTranslate",
    NOVEL_STORAGE: bucket(),
    NOVEL_ARCHIVE: bucket(),
    ASSETS: { fetch: async () => new Response("<!doctype html><title>Trạm Chữ</title>", { headers: { "content-type": "text/html" } }) },
    ...overrides
  };
}

const cookie = (secret = SESSION_SECRET, ttl = 60_000) => {
  const token = issueSessionToken(secret);
  return `tangthu_admin=${token}`;
};

function req(pathname, { method = "GET", body, cookie: jar, origin } = {}) {
  const headers = { "content-type": "application/json" };
  if (jar) headers.cookie = jar;
  if (origin) headers.origin = origin;
  return new Request(`https://tram-chu.online${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function call(pathname, options, environment = env()) {
  return loadWorker().fetch(req(pathname, options), environment);
}

test("static requests come from the assets binding and carry the security headers", async () => {
  const response = await call("/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Trạm Chữ/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /https:\/\/cdn\.tram-chu\.online/, "reader phải gọi được CDN");
  assert.match(csp, /https:\/\/\*\.r2\.cloudflarestorage\.com/, "admin phải PUT được lên R2");
  assert.match(csp, /frame-ancestors 'none'/);
});

test("the CSP omits the CDN cleanly when no base URL is set", async () => {
  const response = await call("/", {}, env({ R2_PUBLIC_BASE_URL: "" }));
  const csp = response.headers.get("content-security-policy");
  assert.ok(!/cdn\./.test(csp), csp);
  assert.ok(!/ ;/.test(csp), `không được để lại khoảng trắng trước ";": ${csp}`);
});

test("an unknown path falls through to the SPA shell, not a 404", async () => {
  const response = await call("/truyen/khong-ton-tai");
  assert.equal(response.status, 200);
});

test("login rejects a wrong password and issues a locked-down cookie for the right one", async () => {
  const wrong = await call("/api/admin/login", { method: "POST", body: { password: "sai" } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null, "thất bại thì không được phát cookie");

  const right = await call("/api/admin/login", { method: "POST", body: { password: PASSWORD } });
  assert.equal(right.status, 200);
  const setCookie = right.headers.get("set-cookie");
  // A session cookie readable by script, or sent cross-site, is the whole attack.
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);
});

test("login refuses to run when it has no password hash configured", async () => {
  const response = await call(
    "/api/admin/login",
    { method: "POST", body: { password: PASSWORD } },
    env({ LIBRARY_UPLOAD_PASSWORD_HASH: "" })
  );
  assert.equal(response.status, 503);
});

test("session reports authentication state and whether uploads can be signed", async () => {
  const anonymous = await call("/api/admin/session");
  assert.deepEqual(await anonymous.json(), { authenticated: false, storageReady: true });

  const signedIn = await call("/api/admin/session", { cookie: cookie() });
  assert.equal((await signedIn.json()).authenticated, true);

  const noR2 = await call("/api/admin/session", { cookie: cookie() }, env({ R2_SECRET_ACCESS_KEY: "" }));
  assert.equal((await noR2.json()).storageReady, false);
});

test("a session signed with a different secret is not accepted", async () => {
  const response = await call("/api/admin/session", { cookie: cookie("secret-khac") });
  assert.equal((await response.json()).authenticated, false);
});

test("logout clears the cookie", async () => {
  const response = await call("/api/admin/session", { method: "DELETE", cookie: cookie() });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("every admin route refuses an anonymous caller", async () => {
  for (const [pathname, method] of [
    ["/api/admin/upload", "POST"],
    ["/api/admin/crawler", "GET"],
    ["/api/admin/catalog", "POST"],
    ["/api/admin/analytics", "GET"]
  ]) {
    // A GET must not be given a body, or Request itself throws.
    const response = await call(pathname, method === "GET" ? { method } : { method, body: {} });
    assert.equal(response.status, 401, `${method} ${pathname} phải là 401`);
  }
});

test("a cross-origin request is refused even with a valid cookie", async () => {
  const response = await call("/api/admin/upload", {
    method: "POST",
    cookie: cookie(),
    origin: "https://ke-xau.example.com",
    body: { kind: "epub", filename: "a.epub", size: 10 }
  });
  assert.equal(response.status, 403);
});

test("a signed-in admin gets a presigned PUT into the private bucket", async () => {
  const response = await call("/api/admin/upload", {
    method: "POST",
    cookie: cookie(),
    body: { kind: "epub", filename: "Truyện Hay.epub", size: 5 * 1024 * 1024 }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.key, /^uploads\/[0-9a-f]{24}\.epub$/, `server phải tự chọn key, nhận ${body.key}`);
  assert.match(body.uploadUrl, /\/novel-archive\//, "EPUB phải vào bucket private");
  assert.match(body.uploadUrl, /X-Amz-Signature=/);
  assert.ok(!body.uploadUrl.includes("SECRET-must-never-reach-a-browser"), "URL không được chứa secret");
});

test("covers go to the reader bucket and EPUBs never do", async () => {
  const response = await call("/api/admin/upload", {
    method: "POST",
    cookie: cookie(),
    body: { kind: "cover", filename: "bia.webp", size: 2048, contentType: "image/webp" }
  });
  const body = await response.json();
  assert.match(body.uploadUrl, /\/novel-storage\//);
  assert.match(body.key, /^covers\/uploads\//);
});

test("bad uploads are refused before anything is signed", async () => {
  const cases = [
    [{ kind: "epub", filename: "a.epub", size: 300 * 1024 * 1024 }, 400, /giới hạn/],
    [{ kind: "epub", filename: "a.pdf", size: 1024 }, 400, /Chỉ nhận/],
    [{ kind: "script", filename: "a.js", size: 10 }, 400, /không hợp lệ/],
    [{ kind: "epub", filename: "a.epub" }, 400, /kích thước/],
    [{ kind: "cover", filename: "a.webp", size: 10, contentType: "text/html" }, 400, /Content-Type/]
  ];
  for (const [body, status, message] of cases) {
    const response = await call("/api/admin/upload", { method: "POST", cookie: cookie(), body });
    assert.equal(response.status, status, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
});

test("presigning reports 503 rather than signing with half a credential", async () => {
  const response = await call(
    "/api/admin/upload",
    { method: "POST", cookie: cookie(), body: { kind: "epub", filename: "a.epub", size: 1024 } },
    env({ R2_SECRET_ACCESS_KEY: "" })
  );
  assert.equal(response.status, 503);
});

test("ingest dispatch validates the archive key and needs a token", async () => {
  const noToken = await call("/api/admin/upload", {
    method: "POST",
    cookie: cookie(),
    body: { action: "ingest", archiveKey: "uploads/abc.epub" }
  });
  assert.equal(noToken.status, 503);

  const withToken = env({ GITHUB_DISPATCH_TOKEN: "dispatch-token" });
  for (const key of ["../../etc/passwd", "archives/secret.epub", ""]) {
    const response = await call(
      "/api/admin/upload",
      { method: "POST", cookie: cookie(), body: { action: "ingest", archiveKey: key } },
      withToken
    );
    assert.equal(response.status, 400, `archiveKey ${JSON.stringify(key)} phải bị từ chối`);
  }
});

test("a valid dispatch reaches the ingest workflow", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await call(
      "/api/admin/upload",
      {
        method: "POST",
        cookie: cookie(),
        body: { action: "ingest", archiveKey: "uploads/abc.epub", title: "Truyện Thử" }
      },
      env({ GITHUB_DISPATCH_TOKEN: "dispatch-token" })
    );

    assert.equal(response.status, 202);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /workflows\/ingest-book\.yml\/dispatches$/);
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.inputs.archive_key, "uploads/abc.epub");
    assert.equal(sent.inputs.title, "Truyện Thử");
    // GitHub rejects API calls without a User-Agent.
    assert.ok(calls[0].options.headers["User-Agent"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("crawler config round-trips through the R2 binding", async () => {
  const environment = env();

  const initial = await call("/api/admin/crawler", { cookie: cookie() }, environment);
  assert.equal(initial.status, 200);
  const first = await initial.json();
  assert.equal(typeof first.config.enabled, "boolean");
  assert.ok(Object.keys(first.categories).length > 0, "phải trả về định nghĩa thể loại");
  assert.ok(first.wordCountBuckets.length > 0);

  const saved = await call(
    "/api/admin/crawler",
    { method: "POST", cookie: cookie(), body: { enabled: true, maxNewBooksPerRun: 3 } },
    environment
  );
  const after = await saved.json();
  assert.equal(after.config.enabled, true);
  assert.equal(after.config.maxNewBooksPerRun, 3);
  // Written to the private bucket, never the reader one.
  assert.ok(environment.NOVEL_ARCHIVE.objects.has("crawler/config.json"));
  assert.ok(!environment.NOVEL_STORAGE.objects.has("crawler/config.json"));
});

test("the crawler form cannot clear the exclusion list by omitting it", async () => {
  const environment = env();
  await call(
    "/api/admin/crawler",
    { method: "POST", cookie: cookie(), body: { excludedSourceIds: ["123456789012"] } },
    environment
  );
  const response = await call(
    "/api/admin/crawler",
    { method: "POST", cookie: cookie(), body: { enabled: true } },
    environment
  );
  const config = (await response.json()).config;
  assert.deepEqual(config.excludedSourceIds, [], "form không được set, nên vẫn rỗng");
});

test("analytics degrades to an explicit empty answer without Supabase", async () => {
  const response = await call("/api/admin/analytics", { cookie: cookie() });
  assert.equal(response.status, 200);
  const body = await response.json();
  // Explicit, so the admin can tell "not configured" from "nobody visited".
  assert.equal(body.summary.storageReady, false);
  assert.deepEqual(body.days, []);
});

test("the catalogue routes report a missing Supabase instead of failing obscurely", async () => {
  const response = await call("/api/admin/catalog", { method: "POST", cookie: cookie(), body: { id: "abc" } });
  assert.equal(response.status, 503);
});

test("wrong methods are rejected with an Allow header", async () => {
  const response = await call("/api/admin/upload", { cookie: cookie() });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("no response ever carries an R2 secret", async () => {
  const paths = [
    ["/", "GET"],
    ["/api/admin/session", "GET"],
    ["/api/admin/crawler", "GET"]
  ];
  for (const [pathname, method] of paths) {
    const response = await call(pathname, { method, cookie: cookie() });
    const text = await response.text();
    assert.ok(!text.includes("SECRET-must-never-reach-a-browser"), `${pathname} lộ secret`);
    assert.ok(!text.includes("AKIDTEST"), `${pathname} lộ access key id`);
  }
});
