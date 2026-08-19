const fs = require("fs");

let lameModule;

function pcmToMp3Base64(pcmBase64, sampleRate = 24000, kbps = 48) {
  const pcm = Buffer.from(pcmBase64, "base64");
  const samples = new Int16Array(Math.floor(pcm.length / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = pcm.readInt16LE(index * 2);
  }

  const { Mp3Encoder } = loadLameModule();
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts = [];
  const blockSize = 1152;

  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + blockSize));
    if (encoded.length) parts.push(Buffer.from(encoded));
  }

  const tail = encoder.flush();
  if (tail.length) parts.push(Buffer.from(tail));
  return Buffer.concat(parts).toString("base64");
}

function loadLameModule() {
  if (lameModule) return lameModule;

  // The package's bundled build is self-contained; its CommonJS entry omits internal globals.
  const source = fs.readFileSync(require.resolve("lamejs/lame.min.js"), "utf8");
  lameModule = Function(`${source}\nreturn lamejs;`)();
  return lameModule;
}

module.exports = { pcmToMp3Base64 };
