"use client";

// Optional trusted person to warn after a scam or suspicious result (P3-2).
// Saved on this device only; page.tsx reads it with readFamilyContact() when
// it builds the AgentRequest.

import { useState, useSyncExternalStore } from "react";
import { UsersThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { FamilyContact } from "@/lib/contract";
import {
  clearFamilyContact,
  readFamilyContact,
  saveFamilyContact,
} from "@/lib/family-contact";

const inputClass =
  "w-full min-h-12 rounded-[10px] border-2 border-line-strong bg-surface px-3 py-2.5 text-lg text-ink placeholder:text-ink-faint";

const KEY = "scamshield.familyContact";
const CHANGE_EVENT = "scamshield:family-contact";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The raw string is a stable snapshot; parsing happens in render.
function rawSnapshot(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function FamilyContactField() {
  // Server render has no localStorage, so it sees "no contact".
  const raw = useSyncExternalStore(subscribe, rawSnapshot, () => null);
  const saved = raw === null ? null : readFamilyContact();
  const notifyChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [reach, setReach] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setName(saved?.name ?? "");
    setReach(saved?.phone ?? saved?.email ?? "");
    setError(null);
    setEditing(true);
  };

  const save = () => {
    const trimmedName = name.trim();
    const trimmedReach = reach.trim();
    if (!trimmedName) {
      setError("Please add their name.");
      return;
    }
    let contact: FamilyContact = { name: trimmedName };
    if (trimmedReach.includes("@")) {
      contact = { ...contact, email: trimmedReach };
    } else if (trimmedReach) {
      const digits = trimmedReach.replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length < 7) {
        setError("That phone number looks too short.");
        return;
      }
      contact = { ...contact, phone: digits };
    }
    saveFamilyContact(contact);
    notifyChange();
    setEditing(false);
  };

  const remove = () => {
    clearFamilyContact();
    notifyChange();
    setEditing(false);
  };

  return (
    <div className="border-t border-line pt-4">
      <p className="flex items-center gap-2 text-lg font-semibold leading-snug">
        <UsersThree size={22} weight="bold" aria-hidden className="text-accent" />
        Someone to warn if it looks wrong
        <span className="text-base font-normal text-ink-soft">(optional)</span>
      </p>

      {!editing && saved && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-lg text-ink-soft">
            We will warn <strong className="text-ink">{saved.name}</strong>
            {saved.phone ? `, ${saved.phone}` : saved.email ? `, ${saved.email}` : ""}.
          </p>
          <Button variant="quiet" onClick={startEdit}>
            Change
          </Button>
          <Button variant="quiet" onClick={remove}>
            Remove
          </Button>
        </div>
      )}

      {!editing && !saved && (
        <Button variant="quiet" className="mt-2" onClick={startEdit}>
          Add a family member
        </Button>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="family-name" className="mb-1 block text-base font-semibold">
              Their name
            </label>
            <input
              id="family-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="family-reach" className="mb-1 block text-base font-semibold">
              Their phone number or email
            </label>
            <input
              id="family-reach"
              value={reach}
              onChange={(e) => setReach(e.target.value)}
              inputMode="email"
              autoComplete="off"
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-base font-semibold text-warn">
              {error}
            </p>
          )}
          <p className="text-base leading-snug text-ink-soft">
            Kept on this phone only. We only contact them after a check that looks
            wrong.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={save}>Save</Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
