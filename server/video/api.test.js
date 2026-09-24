"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { handleAdminVideo } = require("./admin-router");

test("AdminVideoRouter: rejects unauthenticated requests", async () => {
  const req = new Request("http://localhost:3000/api/admin/video/jobs", { method: "GET" });
  const env = { LIBRARY_SESSION_SECRET: "test-secret" };

  await assert.rejects(async () => {
    await handleAdminVideo({
      request: req,
      env,
      url: new URL(req.url),
      path: "/api/admin/video/jobs",
      requireAdmin: async () => {
        const err = new Error("Phiên quản trị đã hết hạn.");
        err.status = 401;
        throw err;
      },
      readJson: async () => ({})
    });
  }, (err) => {
    assert.equal(err.status, 401);
    return true;
  });
});

test("AdminVideoRouter: returns budget and jobs for authenticated admin", async () => {
  const req = new Request("http://localhost:3000/api/admin/video/jobs", { method: "GET" });
  const mockStorage = new Map();
  const env = {
    NOVEL_STORAGE: {
      async get(k) { return mockStorage.get(k) || null; },
      async put(k, v) { mockStorage.set(k, v); }
    }
  };

  const response = await handleAdminVideo({
    request: req,
    env,
    url: new URL(req.url),
    path: "/api/admin/video/jobs",
    requireAdmin: async () => {}, // authenticated
    readJson: async () => ({})
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Array.isArray(data.jobs));
  assert.ok(data.budget);
  assert.equal(data.budget.count, 0);
  assert.equal(data.budget.allowed, true);
});

test("AdminVideoRouter: GET youtube-auth reports configuration status", async () => {
  const req = new Request("http://localhost:3000/api/admin/video/youtube-auth", { method: "GET" });
  const env = {};

  const response = await handleAdminVideo({
    request: req,
    env,
    url: new URL(req.url),
    path: "/api/admin/video/youtube-auth",
    requireAdmin: async () => {},
    readJson: async () => ({})
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.isConfigured, false);
  assert.equal(data.hasToken, false);
});

