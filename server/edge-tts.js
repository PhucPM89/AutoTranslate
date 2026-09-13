"use strict";

// Minimal Cloudflare-Worker client for Microsoft Edge's public Read Aloud
// service. The endpoint is unofficial and can change without notice; keeping it
// behind our own route prevents implementation details from leaking into the UI.
const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VERSION = "1-143.0.3650.75";
const EDGE_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const VOICE = "vi-VN-HoaiMyNeural";
const MAX_TEXT_LENGTH = 3000;

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function makeSecurityToken(now = Date.now()) {
  const windowsEpochSeconds = 11644473600;
  let seconds = now / 1000 + windowsEpochSeconds;
  seconds -= seconds % 300;
  const ticks = Math.trunc(seconds * 10000000);
  const input = new TextEncoder().encode(`${ticks}${EDGE_TOKEN}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function speechConfigMessage() {
  return `X-Timestamp:${timestamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
}

function ssmlMessage(requestId, text) {
  const voiceName = "Microsoft Server Speech Text to Speech Voice (vi-VN, HoaiMyNeural)";
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voiceName}'><prosody pitch='+0Hz' rate='-4%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
}

function headerValue(raw, name) {
  const match = String(raw).match(new RegExp(`(?:^|\\r\\n)${name}:([^\\r\\n]+)`, "i"));
  return match ? match[1].trim() : "";
}

function parseAudioFrame(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 2) return null;
  const headerLength = (bytes[0] << 8) | bytes[1];
  if (bytes.length < headerLength + 2) return null;
  const headers = new TextDecoder().decode(bytes.slice(2, 2 + headerLength));
  if (headerValue(headers, "Path") !== "audio") return null;
  return bytes.slice(2 + headerLength);
}

export async function synthesizeEdgeSpeech(text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > MAX_TEXT_LENGTH) {
    const error = new Error(clean ? `Mỗi đoạn đọc tối đa ${MAX_TEXT_LENGTH} ký tự.` : "Nội dung đọc đang trống.");
    error.status = 400;
    throw error;
  }

  const connectionId = randomId();
  const securityToken = await makeSecurityToken();
  const url = new URL(EDGE_URL);
  url.searchParams.set("TrustedClientToken", EDGE_TOKEN);
  url.searchParams.set("Sec-MS-GEC", securityToken);
  url.searchParams.set("Sec-MS-GEC-Version", EDGE_VERSION);
  url.searchParams.set("ConnectionId", connectionId);

  const response = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": "Mozilla/5.0 Edg/143.0.0.0"
    }
  });
  const socket = response.webSocket;
  if (response.status !== 101 || !socket) throw new Error(`Edge-TTS không kết nối được (${response.status}).`);

  const requestId = randomId();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Edge-TTS quá thời gian phản hồi.")), 30000);

    function cleanup() {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
      try { socket.close(); } catch {}
    }
    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) return reject(error);
      if (!totalBytes) return reject(new Error("Edge-TTS không trả về âm thanh."));
      const output = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      resolve(output);
    }
    async function onMessage(event) {
      try {
        if (typeof event.data === "string") {
          if (headerValue(event.data, "Path") === "turn.end") finish();
          return;
        }
        const raw = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
        const audio = parseAudioFrame(raw);
        if (audio?.length) { chunks.push(audio); totalBytes += audio.length; }
      } catch (error) { finish(error); }
    }
    function onClose() { finish(totalBytes ? null : new Error("Kết nối Edge-TTS đóng trước khi có âm thanh.")); }
    function onError() { finish(new Error("Kết nối Edge-TTS gặp lỗi.")); }

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
    socket.accept();
    socket.send(speechConfigMessage());
    socket.send(ssmlMessage(requestId, clean));
  });
}

export function splitTextIntoSpeechChunks(text, maxChunkLen = 2200) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  if (clean.length <= maxChunkLen) return [clean];

  const paragraphs = clean.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > maxChunkLen) {
      chunks.push(current);
      current = "";
    }
    if (para.length > maxChunkLen) {
      const sentences = para.split(/(?<=[.!?…:;])\s+/);
      for (const sent of sentences) {
        if (current && (current.length + sent.length + 1) > maxChunkLen) {
          chunks.push(current);
          current = "";
        }
        if (sent.length > maxChunkLen) {
          for (let i = 0; i < sent.length; i += maxChunkLen) {
            chunks.push(sent.slice(i, i + maxChunkLen).trim());
          }
        } else {
          current = current ? `${current} ${sent}` : sent;
        }
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export async function synthesizeFullChapterSpeech(text, { maxRetries = 2, delayMs = 250 } = {}) {
  const chunks = splitTextIntoSpeechChunks(text);
  if (!chunks.length) throw new Error("Nội dung chương trống.");

  const audioParts = [];
  let totalLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let audio = null;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        audio = await synthesizeEdgeSpeech(chunk);
        if (audio && audio.length) break;
      } catch (err) {
        lastErr = err;
        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * attempt));
        }
      }
    }

    if (!audio || !audio.length) {
      throw new Error(`Lỗi tạo âm thanh cho phân đoạn ${i + 1}/${chunks.length}: ${lastErr?.message || "Không có âm thanh"}`);
    }

    audioParts.push(audio);
    totalLength += audio.length;

    if (i < chunks.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const concatenated = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of audioParts) {
    concatenated.set(part, offset);
    offset += part.length;
  }

  return concatenated;
}

export { MAX_TEXT_LENGTH, VOICE, escapeXml, makeSecurityToken };
