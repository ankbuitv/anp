import type { ApiResult } from "@anp/api-types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof ArrayBuffer) && !(init.body instanceof Blob) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const text = await res.text();
  let json: ApiResult<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResult<T>) : null;
  } catch {
    throw new ApiError("server_error", "Không thể đọc phản hồi máy chủ.", res.status);
  }
  if (!json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : { code: "server_error", message: "Đã xảy ra lỗi." };
    throw new ApiError(err.code, err.message, res.status);
  }
  return json.data;
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api/v1${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError("download", "Không thể tải file.", res.status);
  return res.blob();
}
