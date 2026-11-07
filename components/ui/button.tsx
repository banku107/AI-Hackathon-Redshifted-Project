"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * The app's one button. shadcn/ui's shape (cva variants + `asChild`) with this
 * project's variants: `primary` is the single action on a screen and everything
 * else steps back from it.
 *
 * Every size clears the 48px touch minimum. `md` is 48px and `lg` is 64px
 * because `lg` is the "Check this for me" button, which a shaky hand has to hit
 * first time. Labels wrap and centre instead of forcing a row wider than a
 * 390px phone.
 */
const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2.5 rounded-[var(--radius-control)] text-center font-bold transition-colors select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent-hover",
        secondary:
          "border-2 border-line-strong bg-surface text-ink hover:border-ink-faint hover:bg-surface-sunk",
        quiet: "text-ink-soft hover:bg-surface-sunk hover:text-ink",
        danger: "border-2 border-scam/40 bg-scam-soft text-scam hover:border-scam",
      },
      size: {
        md: "min-h-12 px-5 text-base",
        lg: "min-h-16 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      // A bare <button> inside a form submits it. Nothing here is meant to
      // submit, so default to a plain button unless a caller says otherwise.
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
