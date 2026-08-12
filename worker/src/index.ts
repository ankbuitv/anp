import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppContext } from "./env";
import { ApiError } from "./lib/errors";
import { securityHeaders } from "./middleware/security";
import { loadSession } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { uploadRoutes } from "./routes/uploads";
import { mediaRoutes } from "./routes/media";
import { albumRoutes } from "./routes/albums";
import { shareRoutes } from "./routes/shares";
import { trashRoutes } from "./routes/trash";
import { storageRoutes } from "./routes/storage";
import { deviceRoutes } from "./routes/devices";
import { backupRoutes } from "./routes/backup";
import { dropRoutes } from "./routes/drop";
import { notificationRoutes } from "./routes/notifications";
import { activityRoutes } from "./routes/activity";
import { momentRoutes } from "./routes/moments";
import { homeRoutes } from "./routes/home";
import { jobRoutes } from "./routes/jobs";

const app = new Hono<AppContext>();

app.use("*", securityHeaders);
app.use("/api/*", loadSession);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    const msg = err.issues[0]?.message || "Dữ liệu không hợp lệ.";
    return c.json({ ok: false, error: { code: "bad_request", message: msg } }, 400);
  }
  if (err instanceof ApiError) {
    return c.json({ ok: false, error: { code: err.code, message: err.message } }, err.status as 400);
  }
  if (err instanceof SyntaxError) {
    return c.json({ ok: false, error: { code: "bad_request", message: "Dữ liệu JSON không hợp lệ." } }, 400);
  }
  console.error("unhandled", err);
  return c.json({ ok: false, error: { code: "server_error", message: "Đã xảy ra lỗi. Thử lại sau." } }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ ok: false, error: { code: "not_found", message: "Không tìm thấy." } }, 404);
  }
  return c.json({ ok: false, error: { code: "not_found", message: "Không tìm thấy." } }, 404);
});

const v1 = new Hono<AppContext>();
v1.get("/health", (c) =>
  c.json({
    ok: true,
    data: {
      name: "ANP",
      version: "v1",
      time: Date.now(),
      env: c.env.ENVIRONMENT || "unknown",
    },
  }),
);

v1.route("/auth", authRoutes);
v1.route("/uploads", uploadRoutes);
v1.route("/media", mediaRoutes);
v1.route("/albums", albumRoutes);
v1.route("/shares", shareRoutes);
v1.route("/trash", trashRoutes);
v1.route("/storage", storageRoutes);
v1.route("/devices", deviceRoutes);
v1.route("/backup", backupRoutes);
v1.route("/drop", dropRoutes);
v1.route("/notifications", notificationRoutes);
v1.route("/activity", activityRoutes);
v1.route("/moments", momentRoutes);
v1.route("/home", homeRoutes);
v1.route("/jobs", jobRoutes);

app.route("/api/v1", v1);

app.get("/api/v1/favorites", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/api/v1/media";
  url.searchParams.set("favorite", "1");
  return app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
});

export default {
  async fetch(request: Request, env: AppContext["Bindings"], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("ANP API. Frontend chưa được gắn (ASSETS).", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
