"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  Copy,
  DownloadSimple,
  Siren,
} from "@phosphor-icons/react";
import { AppBar } from "@/components/app-bar";
import { ReadAloud } from "@/components/read-aloud";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useAppState } from "@/lib/app-state";
import type { DamageControlPlan } from "@/lib/contract";
import { localeFor } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Used when the check never produced a plan: the reader can still reach this
 * screen from the header, and a blank page would be the worst answer.
 */
const FALLBACK_PLAN: DamageControlPlan = {
  steps: [
    {
      title: "Call your bank or card company right now",
      detail:
        "Turn your card over and call the number printed on the back. Tell them you were scammed and ask them to stop the payment or freeze the card.",
      urgent: true,
    },
    {
      title: "Do not send anything more",
      detail:
        "The scammer may call again and ask for more money, or claim there is a new problem. Do not reply to them.",
      urgent: true,
    },
    {
      title: "Keep the message and any receipts",
      detail:
        "Do not delete anything. A picture of the message and the store receipt are what the bank and the police need.",
      urgent: false,
    },
    {
      title: "Report it",
      detail:
        "Report it to the FTC at ReportFraud.ftc.gov and to the FBI at ic3.gov. Both are free and take a few minutes.",
      urgent: false,
    },
    {
      title: "Tell someone you trust",
      detail:
        "You do not have to handle this alone, and being tricked is not your fault.",
      urgent: false,
    },
  ],
  report: [],
};

const AGENCY_NAMES: Record<string, string> = {
  FTC: "Federal Trade Commission",
  IC3: "FBI Internet Crime Complaint Center",
  local_police: "Your local police",
  bank: "Your bank",
  gift_card_company: "The gift card company",
};

/**
 * Where to report when the plan came back without agency links. The fallback
 * plan already names both in its text, so the buttons should exist too.
 */
const DEFAULT_REPORT_LINKS: DamageControlPlan["report"] = [
  { agency: "FTC", url: "https://reportfraud.ftc.gov/", prefilledText: "" },
  { agency: "IC3", url: "https://www.ic3.gov/", prefilledText: "" },
];

function buildReport(plan: DamageControlPlan, sourceText: string, today: string): string {
  if (plan.report.length > 0) {
    return plan.report
      .map(({ agency, url, prefilledText }) =>
        [AGENCY_NAMES[agency] ?? agency, url, "", prefilledText].join("\n"),
      )
      .join("\n\n---\n\n");
  }

  const quoted = sourceText.trim()
    ? sourceText
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    : "> (No message was saved.)";

  return [
    "Scam report",
    ...(today ? [`Date: ${today}`] : []),
    "",
    "Message I received:",
    quoted,
    "",
    "What happened:",
    "I was contacted by someone who appears to be a scammer.",
    "",
    "Where I am reporting this:",
    "- My bank and card company",
    "- ReportFraud.ftc.gov (US Federal Trade Commission)",
    "- ic3.gov (FBI Internet Crime Complaint Center)",
  ].join("\n");
}

function Checklist({ steps }: { steps: DamageControlPlan["steps"] }) {
  const [done, setDone] = useState<Set<number>>(() => new Set());

  function toggle(index: number) {
    setDone((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const count = done.size;
  const total = steps.length;
  const allDone = total > 0 && count === total;
  const percent = total === 0 ? 0 : Math.round((count / total) * 100);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Your steps</h2>
        <p className="text-lg font-bold tabular-nums text-ink-soft" aria-live="polite">
          {count} of {total} done
        </p>
      </div>

      {/* Repeats the count above, so the bar adds a glance, not information. */}
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-sunk"
        aria-hidden
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            allDone ? "bg-safe" : "bg-accent",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-5 space-y-2">
        {steps.map((step, index) => {
          const checked = done.has(index);
          return (
            <li
              key={index}
              className={cn(
                "relative overflow-hidden rounded-[var(--radius-control)] bg-paper",
                step.urgent && !checked && "bg-scam-soft",
              )}
            >
              {step.urgent && !checked && (
                <span
                  className="absolute inset-y-0 left-0 w-1.5 bg-scam"
                  aria-hidden
                />
              )}
              <label
                className={cn(
                  "flex min-h-16 cursor-pointer items-start gap-3.5 py-4 pl-4 pr-3 transition-colors sm:gap-4 sm:pl-5",
                  step.urgent && !checked && "pl-6 sm:pl-7",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(index)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border-2 bg-surface transition-colors",
                    "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent",
                    checked
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong text-accent-ink",
                  )}
                >
                  {checked ? <Check size={24} weight="bold" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className={cn(
                        "text-lg font-bold leading-snug",
                        checked ? "text-ink-soft line-through decoration-1" : "text-ink",
                      )}
                    >
                      {step.title}
                    </span>

                    {/* Icon and word together: the tag survives a greyscale
                        screen and a colour-blind reader. */}
                    {step.urgent && !checked && (
                      <span className="field-scam inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-mono text-xs font-semibold">
                        <Siren size={15} weight="fill" aria-hidden />
                        Do this first
                      </span>
                    )}
                    {checked && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-safe-soft px-2.5 py-0.5 text-sm font-bold text-safe">
                        <CheckCircle size={15} weight="fill" aria-hidden />
                        Done
                      </span>
                    )}
                  </span>

                  <span
                    className={cn(
                      "mt-1 block text-lg leading-relaxed",
                      checked ? "text-ink-faint" : "text-ink-soft",
                    )}
                  >
                    {step.detail}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <p
          className="mt-5 flex items-start gap-3 rounded-[var(--radius-control)] bg-safe-soft px-4 py-3.5 text-lg font-bold leading-snug text-safe"
          role="status"
        >
          <CheckCircle size={24} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          You have done every step on this list. Keep the report below in case your
          bank or the police ask for it.
        </p>
      )}
    </>
  );
}

export default function DamageControlPage() {
  const { run, language } = useAppState();
  const plan = run.damagePlan ?? FALLBACK_PLAN;

  const [today, setToday] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyTimer = useRef<number | null>(null);
  const reportRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // The date is only known after mount; rendering it on the server would
    // produce a different string and trigger a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(
      new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const reportText = useMemo(
    () => buildReport(plan, run.sourceText, today),
    [plan, run.sourceText, today],
  );

  const readAloudText = useMemo(
    () =>
      `What to do after a scam. ${plan.steps
        .map((step, index) => `Step ${index + 1}. ${step.title}. ${step.detail}`)
        .join(" ")}`,
    [plan.steps],
  );

  const reportLinks = plan.report.length > 0 ? plan.report : DEFAULT_REPORT_LINKS;

  function currentReport(): string {
    // The reader may have typed a reference number or a name into the box, so
    // copy and download use what is on screen, not what we first wrote there.
    return reportRef.current?.value ?? reportText;
  }

  function showCopied(state: "copied" | "error") {
    setCopyState(state);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2500);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(currentReport());
      showCopied("copied");
    } catch {
      showCopied("error");
    }
  }

  function downloadReport() {
    const blob = new Blob([currentReport()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scamshield-report.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const stepsKey = plan.steps.map((s) => s.title).join("\n");

  return (
    <div className="min-h-[100dvh]">
      <AppBar />

      <main className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-14">
        <header>
          <h1 className="font-serif text-[1.9rem] leading-[1] text-balance sm:text-[3.25rem]">
            You can still do something about it
          </h1>
          <p className="mt-3 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
            This happens to careful people too. Start with your bank, then work
            down this list at your own pace. Being tricked is not your fault.
          </p>
        </header>

        <div className="mt-8 space-y-6">
          {/* The checklist is the page. It gets the strongest border and the
              read-aloud control, so the two live together. */}
          <Panel>
            <Checklist key={stepsKey} steps={plan.steps} />
            <div className="mt-8">
              <ReadAloud
                text={readAloudText}
                locale={localeFor(language)}
                label="Read these steps out loud"
              />
            </div>
          </Panel>

          <section aria-labelledby="report-links-heading">
            <h2 id="report-links-heading" className="text-2xl font-bold tracking-tight">
              Where to report it
            </h2>
            <p className="mt-1.5 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
              Each link opens a new tab. Both are free. Your bank first is the
              fastest way to stop money from leaving.
            </p>
            <ul className="mt-4 space-y-2.5">
              {reportLinks.map(({ agency, url }) => (
                <li key={agency}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-control)] bg-surface px-5 py-3 text-lg font-bold text-accent transition-colors hover:bg-accent-soft"
                  >
                    <span className="min-w-0 break-words">
                      {AGENCY_NAMES[agency] ?? agency}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-base">
                      <span className="hidden text-ink-soft sm:inline">
                        Opens a new tab
                      </span>
                      <ArrowSquareOut size={20} weight="bold" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
              <li className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] bg-surface px-5 py-3">
                <span className="min-w-0 text-lg font-bold text-ink-soft">
                  Your bank and card company — call the number on the back of the
                  card.
                </span>
              </li>
            </ul>
          </section>

          <Panel tone="sunk">
            <h2 className="text-2xl font-bold tracking-tight">Your report</h2>
            <p className="mt-1.5 text-lg leading-relaxed text-ink">
              Read this to your bank on the phone, or paste it into a report form.
              You can add a name or a reference number before you copy it.
            </p>

            <label htmlFor="report-text" className="sr-only">
              Report text
            </label>
            {/* `key` re-seeds the box when the report text itself changes; once
                the page has settled it never changes again, so anything the
                reader types survives. */}
            <textarea
              id="report-text"
              key={reportText}
              ref={reportRef}
              defaultValue={reportText}
              spellCheck={false}
              className="mt-4 block min-h-64 w-full resize-y rounded-[var(--radius-control)] border-2 border-transparent bg-paper px-4 py-3.5 font-sans text-lg leading-relaxed text-ink"
            />

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Button onClick={() => void copyReport()} className="w-full sm:w-auto">
                <Copy size={22} weight="bold" aria-hidden />
                Copy report
              </Button>
              <Button
                variant="secondary"
                onClick={downloadReport}
                className="w-full sm:w-auto"
              >
                <DownloadSimple size={22} weight="bold" aria-hidden />
                Download as a file
              </Button>
              <ReadAloud
                text={reportText}
                locale={localeFor(language)}
                label="Read the report out loud"
              />
            </div>

            <p role="status" aria-live="polite" className="mt-3 min-h-7 text-lg font-bold text-safe">
              {copyState === "copied" ? (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle size={20} weight="fill" aria-hidden />
                  Copied. Now paste it where you need it.
                </span>
              ) : null}
            </p>
            {copyState === "error" && (
              <p className="text-lg font-bold leading-snug text-scam" role="alert">
                Could not copy. Tap the text above, choose Select all, then Copy.
              </p>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}
