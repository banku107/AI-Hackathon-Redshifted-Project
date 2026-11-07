import { cn } from "@/lib/utils";

/**
 * ScamShield's one signature detail: the evidence dot. Every finding the
 * agent reports carries the same small dot in the colour of what it means,
 * in the live checklist, the verdict reasons, the family alert and the home
 * example. Decorative only: the words next to it always carry the meaning.
 */
const COLOURS = {
  red: "bg-scam",
  yellow: "bg-warn",
  green: "bg-safe",
  info: "bg-line-strong",
  scam: "bg-scam",
  suspicious: "bg-warn",
  safe: "bg-safe",
} as const;

export type DotTone = keyof typeof COLOURS;

export function EvidenceDot({ tone, className }: { tone: DotTone | string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        // Sits on the first line of 18px text at 1.6 leading.
        "mt-[0.6rem] size-2.5 shrink-0 rounded-full",
        COLOURS[tone as DotTone] ?? COLOURS.info,
        className,
      )}
    />
  );
}
