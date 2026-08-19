const { generateSpeech } = require("../server/speech");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server chua co GEMINI_API_KEY." });

    const body = typeof req.body === "object" && req.body !== null ? req.body : await readJsonBody(req);
    const result = await generateSpeech(body?.text, apiKey, {
      genre: body?.genre,
      voice: body?.voice,
      rate: body?.rate,
      segmentIndex: body?.segmentIndex,
      segmentCount: body?.segmentCount
    });
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({
      error:
        error.code === "quota_exceeded"
          ? "Da het han muc Gemini TTS. Hay thu lai sau hoac kiem tra billing cua API key."
          : `Khong the tao giong doc: ${error.message || "Khong ro loi."}`,
      code: error.code || "speech_error"
    });
  }
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
