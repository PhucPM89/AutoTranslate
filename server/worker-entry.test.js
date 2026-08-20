"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

// worker/index.js is ESM with a relative import, and this package is CommonJS, so
// it is bundled the way Cloudflare bundles it and then imported. That means these
// tests run the actual deployed entry point, imports and all.
let workerPromise = null;
function loadWorker() {
  if (!workerPromise) {
    const result = esbuild.buildSync({
      entryPoints: [path.join(__dirname, "..", "worker", "index.js")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      write: false
    });
    const source = result.outputFiles[0].text;
    workerPromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  }
  return workerPromise;
}

const SESSION_SECRET = "secret-cho-worker-test";

function sessionCookie(secret = SESSION_SECRET, expiresInMs = 60_000) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + expiresInMs, nonce: "abc" })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `tangthu_admin=${payload}.${signature}`;
}

function env(overrides = {}) {
  return {
    R2_ACCOUNT_ID: "acct123",
    R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
    R2_SECRET_ACCESS_KEY: "SECRET-must-not-leak",
    R2_BUCKET: "novel-storage",
    R2_ARCHIVE_BUCKET: "novel-archive",
    R2_PUBLIC_BASE_URL: "https://cdn.tram-chu.online",
    LIBRARY_SESSION_SECRET: SESSION_SECRET,
    ASSETS: { fetch: async () => new Response("<!doctype html><title>Trạm Chữ</title>", { headers: { "content-type": "text/html" } }) },
    ...overrides
  };
}

function post(body, headers = {}) {
  return new Request("https://tram-chu.online/api/admin/upload", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

test("static requests are served from the assets binding with security headers", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(new Request("https://tram-chu.online/"), env());

  assert.equal(response.status, 200);
  assert.match(await response.text(), /Trạm Chữ/);
  // _headers is a Pages feature, so on Workers these have to come from code.
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);

  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /https:\/\/cdn\.tram-chu\.online/, "reader phải được phép gọi CDN");
  assert.match(csp, /https:\/\/\*\.r2\.cloudflarestorage\.com/, "admin phải PUT được lên R2");
  assert.match(csp, /frame-ancestors 'none'/);
});

test("the CSP stays strict when no CDN base is configured", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(new Request("https://tram-chu.online/"), env({ R2_PUBLIC_BASE_URL: "" }));
  const csp = response.headers.get("content-security-policy");
  assert.ok(!/cdn\./.test(csp), `không được có origin rỗng: ${csp}`);
  assert.match(csp, /connect-src 'self' https:/);
});

test("the upload route rejects anything but POST", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(new Request("https://tram-chu.online/api/admin/upload"), env());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("upload requires a valid admin session", async () => {
  const { default: worker } = await loadWorker();

  const anonymous = await worker.fetch(post({ kind: "epub", filename: "a.epub", size: 10 }), env());
  assert.equal(anonymous.status, 401);

  const wrongSecret = await worker.fetch(
    post({ kind: "epub", filename: "a.epub", size: 10 }, { cookie: sessionCookie("secret-khac") }),
    env()
  );
  assert.equal(wrongSecret.status, 401);

  const expired = await worker.fetch(
    post({ kind: "epub", filename: "a.epub", size: 10 }, { cookie: sessionCookie(SESSION_SECRET, -1000) }),
    env()
  );
  assert.equal(expired.status, 401);
});

test("a cross-origin post is refused even with a good cookie", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    post({ kind: "epub", filename: "a.epub", size: 10 }, { cookie: sessionCookie(), origin: "https://ke-xau.example.com" }),
    env()
  );
  assert.equal(response.status, 401);
});

test("a signed-in admin gets a presigned PUT for the private bucket", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    post({ kind: "epub", filename: "Truyện Hay.epub", size: 5 * 1024 * 1024 }, { cookie: sessionCookie() }),
    env()
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.method, "PUT");
  assert.match(body.key, /^uploads\/[0-9a-f]{24}\.epub$/, `key phải do server sinh, nhận ${body.key}`);
  // The archive bucket, never the public reader bucket.
  assert.match(body.uploadUrl, /\/novel-archive\//);
  assert.match(body.uploadUrl, /X-Amz-Signature=/);
  assert.ok(!body.uploadUrl.includes("SECRET-must-not-leak"), "URL không được chứa secret");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("covers go to the reader bucket, EPUBs never do", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    post({ kind: "cover", filename: "bia.webp", size: 1024, contentType: "image/webp" }, { cookie: sessionCookie() }),
    env()
  );
  const body = await response.json();
  assert.match(body.uploadUrl, /\/novel-storage\//);
  assert.match(body.key, /^covers\/uploads\//);
});

test("oversized and wrong-typed uploads are refused before any signing", async () => {
  const { default: worker } = await loadWorker();
  const cookie = sessionCookie();

  const tooBig = await worker.fetch(post({ kind: "epub", filename: "a.epub", size: 300 * 1024 * 1024 }, { cookie }), env());
  assert.equal(tooBig.status, 400);
  assert.match((await tooBig.json()).error, /giới hạn/);

  const wrongExtension = await worker.fetch(post({ kind: "epub", filename: "a.pdf", size: 1024 }, { cookie }), env());
  assert.equal(wrongExtension.status, 400);

  const unknownKind = await worker.fetch(post({ kind: "script", filename: "a.js", size: 10 }, { cookie }), env());
  assert.equal(unknownKind.status, 400);

  const noSize = await worker.fetch(post({ kind: "epub", filename: "a.epub" }, { cookie }), env());
  assert.equal(noSize.status, 400);
});

test("presigning reports a clear 503 when R2 is not configured", async () => {
  const { default: worker } = await loadWorker();
  const response = await worker.fetch(
    post({ kind: "epub", filename: "a.epub", size: 1024 }, { cookie: sessionCookie() }),
    env({ R2_SECRET_ACCESS_KEY: "" })
  );
  assert.equal(response.status, 503);
});

test("ingest dispatch validates the archive key and needs a token", async () => {
  const { default: worker } = await loadWorker();
  const cookie = sessionCookie();

  const noToken = await worker.fetch(post({ action: "ingest", archiveKey: "uploads/abc.epub" }, { cookie }), env());
  assert.equal(noToken.status, 503);

  const badKey = await worker.fetch(
    post({ action: "ingest", archiveKey: "../../etc/passwd" }, { cookie }),
    env({ GITHUB_DISPATCH_TOKEN: "t", GITHUB_REPOSITORY: "PhucPM89/AutoTranslate" })
  );
  assert.equal(badKey.status, 400);

  // A key outside uploads/ must not be ingestable either.
  const outsideUploads = await worker.fetch(
    post({ action: "ingest", archiveKey: "archives/secret.epub" }, { cookie }),
    env({ GITHUB_DISPATCH_TOKEN: "t", GITHUB_REPOSITORY: "PhucPM89/AutoTranslate" })
  );
  assert.equal(outsideUploads.status, 400);
});

test("a valid dispatch calls the GitHub API and returns 202", async () => {
  const { default: worker } = await loadWorker();
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    // A 204 must not carry a body, or the Response constructor itself throws.
    return new Response(null, { status: 204 });
  };
  try {
    const response = await worker.fetch(
      post(
        { action: "ingest", archiveKey: "uploads/abc.epub", title: "Truyện Thử" },
        { cookie: sessionCookie() }
      ),
      env({ GITHUB_DISPATCH_TOKEN: "dispatch-token", GITHUB_REPOSITORY: "PhucPM89/AutoTranslate" })
    );

    assert.equal(response.status, 202);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /workflows\/ingest-book\.yml\/dispatches$/);
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.ref, "main");
    assert.equal(sent.inputs.archive_key, "uploads/abc.epub");
    assert.equal(sent.inputs.title, "Truyện Thử");
    // GitHub rejects API requests with no User-Agent.
    assert.ok(calls[0].options.headers["User-Agent"], "thiếu User-Agent");
  } finally {
    global.fetch = originalFetch;
  }
});
