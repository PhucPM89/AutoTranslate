"use strict";

// Preflight for CI jobs. Fails fast with a readable list of what is missing,
// instead of letting the run die on a storage error hundreds of lines later.
//
// It only ever reports presence and length. Values are never printed, never
// logged and never written to an artifact.
//
//   node scripts/check-env.js crawler
//   node scripts/check-env.js translate
//   node scripts/check-env.js keepalive

const isDriveStorage = process.env.STORAGE_DRIVER === "drive" || (process.env.GOOGLE_DRIVE_CLIENT_ID && !process.env.R2_BUCKET);

const storageRequired = isDriveStorage ? [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "GOOGLE_DRIVE_STORAGE_FOLDER_ID"
] : [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL"
];

const PROFILES = {
  crawler: {
    required: storageRequired,
    optional: [
      "R2_ARCHIVE_BUCKET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GROQ_API_KEY",
      "GROQ_API_KEYS",
      "GROQ_MODEL",
      "GROQ_FALLBACK_MODELS",
      "CRAWLER_SECRET",
      "SITE_URL"
    ]
  },
  translate: {
    required: storageRequired,
    anyOf: [
      ["GEMINI_API_KEY", "GEMINI_API_KEYS"],
      ["GROQ_API_KEY", "GROQ_API_KEYS"]
    ],
    optional: [
      "GROQ_API_KEY",
      "GROQ_API_KEYS",
      "GROQ_MODEL",
      "GROQ_FALLBACK_MODELS",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "TRANSLATE_SPACING_MS"
    ]
  },
  keepalive: {
    required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    optional: []
  },
  reconcile: {
    required: [
      ...storageRequired,
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ],
    optional: [
      "R2_PUBLIC_BASE_URL"
    ]
  }
};

const profileName = process.argv[2];
const profile = PROFILES[profileName];

if (!profile) {
  console.error(`Profile không hợp lệ: ${profileName}. Chọn: ${Object.keys(PROFILES).join(", ")}`);
  process.exit(2);
}

const missing = [];
console.log(`Kiểm tra biến môi trường cho profile "${profileName}" (chỉ báo có/không, không in giá trị):`);

if (profile.required) {
  for (const name of profile.required) {
    const value = process.env[name];
    const ok = typeof value === "string" && value.trim().length > 0;
    console.log(`  ${ok ? "OK     " : "MISSING"}  ${name}${ok ? `  (${value.trim().length} ký tự)` : ""}`);
    if (!ok) missing.push(name);
  }
}

if (profile.anyOf) {
  for (const group of profile.anyOf) {
    const present = group.filter((name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0);
    const ok = present.length > 0;
    console.log(`  ${ok ? "OK     " : "MISSING"}  ${group.join(" hoặc ")}${ok ? `  (dùng ${present[0]})` : ""}`);
    if (!ok) missing.push(group.join(" hoặc "));
  }
}

for (const name of profile.optional) {
  const value = process.env[name];
  const ok = typeof value === "string" && value.trim().length > 0;
  console.log(`  ${ok ? "OK     " : "-      "}  ${name} (tùy chọn)${ok ? `  (${value.trim().length} ký tự)` : ""}`);
}

for (const [label, rawKeys] of [
  ["Gemini translation", process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY],
  ["Groq review", process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY]
]) {
  if (rawKeys) {
    const parsed = String(rawKeys).split(/[\r\n,;]+/).map((k) => k.trim()).filter((k) => k.length > 5);
    console.log(`  INFO     ${label} pool: ${parsed.length} API key.`);
  }
}

// A public base URL that is not a URL is a configuration error worth catching
// here rather than as a broken chapter link in the reader.
const publicBase = process.env.R2_PUBLIC_BASE_URL;
if (publicBase && !isDriveStorage) {
  try {
    const url = new URL(publicBase);
    if (url.protocol !== "https:") {
      console.log(`  WARN     R2_PUBLIC_BASE_URL không dùng https (${url.protocol})`);
    }
  } catch {
    console.log("  MISSING  R2_PUBLIC_BASE_URL không phải URL hợp lệ");
    missing.push("R2_PUBLIC_BASE_URL (không hợp lệ)");
  }
}

if (missing.length) {
  console.error(`\nThiếu ${missing.length} biến bắt buộc: ${missing.join(", ")}`);
  console.error("Thêm chúng vào GitHub repository secrets (Settings > Secrets and variables > Actions).");
  process.exit(1);
}

console.log("\nĐủ biến bắt buộc.");
