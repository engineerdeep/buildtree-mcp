import QRCode from "qrcode";

/** PNG bytes of a QR code, for image content blocks and files. */
export function qrPngBuffer(text: string, opts: { width?: number } = {}): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    width: opts.width ?? 256,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

/** A small terminal rendering (half-block characters) for CLI output. */
export function qrTerminal(text: string): Promise<string> {
  return QRCode.toString(text, { type: "terminal", small: true, errorCorrectionLevel: "M" });
}
