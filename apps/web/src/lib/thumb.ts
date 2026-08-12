import { PREVIEW_MAX_EDGE, THUMB_MAX_EDGE } from "@anp/shared";

export async function makeStill(file: File, edge: number, quality = 0.72): Promise<Blob | null> {
  try {
    if (file.type.startsWith("video/")) return videoFrame(file, edge, quality);
    const bmp = await loadImage(file);
    if (!bmp) return null;
    const { w, h } = fit(bmp.width, bmp.height, edge);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  } catch {
    return null;
  }
}

export async function makeThumb(file: File): Promise<Blob | null> {
  return makeStill(file, THUMB_MAX_EDGE, 0.7);
}
export async function makePreview(file: File): Promise<Blob | null> {
  if (file.type.startsWith("video/")) return makeStill(file, THUMB_MAX_EDGE, 0.72);
  return makeStill(file, PREVIEW_MAX_EDGE, 0.78);
}

function fit(w: number, h: number, edge: number) {
  if (w <= edge && h <= edge) return { w, h };
  const r = Math.min(edge / w, edge / h);
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if ("createImageBitmap" in window) {
      return await createImageBitmap(file);
    }
  } catch {}
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function videoFrame(file: File, edge: number, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const fail = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.onerror = fail;
    v.onloadeddata = async () => {
      try {
        v.currentTime = Math.min(0.4, (v.duration || 1) / 10);
      } catch {
        fail();
      }
    };
    v.onseeked = () => {
      try {
        const { w, h } = fit(v.videoWidth || 16, v.videoHeight || 9, edge);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(v, 0, 0, w, h);
        canvas.toBlob(
          (b) => {
            URL.revokeObjectURL(url);
            resolve(b);
          },
          "image/jpeg",
          quality,
        );
      } catch {
        fail();
      }
    };
    v.src = url;
  });
}
