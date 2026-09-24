"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STORY_STATE_SCHEMA_VERSION = 1;

function createEmptyStoryState(bookId = "") {
  return {
    schema: STORY_STATE_SCHEMA_VERSION,
    bookId,
    version: 1,
    updatedAt: new Date().toISOString(),
    characters: [],      // { name, aliases: [], role, relationships: [] }
    terminology: [],     // { zh, vi, category, notes }
    skills: [],          // { zh, vi }
    items: [],           // { zh, vi }
    locations: [],       // { zh, vi }
    factions: [],        // { zh, vi }
    currentScene: "",    // concise scene descriptor (max 200 chars)
    speakerContext: ""   // active speaker/dialogue context (max 150 chars)
  };
}

function cleanStr(val, maxLen = 200) {
  if (typeof val !== "string") return "";
  return val.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

class StoryStateManager {
  constructor({ storageDir = path.resolve(process.cwd(), ".cache", "story-state") } = {}) {
    this.storageDir = storageDir;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getStatePath(bookId) {
    const safeId = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.storageDir, `${safeId}.json`);
  }

  loadState(bookId) {
    const file = this.getStatePath(bookId);
    if (!fs.existsSync(file)) {
      return createEmptyStoryState(bookId);
    }
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return { ...createEmptyStoryState(bookId), ...data };
    } catch {
      return createEmptyStoryState(bookId);
    }
  }

  saveState(state) {
    if (!state?.bookId) throw new Error("State must have a valid bookId");
    state.version = (state.version || 0) + 1;
    state.updatedAt = new Date().toISOString();
    const file = this.getStatePath(state.bookId);
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
    return state;
  }

  computeStateHash(state) {
    const payload = JSON.stringify({
      characters: (state.characters || []).map(c => [c.name, ...(c.aliases || [])]),
      terminology: (state.terminology || []).map(t => [t.zh, t.vi]),
      skills: (state.skills || []).map(s => [s.zh, s.vi]),
      items: (state.items || []).map(i => [i.zh, i.vi]),
      locations: (state.locations || []).map(l => [l.zh, l.vi]),
      factions: (state.factions || []).map(f => [f.zh, f.vi]),
      scene: state.currentScene || "",
      speaker: state.speakerContext || ""
    });
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  /**
   * Incrementally merge updates into state without unbounded growth.
   */
  updateIncremental(bookId, updates = {}) {
    const state = this.loadState(bookId);

    // Update characters
    if (Array.isArray(updates.characters)) {
      const charMap = new Map(state.characters.map(c => [c.name.toLowerCase(), c]));
      for (const item of updates.characters) {
        const name = cleanStr(item.name, 60);
        if (!name) continue;
        const key = name.toLowerCase();
        const prev = charMap.get(key) || { name, aliases: [], role: "", relationships: [] };
        const newAliases = Array.isArray(item.aliases) ? item.aliases.map(a => cleanStr(a, 60)).filter(Boolean) : [];
        const newRels = Array.isArray(item.relationships) ? item.relationships.map(r => cleanStr(r, 100)).filter(Boolean) : [];
        charMap.set(key, {
          name: prev.name || name,
          aliases: [...new Set([...(prev.aliases || []), ...newAliases])].slice(0, 10),
          role: cleanStr(item.role, 80) || prev.role || "",
          relationships: [...new Set([...(prev.relationships || []), ...newRels])].slice(0, 15)
        });
      }
      state.characters = [...charMap.values()].slice(-60); // Bound size
    }

    // Update terminology
    if (Array.isArray(updates.terminology)) {
      const termMap = new Map(state.terminology.map(t => [t.zh.toLowerCase(), t]));
      for (const t of updates.terminology) {
        const zh = cleanStr(t.zh, 60);
        const vi = cleanStr(t.vi, 80);
        if (!zh || !vi) continue;
        termMap.set(zh.toLowerCase(), {
          zh,
          vi,
          category: cleanStr(t.category, 40) || "general",
          notes: cleanStr(t.notes, 100)
        });
      }
      state.terminology = [...termMap.values()].slice(-150);
    }

    // Update skills
    if (Array.isArray(updates.skills)) {
      const skillMap = new Map(state.skills.map(s => [s.zh.toLowerCase(), s]));
      for (const s of updates.skills) {
        const zh = cleanStr(s.zh, 60);
        const vi = cleanStr(s.vi, 80);
        if (zh && vi) skillMap.set(zh.toLowerCase(), { zh, vi });
      }
      state.skills = [...skillMap.values()].slice(-50);
    }

    // Update items
    if (Array.isArray(updates.items)) {
      const itemMap = new Map(state.items.map(i => [i.zh.toLowerCase(), i]));
      for (const i of updates.items) {
        const zh = cleanStr(i.zh, 60);
        const vi = cleanStr(i.vi, 80);
        if (zh && vi) itemMap.set(zh.toLowerCase(), { zh, vi });
      }
      state.items = [...itemMap.values()].slice(-50);
    }

    // Update locations
    if (Array.isArray(updates.locations)) {
      const locMap = new Map(state.locations.map(l => [l.zh.toLowerCase(), l]));
      for (const l of updates.locations) {
        const zh = cleanStr(l.zh, 60);
        const vi = cleanStr(l.vi, 80);
        if (zh && vi) locMap.set(zh.toLowerCase(), { zh, vi });
      }
      state.locations = [...locMap.values()].slice(-30);
    }

    // Update factions
    if (Array.isArray(updates.factions)) {
      const facMap = new Map(state.factions.map(f => [f.zh.toLowerCase(), f]));
      for (const f of updates.factions) {
        const zh = cleanStr(f.zh, 60);
        const vi = cleanStr(f.vi, 80);
        if (zh && vi) facMap.set(zh.toLowerCase(), { zh, vi });
      }
      state.factions = [...facMap.values()].slice(-30);
    }

    if (updates.currentScene !== undefined) {
      state.currentScene = cleanStr(updates.currentScene, 200);
    }
    if (updates.speakerContext !== undefined) {
      state.speakerContext = cleanStr(updates.speakerContext, 150);
    }

    return this.saveState(state);
  }

  /**
   * Generates a compact markdown/summary representation for inclusion in batch prompts.
   * Keeps token count minimal (< 300 tokens).
   */
  formatForContext(state, relevantText = "") {
    const lines = [];

    // Filter characters to relevant ones if text is provided
    let chars = state.characters || [];
    if (relevantText && chars.length > 5) {
      chars = chars.filter(c => relevantText.includes(c.name) || (c.aliases || []).some(a => relevantText.includes(a)));
      if (chars.length === 0) chars = state.characters.slice(-5);
    } else {
      chars = chars.slice(-10);
    }
    if (chars.length) {
      const charStr = chars.map(c => `${c.name}${c.aliases?.length ? ` (${c.aliases.join("/")})` : ""}: ${c.role || "nhân vật"}`).join("; ");
      lines.push(`- Nhân vật: ${charStr}`);
    }

    // Relevant terms
    let terms = state.terminology || [];
    if (relevantText && terms.length > 8) {
      terms = terms.filter(t => relevantText.includes(t.zh));
      if (terms.length === 0) terms = state.terminology.slice(-8);
    } else {
      terms = terms.slice(-12);
    }
    if (terms.length) {
      const termStr = terms.map(t => `${t.zh} -> ${t.vi}`).join(", ");
      lines.push(`- Thuật ngữ: ${termStr}`);
    }

    // Skills & Items
    const skills = (state.skills || []).slice(-8);
    if (skills.length) {
      lines.push(`- Kỹ năng: ${skills.map(s => `${s.zh} -> ${s.vi}`).join(", ")}`);
    }
    const items = (state.items || []).slice(-8);
    if (items.length) {
      lines.push(`- Vật phẩm: ${items.map(i => `${i.zh} -> ${i.vi}`).join(", ")}`);
    }

    if (state.currentScene) {
      lines.push(`- Bối cảnh: ${state.currentScene}`);
    }
    if (state.speakerContext) {
      lines.push(`- Ngữ cảnh thoại: ${state.speakerContext}`);
    }

    return lines.join("\n");
  }
}

module.exports = {
  StoryStateManager,
  createEmptyStoryState
};

