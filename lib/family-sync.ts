// Cross-tab bridge between the person checking a message and the family alert
// screen. Plain functions only, so this module is safe to import anywhere.
//
// The payload carries the contract's own FamilyAlert plus the verdict context
// the family screen needs to explain what happened.

import type { FamilyAlert } from "./contract";

export interface FamilyAlertPayload {
  alert: FamilyAlert;
  /** When this browser sent the alert. The contract's createdAt is server time. */
  sentAt: number;
  reasons: string[];
  nextSteps: string[];
  sourceText: string;
}

const CHANNEL_NAME = "scamshield";
const STORAGE_KEY = "scamshield.lastAlert";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Shape check for a FamilyAlert from storage, a broadcast or the network. */
export function isFamilyAlert(value: unknown): value is FamilyAlert {
  if (typeof value !== "object" || value === null) return false;
  const alert = value as Record<string, unknown>;
  return (
    typeof alert.contactName === "string" &&
    typeof alert.summary === "string" &&
    (alert.riskLevel === "scam" ||
      alert.riskLevel === "suspicious" ||
      alert.riskLevel === "safe") &&
    typeof alert.moneyInvolved === "boolean" &&
    typeof alert.suggestedAction === "string" &&
    typeof alert.createdAt === "string"
  );
}

function isPayload(value: unknown): value is FamilyAlertPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    isFamilyAlert(candidate.alert) &&
    typeof candidate.sentAt === "number" &&
    isStringArray(candidate.reasons) &&
    isStringArray(candidate.nextSteps) &&
    typeof candidate.sourceText === "string"
  );
}

function writeLastAlert(payload: FamilyAlertPayload): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be blocked in private mode; losing the fallback is acceptable.
  }
}

export function broadcastFamilyAlert(payload: FamilyAlertPayload): void {
  // Save before posting so a same-tab visit to /family still has the alert.
  writeLastAlert(payload);
  if (!hasWindow() || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // The alert is already in React state and sessionStorage; the broadcast is extra.
  }
}

export function subscribeFamilyAlerts(
  cb: (payload: FamilyAlertPayload) => void,
): () => void {
  if (!hasWindow() || typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return () => {};
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isPayload(data)) return;
    writeLastAlert(data);
    cb(data);
  };

  return () => {
    try {
      channel.close();
    } catch {
      // Closing a channel twice is harmless.
    }
  };
}

export function readLastAlert(): FamilyAlertPayload | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLastAlert(): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same blocked-storage case as above.
  }
}
