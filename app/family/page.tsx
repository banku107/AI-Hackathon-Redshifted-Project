"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  Phone,
  ShieldCheck,
  UserCircle,
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
import {
  buildFamilyFeed,
  feedItemFromPayload,
  readSeenAlerts,
  readWatchedPerson,
  saveSeenAlerts,
  saveWatchedPerson,
  telHref,
  useServerFamilyAlerts,
  type FamilyFeedItem,
  type WatchedPerson,
} from "@/lib/family-feed";
import { EvidenceDot } from "@/components/evidence-dot";
import { cn } from "@/lib/utils";

const TONES = {
  scam: {
    word: "Scam alert",
    icon: WarningOctagon,
    field: "field-scam",
    heading: "Why it looks wrong",
  },
  suspicious: {
    word: "Be careful",
    icon: Warning,
    field: "field-warn",
    heading: "Why it looks wrong",
  },
  safe: {
    word: "Checked and looks safe",
    icon: ShieldCheck,
    field: "field-safe",
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

const SOMEONE = "Someone you protect";

export default function FamilyPage() {
  const { run } = useAppState();
  const serverAlerts = useServerFamilyAlerts(3000);
  const [liveAlert, setLiveAlert] = useState<FamilyAlertPayload | null>(null);
  const [ignoredRunKey, setIgnoredRunKey] = useState<string | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [watched, setWatched] = useState<WatchedPerson | null>(null);
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
          contactName: SOMEONE,
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
    // Reading browser storage once after mount is the only way to hydrate
    // without the server and client renders disagreeing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveAlert(readLastAlert());
    setSeen(readSeenAlerts());
    setWatched(readWatchedPerson());
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

  const localItems = useMemo(() => {
    const items: FamilyFeedItem[] = [];
    if (liveAlert) items.push(feedItemFromPayload(liveAlert));
    if (runAlert && runAlertKey && runAlertKey !== ignoredRunKey) {
      items.push(feedItemFromPayload(runAlert));
    }
    return items;
  }, [liveAlert, runAlert, runAlertKey, ignoredRunKey]);

  const feed = useMemo(
    () => buildFamilyFeed(serverAlerts, localItems, seen),
    [serverAlerts, localItems, seen],
  );

  function dismissAlert(item: FamilyFeedItem) {
    const next = new Set(seen);
    next.add(item.key);
    setSeen(next);
    saveSeenAlerts(next);
    if (liveAlert && feedItemFromPayload(liveAlert).key === item.key) {
      clearLastAlert();
      setLiveAlert(null);
    }
    if (runAlert && feedItemFromPayload(runAlert).key === item.key && runAlertKey) {
      setIgnoredRunKey(runAlertKey);
    }
  }

  // contactName is the person being warned (whoever reads this page), so the
  // heading names the person this reader looks after, if they told us.
  const watchedName = watched?.name ?? SOMEONE;
  const callHref = watched ? telHref(watched.phone) : null;

  return (
    <div className="min-h-[100dvh]">
      <AppBar />

      <main className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-14">
        <header>
          <h1 className="font-serif text-[2.1rem] leading-[1] text-balance sm:text-[3.25rem]">
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
              className="rounded-[var(--radius-card)] bg-surface p-5 sm:p-7"
              aria-busy="true"
              aria-label="Loading alerts"
            >
              <div className="h-4 w-28 rounded bg-surface-sunk" />
              <div className="mt-5 h-7 w-3/4 rounded bg-surface-sunk" />
              <div className="mt-3 h-4 w-full rounded bg-surface-sunk" />
              <div className="mt-2 h-4 w-5/6 rounded bg-surface-sunk" />
            </div>
          ) : feed.length > 0 ? (
            <ol className="space-y-8" aria-label="Alerts, newest first">
              {feed.map((item, index) => (
                <li key={item.key}>
                  <AlertCard
                    item={item}
                    index={index}
                    now={now}
                    watchedName={watchedName}
                    callHref={callHref}
                    showDetails={index === 0}
                    onDismiss={() => dismissAlert(item)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface">
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

              <div className="bg-surface-sunk px-6 py-5">
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

        {hydrated && (
          <WatchedPersonPanel
            key={watched ? `${watched.name}|${watched.phone}` : "none"}
            watched={watched}
            onSave={(person) => {
              saveWatchedPerson(person);
              setWatched(person);
            }}
          />
        )}
      </main>
    </div>
  );
}

/**
 * One alert, laid out like a phone notification: who, what, when, and the
 * single next action. The colour stripe repeats a meaning that is also spelled
 * out in the chip, so nothing here depends on colour alone.
 */
function AlertCard({
  item,
  index,
  now,
  watchedName,
  callHref,
  showDetails,
  onDismiss,
}: {
  item: FamilyFeedItem;
  index: number;
  now: number;
  watchedName: string;
  callHref: string | null;
  showDetails: boolean;
  onDismiss: () => void;
}) {
  const { alert } = item;
  const tone = TONES[alert.riskLevel];
  const Icon = tone.icon;
  const headingId = `alert-heading-${index}`;
  const isNewest = index === 0;

  return (
    <div className="space-y-5">
      <section
        aria-labelledby={headingId}
        className="overflow-hidden rounded-[var(--radius-card)] bg-surface"
      >
        {/* Same answer field as the checker: the family member sees the
            verdict in the colour and word their relative saw. */}
        <div className={cn("p-5 sm:p-7", tone.field)}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-current/40 bg-black/40 px-3.5 font-mono text-sm font-semibold",
              )}
            >
              <Icon size={16} weight="fill" aria-hidden />
              {tone.word}
            </span>
            {item.sentAt !== null && now > 0 && (
              <span className="inline-flex items-center gap-1.5 text-base font-bold">
                <Clock size={16} weight="bold" aria-hidden />
                <time dateTime={alert.createdAt || undefined}>
                  {relativeTime(item.sentAt, now)}
                </time>
              </span>
            )}
          </div>

          <h2
            id={headingId}
            className="mt-4 font-serif text-[1.45rem] leading-[1.08] text-balance sm:text-[2.25rem]"
          >
            {levelHeading(alert.riskLevel, watchedName)}
          </h2>

          <p className="mt-2.5 text-lg leading-relaxed">{alert.summary}</p>
        </div>

        {(alert.suggestedAction || callHref) && (
          <div className="bg-accent-soft px-5 py-5 sm:px-7">
            {alert.suggestedAction && (
              <p className="flex items-start gap-3">
                <span
                  className="mt-1 flex shrink-0 text-accent"
                  aria-hidden
                >
                  <Phone size={20} weight="fill" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-accent">
                    Do this now
                  </span>
                  <span className="mt-0.5 block text-lg font-bold leading-relaxed">
                    {alert.suggestedAction}
                  </span>
                </span>
              </p>
            )}

            {/* Only a number this reader saved on this device. Never one from
                the alert or the checked message, which may be the scammer's. */}
            {callHref && (
              <Button
                asChild
                size={isNewest ? "lg" : "md"}
                variant={isNewest ? "primary" : "secondary"}
                className={cn("w-full", alert.suggestedAction && "mt-4")}
              >
                <a href={callHref}>
                  <Phone size={isNewest ? 24 : 20} weight="fill" aria-hidden />
                  Call {watchedName}
                </a>
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Findings and actions belong to one another, so they share one border
          instead of two stacked cards. */}
      {showDetails && (item.reasons.length > 0 || item.nextSteps.length > 0) && (
        <StackedSection>
          {item.reasons.length > 0 && (
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-bold tracking-tight">{tone.heading}</h3>
              <ul className="mt-3.5 space-y-3">
                {item.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-3 text-lg leading-relaxed">
                    <EvidenceDot tone={alert.riskLevel} />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.nextSteps.length > 0 && (
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-bold tracking-tight">What you can do</h3>
              <ol className="mt-3.5 space-y-3.5">
                {item.nextSteps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-lg leading-relaxed">
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold tabular-nums text-accent"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {alert.riskLevel !== "safe" && (
                <Link
                  href="/damage-control"
                  className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-control)] bg-paper px-4 py-2.5 text-base font-bold text-accent transition-colors hover:bg-accent-soft"
                >
                  <span className="min-w-0">
                    Already sent money or card numbers? Open the recovery steps
                  </span>
                  <ArrowRight size={20} weight="bold" className="shrink-0" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </StackedSection>
      )}

      {showDetails && item.sourceText.trim() && (
        <Panel tone="sunk">
          <h3 className="text-base font-bold">The message they checked</h3>
          <blockquote className="mt-2.5 border-l-4 border-line-strong pl-4">
            <p className="whitespace-pre-wrap break-words text-lg leading-relaxed text-ink-soft">
              {item.sourceText}
            </p>
          </blockquote>
        </Panel>
      )}

      <Button variant="quiet" onClick={onDismiss} className="w-full sm:w-auto">
        I have seen this
      </Button>
    </div>
  );
}

const FIELD =
  "mt-2 min-h-12 w-full rounded-[var(--radius-control)] border-2 border-line-strong bg-paper px-4 text-lg font-bold text-ink placeholder:font-normal placeholder:text-ink-faint focus:border-accent focus:outline-none";

/**
 * Where the "Call" number comes from. Alerts carry no phone number, so the
 * reader types in the number of the person they look after, once, on this
 * device.
 */
function WatchedPersonPanel({
  watched,
  onSave,
}: {
  watched: WatchedPerson | null;
  onSave: (person: WatchedPerson) => void;
}) {
  const [editing, setEditing] = useState(!watched);
  const [name, setName] = useState(watched?.name ?? "");
  const [phone, setPhone] = useState(watched?.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setError("Please type their name.");
      return;
    }
    if (!telHref(trimmedPhone)) {
      setError("That number does not look right. Try it with the area code.");
      return;
    }
    setError(null);
    setEditing(false);
    onSave({ name: trimmedName, phone: trimmedPhone });
  }

  if (watched && !editing) {
    return (
      <Panel tone="sunk" className="mt-8">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <UserCircle size={20} weight="bold" aria-hidden />
          The Call button phones
        </h2>
        <p className="mt-2 text-lg leading-relaxed">
          {watched.name}, <span className="tabular-nums">{watched.phone}</span>
        </p>
        <Button
          variant="secondary"
          onClick={() => setEditing(true)}
          className="mt-4 w-full sm:w-auto"
        >
          Change this
        </Button>
      </Panel>
    );
  }

  return (
    <Panel tone="sunk" className="mt-8">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <UserCircle size={20} weight="bold" aria-hidden />
        Who do you look after?
      </h2>
      <p className="mt-2 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
        Add their name and number to get a Call button on every alert. It stays
        on this phone only.
      </p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <label className="block text-base font-bold">
          Their name
          <input
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mom"
            className={FIELD}
          />
        </label>
        <label className="block text-base font-bold">
          Their phone number
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            className={FIELD}
          />
        </label>
        {error && (
          <p role="alert" className="text-base font-bold text-ink">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" className="w-full sm:w-auto">
            Save
          </Button>
          {watched && (
            <Button
              variant="quiet"
              onClick={() => setEditing(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
