import type { UserProfile } from "../types";

export type AppView = "discover" | "studio" | "library" | "auth";

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  user: UserProfile | null;
  onLogout: () => void;
}

export function TopBar({ activeView, onNavigate, user, onLogout }: TopBarProps) {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "discover", label: "Discover" },
    { id: "studio", label: "Study Studio" },
    { id: "library", label: "Saved Library" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
        <button
          type="button"
          onClick={() => onNavigate("discover")}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md px-1 dark:text-slate-100"
        >
          AI StudyMate
        </button>

        <nav
          aria-label="Primary"
          className="flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700 dark:bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate("auth")}
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
