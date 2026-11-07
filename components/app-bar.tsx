"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellSimple, ShieldCheck, Siren } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/family",
    label: "Family",
    short: "Family",
    icon: BellSimple,
  },
  {
    href: "/damage-control",
    label: "I already paid",
    short: "Help",
    icon: Siren,
  },
];

export function AppBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          aria-label="ScamShield, back to the checker"
          className="flex min-h-12 min-w-0 items-center gap-1.5 rounded-md font-bold tracking-tight sm:gap-2"
        >
          <ShieldCheck
            size={24}
            weight="fill"
            className="shrink-0 text-accent"
            aria-hidden
          />
          {/* Truncating the wordmark is the last resort, not the layout: at
              390px the two links and the wordmark fit side by side, and even in
              the largest text setting nothing pushes past the edge. */}
          <span className="truncate text-[0.95rem] sm:text-lg">ScamShield</span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex shrink-0 items-center gap-1">
          {links.map(({ href, label, short, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-1.5 rounded-full px-2.5 text-base font-bold whitespace-nowrap transition-colors sm:gap-2 sm:px-4",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-soft hover:bg-surface-sunk hover:text-ink",
                )}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden />
                {/* One link, two wordings: the full label on wide screens, the
                    same control under a shorter name on a phone. */}
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
