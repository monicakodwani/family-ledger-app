import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

const control =
  "block w-full min-h-12 rounded-xl border border-line-strong bg-card px-4 py-3 text-ink placeholder:text-[#8a8178] " +
  "focus:border-accent focus:outline-none focus-visible:outline-3 focus-visible:outline-accent/40 aria-[invalid=true]:border-con-ink";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + hint + error, wired up for screen readers. */
export function Field({ label, hint, error, optional, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-[0.9375rem] text-muted leading-snug">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} role="alert" className="text-[0.9375rem] font-medium text-con-ink">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, "leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "appearance-none pr-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }
>(function Checkbox({ label, hint, className, ...props }, ref) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:bg-cream",
        className,
      )}
    >
      <input ref={ref} id={id} type="checkbox" className="mt-0.5 size-6 shrink-0 accent-accent" {...props} />
      <span>
        <span className="block font-medium leading-snug">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.9375rem] text-muted">{hint}</span>}
      </span>
    </label>
  );
});

/** Big radio cards, used for friendly single choices. */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  hint,
  value,
  onChange,
  options,
  columns = 1,
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  value: T | undefined;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; hint?: ReactNode; icon?: ReactNode }>;
  columns?: 1 | 2;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 font-semibold text-ink">{legend}</legend>
      {hint && <p className="-mt-1 mb-2 text-[0.9375rem] text-muted">{hint}</p>}
      <div className={cn("grid gap-2", columns === 2 && "grid-cols-2")}>
        {options.map((opt) => {
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-offset-2",
                checked ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-cream",
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="size-5 shrink-0 accent-accent"
              />
              {opt.icon && <span className="text-accent">{opt.icon}</span>}
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{opt.label}</span>
                {opt.hint && <span className="block text-[0.9375rem] text-muted leading-snug">{opt.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Compact segmented control for switching views. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("gap-1 rounded-2xl bg-cream-deep p-1", options.length > 3 ? "grid grid-cols-2 sm:flex" : "flex")}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 shrink-0 grow rounded-xl px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors",
            value === o.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
