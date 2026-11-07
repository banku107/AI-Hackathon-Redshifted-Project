"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CaretDown,
  List,
  Moon,
  Sun,
  TextAa,
  Translate,
} from "@phosphor-icons/react";
import { useAppState, type TextSize } from "@/lib/app-state";
import { LANGUAGES } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const textSizes: { value: TextSize; label: string; className: string }[] = [
  { value: "normal", label: "Normal", className: "text-base" },
  { value: "large", label: "Large", className: "text-lg" },
  { value: "xlarge", label: "Largest", className: "text-xl" },
];

const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

/**
 * Reader preferences. Collapsed behind one button because the home screen
 * should show exactly one obvious action, not a control panel. The panel opens
 * upward from the button (it is docked at the bottom of the screen) and caps
 * its own height, so it stays reachable at 390px with the largest text size.
 */
export function SettingsMenu() {
  const { theme, setTheme, textSize, setTextSize, language, setLanguage } =
    useAppState();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and on a click outside, so the panel never becomes a thing
  // the reader has to hunt for a way to dismiss.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        ref={buttonRef}
        variant="quiet"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Reader settings: text size, colours and language"
        className="px-3 sm:px-4"
      >
        <List size={20} weight="bold" aria-hidden />
        <span className="hidden sm:inline">Settings</span>
        <CaretDown
          size={16}
          weight="bold"
          className={cn("transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </Button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Reader settings"
          className="absolute right-0 top-full z-40 mt-2 max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-paper p-5 shadow-[0_12px_40px_rgba(9,40,33,0.18)]"
        >
          <fieldset>
            <legend className="flex items-center gap-2 text-base font-bold">
              <TextAa size={20} aria-hidden />
              Text size
            </legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {textSizes.map((size) => {
                const selected = textSize === size.value;
                return (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() => setTextSize(size.value)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border-2 px-1 font-bold transition-colors",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line-strong bg-surface text-ink-soft hover:border-ink-faint",
                    )}
                  >
                    <span className={size.className} aria-hidden>
                      Aa
                    </span>
                    <span className="text-xs leading-tight">{size.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <hr className="my-5 border-line" />

          <div>
            <label
              htmlFor={`${panelId}-language`}
              className="flex items-center gap-2 text-base font-bold"
            >
              <Translate size={20} aria-hidden />
              Language
            </label>
            <select
              id={`${panelId}-language`}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-3 min-h-12 w-full rounded-[var(--radius-control)] border-2 border-line-strong bg-surface px-3 text-lg font-semibold text-ink"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native}
                </option>
              ))}
            </select>
          </div>

          <hr className="my-5 border-line" />

          <fieldset>
            <legend className="flex items-center gap-2 text-base font-bold">
              {theme === "dark" ? (
                <Moon size={20} aria-hidden />
              ) : (
                <Sun size={20} aria-hidden />
              )}
              Light or dark
            </legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {themes.map((choice) => {
                const selected = theme === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setTheme(choice.value)}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-12 rounded-[var(--radius-control)] border-2 text-base font-bold transition-colors",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line-strong text-ink-soft hover:border-ink-faint",
                    )}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
