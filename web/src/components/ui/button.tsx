import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background,color,border-color,transform] outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-[var(--signal)] px-5 py-3 text-black hover:bg-[var(--signal-hot)]",
        light: "bg-[var(--paper)] px-5 py-3 text-[var(--ink)] hover:bg-white",
        outline:
          "border border-[var(--line-strong)] bg-[var(--panel)] px-5 py-3 text-[var(--paper)] hover:border-[var(--paper)]",
        ghost: "px-4 py-2 text-[var(--muted)] hover:bg-white/7 hover:text-[var(--paper)]",
        square: "size-10 border border-[var(--line)] bg-[var(--panel)] text-[var(--paper)] hover:border-[var(--paper)]",
      },
      size: {
        default: "h-11",
        sm: "h-9 px-4 text-xs",
        lg: "h-13 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
