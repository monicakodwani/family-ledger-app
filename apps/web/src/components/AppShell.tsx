import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ChevronLeft, Ellipsis, FlaskConical, House, Landmark, Lightbulb, WifiOff, Wallet } from "lucide-react";
import { IS_DEMO } from "../env";
import { t } from "../i18n";
import { useOnline } from "../lib/useOnline";
import { cn } from "../lib/cn";

export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="safe-top bg-est-bg text-est-ink border-b border-est-line">
      <p className="mx-auto flex max-w-2xl items-start gap-2 px-4 py-2 text-[0.875rem] font-medium leading-snug">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t("demo.banner")}</span>
      </p>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-ink text-white">
      <p className="mx-auto flex max-w-2xl items-start gap-2 px-4 py-2.5 text-[0.9375rem] leading-snug">
        <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t("offline.banner")}</span>
      </p>
    </div>
  );
}

const TABS = [
  { to: "/", key: "nav.home", icon: House, end: true },
  { to: "/money", key: "nav.money", icon: Wallet, end: false },
  { to: "/accounts", key: "nav.accounts", icon: Landmark, end: false },
  { to: "/plans", key: "nav.plans", icon: Lightbulb, end: false },
  { to: "/more", key: "nav.more", icon: Ellipsis, end: false },
] as const;

const MORE_PATHS = [
  "/more",
  "/notes",
  "/checks",
  "/documents",
  "/activity",
  "/archived",
  "/security",
  "/settings",
  "/help",
];

function TabBar() {
  const location = useLocation();
  const inMore = MORE_PATHS.some((p) => location.pathname.startsWith(p));
  return (
    <nav
      aria-label={t("nav.main")}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card shadow-[0_-2px_12px_rgb(31_27_22/0.05)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map(({ to, key, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => {
                const active = to === "/more" ? inMore : isActive;
                return cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.8125rem] font-semibold no-underline",
                  active ? "text-accent" : "text-muted hover:text-ink",
                );
              }}
            >
              {({ isActive }) => {
                const active = to === "/more" ? inMore : isActive;
                return (
                  <>
                    <span
                      className={cn(
                        "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                        active && "bg-accent-soft",
                      )}
                    >
                      <Icon aria-hidden className="size-6" strokeWidth={active ? 2.25 : 1.9} />
                    </span>
                    <span>{t(key)}</span>
                  </>
                );
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Main layout: demo banner, offline notice, page content and the bottom tab bar. */
export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    // Move focus to the new page's heading for screen-reader users.
    const h1 = mainRef.current?.querySelector("h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-cream">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-card focus:px-4 focus:py-3"
      >
        Skip to content
      </a>
      <DemoBanner />
      <OfflineBanner />
      <main
        id="main"
        ref={mainRef}
        className="mx-auto max-w-2xl px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none"
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}

/** Page title with an optional back button and actions. */
export function PageHeader({
  title,
  back,
  subtitle,
  action,
}: {
  title: ReactNode;
  back?: string | true;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-5">
      {back && (
        <div className="-ml-2 mb-1">
          {back === true ? (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
              className="inline-flex min-h-12 items-center gap-1 rounded-xl px-2 font-semibold text-accent hover:bg-accent-soft"
            >
              <ChevronLeft aria-hidden className="size-6" />
              {t("action.back")}
            </button>
          ) : (
            <Link
              to={back}
              className="inline-flex min-h-12 items-center gap-1 rounded-xl px-2 font-semibold text-accent no-underline hover:bg-accent-soft"
            >
              <ChevronLeft aria-hidden className="size-6" />
              {t("action.back")}
            </Link>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.875rem] font-bold tracking-tight text-ink outline-none break-words">{title}</h1>
          {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
    </header>
  );
}
