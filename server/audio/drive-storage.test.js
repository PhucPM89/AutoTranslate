"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireDriveConfig, getAccessToken, ensureBookFolder, publicDownloadUrl } = require("./drive-storage");

test("Drive audio storage refuses incomplete credentials", () => {
  assert.throws(() => requireDriveConfig({}), /Thiếu cấu hình Google Drive/);
});

test("Drive OAuth uses only refresh-token grant and never billing settings", async () => {
  let request;
  const token = await getAccessToken({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" }, async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ access_token: "access" }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal(token, "access");
  assert.match(String(request.url), /oauth2\.googleapis\.com\/token/);
  assert.equal(request.init.body.get("grant_type"), "refresh_token");
  assert.equal(request.init.body.has("billing"), false);
});

test("public Drive URL targets the uploaded file", () => {
  assert.equal(publicDownloadUrl("abc 123"), "https://drive.google.com/uc?export=download&id=abc%20123");
});

test("Drive audio creates one child folder per book when missing", async () => {
  const requests = [];
  const folder = await ensureBookFolder({
    accessToken: "access",
    parentFolderId: "root-folder",
    bookId: "book-1",
    bookName: "Bộ Truyện Một",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (!init.method) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: "book-folder", name: "Bộ Truyện Một" }), { status: 200 });
    }
  });
  assert.equal(folder.id, "book-folder");
  assert.match(requests[0].url, /audioBookId/);
  const metadata = JSON.parse(requests[1].init.body);
  assert.deepEqual(metadata.parents, ["root-folder"]);
  assert.equal(metadata.name, "Bộ Truyện Một");
  assert.equal(metadata.mimeType, "application/vnd.google-apps.folder");
});
