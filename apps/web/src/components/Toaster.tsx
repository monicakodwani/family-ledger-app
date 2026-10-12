import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "../lib/cn";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = next.current++;
      setToasts([{ id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-atomic="false"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3.5 shadow-lg animate-sheet-in",
              t.kind === "error" ? "bg-con-ink text-white" : "bg-ink text-white",
            )}
          >
            {t.kind === "error" ? (
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            ) : (
              <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[#a8d5b5]" />
            )}
            <p className="flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss message"
              className="-my-2 -mr-2 flex size-10 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
