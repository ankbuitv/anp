import { NavLink, useNavigate } from "react-router-dom";
import { NAV } from "@anp/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../store/auth";
import { useUi } from "../../store/ui";
import { Icon } from "../common/Icons";
import { cn } from "../common/Ui";

const ICONS: Record<string, typeof Icon.Home> = {
  home: Icon.Home,
  library: Icon.Library,
  videos: Icon.Video,
  calendar: Icon.Calendar,
  map: Icon.Map,
  memories: Icon.Clock,
  albums: Icon.Album,
  favorites: Icon.Star,
  recent: Icon.Spark,
  private: Icon.Lock,
  shares: Icon.Link,
  drop: Icon.Drop,
  backup: Icon.Backup,
  cleanup: Icon.Broom,
  storage: Icon.Chart,
  trash: Icon.Trash,
  notifications: Icon.Bell,
  activity: Icon.Log,
  settings: Icon.Settings,
};

function Section({ title, items, collapsed }: { title: string; items: readonly { to: string; id: string; label: string }[]; collapsed: boolean }) {
  return (
    <div className="mb-4">
      {!collapsed ? (
        <div className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-mute/80">{title}</div>
      ) : (
        <div className="mx-auto mb-2 h-px w-6 bg-line/10" />
      )}
      <nav className="space-y-0.5">
        {items.map((it) => {
          const Ic = ICONS[it.id] || Icon.Library;
          return (
            <NavLink
              key={it.id}
              to={it.to}
              end={it.to === "/"}
              title={collapsed ? it.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-mute transition hover:bg-line/10 hover:text-paper",
                  isActive && "bg-bronze/15 text-paper",
                  collapsed && "justify-center px-0",
                )
              }
            >
              <Ic size={18} />
              {!collapsed ? <span>{it.label}</span> : null}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const user = useAuth((s) => s.user);
  const nav = useNavigate();

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    useAuth.setState({ user: null });
    nav("/login");
  }

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col border-r border-line/10 bg-elev/50 md:flex",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex items-center gap-2 px-3 py-4", collapsed && "justify-center")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bronze/20 font-display text-bronze">A</div>
        {!collapsed ? (
          <div>
            <div className="font-display text-lg leading-none">ANP</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-mute">ảnh · video</div>
          </div>
        ) : null}
        <button onClick={toggle} className={cn("ml-auto rounded-lg p-1.5 text-mute hover:text-paper", collapsed && "ml-0 hidden")} aria-label="Thu gọn">
          <Icon.Chevron size={16} className="rotate-180" />
        </button>
      </div>
      {collapsed ? (
        <button onClick={toggle} className="mx-auto mb-2 rounded-lg p-1.5 text-mute hover:text-paper" aria-label="Mở rộng">
          <Icon.Chevron size={16} />
        </button>
      ) : null}

      <div className="flex-1 overflow-y-auto px-2 pb-3 no-scrollbar">
        <Section title="Chính" items={NAV.main} collapsed={collapsed} />
        <Section title="Nội dung" items={NAV.content} collapsed={collapsed} />
        <Section title="Riêng tư" items={NAV.private} collapsed={collapsed} />
        <Section title="Thiết bị" items={NAV.devices} collapsed={collapsed} />
        <Section title="Quản lý" items={NAV.manage} collapsed={collapsed} />
        <Section title="Hệ thống" items={NAV.system} collapsed={collapsed} />
      </div>

      <div className={cn("border-t border-line/10 p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2 rounded-xl p-2", collapsed && "justify-center")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bronze/25 text-sm font-medium">
            {(user?.name || "A").slice(0, 1).toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{user?.name}</div>
              <div className="truncate text-[11px] text-mute">{user?.email}</div>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <div className="mt-1 flex gap-1">
            <button onClick={() => nav("/settings")} className="flex-1 rounded-lg px-2 py-1.5 text-xs text-mute hover:bg-line/10">
              Hồ sơ
            </button>
            <button onClick={logout} className="flex-1 rounded-lg px-2 py-1.5 text-xs text-mute hover:bg-line/10">
              Đăng xuất
            </button>
          </div>
        ) : (
          <button onClick={logout} className="mx-auto mt-1 flex rounded-lg p-2 text-mute hover:text-paper" title="Đăng xuất">
            <Icon.Logout size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
