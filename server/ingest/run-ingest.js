"use strict";

const { createStorage, createArchiveStorage, hasR2Credentials } = require("../storage");
const { createMetadataStore } = require("../supabase");
const { ingestBook } = require("./ingest-book");
const { translateText } = require("../gemini");

// The one entry point both the admin upload and the crawler call. It assembles
// storage, the metadata store and the translator from the environment so neither
// caller has to know whether it is talking to R2 or a local directory, or whether
// Supabase is configured at all.
//
// Translation happens here, once, at ingest. Readers never reach Gemini.

async function runIngest({
  epubBuffer,
  book,
  revision = 1,
  // Per-run caps so a 4,000-chapter novel is translated across several runs
  // instead of blowing the daily Gemini quota in one go.
  requestBudget = Number(process.env.INGEST_TRANSLATE_BUDGET || 0) || Infinity,
  runBudgetMs = Number(process.env.INGEST_RUN_BUDGET_MINUTES || 0) * 60 * 1000 || Infinity,
  spacingMs = Number(process.env.INGEST_REQUEST_SPACING_MS || 1200),
  translateEnabled = process.env.INGEST_TRANSLATE !== "false",
  log = () => {}
} = {}) {
  const storage = createStorage();
  const archiveStorage = createArchiveStorage();
  const metadataStore = createMetadataStore();
  const apiKey = process.env.GEMINI_API_KEY || "";

  const translate =
    translateEnabled && apiKey
      ? async (chapter) => {
          const result = await translateText(chapter.content, apiKey);
          if (!result || !result.translation) throw new Error("Gemini không trả bản dịch.");
          return result.translation;
        }
      : null;

  if (translateEnabled && !apiKey) {
    log({ event: "ingest.translate_skipped", reason: "GEMINI_API_KEY chưa được cấu hình" });
  }

  return ingestBook({
    storage,
    epubBuffer,
    book,
    revision,
    translate,
    metadataStore,
    archiveStorage,
    requestBudget,
    deadlineAt: runBudgetMs === Infinity ? Infinity : Date.now() + runBudgetMs,
    spacingMs,
    log
  });
}

function describeIngestTargets(env = process.env) {
  return {
    storage: hasR2Credentials(env) ? `r2:${env.R2_BUCKET}` : `local:${env.LOCAL_STORAGE_DIR || ".storage"}`,
    metadata: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "none",
    translate: env.INGEST_TRANSLATE === "false" ? "disabled" : env.GEMINI_API_KEY ? "gemini" : "no key",
    publicBase: env.R2_PUBLIC_BASE_URL || "(chưa cấu hình)"
  };
}

module.exports = { runIngest, describeIngestTargets };
