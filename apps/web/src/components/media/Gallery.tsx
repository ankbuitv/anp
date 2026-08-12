import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CursorPage, Media } from "@anp/api-types";
import { api } from "../../lib/api";
import { formatDayHeading } from "../../lib/format";
import { useUi } from "../../store/ui";
import { Empty } from "../common/Ui";
import { Icon } from "../common/Icons";
import { MediaTile } from "./MediaTile";

export type GalleryQuery = Record<string, string | undefined>;

function qs(q: GalleryQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return p.toString();
}

export function useMediaPages(query: GalleryQuery, key: unknown[]) {
  return useInfiniteQuery({
    queryKey: ["media", ...key, query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(qs(query));
      if (pageParam) p.set("cursor", pageParam);
      p.set("limit", "80");
      return api<CursorPage<Media>>(`/media?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function Gallery({
  query,
  queryKey,
  emptyTitle,
  emptyBody,
}: {
  query: GalleryQuery;
  queryKey: unknown[];
  emptyTitle: string;
  emptyBody?: string;
}) {
  const q = useMediaPages(query, queryKey);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const sentinel = useRef<HTMLDivElement>(null);
  const selected = useUi((s) => s.selected);
  const lastClicked = useUi((s) => s.lastClicked);

  useEffect(() => {
    const fn = () => {
      void q.refetch();
    };
    window.addEventListener("anp-uploaded", fn);
    return () => window.removeEventListener("anp-uploaded", fn);
  }, [q]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting) && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  const groups = useMemo(() => {
    const map = new Map<string, Media[]>();
    for (const m of items) {
      const t = m.takenAt || m.uploadedAt;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()].map(([k, list]) => ({
      key: k,
      label: formatDayHeading(list[0]!.takenAt || list[0]!.uploadedAt),
      items: list,
    }));
  }, [items]);

  function onClick(m: Media, e: React.MouseEvent) {
    const ids = items.map((x) => x.id);
    if (e.shiftKey && lastClicked) {
      const a = ids.indexOf(lastClicked);
      const b = ids.indexOf(m.id);
      if (a >= 0 && b >= 0) {
        const [s, t] = a < b ? [a, b] : [b, a];
        useUi.getState().toggleSelect(m.id, ids.slice(s, t + 1));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey || useUi.getState().selectMode) {
      useUi.getState().toggleSelect(m.id);
      return;
    }
    useUi.getState().openViewer(ids, ids.indexOf(m.id));
  }

  function onContext(m: Media, e: React.MouseEvent) {
    e.preventDefault();
    useUi.getState().setContext({ x: e.clientX, y: e.clientY, media: m });
  }

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 p-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-elev" />
        ))}
      </div>
    );
  }
  if (!items.length) return <Empty title={emptyTitle} body={emptyBody} />;

  return (
    <div className="px-2 pb-8 pt-2 md:px-4">
      {groups.map((g) => (
        <section key={g.key} className="mb-6">
          <h3 className="sticky top-0 z-10 mb-2 bg-ink/80 px-1 py-1.5 text-sm font-medium capitalize backdrop-blur">
            {g.label}
          </h3>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {g.items.map((m) => (
              <MediaTile
                key={m.id}
                media={m}
                selected={selected.has(m.id)}
                onClick={(e) => onClick(m, e)}
                onContext={(e) => onContext(m, e)}
              />
            ))}
          </div>
        </section>
      ))}
      <div ref={sentinel} className="h-10" />
      {q.isFetchingNextPage ? (
        <div className="flex justify-center py-4 text-xs text-mute">
          <Icon.Clock size={14} /> Đang tải thêm…
        </div>
      ) : null}
    </div>
  );
}
