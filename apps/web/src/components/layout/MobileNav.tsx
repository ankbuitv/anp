import { NavLink } from "react-router-dom";
import { NAV } from "@anp/shared";
import { useUi } from "../../store/ui";
import { Icon } from "../common/Icons";
import { cn } from "../common/Ui";

const tabs = [
  { to: "/", label: "Home", icon: Icon.Home },
  { to: "/library", label: "Thư viện", icon: Icon.Library },
  { to: "/albums", label: "Album", icon: Icon.Album },
  { to: "/favorites", label: "Thích", icon: Icon.Star },
  { to: "/settings", label: "Thêm", icon: Icon.Menu },
];

export function MobileNav() {
  const open = useUi((s) => s.mobileNav);
  const all = [...NAV.main, ...NAV.content, ...NAV.private, ...NAV.devices, ...NAV.manage, ...NAV.system];
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/10 bg-elev/90 px-1 py-1 backdrop-blur md:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              cn("flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-mute", isActive && "text-bronze")
            }
          >
            <t.icon size={18} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/50" onClick={() => useUi.setState({ mobileNav: false })} />
          <div className="absolute inset-y-0 left-0 w-[80%] max-w-xs overflow-y-auto bg-elev p-4 shadow-lift">
            <div className="mb-4 font-display text-2xl">ANP</div>
            {all.map((it) => (
              <NavLink
                key={it.id}
                to={it.to}
                onClick={() => useUi.setState({ mobileNav: false })}
                className="block rounded-xl px-3 py-2.5 text-sm text-mute hover:bg-line/10 hover:text-paper"
              >
                {it.label}
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
