import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-card p-5 shadow-card", className)} {...props} />;
}

/** A whole card that is one big link (summaries are always tappable). */
export function LinkCard({
  to,
  className,
  children,
  label,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        "group block rounded-2xl border border-line bg-card p-5 shadow-card no-underline text-ink",
        "transition-colors hover:border-line-strong active:bg-cream-deep",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mt-8 mb-3 flex items-end justify-between gap-3 px-1">
      <h2 id={id} className="text-xl font-bold text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A large tappable row with a chevron, like iOS Settings. */
export function RowLink({
  to,
  icon,
  title,
  subtitle,
  trailing,
  className,
}: {
  to: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-16 items-center gap-4 px-4 py-3 no-underline text-ink hover:bg-cream active:bg-cream-deep",
        className,
      )}
    >
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[0.9375rem] text-muted leading-snug">{subtitle}</span>}
      </span>
      {trailing}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

export function RowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-card shadow-card divide-y divide-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-card/60 px-6 py-8 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}
