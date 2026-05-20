import QRCode from "qrcode";

// Render a QR code into the given canvas element. White-on-transparent so
// it sits well on the dark lobby background. Errors are caught by the
// caller (typically: log + skip).
export async function renderQrCanvas(
  canvas: HTMLCanvasElement,
  url: string,
  sizePx: number,
): Promise<void> {
  await QRCode.toCanvas(canvas, url, {
    width: sizePx,
    margin: 1,
    color: { dark: "#ffffff", light: "#00000000" },
    errorCorrectionLevel: "M",
  });
}
