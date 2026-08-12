import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
function I({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  Home: (p: P) => (
    <I {...p}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M7 10.5V20h10v-9.5" />
    </I>
  ),
  Library: (p: P) => (
    <I {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 16 5-4 4 3 3-2 6 4" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </I>
  ),
  Video: (p: P) => (
    <I {...p}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </I>
  ),
  Calendar: (p: P) => (
    <I {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </I>
  ),
  Map: (p: P) => (
    <I {...p}>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </I>
  ),
  Clock: (p: P) => (
    <I {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </I>
  ),
  Album: (p: P) => (
    <I {...p}>
      <path d="M4 7h16v12H4z" />
      <path d="M7 7V5h10v2" />
    </I>
  ),
  Star: (p: P) => (
    <I {...p}>
      <path d="m12 3.5 2.4 5 5.4.7-4 3.8.9 5.5L12 16.2 7.3 18.5l.9-5.5-4-3.8 5.4-.7z" />
    </I>
  ),
  StarFill: (p: P) => (
    <I {...p}>
      <path fill="currentColor" stroke="none" d="m12 3.5 2.4 5 5.4.7-4 3.8.9 5.5L12 16.2 7.3 18.5l.9-5.5-4-3.8 5.4-.7z" />
    </I>
  ),
  Spark: (p: P) => (
    <I {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </I>
  ),
  Lock: (p: P) => (
    <I {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </I>
  ),
  Link: (p: P) => (
    <I {...p}>
      <path d="M9 12a4 4 0 0 0 4 4h3a4 4 0 0 0 0-8h-1" />
      <path d="M15 12a4 4 0 0 0-4-4H8a4 4 0 0 0 0 8h1" />
    </I>
  ),
  Drop: (p: P) => (
    <I {...p}>
      <path d="M12 3c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z" />
    </I>
  ),
  Backup: (p: P) => (
    <I {...p}>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </I>
  ),
  Broom: (p: P) => (
    <I {...p}>
      <path d="m15 3 6 6M8 20 3 21l1-5 11-11 4 4z" />
    </I>
  ),
  Chart: (p: P) => (
    <I {...p}>
      <path d="M4 20h16M7 16v-5M12 16V8M17 16v-8" />
    </I>
  ),
  Trash: (p: P) => (
    <I {...p}>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" />
    </I>
  ),
  Bell: (p: P) => (
    <I {...p}>
      <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </I>
  ),
  Log: (p: P) => (
    <I {...p}>
      <path d="M7 4h10v16H7z" />
      <path d="M10 8h4M10 12h4M10 16h2" />
    </I>
  ),
  Settings: (p: P) => (
    <I {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </I>
  ),
  Search: (p: P) => (
    <I {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4-4" />
    </I>
  ),
  Upload: (p: P) => (
    <I {...p}>
      <path d="M12 16V5M8 8l4-4 4 4" />
      <path d="M5 19h14" />
    </I>
  ),
  Download: (p: P) => (
    <I {...p}>
      <path d="M12 5v11M8 12l4 4 4-4" />
      <path d="M5 19h14" />
    </I>
  ),
  Info: (p: P) => (
    <I {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8h.01" />
    </I>
  ),
  Close: (p: P) => (
    <I {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </I>
  ),
  Menu: (p: P) => (
    <I {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </I>
  ),
  Chevron: (p: P) => (
    <I {...p}>
      <path d="m9 6 6 6-6 6" />
    </I>
  ),
  Plus: (p: P) => (
    <I {...p}>
      <path d="M12 5v14M5 12h14" />
    </I>
  ),
  Check: (p: P) => (
    <I {...p}>
      <path d="m5 12 5 5 9-10" />
    </I>
  ),
  Play: (p: P) => (
    <I {...p}>
      <path d="m8 5 12 7-12 7z" />
    </I>
  ),
  Pause: (p: P) => (
    <I {...p}>
      <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
    </I>
  ),
  Fullscreen: (p: P) => (
    <I {...p}>
      <path d="M5 10V5h5M19 10V5h-5M5 14v5h5M19 14v5h-5" />
    </I>
  ),
  Logout: (p: P) => (
    <I {...p}>
      <path d="M10 7V5H5v14h5v-2" />
      <path d="M13 12H5M15 8l4 4-4 4" />
    </I>
  ),
  User: (p: P) => (
    <I {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19" />
    </I>
  ),
  Device: (p: P) => (
    <I {...p}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M10 18h4" />
    </I>
  ),
  More: (p: P) => (
    <I {...p}>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </I>
  ),
  Qr: (p: P) => (
    <I {...p}>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <path d="M14 14h3v3h-3zM19 14v6M14 19h2" />
    </I>
  ),
  Filter: (p: P) => (
    <I {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </I>
  ),
};
