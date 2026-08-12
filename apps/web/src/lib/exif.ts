import exifr from "exifr";

export type ParsedExif = {
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  iso: number | null;
  aperture: string | null;
  shutterSpeed: string | null;
  focalLength: string | null;
  orientation: number | null;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  takenAt: number | null;
  photographer: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function shutter(v: unknown): string | null {
  const n = num(v);
  if (n == null) return str(v);
  if (n >= 1) return `${n.toFixed(n % 1 ? 1 : 0)}s`;
  return `1/${Math.round(1 / n)}`;
}

function aperture(v: unknown): string | null {
  const n = num(v);
  if (n == null) return str(v);
  return `f/${n}`;
}

function focal(v: unknown): string | null {
  const n = num(v);
  if (n == null) return str(v);
  return `${Math.round(n)}mm`;
}

export async function readExif(file: File): Promise<ParsedExif> {
  const empty: ParsedExif = {
    cameraMake: null,
    cameraModel: null,
    lens: null,
    iso: null,
    aperture: null,
    shutterSpeed: null,
    focalLength: null,
    orientation: null,
    lat: null,
    lng: null,
    locationName: null,
    takenAt: null,
    photographer: null,
    width: null,
    height: null,
    duration: null,
  };
  if (!file.type.startsWith("image/")) {
    const dim = await videoMeta(file);
    return { ...empty, ...dim };
  }
  try {
    const data = await exifr.parse(file, true);
    if (!data) return { ...empty, ...(await imageSize(file)) };
    const taken = data.DateTimeOriginal || data.CreateDate || data.ModifyDate || data.DateTime;
    let takenAt: number | null = null;
    if (taken instanceof Date && !Number.isNaN(taken.getTime())) takenAt = taken.getTime();
    const gps = data.latitude != null && data.longitude != null ? { lat: Number(data.latitude), lng: Number(data.longitude) } : { lat: null, lng: null };
    const size = await imageSize(file);
    return {
      cameraMake: str(data.Make),
      cameraModel: str(data.Model),
      lens: str(data.LensModel || data.LensMake),
      iso: num(data.ISO),
      aperture: aperture(data.FNumber ?? data.ApertureValue),
      shutterSpeed: shutter(data.ExposureTime ?? data.ShutterSpeedValue),
      focalLength: focal(data.FocalLength),
      orientation: num(data.Orientation),
      lat: gps.lat,
      lng: gps.lng,
      locationName: null,
      takenAt,
      photographer: str(data.Artist || data.Copyright),
      width: size.width ?? num(data.ExifImageWidth) ?? num(data.ImageWidth),
      height: size.height ?? num(data.ExifImageHeight) ?? num(data.ImageHeight),
      duration: null,
    };
  } catch {
    return { ...empty, ...(await imageSize(file)) };
  }
}

function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    img.src = url;
  });
}

function videoMeta(file: File): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve({
        width: v.videoWidth || null,
        height: v.videoHeight || null,
        duration: Number.isFinite(v.duration) ? v.duration : null,
      });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null, duration: null });
    };
    v.src = url;
  });
}
