import { z } from "zod";
import { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD } from "@anp/shared";

export const emailSchema = z.string().trim().email("Email không hợp lệ.").max(254);
export const nameSchema = z.string().trim().min(1, "Nhập tên.").max(80, "Tên quá dài.");
export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự.")
  .max(128, "Mật khẩu quá dài.")
  .regex(/[A-Za-z]/, "Mật khẩu cần ít nhất một chữ.")
  .regex(/[0-9]/, "Mật khẩu cần ít nhất một số.");

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    deviceName: z.string().max(80).optional(),
    deviceType: z.enum(["web", "desktop", "ios", "android"]).optional(),
    platform: z.string().max(80).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Nhập mật khẩu."),
  deviceName: z.string().max(80).optional(),
  deviceType: z.enum(["web", "desktop", "ios", "android"]).optional(),
  platform: z.string().max(80).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  name: nameSchema,
});

export const pinSchema = z.string().regex(/^\d{6}$/, "PIN gồm 6 chữ số.");

export const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  slideshowSeconds: z.union([z.literal(3), z.literal(5), z.literal(10)]).optional(),
});

export const exifSchema = z.object({
  cameraMake: z.string().max(80).nullable().optional(),
  cameraModel: z.string().max(80).nullable().optional(),
  lens: z.string().max(120).nullable().optional(),
  iso: z.number().int().min(0).max(4_000_000).nullable().optional(),
  aperture: z.string().max(32).nullable().optional(),
  shutterSpeed: z.string().max(32).nullable().optional(),
  focalLength: z.string().max(32).nullable().optional(),
  orientation: z.number().int().min(1).max(8).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  locationName: z.string().max(160).nullable().optional(),
  takenAt: z.number().int().nullable().optional(),
  photographer: z.string().max(80).nullable().optional(),
  width: z.number().int().positive().max(100_000).nullable().optional(),
  height: z.number().int().positive().max(100_000).nullable().optional(),
  duration: z.number().min(0).max(86400 * 12).nullable().optional(),
});

export const uploadInitSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  mime: z.string().min(1).max(120),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i, "Checksum SHA-256 không hợp lệ."),
  isPrivate: z.boolean().optional(),
  deviceId: z.string().max(64).optional(),
  exif: exifSchema.optional(),
});

export const uploadBatchSchema = z.object({
  files: z.array(uploadInitSchema).min(1).max(MAX_FILES_PER_UPLOAD),
});

export const albumCreateSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên album.").max(120),
  description: z.string().max(2000).optional().nullable(),
  isPrivate: z.boolean().optional(),
});

export const albumUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  coverMediaId: z.string().min(1).optional().nullable(),
  isPrivate: z.boolean().optional(),
});

export const albumItemsSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(2000),
});

export const shareCreateSchema = z.object({
  type: z.enum(["album", "media", "selection"]),
  albumId: z.string().optional(),
  mediaIds: z.array(z.string().min(1)).max(5000).optional(),
  title: z.string().max(160).optional(),
  permission: z.enum(["view", "download"]).default("view"),
  accessCode: z.string().min(4).max(32).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});

export const shareUnlockSchema = z.object({
  code: z.string().min(1).max(32),
});

export const idsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(2000),
});

export const mediaPatchSchema = z.object({
  filename: z.string().min(1).max(255).optional(),
  photographer: z.string().max(80).nullable().optional(),
  locationName: z.string().max(160).nullable().optional(),
  isFavorite: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});

export const momentRenameSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(["image", "video", "all"]).optional(),
  favorite: z.enum(["0", "1"]).optional(),
  hasGps: z.enum(["0", "1"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const dropCreateSchema = z.object({
  type: z.enum(["send", "receive"]),
});

export const backupCreateSchema = z.object({
  deviceId: z.string().min(1).optional(),
  totalFiles: z.number().int().min(0).optional(),
  bytesTotal: z.number().int().min(0).optional(),
});

export const backupItemSchema = z.object({
  localPath: z.string().max(1024).optional(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  size: z.number().int().nonnegative(),
});

export const exportSchema = z.object({
  albumId: z.string().optional(),
  scope: z.enum(["album", "all"]).default("album"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UploadInitInput = z.infer<typeof uploadInitSchema>;
export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
