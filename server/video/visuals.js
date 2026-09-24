"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function execAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Fetch AI image from Pollinations.ai (free, fast, no key required)
 */
async function fetchPollinationsImage(prompt, outputPath, { width = 1080, height = 1920, timeoutMs = 20000 } = {}) {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Pollinations HTTP ${res.status}: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 5000) {
      throw new Error("Tệp ảnh tải về quá nhỏ hoặc không hợp lệ");
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    return { success: true, outputPath, source: "pollinations" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Render graphic scene card using Python Pillow
 */
async function renderGraphicCard({
  outputPath,
  coverPath,
  title,
  author,
  badge = "REVIEW TRUYỆN",
  keyword = "",
  sceneText = "",
  width = 1080,
  height = 1920
}) {
  const scriptPath = path.join(__dirname, "render_card.py");
  const tmpCfgPath = path.join(path.dirname(outputPath), `cfg_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

  const cfg = {
    width,
    height,
    outputPath,
    coverPath: coverPath && fs.existsSync(coverPath) ? coverPath : null,
    title,
    author,
    badge,
    keyword,
    sceneText
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tmpCfgPath, JSON.stringify(cfg, null, 2), "utf8");

  try {
    await execAsync("python", [scriptPath, tmpCfgPath], { timeout: 15000 });
    return { success: true, outputPath, source: "graphic_card" };
  } finally {
    if (fs.existsSync(tmpCfgPath)) {
      try { fs.unlinkSync(tmpCfgPath); } catch (_) {}
    }
  }
}

/**
 * Generate visuals for each scene in the script
 * Enhances prompt with high-impact manhwa/webtoon visual keywords
 */
function enhancePrompt(rawPrompt, isVertical = true) {
  const base = String(rawPrompt || "").trim();
  const orientation = isVertical ? "vertical 9:16 smartphone wallpaper format" : "cinematic 16:9 widescreen format";
  const tags = "dark fantasy webtoon manhwa anime digital painting, dramatic cinematic rim lighting, highly detailed character and environment, 8k resolution, trending on artstation, masterpiece, no text, no watermark";
  return `${base}, ${orientation}, ${tags}`;
}

/**
 * Generate visuals for each scene in the script with multi-cut support
 *
 * @param {Object} script Script with scenes
 * @param {Object} book Book metadata
 * @param {Object} options
 */
async function generateScriptVisuals(script, book, {
  workDir,
  coverPath = null,
  enableAiVisuals = true,
  aiVisualRatio = 0.5,
  aspectRatio = "9:16",
  cutsPerScene = 2
} = {}) {
  const visualsDir = path.join(workDir, "visuals");
  fs.mkdirSync(visualsDir, { recursive: true });

  const isVertical = aspectRatio === "9:16";
  const width = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;

  const scenes = script.scenes || [];
  const sceneVisuals = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = scene.id || `scene_${i + 1}`;
    const primaryImgPath = path.join(visualsDir, `${sceneId}_shot1.jpg`);
    const secondaryImgPath = path.join(visualsDir, `${sceneId}_shot2.jpg`);
    const cardImgPath = path.join(visualsDir, `${sceneId}_card.jpg`);

    console.log(`[Visuals] Generating visuals for scene ${i + 1}/${scenes.length}: ${sceneId} (${aspectRatio})`);

    const shots = [];

    // Shot 1: Primary Art (AI or Stylized Card)
    let shot1Generated = false;
    if (enableAiVisuals && scene.visualPrompt) {
      try {
        const p1 = enhancePrompt(scene.visualPrompt, isVertical);
        await fetchPollinationsImage(p1, primaryImgPath, { width, height, timeoutMs: 16000 });
        shots.push({
          imagePath: primaryImgPath,
          motion: i % 2 === 0 ? "zoom_in" : "zoom_out",
          source: "ai_art"
        });
        shot1Generated = true;
      } catch (err) {
        console.warn(`[Visuals] Shot 1 AI visual failed for ${sceneId}, falling back to card:`, err.message);
      }
    }

    if (!shot1Generated) {
      await renderGraphicCard({
        outputPath: primaryImgPath,
        coverPath,
        title: book.title || "Trạm Chữ",
        author: book.author || "",
        badge: scene.badge || (scene.type === "hook" ? "🔥 SIÊU PHẨM SINH TỒN" : scene.type === "conflict" ? "⚡ CAO TRÀO" : "REVIEW TRUYỆN"),
        keyword: scene.visualKeyword || scene.section || "",
        sceneText: scene.text || "",
        width,
        height
      });
      shots.push({
        imagePath: primaryImgPath,
        motion: "zoom_in",
        source: "graphic_card"
      });
    }

    // Shot 2: Secondary Close-up / Action Art or Stylized Title Card
    if (cutsPerScene >= 2) {
      let shot2Generated = false;
      if (enableAiVisuals && (scene.visualPrompt2 || scene.visualKeyword || scene.visualPrompt)) {
        try {
          const secondaryPrompt = scene.visualPrompt2 ||
            `close-up intense focus on ${scene.visualKeyword || scene.section || "the protagonist in danger"}, dramatic tension`;
          const p2 = enhancePrompt(secondaryPrompt, isVertical);
          await fetchPollinationsImage(p2, secondaryImgPath, { width, height, timeoutMs: 16000 });
          shots.push({
            imagePath: secondaryImgPath,
            motion: isVertical ? "pan_up" : "zoom_out",
            source: "ai_art"
          });
          shot2Generated = true;
        } catch (err) {
          console.warn(`[Visuals] Shot 2 AI visual failed for ${sceneId}:`, err.message);
        }
      }

      if (!shot2Generated) {
        // Generate vertical card with distinct badge/keyword
        await renderGraphicCard({
          outputPath: cardImgPath,
          coverPath,
          title: book.title || "Trạm Chữ",
          author: book.author || "",
          badge: scene.type === "hook" ? "⭐ CỰC PHẨM ĐỀ CỬ" : "TRẠM CHỮ ONLINE",
          keyword: scene.visualKeyword ? `TIÊU ĐIỂM: ${scene.visualKeyword.toUpperCase()}` : "",
          sceneText: scene.text || "",
          width,
          height
        });
        shots.push({
          imagePath: cardImgPath,
          motion: "pan_up",
          source: "graphic_card"
        });
      }
    }

    sceneVisuals.push({
      sceneId,
      imagePath: shots[0].imagePath,
      shots,
      width,
      height
    });
  }

  return sceneVisuals;
}

module.exports = {
  fetchPollinationsImage,
  renderGraphicCard,
  generateScriptVisuals
};
