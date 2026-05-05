import QRCode from "qrcode";

export async function generateQrDataUrl(payload: string) {
  const baseQrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 320,
    color: {
      dark: "#6f6f73",
      light: "#ffffff",
    },
  });

  if (typeof window === "undefined") {
    return baseQrDataUrl;
  }

  const qrImage = await loadImage(baseQrDataUrl);
  const qrWidth = qrImage.naturalWidth || qrImage.width;
  const qrHeight = qrImage.naturalHeight || qrImage.height;
  const canvas = window.document.createElement("canvas");
  canvas.width = qrWidth;
  canvas.height = qrHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return baseQrDataUrl;
  }

  context.drawImage(qrImage, 0, 0, qrWidth, qrHeight);

  const cutoutSize = Math.round(qrWidth * 0.19);
  const cutoutRadius = Math.round(cutoutSize * 0.16);
  const cutoutX = Math.round((qrWidth - cutoutSize) / 2);
  const cutoutY = Math.round((qrHeight - cutoutSize) / 2);
  clearRoundedRect(context, cutoutX, cutoutY, cutoutSize, cutoutSize, cutoutRadius);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load QR image."));
    image.src = src;
  });
}

function clearRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
  context.restore();
}
