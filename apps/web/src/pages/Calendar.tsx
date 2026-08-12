import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CalendarDay } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Gallery } from "../components/media/Gallery";

export function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sel, setSel] = useState<string | null>(null);
  const tz = new Date().getTimezoneOffset();
  const q = useQuery({
    queryKey: ["calendar", year, month, tz],
    queryFn: () => api<{ days: CalendarDay[] }>(`/media/calendar?year=${year}&month=${month}&tz=${tz}`),
  });
  const map = useMemo(() => new Map((q.data?.days ?? []).map((d) => [d.date, d])), [q.data]);
  const first = new Date(year, month - 1, 1);
  const startWeek = (first.getDay() + 6) % 7;
  const daysIn = new Date(year, month, 0).getDate();
  const cells = [...Array(startWeek).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  function prev() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
    setSel(null);
  }
  function next() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
    setSel(null);
  }

  const from = sel ? `${sel}T00:00:00` : undefined;
  const to = sel ? `${sel}T23:59:59` : undefined;

  return (
    <>
      <PageHead
        title="Lịch"
        extra={
          <div className="flex items-center gap-2 text-sm">
            <button onClick={prev} className="rounded-lg px-2 py-1 hover:bg-line/10">
              ‹
            </button>
            <span className="min-w-[8rem] text-center">
              Tháng {month} / {year}
            </span>
            <button onClick={next} className="rounded-lg px-2 py-1 hover:bg-line/10">
              ›
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-7 gap-1 p-4 text-center text-xs text-mute">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const info = map.get(key);
          return (
            <button
              key={key}
              onClick={() => info && setSel(key)}
              className={`relative min-h-[72px] rounded-xl p-1 text-left ${info ? "bg-elev" : ""} ${sel === key ? "ring-1 ring-bronze" : ""}`}
            >
              <div className="text-[11px]">{d}</div>
              {info?.coverUrl ? <img src={info.coverUrl} alt="" className="mt-1 h-8 w-full rounded object-cover" /> : null}
              {info ? <div className="absolute bottom-1 right-1 text-[10px] text-bronze">{info.count}</div> : null}
            </button>
          );
        })}
      </div>
      {sel ? <Gallery queryKey={["cal", sel]} query={{ from, to }} emptyTitle="Không có media ngày này." /> : null}
    </>
  );
}
