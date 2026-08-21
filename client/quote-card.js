"use strict";

// Quote card generator for social sharing (Facebook, Threads, Instagram).
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
  theme = "dark"
}) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const width = 1080;
  const padding = 80;
  const contentWidth = width - padding * 2;

  // Measurement phase to determine height
  ctx.font = "italic 36px 'Be Vietnam Pro', -apple-system, sans-serif";
  const quoteLines = wrapText(ctx, quote.slice(0, 420), contentWidth);
  const lineHeight = 56;
  const textBlockHeight = quoteLines.length * lineHeight;
  const height = Math.max(760, Math.min(1400, textBlockHeight + 460));

  canvas.width = width;
  canvas.height = height;

  // Background styling
  if (theme === "sepia") {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#faf5e8");
    bg.addColorStop(1, "#f1e6cd");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Frame border
    ctx.strokeStyle = "rgba(120, 107, 92, 0.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Quote mark
    ctx.fillStyle = "rgba(180, 83, 9, 0.25)";
    ctx.font = "bold 160px Georgia, serif";
    ctx.fillText("“", padding - 10, padding + 70);

    // Main quote text
    ctx.fillStyle = "#2d261e";
    ctx.font = "italic 36px 'Be Vietnam Pro', -apple-system, sans-serif";
    let y = padding + 120;
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
    ctx.lineTo(padding + 160, y);
    ctx.stroke();

    // Book title & author
    y += 55;
    ctx.fillStyle = "#1b140e";
    ctx.font = "bold 32px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(bookTitle || "Trạm Chữ", padding, y);

    if (author) {
      y += 38;
      ctx.fillStyle = "#6e6459";
      ctx.font = "24px 'Be Vietnam Pro', sans-serif";
      ctx.fillText(`Tác giả: ${author}`, padding, y);
    }

    // Footer branding
    ctx.fillStyle = "#8a7e6f";
    ctx.font = "600 22px 'Be Vietnam Pro', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Trạm Chữ · tram-chu.online", width - padding, height - padding);
  } else {
    // Luxury Dark Gradient
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0a0716");
    bg.addColorStop(0.5, "#140e2b");
    bg.addColorStop(1, "#07050f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle glow border
    ctx.strokeStyle = "rgba(168, 85, 247, 0.22)";
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Quote mark
    ctx.fillStyle = "rgba(168, 85, 247, 0.35)";
    ctx.font = "bold 160px Georgia, serif";
    ctx.fillText("“", padding - 10, padding + 70);

    // Main quote text
    ctx.fillStyle = "#f4f1ff";
    ctx.font = "italic 36px 'Be Vietnam Pro', -apple-system, sans-serif";
    let y = padding + 120;
    for (const line of quoteLines) {
      ctx.fillText(line, padding, y);
      y += lineHeight;
    }

    // Gradient Divider
    y += 40;
    const divider = ctx.createLinearGradient(padding, y, padding + 240, y);
    divider.addColorStop(0, "#a855f7");
    divider.addColorStop(1, "rgba(6, 182, 212, 0.1)");
    ctx.strokeStyle = divider;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + 200, y);
    ctx.stroke();

    // Book title & author
    y += 55;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(bookTitle || "Trạm Chữ", padding, y);

    if (author) {
      y += 38;
      ctx.fillStyle = "#948cbe";
      ctx.font = "24px 'Be Vietnam Pro', sans-serif";
      ctx.fillText(`Tác giả: ${author}`, padding, y);
    }

    // Footer branding
    ctx.fillStyle = "#c084fc";
    ctx.font = "600 22px 'Be Vietnam Pro', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Trạm Chữ · tram-chu.online", width - padding, height - padding);
  }

  return canvas;
}

module.exports = {
  wrapText,
  renderQuoteCard
};
