"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  Phone,
  ShieldCheck,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/ui/button";
import { Panel, StackedSection } from "@/components/ui/panel";
import { useAppState } from "@/lib/app-state";
import type { VerdictLevel } from "@/lib/contract";
import {
  clearLastAlert,
  readLastAlert,
  subscribeFamilyAlerts,
  type FamilyAlertPayload,
} from "@/lib/family-sync";
import { cn } from "@/lib/utils";

const TONES = {
  scam: {
    word: "Scam alert",
    icon: WarningOctagon,
    stripe: "bg-scam",
    chip: "border-scam/45 bg-scam-soft text-scam",
    heading: "Why it looks wrong",
  },
  suspicious: {
    word: "Be careful",
    icon: Warning,
    stripe: "bg-warn",
    chip: "border-warn/45 bg-warn-soft text-warn",
    heading: "Why it looks wrong",
  },
  safe: {
    word: "Checked and looks safe",
    icon: ShieldCheck,
    stripe: "bg-safe",
    chip: "border-safe/45 bg-safe-soft text-safe",
    heading: "What the check found",
  },
} as const;

function relativeTime(sentAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return "over a week ago";
}

function levelHeading(level: VerdictLevel, name: string): string {
  if (level === "safe") return `${name} checked something that looks safe`;
  return `${name} may have been targeted`;
}

export default function FamilyPage() {
  const { run } = useAppState();
  const [liveAlert, setLiveAlert] = useState<FamilyAlertPayload | null>(null);
  const [ignoredRunKey, setIgnoredRunKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Both start at 0 so prerendering never reads the clock. The mount effect
  // below fills them in, and nothing time-relative renders before then.
  const [mountedAt, setMountedAt] = useState(0);
  const [now, setNow] = useState(0);

  // Single-tab fallback: derive an alert from the run already in memory, so a
  // rehearsal without two devices still fills this screen.
  const runAlertKey = run.verdict
    ? `${run.verdict.level}|${run.familyAlert?.createdAt ?? ""}|${run.sourceText}`
    : null;

  const runAlert = useMemo<FamilyAlertPayload | null>(() => {
    const verdict = run.verdict;
    if (!verdict) return null;
    return {
      alert:
        run.familyAlert ?? {
          contactName: "Someone you protect",
          summary: verdict.headline,
          riskLevel: verdict.level,
          moneyInvolved: false,
          suggestedAction: "Call them and check.",
          createdAt: "",
        },
      sentAt: mountedAt,
      reasons: verdict.reasons,
      nextSteps: verdict.nextSteps,
      sourceText: run.sourceText,
    };
  }, [run.verdict, run.familyAlert, run.sourceText, mountedAt]);

  useEffect(() => {
    // Reading sessionStorage once after mount is the only way to hydrate the
    // last alert without the server and client renders disagreeing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveAlert(readLastAlert());
    const startedAt = Date.now();
    setMountedAt(startedAt);
    setNow(startedAt);

    const unsubscribe = subscribeFamilyAlerts((payload) => {
      setLiveAlert(payload);
    });

    setHydrated(true);
    return unsubscribe;
  }, []);

  // Refresh the "2 minutes ago" wording without pulling in a date library.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const alert =
    liveAlert ?? (runAlertKey && runAlertKey !== ignoredRunKey ? runAlert : null);

  function dismissAlert() {
    clearLastAlert();
    setLiveAlert(null);
    if (runAlertKey) setIgnoredRunKey(runAlertKey);
  }

  return (
    <div className="min-h-[100dvh]">
      <AppBar />

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <h1 className="text-[2rem] font-bold leading-[1.12] tracking-tight text-balance sm:text-[2.5rem]">
            What your family found
          </h1>
          <p className="mt-3 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
            When someone you protect checks a message, the result shows up here.
            Keep this page open and it updates on its own.
          </p>
        </header>

        <div className="mt-8">
          {!hydrated ? (
            <div
              className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
              aria-busy="true"
              aria-label="Loading alerts"
            >
              <div className="h-4 w-28 rounded bg-surface-sunk" />
              <div className="mt-5 h-7 w-3/4 rounded bg-surface-sunk" />
              <div className="mt-3 h-4 w-full rounded bg-surface-sunk" />
              <div className="mt-2 h-4 w-5/6 rounded bg-surface-sunk" />
            </div>
          ) : alert ? (
            <div className="space-y-5">
              {/* One sheet: who, what, when, and the single next action. The
                  colour stripe repeats a meaning that is also spelled out in
                  the chip, so nothing here depends on colour alone. */}
              <section
                aria-labelledby="alert-heading"
                className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
              >
                <div
                  className={cn("h-1.5", TONES[alert.alert.riskLevel].stripe)}
                  aria-hidden
                />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-bold",
                        TONES[alert.alert.riskLevel].chip,
                      )}
                    >
                      {(() => {
                        const Icon = TONES[alert.alert.riskLevel].icon;
                        return <Icon size={16} weight="fill" aria-hidden />;
                      })()}
                      {TONES[alert.alert.riskLevel].word}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft">
                      <Clock size={16} weight="bold" aria-hidden />
                      <time dateTime={alert.alert.createdAt || undefined}>
                        {relativeTime(alert.sentAt, now)}
                      </time>
                    </span>
                  </div>

                  <h2
                    id="alert-heading"
                    className="mt-3 text-[1.5rem] font-bold leading-[1.18] tracking-tight text-balance sm:text-[1.75rem]"
                  >
                    {levelHeading(alert.alert.riskLevel, alert.alert.contactName)}
                  </h2>

                  <p className="mt-2.5 text-lg leading-relaxed">
                    {alert.alert.summary}
                  </p>
                </div>

                {alert.alert.suggestedAction && (
                  <div className="border-t border-line bg-accent-soft/70 px-5 py-4 sm:px-6">
                    <p className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent"
                        aria-hidden
                      >
                        <Phone size={20} weight="fill" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-accent">
                          Do this now
                        </span>
                        <span className="mt-0.5 block text-lg font-semibold leading-relaxed">
                          {alert.alert.suggestedAction}
                        </span>
                      </span>
                    </p>
                  </div>
                )}
              </section>

              {/* Findings and actions belong to one another, so they share one
                  border instead of two stacked cards. */}
              {(alert.reasons.length > 0 || alert.nextSteps.length > 0) && (
                <StackedSection>
                  {alert.reasons.length > 0 && (
                    <div className="p-5 sm:p-6">
                      <h3 className="text-xl font-bold tracking-tight">
                        {TONES[alert.alert.riskLevel].heading}
                      </h3>
                      <ul className="mt-3.5 space-y-3">
                        {alert.reasons.map((reason, index) => (
                          <li key={index} className="flex gap-3 text-lg leading-relaxed">
                            <span
                              className="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-ink-faint"
                              aria-hidden
                            />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {alert.nextSteps.length > 0 && (
                    <div className="p-5 sm:p-6">
                      <h3 className="text-xl font-bold tracking-tight">
                        What you can do
                      </h3>
                      <ol className="mt-3.5 space-y-3.5">
                        {alert.nextSteps.map((step, index) => (
                          <li key={index} className="flex gap-3 text-lg leading-relaxed">
                            <span
                              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold tabular-nums text-accent"
                              aria-hidden
                            >
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>

                      {alert.alert.riskLevel !== "safe" && (
                        <Link
                          href="/damage-control"
                          className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-control)] border-2 border-line-strong px-4 py-2.5 text-base font-bold text-accent hover:border-accent"
                        >
                          <span className="min-w-0">
                            Already sent money or card numbers? Open the recovery
                            steps
                          </span>
                          <ArrowRight
                            size={20}
                            weight="bold"
                            className="shrink-0"
                            aria-hidden
                          />
                        </Link>
                      )}
                    </div>
                  )}
                </StackedSection>
              )}

              {alert.sourceText.trim() && (
                <Panel tone="sunk">
                  <h3 className="text-base font-bold">The message they checked</h3>
                  <blockquote className="mt-2.5 border-l-4 border-line-strong pl-4">
                    <p className="whitespace-pre-wrap break-words text-lg leading-relaxed text-ink-soft">
                      {alert.sourceText}
                    </p>
                  </blockquote>
                </Panel>
              )}

              <Button variant="quiet" onClick={dismissAlert} className="w-full sm:w-auto">
                I have seen this
              </Button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="p-6 sm:p-7">
                <h2 className="text-xl font-bold">Nothing here yet</h2>
                <p className="mt-2 max-w-[42ch] text-lg leading-relaxed text-ink-soft">
                  That is normal. An alert only appears after someone you protect
                  runs a check, so an empty page is not a warning sign.
                </p>

                <h3 className="mt-6 text-base font-bold text-ink-soft">
                  How an alert arrives
                </h3>
                <ol className="mt-3 space-y-3">
                  {[
                    "They open ScamShield on their phone.",
                    "They paste the message or add a picture of it.",
                    "The answer appears on this page, usually within a minute.",
                  ].map((step, index) => (
                    <li key={index} className="flex gap-3 text-lg leading-relaxed">
                      <span
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold tabular-nums text-accent"
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="border-t border-line bg-surface-sunk/60 px-6 py-5">
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                  <Link href="/">Check a message yourself</Link>
                </Button>
                <p className="mt-3 text-base leading-snug text-ink-soft">
                  Leave this page open, or come back to it later. The last alert is
                  kept for this visit.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
