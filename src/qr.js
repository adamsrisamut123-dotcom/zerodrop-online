'use strict';
// Bundled QRCode implementation: Kazuhiko Arase (MIT), packaged in
// qrcode-terminal (Apache-2.0). See third_party/NOTICE.md.
const QRCode = require('../third_party/qrcode');
const ErrorCorrection = require('../third_party/qrcode/QRErrorCorrectLevel');
function makeQrSvg(value) {
  if (typeof value !== 'string' || value.length > 450) throw new Error('QR link too long');
  const qr = new QRCode(-1, ErrorCorrection.M);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  const size = n + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280" role="img" aria-label="ZeroDrop room QR"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#142035" d="${d}"/></svg>`;
}
module.exports = { makeQrSvg };
