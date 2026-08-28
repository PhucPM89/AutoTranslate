"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = env.CLOUDFLARE_API_TOKEN;

async function setupAiGateway() {
  if (!accountId || !apiToken) {
    console.error("Thiếu CLOUDFLARE_ACCOUNT_ID hoặc CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  console.log(`Kiểm tra AI Gateway trên Cloudflare Account: ${accountId}...`);

  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`,
    {
      headers: { Authorization: `Bearer ${apiToken}` }
    }
  );

  const listData = await listRes.json();
  let gatewayId = "gemini-gateway";

  if (listData.success && Array.isArray(listData.result) && listData.result.length > 0) {
    const existing = listData.result.find((g) => g.id === gatewayId) || listData.result[0];
    gatewayId = existing.id;
    console.log(`Đã tìm thấy AI Gateway sẵn có: "${gatewayId}"`);
  } else {
    console.log(`Đang tạo AI Gateway mới "${gatewayId}"...`);
    const createRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: gatewayId,
          name: "Gemini AI Gateway",
          cache_ttl: 0,
          rate_limiting_interval: 0,
          rate_limiting_limit: 0
        })
      }
    );
    const createData = await createRes.json();
    if (!createData.success) {
      console.warn("Không thể tạo tự động qua API Gateway (có thể do quyền token):", createData.errors);
    } else {
      console.log(`Tạo AI Gateway "${gatewayId}" thành công!`);
    }
  }

  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio`;
  console.log(`\nURL AI Gateway cho Google AI Studio:\n${gatewayUrl}\n`);

  // Test ping with one key if available
  const sampleKey = env.GEMINI_API_KEY || (env.GEMINI_API_KEYS ? env.GEMINI_API_KEYS.split(/[\n,;]+/)[0].trim() : "");
  if (sampleKey) {
    console.log(`Đang kiểm tra kết nối qua Gateway với key ${sampleKey.slice(0, 10)}...`);
    try {
      const probeRes = await fetch(`${gatewayUrl}/v1beta/models?key=${encodeURIComponent(sampleKey)}`, {
        signal: AbortSignal.timeout(10000)
      });
      const probeData = await probeRes.json().catch(() => null);
      if (probeRes.ok) {
        console.log("🟢 Kết nối qua Cloudflare AI Gateway thành công 100%! Không bị chặn vị trí!");
      } else {
        console.log(`Phản hồi (${probeRes.status}):`, probeData?.error?.message || probeData);
      }
    } catch (err) {
      console.log("Lỗi probe gateway:", err.message);
    }
  }

  return { accountId, gatewayId, gatewayUrl };
}

setupAiGateway().catch(console.error);
