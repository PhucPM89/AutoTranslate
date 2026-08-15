const { translateText } = require("../server/gemini");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server chưa có GEMINI_API_KEY." });
    }

    const body = typeof req.body === "object" && req.body !== null ? req.body : await readJsonBody(req);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ error: "Thiếu nội dung chương cần dịch." });
    }

    const result = await translateText(text, apiKey);
    if (!result.translation) {
      return res.status(502).json({ error: "Gemini không trả về bản dịch." });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể dịch chương lúc này." });
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
