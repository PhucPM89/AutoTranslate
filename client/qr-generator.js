"use strict";

// Standard ISO/IEC 18004 QR Code Generator using QRCode library
// 100% compatible with iOS Camera, Android Camera, Zalo, and QR scanners.
const QRCode = require("qrcode");

function drawQRCodeToCanvas(canvas, text, options = {}) {
  if (!canvas || !text) return Promise.resolve(null);

  const {
    width = 240,
    margin = 2,
    colorDark = "#000000",
    colorLight = "#ffffff",
    errorCorrectionLevel = "M"
  } = options;

  return QRCode.toCanvas(canvas, text, {
    width,
    margin,
    color: {
      dark: colorDark,
      light: colorLight
    },
    errorCorrectionLevel
  }).catch((err) => {
    console.warn("Unable to generate QR code:", err);
  });
}

module.exports = {
  drawQRCodeToCanvas
};
