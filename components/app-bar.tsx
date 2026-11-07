"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellSimple, ShieldCheck, Siren } from "@phosphor-icons/react";
import { SettingsMenu } from "@/components/settings-menu";
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
    // The websityer bar: solid obsidian, a thin border, the green shield tile.
    <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950">
      <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center gap-1 px-3 sm:h-20 sm:gap-4 sm:px-6 xl:px-0">
        <Link
          href="/"
          aria-label="ScamShield, back to the checker"
          className="flex min-h-12 min-w-0 shrink-0 items-center gap-2 rounded-md sm:gap-3"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-500 sm:size-9">
            <ShieldCheck size={20} weight="fill" className="text-neutral-950" aria-hidden />
          </span>
          {/* Truncating the wordmark is the last resort, not the layout: at
              390px the two links and the wordmark fit side by side, and even in
              the largest text setting nothing pushes past the edge. */}
          <span className="truncate font-serif text-[1rem] tracking-wider sm:text-xl">
            Scam<span className="text-green-400">Shield</span>
          </span>
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
                  "flex min-h-12 items-center gap-1.5 rounded-lg px-2 font-mono text-sm font-semibold whitespace-nowrap transition-colors sm:gap-2 sm:px-3.5",
                  active
                    ? "bg-green-500/10 text-green-400 ring-1 ring-green-500/30"
                    : "text-neutral-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} className="hidden sm:block" aria-hidden />
                {/* One link, two wordings: the full label on wide screens, the
                    same control under a shorter name on a phone. */}
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </Link>
            );
          })}
          <SettingsMenu />
        </nav>
      </div>
    </header>
  );
}
