"use strict";

// Quote card generator for social sharing (Facebook, Threads, Instagram, TikTok Stories).
// Uses off-screen HTML5 Canvas to render elegant quote cards with Trạm Chữ branding.

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").trim().split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function renderQuoteCard({
  canvas,
  quote = "",
  bookTitle = "",
  author = "",
  theme = "dark",
  format = "post" // "post" (flexible height) or "story" (1080x1920 9:16)
}) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const isStory = format === "story";
  const width = 1080;
  const height = isStory ? 1920 : 0;
  const padding = isStory ? 96 : 80;
  const contentWidth = width - padding * 2;

  // Font size & measurement
  const fontSize = isStory ? 44 : 36;
  const lineHeight = isStory ? 68 : 56;
  ctx.font = `italic ${fontSize}px 'Be Vietnam Pro', -apple-system, sans-serif`;
  const quoteLines = wrapText(ctx, quote.slice(0, isStory ? 550 : 420), contentWidth);
  const textBlockHeight = quoteLines.length * lineHeight;

  const calculatedHeight = isStory ? 1920 : Math.max(760, Math.min(1400, textBlockHeight + 460));

  canvas.width = width;
  canvas.height = calculatedHeight;

  // Re-set context after canvas resize
  if (theme === "sepia") {
    const bg = ctx.createLinearGradient(0, 0, width, calculatedHeight);
    bg.addColorStop(0, "#faf5e8");
    bg.addColorStop(1, "#f1e6cd");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, calculatedHeight);

    // Frame border
    ctx.strokeStyle = "rgba(120, 107, 92, 0.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, width - 64, calculatedHeight - 64);

    // Quote mark
    ctx.fillStyle = "rgba(180, 83, 9, 0.25)";
    ctx.font = `bold ${isStory ? 200 : 160}px Georgia, serif`;
    const startY = isStory ? 320 : padding + 120;
    ctx.fillText("“", padding - 10, isStory ? 280 : padding + 70);

    // Main quote text
    ctx.fillStyle = "#2d261e";
    ctx.font = `italic ${fontSize}px 'Be Vietnam Pro', -apple-system, sans-serif`;
    let y = startY;
    for (const line of quoteLines) {
      ctx.fillText(line, padding, y);
      y += lineHeight;
    }

    // Divider
    y += 40;
    ctx.strokeStyle = "rgba(120, 107, 92, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + 200, y);
    ctx.stroke();

    // Book title & author
    y += 55;
    ctx.fillStyle = "#1b140e";
    ctx.font = `bold ${isStory ? 38 : 32}px 'Be Vietnam Pro', sans-serif`;
    ctx.fillText(bookTitle || "Trạm Chữ", padding, y);

    if (author) {
      y += 42;
      ctx.fillStyle = "#6e6459";
      ctx.font = `${isStory ? 28 : 24}px 'Be Vietnam Pro', sans-serif`;
      ctx.fillText(`Tác giả: ${author}`, padding, y);
    }

    // Footer branding
    ctx.fillStyle = "#8a7e6f";
    ctx.font = "600 24px 'Be Vietnam Pro', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Trạm Chữ · tram-chu.online", width - padding, calculatedHeight - padding);
  } else {
    // Luxury Dark Gradient
    const bg = ctx.createLinearGradient(0, 0, width, calculatedHeight);
    bg.addColorStop(0, "#0a0716");
    bg.addColorStop(0.5, "#140e2b");
    bg.addColorStop(1, "#07050f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, calculatedHeight);

    // Decorative glow rings for story
    if (isStory) {
      ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
      ctx.beginPath();
      ctx.arc(width / 2, 400, 350, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glow border
    ctx.strokeStyle = "rgba(168, 85, 247, 0.22)";
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, width - 64, calculatedHeight - 64);

    // Quote mark
    ctx.fillStyle = "rgba(168, 85, 247, 0.35)";
    ctx.font = `bold ${isStory ? 200 : 160}px Georgia, serif`;
    const startY = isStory ? 440 : padding + 120;
    ctx.fillText("“", padding - 10, isStory ? 390 : padding + 70);

    // Main quote text
    ctx.fillStyle = "#f4f1ff";
    ctx.font = `italic ${fontSize}px 'Be Vietnam Pro', -apple-system, sans-serif`;
    let y = startY;
    for (const line of quoteLines) {
      ctx.fillText(line, padding, y);
      y += lineHeight;
    }

    // Gradient Divider
    y += 45;
    const divider = ctx.createLinearGradient(padding, y, padding + 280, y);
    divider.addColorStop(0, "#a855f7");
    divider.addColorStop(1, "rgba(6, 182, 212, 0.1)");
    ctx.strokeStyle = divider;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + 240, y);
    ctx.stroke();

    // Book title & author
    y += 60;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${isStory ? 40 : 32}px 'Be Vietnam Pro', sans-serif`;
    ctx.fillText(bookTitle || "Trạm Chữ", padding, y);

    if (author) {
      y += 44;
      ctx.fillStyle = "#948cbe";
      ctx.font = `${isStory ? 28 : 24}px 'Be Vietnam Pro', sans-serif`;
      ctx.fillText(`Tác giả: ${author}`, padding, y);
    }

    // Footer branding
    ctx.fillStyle = "#c084fc";
    ctx.font = "600 24px 'Be Vietnam Pro', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Trạm Chữ · tram-chu.online", width - padding, calculatedHeight - padding);
  }

  return canvas;
}

module.exports = {
  wrapText,
  renderQuoteCard
};
