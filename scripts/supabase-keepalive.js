"use strict";

// One tiny read to keep a free Supabase project from pausing. Deliberately not a
// write: no rows are created, so this can never leave rubbish behind. `limit=1`
// on a primary-key column means the planner touches an index, not a table scan.

const { createSupabase } = require("../server/supabase");

(async () => {
  const db = createSupabase();
  if (!db) {
    console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const startedAt = Date.now();
  const rows = await db.request("books", { query: "?select=id&limit=1" });
  const elapsedMs = Date.now() - startedAt;
  console.log(`Supabase phản hồi sau ${elapsedMs}ms, ${Array.isArray(rows) ? rows.length : 0} hàng (không ghi gì).`);
})().catch((error) => {
  console.error("Keep-alive thất bại:", error.message);
  process.exit(1);
});
