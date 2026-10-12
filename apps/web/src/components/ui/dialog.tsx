import type { ReactNode } from "react";
import * as RD from "@radix-ui/react-dialog";
import * as AD from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/cn";

const overlay = "fixed inset-0 z-40 bg-[rgb(31_27_22/0.38)] animate-fade-in";
const panel =
  "fixed z-50 inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-cream p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-sheet animate-sheet-in " +
  "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-6";

/** A bottom sheet on phones, a centred dialog on larger screens. Focus is trapped by Radix. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  trigger?: ReactNode;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RD.Trigger asChild>{trigger}</RD.Trigger>}
      <RD.Portal>
        <RD.Overlay className={overlay} />
        <RD.Content className={panel} aria-describedby={description ? undefined : undefined}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-3">
            <RD.Title className="text-xl font-bold text-ink">{title}</RD.Title>
            <RD.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="-mr-2 -mt-1 flex size-12 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream-deep"
              >
                <X aria-hidden className="size-6" />
              </button>
            </RD.Close>
          </div>
          {description ? (
            <RD.Description className="-mt-2 mb-4 text-muted">{description}</RD.Description>
          ) : (
            <RD.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RD.Description>
          )}
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Understandable confirmation for anything destructive or important. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = "Not now",
  tone = "primary",
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={cn(panel)}>
          <AD.Title className="text-xl font-bold text-ink">{title}</AD.Title>
          <AD.Description asChild>
            <div className="mt-3 space-y-2 text-ink/90">{body}</div>
          </AD.Description>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              size="lg"
              block
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {busy ? "One moment…" : confirmLabel}
            </Button>
            <AD.Cancel asChild>
              <Button variant="secondary" size="lg" block>
                {cancelLabel}
              </Button>
            </AD.Cancel>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
