// The trusted person the reader wants warned. Kept on this device only, in
// localStorage, because a phone number is personal data and there is no account
// system to hold it.

import type { FamilyContact } from "./contract";

const KEY = "scamshield.familyContact";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/**
 * Returns the saved contact, or null. Invalid stored data is dropped rather
 * than trusted: it may be from an older version of this page.
 */
export function readFamilyContact(): FamilyContact | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
    return {
      name: candidate.name.trim(),
      ...(typeof candidate.phone === "string" && candidate.phone.trim()
        ? { phone: candidate.phone.trim() }
        : {}),
      ...(typeof candidate.email === "string" && candidate.email.trim()
        ? { email: candidate.email.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveFamilyContact(contact: FamilyContact): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(contact));
  } catch {
    // Private-mode storage can refuse writes; the contact then lasts this page only.
  }
}

export function clearFamilyContact(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Same as above.
  }
}
