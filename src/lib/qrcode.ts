import QRCode from "qrcode";

export async function generateQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
    color: {
      dark: "#020617",
      light: "#ffffff",
    },
  });
}