// One list of alerts for the family screen.
//
// Two sources feed it:
//   1. GET /api/family (Person 2's route), polled every few seconds. This is
//      the real one: it works across devices.
//   2. lib/family-sync (BroadcastChannel + sessionStorage). Same browser only,
//      kept so a one-laptop rehearsal works before the route exists.
//
// The rule: until the route has answered OK once, show the local alerts. After
// that, show only what the server returns, borrowing the extra detail (reasons,
// steps, message text) from a matching local alert when this browser has one.

import { useEffect, useState } from "react";
import type { FamilyAlert } from "./contract";
import { isFamilyAlert, type FamilyAlertPayload } from "./family-sync";

export interface FamilyFeedItem {
  key: string;
  alert: FamilyAlert;
  /** Milliseconds since epoch, or null when the time is unknown. */
  sentAt: number | null;
  reasons: string[];
  nextSteps: string[];
  sourceText: string;
}

const POLL_URL = "/api/family";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Same alert from any source gives the same key, so it never shows twice. */
export function alertKey(alert: FamilyAlert): string {
  return `${alert.createdAt}|${alert.riskLevel}|${alert.summary}`;
}

export function feedItemFromPayload(payload: FamilyAlertPayload): FamilyFeedItem {
  return {
    key: alertKey(payload.alert),
    alert: payload.alert,
    sentAt: payload.sentAt > 0 ? payload.sentAt : null,
    reasons: payload.reasons,
    nextSteps: payload.nextSteps,
    sourceText: payload.sourceText,
  };
}

function feedItemFromServer(alert: FamilyAlert): FamilyFeedItem {
  const parsed = Date.parse(alert.createdAt);
  return {
    key: alertKey(alert),
    alert,
    sentAt: Number.isFinite(parsed) ? parsed : null,
    reasons: [],
    nextSteps: [],
    sourceText: "",
  };
}

/**
 * @param server null while the route has never answered OK.
 * @param local  alerts this browser knows about, in any order.
 * @param seen   keys the reader has dismissed.
 */
export function buildFamilyFeed(
  server: FamilyAlert[] | null,
  local: FamilyFeedItem[],
  seen: ReadonlySet<string>,
): FamilyFeedItem[] {
  let items: FamilyFeedItem[];

  if (server) {
    const localByKey = new Map(local.map((item) => [item.key, item]));
    // Server order is already newest first; keep it.
    items = server.map((alert) => {
      const fromServer = feedItemFromServer(alert);
      const match = localByKey.get(fromServer.key);
      return match ? { ...match, alert, sentAt: fromServer.sentAt ?? match.sentAt } : fromServer;
    });
  } else {
    items = [...local].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
  }

  const out: FamilyFeedItem[] = [];
  const used = new Set<string>();
  for (const item of items) {
    if (used.has(item.key) || seen.has(item.key)) continue;
    used.add(item.key);
    out.push(item);
  }
  return out;
}

function sameAlerts(a: FamilyAlert[] | null, b: FamilyAlert[]): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Polls GET /api/family. Returns null until the route has answered OK once;
 * after that it keeps the last good list even if a later poll fails. Errors,
 * 404s and bad JSON are ignored quietly. Polling pauses while the tab is hidden.
 */
export function useServerFamilyAlerts(intervalMs = 3000): FamilyAlert[] | null {
  const [alerts, setAlerts] = useState<FamilyAlert[] | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    async function poll() {
      timer = undefined;
      if (stopped || document.hidden) return;

      controller = new AbortController();
      try {
        const res = await fetch(POLL_URL, {
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const data: unknown = await res.json();
          if (!stopped && Array.isArray(data)) {
            const list = data.filter(isFamilyAlert);
            setAlerts((prev) => (sameAlerts(prev, list) ? prev : list));
          }
        }
      } catch {
        // Route missing, offline or aborted: the local source covers it.
      } finally {
        controller = null;
      }

      if (!stopped && !document.hidden) {
        timer = window.setTimeout(poll, intervalMs);
      }
    }

    function onVisibilityChange() {
      if (!document.hidden && timer === undefined && controller === null) {
        void poll();
      }
    }

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return alerts;
}

// ---------- Dismissed alerts (this visit only) ----------

const SEEN_KEY = "scamshield.seenAlerts";

export function readSeenAlerts(): Set<string> {
  if (!hasWindow()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function saveSeenAlerts(keys: ReadonlySet<string>): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    // Blocked storage: the dismissal lasts until the page reloads.
  }
}

// ---------- The person this family member looks after ----------
// FamilyAlert carries no phone number (and contactName is the person being
// warned, not the one who checked the message). So the number for "Call" is
// one the family member typed in on this device. It is never taken from an
// alert or from the checked message, which may be the scammer's.

export interface WatchedPerson {
  name: string;
  phone: string;
}

const WATCHED_KEY = "scamshield.watchedPerson";

/** A dialable tel: link, or null when the number does not look like one. */
export function telHref(phone: string): string | null {
  const cleaned = phone.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned) ? `tel:${cleaned}` : null;
}

export function readWatchedPerson(): WatchedPerson | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(WATCHED_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
    if (typeof candidate.phone !== "string" || !telHref(candidate.phone)) return null;
    return { name: candidate.name.trim(), phone: candidate.phone.trim() };
  } catch {
    return null;
  }
}

export function saveWatchedPerson(person: WatchedPerson): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(WATCHED_KEY, JSON.stringify(person));
  } catch {
    // Private-mode storage can refuse writes; it then lasts this page only.
  }
}
