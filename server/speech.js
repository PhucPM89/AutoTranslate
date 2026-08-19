const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_TIMEOUT_MS = Number(process.env.GEMINI_TTS_TIMEOUT_MS || 60000);
const MAX_SPEECH_TEXT_LENGTH = 1200;
const ALLOWED_VOICES = new Set(["Kore", "Aoede", "Leda", "Puck", "Charon"]);
const ALLOWED_RATES = new Set(["0.8", "1", "1.2", "1.5"]);
const GENRE_DIRECTIONS = {
  fantasy: "Giong ke ky ao, giau hinh anh, nhan vao cam giac bi an va quy mo cua the gioi.",
  horror: "Giong tram, lanh va tiet che; tao khoang lang tu nhien, tang dan cang thang, khong doc khoa truong.",
  apocalypse: "Giong chac, khan truong va khac nghiet; giu nhip cang, nhan ro nguy hiem va cam giac sinh ton.",
  detective: "Giong binh tinh, ro net va kiem soat; nhip suy luan mach lac, nhan nhe vao manh moi va chi tiet bat thuong.",
  xianxia: "Giong trang trong, khoang dat va co tien khi; loi ke ung dung, canh chien dau manh nhung khong gap gap."
};
const VOICE_PROFILES = {
  Kore: "Chat giong truong thanh, vung, am sac trung tinh va cao do on dinh.",
  Aoede: "Chat giong truong thanh, am, thanh thoat va cao do on dinh.",
  Leda: "Chat giong sang, ro, tre trung vua phai va cao do on dinh.",
  Puck: "Chat giong linh hoat, giau nang luong nhung van la mot nguoi ke truong thanh.",
  Charon: "Chat giong tram, day, diem tinh va cao do on dinh."
};

async function generateSpeech(text, apiKey, options = {}) {
  const cleanText = String(text || "").trim();
  if (!cleanText) throw publicError("Thieu noi dung ban dich can doc.", 400);
  if (cleanText.length > MAX_SPEECH_TEXT_LENGTH) {
    throw publicError(`Moi doan doc khong duoc vuot qua ${MAX_SPEECH_TEXT_LENGTH} ky tu.`, 400);
  }

  const voice = ALLOWED_VOICES.has(options.voice) ? options.voice : "Kore";
  const rate = ALLOWED_RATES.has(String(options.rate)) ? String(options.rate) : "1";
  const genre = GENRE_DIRECTIONS[options.genre] ? options.genre : "fantasy";
  const segmentCount = clampInteger(options.segmentCount, 1, 999, 1);
  const segmentIndex = clampInteger(options.segmentIndex, 0, segmentCount - 1, 0);
  const prompt = buildSpeechPrompt(cleanText, rate, genre, voice, segmentIndex, segmentCount);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_TTS_MODEL
  )}:generateContent`;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TTS_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            temperature: 0.2,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice }
              }
            }
          }
        })
      });
      const data = await response.json();

      if (!response.ok) {
        const error = publicError(data?.error?.message || "Gemini TTS tra ve loi.", response.status);
        error.model = GEMINI_TTS_MODEL;
        if (response.status === 429 && isQuotaExhausted(error.message)) {
          error.code = "quota_exceeded";
        }
        lastError = error;
        if (!error.code && (response.status === 429 || response.status >= 500) && attempt === 0) {
          await wait(700);
          continue;
        }
        throw error;
      }

      const audioPart = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
      if (!audioPart?.inlineData?.data) {
        lastError = publicError("Gemini TTS khong tra ve du lieu am thanh.", 502);
        if (attempt === 0) continue;
        throw lastError;
      }

      return {
        audio: pcmToWavBase64(audioPart.inlineData.data),
        mimeType: "audio/wav",
        model: GEMINI_TTS_MODEL,
        voice,
        genre
      };
    } catch (error) {
      if (error.name === "AbortError") {
        lastError = publicError("Gemini TTS phan hoi qua cham.", 504);
      } else {
        lastError = error;
      }
      if (attempt === 0 && (!error.status || error.status >= 500)) {
        await wait(700);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || publicError("Khong the tao giong doc.", 502);
}

function buildSpeechPrompt(text, rate, genre = "fantasy", voice = "Kore", segmentIndex = 0, segmentCount = 1) {
  const pace = {
    "0.8": "cham rai, ro tung cau",
    "1": "tu nhien, ro rang",
    "1.2": "hoi nhanh nhung van ro rang",
    "1.5": "nhanh, lien mach nhung khong nuot chu"
  }[rate];

  return [
    "Doc thanh tieng bang tieng Viet tu nhien.",
    "Chi doc nguyen van ban tieng Viet trong muc NOI DUNG, khong dich, khong tom tat, khong them loi dan.",
    `Day la doan ${segmentIndex + 1}/${segmentCount} cua cung mot chuong truyen lien tuc.`,
    `Ho so nguoi ke co dinh: ${VOICE_PROFILES[voice] || VOICE_PROFILES.Kore}`,
    "Bat buoc chi dung mot nguoi ke cho toan bo doan. Giu nguyen am sac, cao do, do tuoi cam nhan va trong luong giong nhu cac doan truoc.",
    "Khong doi sang giong nhan vat khi gap loi thoai; khong dong vai nhieu nhan vat; chi thay doi nhe cach nhan cau.",
    `Nhip doc: ${pace}.`,
    `Phong cach truyen: ${GENRE_DIRECTIONS[genre] || GENRE_DIRECTIONS.fantasy}`,
    "Phat am ten rieng theo am Han-Viet nhu van ban da viet.",
    "",
    "NOI DUNG:",
    text
  ].join("\n");
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isQuotaExhausted(message) {
  const value = String(message || "").toLowerCase();
  return value.includes("exceeded your current quota") || value.includes("billing details");
}

function pcmToWavBase64(pcmBase64, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString("base64");
}

function publicError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  generateSpeech,
  buildSpeechPrompt,
  pcmToWavBase64,
  MAX_SPEECH_TEXT_LENGTH
};
