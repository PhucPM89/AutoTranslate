"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

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

test("YouTube: uploadVideoToYouTube gracefully reports not configured when keys missing", async () => {
  const result = await uploadVideoToYouTube({
    videoPath: "d:/Trans/epub-translator/public/samples/review-ac-mong-cau-sinh.mp4",
    title: "Test Video",
    privacyStatus: "private"
  });

  assert.equal(result.success, false);
  assert.equal(result.isConfigured, false);
  assert.match(result.message, /Chưa cấu hình tài khoản YouTube API/);
});

