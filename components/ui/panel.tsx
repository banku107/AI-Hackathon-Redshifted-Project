import { clsx } from "clsx";

/**
 * A page-level container. Deliberately not a "card": we group with borders and
 * space rather than stacking shadows, which reads calmer and holds up in
 * large-text mode.
 */
export function Panel({
  children,
  className,
  tone = "plain",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "sunk" | "accent";
}) {
  const tones = {
    plain: "bg-surface border-line",
    sunk: "bg-surface-sunk border-line",
    accent: "bg-accent-soft border-accent/25",
  } as const;

  return (
    <section
      className={clsx(
        "rounded-[var(--radius-card)] border p-5 sm:p-6",
        tones[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Small label above a block. Sentence case with normal letter spacing on
 * purpose: all-caps tracking-out at 14px is one of the first things to fail
 * for a low-vision reader, and it turns every heading into a shout.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold text-ink-soft">{children}</p>;
}

/**
 * Groups sections inside one border instead of stacking a card per section.
 * Use when two or three blocks belong to one thought.
 */
export function StackedSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}
