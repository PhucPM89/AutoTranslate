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
    async list({ prefix = "" } = {}) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, body]) => ({ key, size: body.length })),
        truncated: false
      };
    },
    async delete(key) {
      for (const item of Array.isArray(key) ? key : [key]) objects.delete(item);
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

test("an unknown path falls through to the assets binding, not a 404", async () => {
  const response = await call("/truyen/khong-ton-tai");
  assert.equal(response.status, 200);
});

test("public catalog reads the configured NOVEL_STORAGE binding", async () => {
  const storage = bucket({
    "catalog/latest.json": JSON.stringify({ schema: 1, books: [{ id: "book-from-r2" }] })
  });
  const response = await call("/api/catalog", {}, env({ NOVEL_STORAGE: storage }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { schema: 1, books: [{ id: "book-from-r2" }] });
  assert.match(response.headers.get("cache-control"), /s-maxage=300/);
});

test("reader content proxy serves only public book JSON paths", async () => {
  const storage = bucket({
    "books/fanqie-123/index.json": JSON.stringify({ bookId: "fanqie-123", chapters: [{ n: 1 }] }),
    "books/fanqie-123/r2/ch/1.json": JSON.stringify({ content: "Chương thử" }),
    "private/api-keys.json": JSON.stringify({ secret: true })
  });
  const environment = env({ NOVEL_STORAGE: storage });

  const indexResponse = await call(
    "/api/reader/content?key=books%2Ffanqie-123%2Findex.json",
    {},
    environment
  );
  assert.equal(indexResponse.status, 200);
  assert.equal((await indexResponse.json()).bookId, "fanqie-123");

  const chapterResponse = await call(
    "/api/reader/content?key=books%2Ffanqie-123%2Fr2%2Fch%2F1.json",
    {},
    environment
  );
  assert.equal(chapterResponse.status, 200);
  assert.match(chapterResponse.headers.get("cache-control"), /immutable/);

  const privateResponse = await call(
    "/api/reader/content?key=private%2Fapi-keys.json",
    {},
    environment
  );
  assert.equal(privateResponse.status, 400);
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
    ["/api/admin/translate", "GET"],
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

test("same host on a different scheme is not accepted as same-origin", async () => {
  const response = await call("/api/admin/upload", {
    method: "POST",
    cookie: cookie(),
    origin: "http://tram-chu.online",
    body: { kind: "epub", filename: "book.epub", size: 10, contentType: "application/epub+zip" }
  });
  assert.equal(response.status, 403);
});

test("JSON bodies are bounded before parsing", async () => {
  const response = await call("/api/admin/login", {
    method: "POST",
    body: { password: "x".repeat(70 * 1024) }
  });
  assert.equal(response.status, 413);
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

test("translation focus persists and is returned with worker status", async () => {
  const environment = env();
  environment.NOVEL_STORAGE.objects.set(
    "catalog/latest.json",
    Buffer.from(JSON.stringify({ books: [{ id: "book-1", title: "Truyện Một" }] }))
  );

  const saved = await call(
    "/api/admin/translate",
    { method: "POST", cookie: cookie(), body: { action: "focus", focusBookId: "book-1" } },
    environment
  );
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).config.focusBookId, "book-1");
  assert.ok(environment.NOVEL_STORAGE.objects.has("config/translation.json"));

  const loaded = await call("/api/admin/translate", { cookie: cookie() }, environment);
  const body = await loaded.json();
  assert.equal(body.config.focusBookId, "book-1");
  assert.equal(body.status.selectionMode, "focused");
});

test("translation focus refuses a book outside the published catalog", async () => {
  const environment = env();
  environment.NOVEL_STORAGE.objects.set("catalog/latest.json", Buffer.from('{"books":[]}'));
  const response = await call(
    "/api/admin/translate",
    { method: "POST", cookie: cookie(), body: { action: "focus", focusBookId: "missing-book" } },
    environment
  );
  assert.equal(response.status, 400);
});

test("Gemini Web daemon control is persisted with dashboard status", async () => {
  const environment = env();
  const response = await call(
    "/api/admin/translate",
    {
      method: "POST",
      cookie: cookie(),
      body: {
        action: "gemini-web-pause",
        minutes: 30,
        headless: true,
        protectiveMode: true,
        lowResourceMode: true,
        spacingMs: 4500,
        sessionMinutes: 180
      }
    },
    environment
  );
  assert.equal(response.status, 200);
  assert.ok(environment.NOVEL_STORAGE.objects.has("jobs/gemini-web-control.json"));
  const saved = JSON.parse(environment.NOVEL_STORAGE.objects.get("jobs/gemini-web-control.json").toString("utf8"));
  assert.equal(saved.headless, true);
  assert.equal(saved.protectiveMode, true);
  assert.equal(saved.lowResourceMode, true);
  assert.equal(saved.spacingMs, 4500);
  assert.equal(saved.sessionMinutes, 180);
  assert.deepEqual(saved.slots, { "1": true, "2": false, "3": false });
  assert.ok(saved.pauseUntilEpochMs > Date.now());

  environment.NOVEL_STORAGE.objects.set(
    "jobs/gemini-web-daemon-status.json",
    Buffer.from(JSON.stringify({ state: "paused_until", updatedAt: new Date().toISOString() }))
  );
  environment.NOVEL_STORAGE.objects.set(
    "jobs/gemini-web-active.json",
    Buffer.from(JSON.stringify({ provider: "gemini-web", expiresAtEpochMs: Date.now() + 60000 }))
  );
  const loaded = await call("/api/admin/translate", { cookie: cookie() }, environment);
  const body = await loaded.json();
  assert.equal(body.geminiWeb.control.spacingMs, 4500);
  assert.equal(body.geminiWeb.active, true);
  assert.equal(body.geminiWeb.daemonAlive, true);
  assert.equal(body.geminiWeb.paused, true);
  assert.equal("issues" in body.geminiWeb, false);
});

test("saving translation focus dispatches an immediate replacement run", async () => {
  const environment = env({
    GITHUB_DISPATCH_TOKEN: "github-test-token"
  });
  environment.NOVEL_STORAGE.objects.set(
    "catalog/latest.json",
    Buffer.from('{"books":[{"id":"book-1","title":"Truyện Một"}]}')
  );
  const originalFetch = global.fetch;
  let dispatched = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("/actions/workflows/translate-worker.yml/dispatches")) {
      dispatched = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await call(
      "/api/admin/translate",
      { method: "POST", cookie: cookie(), body: { action: "focus", focusBookId: "book-1" } },
      environment
    );
    const body = await response.json();
    assert.equal(body.dispatchStarted, true);
    assert.equal(dispatched.inputs.book, "book-1");
    assert.equal(dispatched.inputs.replace_current, "true");
  } finally {
    global.fetch = originalFetch;
  }
});

test("translation dispatch rejects shell-shaped inputs before calling GitHub", async () => {
  const environment = env({ GITHUB_DISPATCH_TOKEN: "github-test-token" });
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };
  try {
    for (const body of [
      { book: "safe-book; env", budget: "5000" },
      { book: "safe-book", budget: "1; env" },
      { book: "safe-book", budget: "10001" }
    ]) {
      const response = await call("/api/admin/translate", { method: "POST", cookie: cookie(), body }, environment);
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("malformed translation JSON is rejected instead of dispatching defaults", async () => {
  const environment = env({ GITHUB_DISPATCH_TOKEN: "github-test-token" });
  const request = new Request("https://tram-chu.online/api/admin/translate", {
    method: "POST",
    headers: { cookie: cookie(), origin: "https://tram-chu.online", "content-type": "application/json" },
    body: "{broken"
  });
  const response = await loadWorker().fetch(request, environment);
  assert.equal(response.status, 400);
});

test("dynamic API keys are persisted only in the private archive bucket", async () => {
  const environment = env();
  const response = await call(
    "/api/admin/keys",
    {
      method: "POST",
      cookie: cookie(),
      body: { action: "add", key: `gsk_${"a".repeat(40)}` }
    },
    environment
  );
  assert.equal(response.status, 200);
  assert.ok(environment.NOVEL_ARCHIVE.objects.has("config/api-keys.json"));
  assert.ok(!environment.NOVEL_STORAGE.objects.has("config/api-keys.json"));
});

test("translation status hides deleted books left in an old worker snapshot", async () => {
  const environment = env();
  environment.NOVEL_STORAGE.objects.set(
    "catalog/latest.json",
    Buffer.from('{"books":[{"id":"live-book","title":"Truyện Còn"}]}')
  );
  environment.NOVEL_STORAGE.objects.set(
    "config/translation.json",
    Buffer.from('{"focusBookId":"deleted-book"}')
  );
  environment.NOVEL_STORAGE.objects.set(
    "jobs/translate-status.json",
    Buffer.from(JSON.stringify({
      state: "running",
      currentBookId: "deleted-book",
      currentBookTitle: "Yến Vũ Lâu",
      queue: [
        { bookId: "deleted-book", total: 4251, pending: 2579 },
        { bookId: "live-book", total: 10, pending: 5 }
      ],
      recentActivity: [
        { bookId: "deleted-book", count: 8 },
        { bookId: "live-book", count: 2 }
      ]
    }))
  );

  const response = await call("/api/admin/translate", { cookie: cookie() }, environment);
  const body = await response.json();
  assert.equal(body.status.state, "idle");
  assert.equal(body.status.currentBookId, "");
  assert.deepEqual(body.status.queue.map((job) => job.bookId), ["live-book"]);
  assert.deepEqual(body.status.recentActivity.map((activity) => activity.bookId), ["live-book"]);
  assert.equal(body.config.focusBookId, "");
});

test("reader issue reports feed the admin QA queue", async () => {
  const environment = env();
  environment.NOVEL_STORAGE.objects.set(
    "books/book-qa/index.json",
    Buffer.from(JSON.stringify({ bookId: "book-qa", title: "Truyện QA" }))
  );
  environment.NOVEL_STORAGE.objects.set(
    "jobs/book-qa/translation.json",
    Buffer.from(JSON.stringify({
      bookId: "book-qa",
      revision: "r1",
      updatedAt: "2026-08-31T00:00:00.000Z",
      chapters: [
        { n: 7, status: "failed", attempts: 3, lastError: "Bản dịch làm mất số 1763." }
      ]
    }))
  );

  const reportResponse = await call(
    "/api/reader/report-issue",
    {
      method: "POST",
      body: {
        bookId: "book-qa",
        bookTitle: "Truyện QA",
        chapterIndex: 6,
        paragraphIndex: 2,
        selectedText: "Thái 邪 còn sót chữ Hán",
        note: "Còn sót chữ Hán"
      }
    },
    environment
  );
  assert.equal(reportResponse.status, 200);

  const qaResponse = await call("/api/admin/qa", { cookie: cookie() }, environment);
  assert.equal(qaResponse.status, 200);
  const qa = await qaResponse.json();
  assert.equal(qa.summary.reports, 1);
  assert.equal(qa.reports[0].chapterNumber, 7);
  assert.equal(qa.failedChapters[0].bookTitle, "Truyện QA");
  assert.equal(qa.failedChapters[0].chapter, 7);

  const dismissResponse = await call(
    "/api/admin/qa",
    {
      method: "POST",
      cookie: cookie(),
      origin: "https://tram-chu.online",
      body: { action: "dismiss-report", id: qa.reports[0].id }
    },
    environment
  );
  assert.equal(dismissResponse.status, 200);
  const afterDismiss = await call("/api/admin/qa", { cookie: cookie() }, environment);
  const afterBody = await afterDismiss.json();
  assert.equal(afterBody.summary.reports, 0);

  // Add another report and test delete-report
  await call(
    "/api/reader/report-issue",
    {
      method: "POST",
      body: {
        bookId: "book-qa-2",
        bookTitle: "Truyện QA 2",
        chapterIndex: 1,
        paragraphIndex: 0,
        selectedText: "Nội dung báo lỗi spam",
        note: "Báo lỗi"
      }
    },
    environment
  );
  const qa2 = await (await call("/api/admin/qa", { cookie: cookie() }, environment)).json();
  assert.equal(qa2.summary.reports, 1);
  const deleteResponse = await call(
    "/api/admin/qa",
    {
      method: "POST",
      cookie: cookie(),
      origin: "https://tram-chu.online",
      body: { action: "delete-report", id: qa2.reports[0].id }
    },
    environment
  );
  assert.equal(deleteResponse.status, 200);
  const deleteResult = await deleteResponse.json();
  assert.equal(deleteResult.message, "Đã xóa báo lỗi khỏi hàng chờ.");
  const afterDelete = await (await call("/api/admin/qa", { cookie: cookie() }, environment)).json();
  assert.equal(afterDelete.summary.reports, 0);
});

test("admin deletion permanently removes book objects, job state and database row", async () => {
  const environment = env({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  });
  for (const [key, value] of Object.entries({
    "books/fanqie-123/index.json": '{"bookId":"fanqie-123","title":"Truyện Xóa"}',
    "books/fanqie-123/r1/ch/1.json": "{}",
    "jobs/fanqie-123/translation.json": "{}",
    "covers/fanqie-123.webp": "cover",
    "config/translation.json": '{"focusBookId":"fanqie-123"}',
    "catalog/latest.json": '{"books":[{"id":"fanqie-123","title":"Truyện Xóa"}]}'
  })) environment.NOVEL_STORAGE.objects.set(key, Buffer.from(value));

  const originalFetch = global.fetch;
  const databaseDeletes = [];
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/books") && options.method === "DELETE") {
      databaseDeletes.push(target);
      return new Response(null, { status: 204 });
    }
    if (target.includes("/rest/v1/chapters") || target.includes("/rest/v1/book_categories")) {
      databaseDeletes.push(target);
      return new Response(null, { status: 204 });
    }
    if (target.includes("select=id%2Ctitle%2Csource%2Csource_id") || target.includes("select=id,title,source,source_id")) {
      return new Response(JSON.stringify([{ id: "fanqie-123", title: "Truyện Xóa", source: "fanqie", source_id: "123" }]), {
        headers: { "content-type": "application/json" }
      });
    }
    if (target.includes("/rest/v1/books")) {
      return new Response("[]", { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch ${target}`);
  };

  try {
    const response = await call(
      "/api/admin/catalog",
      { method: "DELETE", cookie: cookie(), body: { id: "fanqie-123" } },
      environment
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cleanupFailed, false);
    assert.ok(![...environment.NOVEL_STORAGE.objects.keys()].some((key) => key.includes("fanqie-123")));
    assert.equal(JSON.parse(environment.NOVEL_STORAGE.objects.get("config/translation.json")).focusBookId, "");
    assert.equal(databaseDeletes.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
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

test("admin chapter save persists content and marks the translation queue completed", async () => {
  const storage = bucket({
    "books/book-1/index.json": JSON.stringify({
      schema: 1,
      bookId: "book-1",
      revision: 1,
      translatedChapters: 0,
      chapters: [{ n: 7, title: "Chương cũ", status: "retrying" }]
    }),
    "books/book-1/r1/ch/7.json": JSON.stringify({
      schema: 1,
      bookId: "book-1",
      revision: 1,
      chapterNumber: 7,
      title: "Chương cũ",
      content: "Bản cũ",
      translationStatus: "retrying"
    }),
    "jobs/book-1/translation.json": JSON.stringify({
      schema: 1,
      bookId: "book-1",
      revision: 1,
      chapters: [{ n: 7, status: "retrying", attempts: 3, lastError: "cần sửa", nextAttemptAt: 123, startedAt: "x" }]
    })
  });

  const response = await call("/api/admin/chapter-save", {
    method: "POST",
    cookie: cookie(),
    body: {
      bookId: "book-1",
      chapterNumber: 7,
      revision: 1,
      title: "Chương đã sửa",
      content: "Chương đã sửaNội dung biên tập thủ công. Bọn họ mà tôi mã thì hỏng hết.",
      status: "completed"
    }
  }, env({ NOVEL_STORAGE: storage }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);

  const savedChapter = JSON.parse(storage.objects.get("books/book-1/r1/ch/7.json").toString("utf8"));
  assert.equal(savedChapter.title, "Chương đã sửa");
  assert.equal(savedChapter.content, "Nội dung biên tập thủ công. Bọn họ mà ngã ngựa thì hỏng hết.");
  assert.equal(savedChapter.translationStatus, "completed");
  assert.equal(savedChapter.manualEdited, true);

  const savedState = JSON.parse(storage.objects.get("jobs/book-1/translation.json").toString("utf8"));
  assert.equal(savedState.chapters[0].status, "completed");
  assert.equal(savedState.chapters[0].lastError, "");
  assert.equal(savedState.chapters[0].nextAttemptAt, 0);
  assert.equal(savedState.chapters[0].manualEdited, true);

  const savedIndex = JSON.parse(storage.objects.get("books/book-1/index.json").toString("utf8"));
  assert.equal(savedIndex.chapters[0].title, "Chương đã sửa");
  assert.equal(savedIndex.chapters[0].status, "completed");
  assert.equal(savedIndex.translatedChapters, 1);
});

test("admin gemini translate requires admin auth and validates inputs", async () => {
  const unauth = await call("/api/admin/gemini-translate", { method: "POST", body: { content: "test" } });
  assert.equal(unauth.status, 401);

  const getReq = await call("/api/admin/gemini-translate", { method: "GET", cookie: cookie() });
  assert.equal(getReq.status, 405);

  const noContent = await call("/api/admin/gemini-translate", { method: "POST", cookie: cookie(), body: {} });
  assert.equal(noContent.status, 400);

  const noKey = await call("/api/admin/gemini-translate", { method: "POST", cookie: cookie(), body: { content: "Chương 1..." } });
  assert.equal(noKey.status, 503);
});

test("admin gemini translate proxies translation successfully", async () => {
  const originalFetch = global.fetch;
  let geminiRequest = null;
  global.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes("generativelanguage.googleapis.com") || target.includes("gateway.ai.cloudflare.com")) {
      geminiRequest = { target, options };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Chương 1: Tiên Đạo Khởi Đầu\n\nTrời cao vạn dặm, mây gió cuồn cuộn." }]
              },
              finishReason: "STOP"
            }
          ]
        }),
        { headers: { "content-type": "application/json" } }
      );
    }
    return originalFetch(url, options);
  };

  try {
    const response = await call("/api/admin/gemini-translate", {
      method: "POST",
      cookie: cookie(),
      body: {
        apiKey: "CLIENT_KEY_MUST_BE_IGNORED",
        model: "gemini-3.6-flash",
        content: "第一章 仙道起步\n\n万里长空，风云变幻。",
        title: "第一章 仙道起步"
      }
    }, env({ EPUB_STUDIO_API_KEYS: "VIP_SERVER_KEY_1,VIP_SERVER_KEY_2" }));

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.ok(!data.translation.includes("Chương 1: Tiên Đạo Khởi Đầu"));
    assert.ok(data.translation.includes("Trời cao vạn dặm"));
    assert.equal(data.model, "gemini-3.6-flash");
    assert.ok(["VIP_SERVER_KEY_1", "VIP_SERVER_KEY_2"].includes(geminiRequest.options.headers["x-goog-api-key"]));
    assert.notEqual(geminiRequest.options.headers["x-goog-api-key"], "CLIENT_KEY_MUST_BE_IGNORED");
    assert.ok(!geminiRequest.target.includes("VIP_SERVER_KEY"), "API key must not be placed in the URL");
    assert.equal(JSON.parse(geminiRequest.options.body).generationConfig.maxOutputTokens, 32768);
  } finally {
    global.fetch = originalFetch;
  }
});

test("admin gemini translate rejects an unsupported model before contacting Gemini", async () => {
  const response = await call("/api/admin/gemini-translate", {
    method: "POST",
    cookie: cookie(),
    body: {
      apiKey: "AIzaSyTestKey123",
      model: "gemini-made-up-model",
      content: "第一章"
    }
  }, env({ EPUB_STUDIO_API_KEYS: "VIP_SERVER_KEY" }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /không được EPUB Studio hỗ trợ/);
});
