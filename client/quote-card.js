"use strict";

// Trạm Chữ — Luxury Quote Card Generator Studio
// Generates stunning, high-definition shareable cards (1:1 Post & 9:16 Story)
// for Facebook, Threads, Instagram, TikTok with oriental glassmorphism aesthetics.

const { drawQRCodeToCanvas } = require("./qr-generator.js");

const THEMES = {
  nebula: {
    id: "nebula",
    name: "Tử Kim Huyễn Cảnh",
    bgStart: "#05030e",
    bgMid: "#120926",
    bgEnd: "#080414",
    aura1: "rgba(168, 85, 247, 0.18)",
    aura2: "rgba(234, 179, 8, 0.12)",
    border: "rgba(168, 85, 247, 0.35)",
    borderInner: "rgba(234, 179, 8, 0.2)",
    filigree: "#eab308",
    quoteMark: "rgba(192, 132, 252, 0.45)",
    textPrimary: "#fcfaff",
    textSecondary: "#c084fc",
    textMuted: "#948cbe",
    badgeBg: "rgba(168, 85, 247, 0.22)",
    badgeBorder: "#a855f7",
    badgeText: "#f3e8ff",
    dividerStart: "#eab308",
    dividerEnd: "#a855f7",
    qrDark: "#130926",
    qrLight: "#fcfaff",
    brandColor: "#facc15",
    sealColor: "#ef4444"
  },
  ink: {
    id: "ink",
    name: "Mặc Trúc Giang Hồ",
    bgStart: "#07120d",
    bgMid: "#0e1f18",
    bgEnd: "#050b08",
    aura1: "rgba(16, 185, 129, 0.15)",
    aura2: "rgba(245, 158, 11, 0.1)",
    border: "rgba(52, 211, 153, 0.35)",
    borderInner: "rgba(217, 119, 6, 0.2)",
    filigree: "#34d399",
    quoteMark: "rgba(52, 211, 153, 0.4)",
    textPrimary: "#f2fcf6",
    textSecondary: "#6ee7b7",
    textMuted: "#86a798",
    badgeBg: "rgba(16, 185, 129, 0.2)",
    badgeBorder: "#10b981",
    badgeText: "#d1fae5",
    dividerStart: "#34d399",
    dividerEnd: "#f59e0b",
    qrDark: "#071710",
    qrLight: "#f2fcf6",
    brandColor: "#34d399",
    sealColor: "#dc2626"
  },
  gold: {
    id: "gold",
    name: "Hoàng Kim Bá Khí",
    bgStart: "#0d0904",
    bgMid: "#1c1206",
    bgEnd: "#080502",
    aura1: "rgba(245, 158, 11, 0.2)",
    aura2: "rgba(239, 68, 68, 0.12)",
    border: "rgba(245, 158, 11, 0.4)",
    borderInner: "rgba(239, 68, 68, 0.25)",
    filigree: "#fbbf24",
    quoteMark: "rgba(251, 191, 36, 0.45)",
    textPrimary: "#fffdfa",
    textSecondary: "#fbbf24",
    textMuted: "#bca380",
    badgeBg: "rgba(245, 158, 11, 0.2)",
    badgeBorder: "#f59e0b",
    badgeText: "#fef3c7",
    dividerStart: "#fbbf24",
    dividerEnd: "#ef4444",
    qrDark: "#1c1206",
    qrLight: "#fffdfa",
    brandColor: "#fbbf24",
    sealColor: "#b91c1c"
  }
};

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

function drawCornerFiligree(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // Outer corner bracket
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();

  // Inner decorative knot
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, size * 0.6);
  ctx.lineTo(8, 8);
  ctx.lineTo(size * 0.6, 8);
  ctx.stroke();

  // Corner diamond dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSealStamp(ctx, x, y, text, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-24, -24, 48, 48);

  ctx.fillStyle = color;
  ctx.font = "bold 13px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 2), 0, -6);
  ctx.fillText(text.slice(2, 4) || "Chữ", 0, 8);
  ctx.restore();
}

async function renderQuoteCard({
  canvas,
  quote = "",
  bookTitle = "",
  author = "",
  chapterTitle = "",
  readerNickname = "",
  readerRankTitle = "",
  theme = "nebula",
  format = "post", // "post" (1200x1200) or "story" (1080x1920)
  shareUrl = "https://tram-chu.online"
}) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const t = THEMES[theme] || THEMES.nebula;
  const isStory = format === "story";
  const width = isStory ? 1080 : 1200;
  const height = isStory ? 1920 : 1200;
  const padding = isStory ? 84 : 96;
  const contentWidth = width - padding * 2;

  canvas.width = width;
  canvas.height = height;

  // 1. Background Gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, t.bgStart);
  bg.addColorStop(0.5, t.bgMid);
  bg.addColorStop(1, t.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 2. Ambient Aurora Glows
  const aura1 = ctx.createRadialGradient(width * 0.85, height * 0.15, 50, width * 0.85, height * 0.15, isStory ? 600 : 500);
  aura1.addColorStop(0, t.aura1);
  aura1.addColorStop(1, "transparent");
  ctx.fillStyle = aura1;
  ctx.fillRect(0, 0, width, height);

  const aura2 = ctx.createRadialGradient(width * 0.15, height * 0.85, 50, width * 0.15, height * 0.85, isStory ? 600 : 500);
  aura2.addColorStop(0, t.aura2);
  aura2.addColorStop(1, "transparent");
  ctx.fillStyle = aura2;
  ctx.fillRect(0, 0, width, height);

  // 3. Double Border Frames
  const frameMargin = isStory ? 36 : 40;
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(frameMargin, frameMargin, width - frameMargin * 2, height - frameMargin * 2);

  const innerMargin = frameMargin + 10;
  ctx.strokeStyle = t.borderInner;
  ctx.lineWidth = 1;
  ctx.strokeRect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2);

  // 4. Filigree Corner Brackets
  const cornerSize = isStory ? 44 : 50;
  drawCornerFiligree(ctx, innerMargin + 6, innerMargin + 6, cornerSize, 0, t.filigree);
  drawCornerFiligree(ctx, width - innerMargin - 6, innerMargin + 6, cornerSize, Math.PI / 2, t.filigree);
  drawCornerFiligree(ctx, width - innerMargin - 6, height - innerMargin - 6, cornerSize, Math.PI, t.filigree);
  drawCornerFiligree(ctx, innerMargin + 6, height - innerMargin - 6, cornerSize, -Math.PI / 2, t.filigree);

  // 5. Header: Brand Logo & Reader Info
  let curY = padding + (isStory ? 70 : 40);

  // Top Bar Brand Badge
  ctx.fillStyle = t.badgeBg;
  ctx.strokeStyle = t.badgeBorder;
  ctx.lineWidth = 1.5;
  const brandBadgeWidth = 260;
  const brandBadgeHeight = 44;
  ctx.beginPath();
  ctx.roundRect(padding, curY, brandBadgeWidth, brandBadgeHeight, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = t.brandColor;
  ctx.font = "bold 20px 'Be Vietnam Pro', -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("✦ TRẠM CHỮ NOVEL", padding + 22, curY + brandBadgeHeight / 2);

  // Reader Đạo Hiệu Tag on the right
  if (readerNickname) {
    ctx.textAlign = "right";
    ctx.font = "600 20px 'Be Vietnam Pro', sans-serif";
    ctx.fillStyle = t.textMuted;
    const titleTag = readerRankTitle ? `[${readerRankTitle}] ` : "";
    ctx.fillText(`${titleTag}${readerNickname}`, width - padding, curY + brandBadgeHeight / 2);
  }

  // 6. Book Badge & Chapter Header
  curY += isStory ? 100 : 75;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  if (chapterTitle || bookTitle) {
    ctx.fillStyle = t.textSecondary;
    ctx.font = "bold 22px 'Be Vietnam Pro', sans-serif";
    const headerInfo = [bookTitle, chapterTitle].filter(Boolean).join(" • ");
    ctx.fillText(headerInfo.toUpperCase(), padding, curY);
  }

  // 7. Giant Decorative Opening Quote Mark
  curY += isStory ? 50 : 35;
  ctx.fillStyle = t.quoteMark;
  ctx.font = `bold ${isStory ? 180 : 150}px 'Cinzel', Georgia, serif`;
  ctx.fillText("“", padding - 15, curY);

  // 8. Main Quote Text (Auto-scaling & Line wrapping)
  const maxQuoteLength = isStory ? 650 : 450;
  const cleanQuote = quote.slice(0, maxQuoteLength).trim();
  
  let fontSize = isStory ? 42 : 38;
  let lineHeight = isStory ? 68 : 60;
  if (cleanQuote.length > 250) {
    fontSize = isStory ? 36 : 32;
    lineHeight = isStory ? 58 : 50;
  }
  if (cleanQuote.length > 400) {
    fontSize = isStory ? 32 : 28;
    lineHeight = isStory ? 52 : 44;
  }

  ctx.font = `italic ${fontSize}px 'Be Vietnam Pro', 'Merriweather', -apple-system, serif`;
  const quoteLines = wrapText(ctx, cleanQuote, contentWidth);

  let textY = curY + (isStory ? 110 : 85);
  ctx.fillStyle = t.textPrimary;
  
  for (const line of quoteLines) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText(line, padding, textY);
    textY += lineHeight;
  }
  ctx.shadowColor = "transparent";

  // 9. Divider with Glowing Gradient
  let footerY = height - padding - (isStory ? 200 : 160);
  const dividerY = Math.max(textY + 35, footerY - 40);

  const dividerGrad = ctx.createLinearGradient(padding, dividerY, padding + contentWidth, dividerY);
  dividerGrad.addColorStop(0, t.dividerStart);
  dividerGrad.addColorStop(0.5, t.dividerEnd);
  dividerGrad.addColorStop(1, "rgba(255, 255, 255, 0.05)");
  ctx.strokeStyle = dividerGrad;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padding, dividerY);
  ctx.lineTo(padding + contentWidth, dividerY);
  ctx.stroke();

  // 10. Footer Section: Book Details + QR Code + Seal Stamp
  const footerContentY = dividerY + 30;

  // Book Title & Author Info
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px 'Be Vietnam Pro', sans-serif";
  ctx.fillText(bookTitle || "Trạm Chữ", padding, footerContentY);

  if (author) {
    ctx.fillStyle = t.textMuted;
    ctx.font = "22px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(`Tác giả: ${author}`, padding, footerContentY + 42);
  }

  ctx.fillStyle = t.brandColor;
  ctx.font = "600 20px 'Be Vietnam Pro', sans-serif";
  ctx.fillText("Đọc trọn bộ tại: tram-chu.online", padding, footerContentY + 76);

  // Traditional Seal Stamp
  drawSealStamp(ctx, width - padding - 180, footerContentY + 45, "TrạmChữ", t.sealColor);

  // QR Code Stamp in Corner
  try {
    const qrCanvas = document.createElement("canvas");
    await drawQRCodeToCanvas(qrCanvas, shareUrl, {
      width: 120,
      margin: 1,
      colorDark: t.qrDark,
      colorLight: t.qrLight
    });
    if (qrCanvas) {
      const qrX = width - padding - 120;
      const qrY = footerContentY - 5;
      
      // QR Border
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 3, qrY - 3, 126, 126);
      
      ctx.drawImage(qrCanvas, qrX, qrY, 120, 120);

      ctx.fillStyle = t.textMuted;
      ctx.font = "14px 'Be Vietnam Pro', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Quét đọc ngay", qrX + 60, qrY + 130);
    }
  } catch (err) {
    console.warn("QR stamp note:", err.message);
  }

  return canvas;
}

module.exports = {
  THEMES,
  wrapText,
  renderQuoteCard
};
