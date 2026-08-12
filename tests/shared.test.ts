import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatEta,
  formatShareCode,
  groupMoments,
  isAllowedMedia,
  isZipBomb,
  parseShareCode,
  safeZipEntryName,
  defaultMomentName,
} from "@anp/shared";

describe("formatBytes", () => {
  it("formats SI-ish binary units in vi", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1,0 KB");
    expect(formatBytes(1536)).toBe("1,5 KB");
  });
});

describe("formatEta", () => {
  it("speaks Vietnamese", () => {
    expect(formatEta(12)).toContain("giây");
    expect(formatEta(90)).toContain("phút");
  });
});

describe("media allow-list", () => {
  it("accepts common photos and videos", () => {
    expect(isAllowedMedia("image/jpeg", "a.jpg")).toBe(true);
    expect(isAllowedMedia("video/mp4", "clip.mp4")).toBe(true);
    expect(isAllowedMedia("application/pdf", "x.pdf")).toBe(false);
    expect(isAllowedMedia("image/jpeg", "x.exe")).toBe(false);
  });
});

describe("zip safety", () => {
  it("rejects traversal and windows drives", () => {
    expect(safeZipEntryName("../etc/passwd")).toBeNull();
    expect(safeZipEntryName("C:/Windows/x.jpg")).toBeNull();
    expect(safeZipEntryName("album/photo.jpg")).toBe("album/photo.jpg");
    expect(safeZipEntryName("folder/")).toBeNull();
  });
  it("detects zip bombs", () => {
    expect(isZipBomb({ entries: 10, compressed: 100, uncompressed: 200 }).ok).toBe(true);
    expect(isZipBomb({ entries: 9000, compressed: 1, uncompressed: 1 }).ok).toBe(false);
    expect(isZipBomb({ entries: 2, compressed: 10, uncompressed: 10_000 }).ok).toBe(false);
  });
});

describe("share codes", () => {
  it("normalizes display form", () => {
    expect(formatShareCode("ab12cd34")).toBe("AB12-CD34");
    expect(parseShareCode("ab12-cd34")).toBe("AB12CD34");
  });
});

describe("moments", () => {
  it("groups nearby photos and ignores singles", () => {
    const t0 = Date.parse("2026-07-12T10:00:00Z");
    const items = [
      { id: "a", takenAt: t0, uploadedAt: t0, lat: 11.94, lng: 108.44, locationName: "Đà Lạt" },
      { id: "b", takenAt: t0 + 20 * 60_000, uploadedAt: t0, lat: 11.941, lng: 108.441, locationName: "Đà Lạt" },
      { id: "c", takenAt: t0 + 3 * 86400_000, uploadedAt: t0, lat: 21.03, lng: 105.85, locationName: "Hà Nội" },
    ];
    const groups = groupMoments(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.mediaIds).toEqual(["a", "b"]);
    expect(defaultMomentName(groups[0]!)).toContain("Đà Lạt");
  });
});
