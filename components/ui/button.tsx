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
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2.5 rounded-xl text-center font-bold transition-[background-color,color,transform] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-neon",
        secondary: "border border-white/15 bg-white/5 text-ink hover:bg-white/10",
        quiet: "text-ink-soft hover:bg-white/5 hover:text-ink",
        danger: "field-scam hover:brightness-125",
      },
      size: {
        md: "min-h-12 px-6 text-base",
        lg: "min-h-16 px-8 text-lg",
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
