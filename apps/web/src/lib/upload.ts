import { CHUNK_SIZE, MAX_FILES_PER_UPLOAD, isAllowedMedia } from "@anp/shared";
import type { Media } from "@anp/api-types";
import { api } from "./api";
import { sha256File } from "./sha256";
import { readExif } from "./exif";
import { makePreview, makeThumb } from "./thumb";

export type UploadItem = {
  localId: string;
  file: File;
  name: string;
  size: number;
  status: "queued" | "hashing" | "uploading" | "paused" | "done" | "error" | "duplicate" | "cancelled";
  progress: number;
  uploadedBytes: number;
  error?: string;
  uploadId?: string;
  media?: Media;
  startedAt?: number;
};

type Listener = () => void;

class UploadManager {
  items: UploadItem[] = [];
  paused = false;
  concurrency = 3;
  private active = 0;
  private abort = new Map<string, AbortController>();
  private listeners = new Set<Listener>();
  private speedWindow: { t: number; b: number }[] = [];

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  enqueue(files: File[], opts?: { isPrivate?: boolean }) {
    const accepted = files.filter((f) => isAllowedMedia(f.type || guessMime(f.name), f.name));
    const room = MAX_FILES_PER_UPLOAD - this.items.filter((i) => i.status !== "done" && i.status !== "cancelled").length;
    const slice = accepted.slice(0, Math.max(0, room));
    for (const file of slice) {
      this.items.push({
        localId: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        status: "queued",
        progress: 0,
        uploadedBytes: 0,
      });
    }
    this.emit();
    this.pump(opts);
    return { accepted: slice.length, skipped: files.length - slice.length };
  }

  pauseAll() {
    this.paused = true;
    for (const a of this.abort.values()) a.abort();
    for (const it of this.items) if (it.status === "uploading" || it.status === "hashing") it.status = "paused";
    this.emit();
  }
  resumeAll() {
    this.paused = false;
    for (const it of this.items) if (it.status === "paused") it.status = "queued";
    this.emit();
    this.pump();
  }
  cancel(id: string) {
    this.abort.get(id)?.abort();
    const it = this.items.find((i) => i.localId === id);
    if (it && it.status !== "done") {
      it.status = "cancelled";
      if (it.uploadId) void api(`/uploads/${it.uploadId}`, { method: "DELETE" }).catch(() => null);
    }
    this.emit();
  }
  retry(id: string) {
    const it = this.items.find((i) => i.localId === id);
    if (!it) return;
    it.status = "queued";
    it.error = undefined;
    it.progress = 0;
    this.emit();
    this.pump();
  }
  clearFinished() {
    this.items = this.items.filter((i) => i.status !== "done" && i.status !== "duplicate" && i.status !== "cancelled");
    this.emit();
  }

  stats() {
    const live = this.items.filter((i) => i.status !== "cancelled");
    const done = live.filter((i) => i.status === "done" || i.status === "duplicate").length;
    const fail = live.filter((i) => i.status === "error").length;
    const totalBytes = live.reduce((a, i) => a + i.size, 0);
    const uploaded = live.reduce((a, i) => a + (i.status === "done" || i.status === "duplicate" ? i.size : i.uploadedBytes), 0);
    const now = Date.now();
    this.speedWindow = this.speedWindow.filter((s) => now - s.t < 3000);
    const speed =
      this.speedWindow.length >= 2
        ? ((this.speedWindow[this.speedWindow.length - 1]!.b - this.speedWindow[0]!.b) /
            Math.max(1, this.speedWindow[this.speedWindow.length - 1]!.t - this.speedWindow[0]!.t)) *
          1000
        : 0;
    const remain = totalBytes - uploaded;
    const eta = speed > 0 ? remain / speed : 0;
    return { total: live.length, done, fail, totalBytes, uploaded, speed, eta, active: this.active };
  }

  private async pump(opts?: { isPrivate?: boolean }) {
    while (!this.paused && this.active < this.concurrency) {
      const next = this.items.find((i) => i.status === "queued");
      if (!next) break;
      next.status = "hashing";
      this.active += 1;
      this.emit();
      void this.run(next, opts).finally(() => {
        this.active -= 1;
        this.emit();
        this.pump(opts);
      });
    }
    if (this.items.length && this.items.every((i) => ["done", "error", "duplicate", "cancelled"].includes(i.status))) {
      const ok = this.items.filter((i) => i.status === "done" || i.status === "duplicate").length;
      const fail = this.items.filter((i) => i.status === "error").length;
      void api("/uploads/notify-batch", { method: "POST", body: JSON.stringify({ ok, fail }) }).catch(() => null);
    }
  }

  private async run(it: UploadItem, opts?: { isPrivate?: boolean }) {
    try {
      it.startedAt = Date.now();
      const checksum = await sha256File(it.file, (r) => {
        it.progress = r * 0.08;
        this.emit();
      });
      if (this.paused || it.status === "cancelled") return;
      it.status = "uploading";
      const exif = await readExif(it.file);
      const init = await api<
        | { duplicate: true; media: Media }
        | { duplicate: false; uploadId: string; mediaId: string; chunkSize: number; uploadedParts: number[] }
      >("/uploads", {
        method: "POST",
        body: JSON.stringify({
          filename: it.file.name,
          size: it.file.size,
          mime: it.file.type || guessMime(it.file.name),
          checksum,
          isPrivate: !!opts?.isPrivate,
          exif,
        }),
      });
      if (init.duplicate) {
        it.status = "duplicate";
        it.media = init.media;
        it.progress = 1;
        it.uploadedBytes = it.size;
        this.emit();
        return;
      }
      it.uploadId = init.uploadId;
      const uploaded = new Set(init.uploadedParts);
      const chunk = init.chunkSize || CHUNK_SIZE;
      const parts = Math.ceil(it.file.size / chunk) || 1;
      const ac = new AbortController();
      this.abort.set(it.localId, ac);
      for (let n = 1; n <= parts; n++) {
        if (ac.signal.aborted) {
          if (this.paused) it.status = "paused";
          return;
        }
        if (uploaded.has(n)) {
          it.uploadedBytes = Math.min(it.size, n * chunk);
          it.progress = 0.08 + 0.82 * (n / parts);
          continue;
        }
        const start = (n - 1) * chunk;
        const blob = it.file.slice(start, start + chunk);
        const buf = await blob.arrayBuffer();
        const res = await fetch(`/api/v1/uploads/${init.uploadId}/parts/${n}`, {
          method: "PUT",
          credentials: "include",
          body: buf,
          signal: ac.signal,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (!res.ok) throw new Error(await errorMessage(res));
        it.uploadedBytes = Math.min(it.size, start + buf.byteLength);
        it.progress = 0.08 + 0.82 * (n / parts);
        this.speedWindow.push({ t: Date.now(), b: this.stats().uploaded });
        this.emit();
      }
      const done = await api<{ media: Media }>(`/uploads/${init.uploadId}/complete`, { method: "POST" });
      it.media = done.media;
      const [thumb, preview] = await Promise.all([makeThumb(it.file), makePreview(it.file)]);
      // Thumbnail lỗi không làm hỏng file gốc đã lên, nhưng vẫn thử lại một lần.
      if (thumb) await putDerived(`/api/v1/uploads/${done.media.id}/thumb`, thumb);
      if (preview && it.file.type.startsWith("image/")) {
        await putDerived(`/api/v1/uploads/${done.media.id}/thumb?kind=preview`, preview);
      }
      it.status = "done";
      it.progress = 1;
      it.uploadedBytes = it.size;
      this.emit();
      window.dispatchEvent(new CustomEvent("anp-uploaded"));
    } catch (e) {
      if (it.status === "cancelled" || it.status === "paused") return;
      it.status = "error";
      it.error = e instanceof Error ? e.message : "Không thể tải file lên.";
      this.emit();
    } finally {
      this.abort.delete(it.localId);
    }
  }
}

/** Gửi thumbnail/preview; thử lại một lần và không làm hỏng file gốc đã tải lên. */
async function putDerived(url: string, body: Blob): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        credentials: "include",
        body,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (res.ok) return;
    } catch {
      // Thử lại lần cuối bên dưới.
    }
  }
}

/** Đọc thông báo lỗi thật từ Worker để hiện đúng nguyên nhân trong UploadDock. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const json = text ? (JSON.parse(text) as { error?: { message?: string } }) : null;
    if (json?.error?.message) return json.error.message;
  } catch {
    // Phản hồi không phải JSON — dùng thông báo mặc định bên dưới.
  }
  if (res.status === 413) return "File vượt giới hạn cho phép.";
  if (res.status === 401) return "Phiên đăng nhập đã hết hạn.";
  if (res.status === 429) return "Quá nhiều yêu cầu, thử lại sau.";
  return `Không thể tải file lên (HTTP ${res.status}).`;
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  return map[ext] || "";
}

export const uploads = new UploadManager();
