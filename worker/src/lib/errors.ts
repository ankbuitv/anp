export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  badRequest: (m = "Dữ liệu không hợp lệ.") => new ApiError(400, "bad_request", m),
  unauthorized: (m = "Bạn cần đăng nhập.") => new ApiError(401, "unauthorized", m),
  forbidden: (m = "Bạn không có quyền truy cập.") => new ApiError(403, "forbidden", m),
  notFound: (m = "Không tìm thấy.") => new ApiError(404, "not_found", m),
  conflict: (m = "Xung đột dữ liệu.") => new ApiError(409, "conflict", m),
  gone: (m = "Chia sẻ đã hết hạn.") => new ApiError(410, "gone", m),
  rateLimited: (m = "Quá nhiều yêu cầu. Thử lại sau.") => new ApiError(429, "rate_limited", m),
  unsupported: (m = "Định dạng không được hỗ trợ.") => new ApiError(415, "unsupported", m),
  payload: (m = "File quá lớn.") => new ApiError(413, "payload_too_large", m),
  server: (m = "Đã xảy ra lỗi. Thử lại sau.") => new ApiError(500, "server_error", m),
};
