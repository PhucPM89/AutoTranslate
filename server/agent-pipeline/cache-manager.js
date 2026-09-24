"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

class CacheManager {
  constructor({ cacheDir = path.resolve(process.cwd(), ".cache", "translation-batches") } = {}) {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.hits = 0;
    this.misses = 0;
  }

  computeCacheKey({
    sourceHash,
    modelVersion = "agent-runtime-v1",
    promptVersion = "agent-prompt-v2",
    storyStateVersion = "1"
  }) {
    const payload = `${sourceHash}|${modelVersion}|${promptVersion}|${storyStateVersion}`;
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  }

  getCacheFilePath(cacheKey) {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  get(cacheKey) {
    const file = this.getCacheFilePath(cacheKey);
    if (!fs.existsSync(file)) {
      this.misses++;
      return null;
    }
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      this.hits++;
      return data;
    } catch {
      this.misses++;
      return null;
    }
  }

  set(cacheKey, data) {
    const file = this.getCacheFilePath(cacheKey);
    const entry = {
      cacheKey,
      cachedAt: new Date().toISOString(),
      data
    };
    fs.writeFileSync(file, JSON.stringify(entry, null, 2), "utf8");
    return entry;
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      totalRequests: total,
      hitRate: Number(hitRate.toFixed(4))
    };
  }
}

module.exports = {
  CacheManager
};

