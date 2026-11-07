"use client";

import { Check, SpinnerGap, Warning } from "@phosphor-icons/react";
import type { StepEntry } from "@/lib/app-state";
import { cn } from "@/lib/utils";

const EVIDENCE_DOT: Record<string, string> = {
  red: "bg-scam",
  yellow: "bg-warn",
  green: "bg-safe",
  info: "bg-line-strong",
};

/**
 * The investigation timeline: one row per planned step, filling in as the agent
 * works, with the evidence it found underneath the step that found it.
 *
 * Step labels come from the agent already written in the reader's language, so
 * there are no tool names on screen.
 */
export function Timeline({
  steps,
  heading = "Checking your message",
}: {
  steps: StepEntry[];
  heading?: string;
}) {
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const running = steps.find((s) => s.status === "running");

  return (
    <section aria-labelledby="timeline-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="timeline-heading"
          className="text-xl font-bold tracking-tight"
          aria-live="polite"
          aria-atomic="true"
        >
          {heading}
        </h2>
        <p className="text-base font-bold tabular-nums text-ink-soft">
          {doneCount} of {steps.length}
        </p>
      </div>

      {/* A thin progress rule under the heading reads faster than counting rows. */}
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-surface-sunk"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="mt-1">
        {steps.map((step, index) => {
          const isRunning = step.status === "running";
          const failed = step.status === "done" && !step.ok;
          return (
            <li
              key={step.id}
              className={cn(
                "flex gap-3.5 border-l-2 py-3.5 pl-4",
                isRunning && "border-accent",
                failed && "border-warn",
                step.status === "done" && step.ok && "border-line",
              )}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {isRunning ? (
                  <SpinnerGap
                    size={20}
                    weight="bold"
                    className="animate-spin text-accent motion-reduce:animate-none"
                  />
                ) : (
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full",
                      failed ? "bg-warn-soft text-warn" : "bg-safe-soft text-safe",
                    )}
                  >
                    {failed ? (
                      <Warning size={13} weight="fill" />
                    ) : (
                      <Check size={13} weight="bold" />
                    )}
                  </span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-lg font-bold leading-snug",
                    isRunning ? "text-ink" : "text-ink-soft",
                  )}
                >
                  <span className="tabular-nums text-ink-faint">{index + 1}. </span>
                  {step.label}
                  {isRunning && <span className="sr-only"> in progress</span>}
                </p>

                {step.summary && (
                  <p className="mt-1.5 text-lg leading-relaxed text-ink-soft">
                    {step.summary}
                  </p>
                )}

                {step.evidence.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {step.evidence.map((line, index) => (
                      <li
                        key={index}
                        className="flex gap-2.5 text-lg leading-snug text-ink"
                      >
                        <span
                          className={cn(
                            "mt-[0.6rem] size-2 shrink-0 rounded-full",
                            EVIDENCE_DOT[line.severity] ?? "bg-line-strong",
                          )}
                          aria-hidden
                        />
                        <span>{line.finding}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {running && (
        <p className="sr-only" role="status">
          Still working: {running.label}
        </p>
      )}
    </section>
  );
}
