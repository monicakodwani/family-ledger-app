import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "lg" | "md" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-sm",
  secondary: "bg-card text-ink border border-line-strong hover:bg-cream-deep",
  ghost: "bg-transparent text-accent hover:bg-accent-soft",
  danger: "bg-con-ink text-white hover:bg-[#74222d]",
  quiet: "bg-cream-deep text-ink hover:bg-line",
};

const sizes: Record<Size, string> = {
  lg: "min-h-14 px-6 text-[1.0625rem] rounded-2xl",
  md: "min-h-12 px-5 rounded-xl",
  sm: "min-h-12 px-4 text-[0.9375rem] rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, asChild, className, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-colors select-none",
        "disabled:opacity-50 disabled:pointer-events-none no-underline",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
});
