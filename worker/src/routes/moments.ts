import { Hono } from "hono";
import { momentRenameSchema } from "@anp/validation";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { rebuildMoments } from "../lib/moments";

export const momentRoutes = new Hono<AppContext>();
momentRoutes.use("*", requireAuth);

momentRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM moments WHERE user_id = ? ORDER BY start_at DESC`)
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      name: string;
      start_at: number | null;
      end_at: number | null;
      lat: number | null;
      lng: number | null;
      location_name: string | null;
      media_count: number;
      cover_media_id: string | null;
    }>();
  return ok(c, {
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      startAt: r.start_at,
      endAt: r.end_at,
      lat: r.lat,
      lng: r.lng,
      locationName: r.location_name,
      mediaCount: r.media_count,
      coverUrl: r.cover_media_id ? `/api/v1/media/${r.cover_media_id}/thumb` : null,
    })),
  });
});

momentRoutes.post("/rebuild", async (c) => {
  await rebuildMoments(c.env.DB, c.get("user")!.id);
  return ok(c, { rebuilt: true });
});

momentRoutes.patch("/:id", async (c) => {
  const body = momentRenameSchema.parse(await c.req.json());
  const row = await c.env.DB.prepare(`SELECT id FROM moments WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first();
  if (!row) throw Errors.notFound();
  await c.env.DB.prepare(`UPDATE moments SET name = ?, updated_at = ? WHERE id = ?`)
    .bind(body.name, Date.now(), c.req.param("id"))
    .run();
  return ok(c, { id: c.req.param("id"), name: body.name });
});
