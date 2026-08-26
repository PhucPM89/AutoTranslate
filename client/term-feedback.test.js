"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { submitTermFeedback } = require("./term-feedback.js");

test("Client Term Feedback: throws on missing parameters", async () => {
  await assert.rejects(
    async () => submitTermFeedback({ bookId: "", originalTerm: "落井下石", suggestedTranslation: "" }),
    /Vui lòng điền đầy đủ/
  );
});

test("Client Term Feedback: sends POST to /api/reader/term-feedback", async () => {
  const originalFetch = global.fetch;
  let sentPayload = null;

  global.fetch = async (url, options) => {
    assert.equal(url, "/api/reader/term-feedback");
    assert.equal(options.method, "POST");
    sentPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, message: "Thành công" })
    };
  };

  try {
    const res = await submitTermFeedback({
      bookId: "kiem-lai",
      originalTerm: "落井下石",
      suggestedTranslation: "giậu đổ bìm leo"
    });

    assert.equal(res.ok, true);
    assert.equal(sentPayload.bookId, "kiem-lai");
    assert.equal(sentPayload.originalTerm, "落井下石");
    assert.equal(sentPayload.suggestedTranslation, "giậu đổ bìm leo");
  } finally {
    global.fetch = originalFetch;
  }
});
