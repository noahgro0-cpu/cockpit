// D28: pictures for note pages. Shrunk on the device (photos from the iPhone/iPad library are
// several MB), kept in IndexedDB at once, uploaded through the outbox, loaded on demand.

const MAX_SIDE = 1600;
const MAX_BASE64 = 2_700_000;

async function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht umgewandelt werden."))), "image/jpeg", quality),
  );
}

/** Any browser-readable picture -> JPEG, longest side at most 1600 px (then 1200 px if needed). */
export async function shrinkImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Dieses Bildformat kann der Browser nicht lesen.");
  }
  for (const [side, quality] of [[MAX_SIDE, 0.82], [1200, 0.72], [900, 0.65]] as const) {
    const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * k);
    canvas.height = Math.round(bitmap.height * k);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent screenshots stay readable as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, quality);
    if (blob.size * 1.37 < MAX_BASE64) return blob;
  }
  throw new Error("Das Bild ist zu gross.");
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

export function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
