"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  getYouTubeAuthUrl,
  uploadVideoToYouTube
} = require("./youtube");

test("YouTube: getYouTubeAuthUrl builds correct URL with required scopes", () => {
  const url = getYouTubeAuthUrl({
    clientId: "test-client-id.apps.googleusercontent.com",
    redirectUri: "http://localhost:3000/callback"
  });

  assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
  assert.ok(url.includes("client_id=test-client-id.apps.googleusercontent.com"));
  assert.ok(url.includes("access_type=offline"));
  assert.ok(url.includes("youtube.upload"));
});

test("YouTube: getYouTubeAuthUrl throws if clientId missing", () => {
  assert.throws(() => {
    getYouTubeAuthUrl({ clientId: "" });
  }, /Chưa cấu hình YOUTUBE_CLIENT_ID/);
});

test("YouTube: uploadVideoToYouTube gracefully reports not configured when keys missing", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-upload-test-"));
  const videoPath = path.join(tempDir, "sample.mp4");
  fs.writeFileSync(videoPath, Buffer.from("test-video"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const previousClientId = process.env.YOUTUBE_CLIENT_ID;
  const previousClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const previousRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;
  delete process.env.YOUTUBE_REFRESH_TOKEN;
  t.after(() => {
    restoreEnv("YOUTUBE_CLIENT_ID", previousClientId);
    restoreEnv("YOUTUBE_CLIENT_SECRET", previousClientSecret);
    restoreEnv("YOUTUBE_REFRESH_TOKEN", previousRefreshToken);
  });

  const result = await uploadVideoToYouTube({ videoPath, title: "Test Video", privacyStatus: "private" });
  assert.equal(result.success, false);
  assert.equal(result.isConfigured, false);
  assert.match(result.message, /Chưa cấu hình tài khoản YouTube API/);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

