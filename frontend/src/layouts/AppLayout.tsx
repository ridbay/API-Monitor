import { NavLink, Outlet } from "react-router-dom";
import { Activity, FileBarChart, LayoutDashboard, ListChecks, Sparkles, UploadCloud } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true, icon: LayoutDashboard },
  { to: "/endpoints", label: "Endpoints", icon: ListChecks },
  { to: "/import", label: "Import", icon: UploadCloud },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
];

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_0_16px_-2px_rgba(99,102,241,0.6)]">
            <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[var(--color-text)]">API Monitor</h1>
            <p className="text-[11px] text-[var(--color-text-faint)]">Synthetic monitoring</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3 pt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-500/10 text-brand-300"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
                    )}
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto px-5 py-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-success-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              Monitoring active
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Checks run every minute</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
