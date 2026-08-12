import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { MapPoint } from "@anp/api-types";
import { api } from "../lib/api";
import { useUi } from "../store/ui";
import { PageHead } from "./Library";
import { Empty } from "../components/common/Ui";
import "leaflet/dist/leaflet.css";

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useMemo(() => {
    if (!points.length) return;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40], maxZoom: 12 },
    );
  }, [points, map]);
  return null;
}

export function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: () => api<{ items: MapPoint[] }>("/media/map") });
  const items = q.data?.items ?? [];
  const clusters = useMemo(() => cluster(items, 0.08), [items]);

  return (
    <div className="flex h-full flex-col">
      <PageHead title="Bản đồ" extra={<span className="text-xs text-mute">{items.length} vị trí</span>} />
      {!items.length && !q.isLoading ? (
        <Empty title="Chưa có ảnh gắn GPS." body="Ảnh có tọa độ sẽ hiện trên bản đồ. Ảnh không GPS được ẩn." />
      ) : (
        <div className="m-4 min-h-[60vh] flex-1 overflow-hidden rounded-2xl">
          <MapContainer center={[16.0, 106.0]} zoom={5} className="h-[70vh] w-full" scrollWheelZoom>
            <TileLayer attribution='&copy; OSM &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <Fit points={items} />
            {clusters.map((c) => (
              <CircleMarker
                key={c.id}
                center={[c.lat, c.lng]}
                radius={c.count > 1 ? Math.min(18, 8 + c.count / 4) : 7}
                pathOptions={{ color: "#d7a36a", fillColor: "#d7a36a", fillOpacity: 0.75 }}
              >
                <Popup>
                  <div className="min-w-[140px] text-sm">
                    <div>
                      {c.photos} ảnh · {c.videos} video
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {c.samples.map((p) => (
                        <button key={p.id} onClick={() => useUi.getState().openViewer([p.id], 0)}>
                          <img src={p.thumbUrl} className="h-12 w-12 rounded object-cover" alt="" />
                        </button>
                      ))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

function cluster(points: MapPoint[], cell: number) {
  const map = new Map<string, { id: string; lat: number; lng: number; count: number; photos: number; videos: number; samples: MapPoint[] }>();
  for (const p of points) {
    const k = `${Math.round(p.lat / cell)}_${Math.round(p.lng / cell)}`;
    const cur = map.get(k) ?? { id: k, lat: 0, lng: 0, count: 0, photos: 0, videos: 0, samples: [] };
    cur.lat = (cur.lat * cur.count + p.lat) / (cur.count + 1);
    cur.lng = (cur.lng * cur.count + p.lng) / (cur.count + 1);
    cur.count += 1;
    if (p.mediaType === "video") cur.videos += 1;
    else cur.photos += 1;
    if (cur.samples.length < 6) cur.samples.push(p);
    map.set(k, cur);
  }
  return [...map.values()];
}
