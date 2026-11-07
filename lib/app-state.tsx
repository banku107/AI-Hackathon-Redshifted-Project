"use client";

// Global UI state: theme, text size, language, and the current investigation.
//
// The shapes here are the contract's shapes. This file only adds what the
// screen needs to remember between renders (a step's status, the evidence that
// belongs to it), never a second version of the data itself.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AgentEvent,
  DamageControlPlan,
  FamilyAlert,
  FamilyAlertResult,
  Verdict,
} from "./contract";

export type ThemeChoice = "system" | "light" | "dark";
export type TextSize = "normal" | "large" | "xlarge";

export interface EvidenceLine {
  finding: string;
  severity: "red" | "yellow" | "green" | "info";
}

export interface StepEntry {
  id: string;
  label: string;
  status: "running" | "done";
  ok: boolean;
  summary: string;
  evidence: EvidenceLine[];
}

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  /** The agent's plan, as one short sentence per step. */
  plan: string[];
  steps: StepEntry[];
  verdict: Verdict | null;
  familyAlert: FamilyAlert | null;
  alertResult: FamilyAlertResult | null;
  damagePlan: DamageControlPlan | null;
  errorMessage: string | null;
  /** Raw text of the message being checked, so later screens can quote it. */
  sourceText: string;
}

const emptyRun: RunState = {
  status: "idle",
  plan: [],
  steps: [],
  verdict: null,
  familyAlert: null,
  alertResult: null,
  damagePlan: null,
  errorMessage: null,
  sourceText: "",
};

interface AppState {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  resolvedDark: boolean;

  textSize: TextSize;
  setTextSize: (s: TextSize) => void;

  language: string;
  setLanguage: (code: string) => void;

  run: RunState;
  /** Apply one event from the agent stream. Used by live mode and demo mode. */
  applyEvent: (event: AgentEvent) => void;
  resetRun: (sourceText?: string) => void;
  beginRun: (sourceText?: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

function readStored<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return (value as T) ?? fallback;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolvedDark, setResolvedDark] = useState(false);
  const [textSize, setTextSizeState] = useState<TextSize>("normal");
  const [language, setLanguageState] = useState("en");
  const [run, setRun] = useState<RunState>(emptyRun);
  const hydrated = useRef(false);

  // Hydrate from storage after mount; the inline boot script in layout.tsx
  // already applied the visual parts, this just syncs React state to it.
  useEffect(() => {
    // localStorage is unreadable during prerender, so state has to be filled
    // in after mount. The inline boot script already applied the visuals.
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(readStored<ThemeChoice>("scamshield.theme", "system"));
    setTextSizeState(readStored<TextSize>("scamshield.text", "normal"));
    setLanguageState(readStored<string>("scamshield.language", "en"));
    /* eslint-enable react-hooks/set-state-in-effect */
    hydrated.current = true;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      setResolvedDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem("scamshield.theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem("scamshield.text", textSize);
    document.documentElement.setAttribute("data-text", textSize);
  }, [textSize]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem("scamshield.language", language);
  }, [language]);

  const setTheme = useCallback((t: ThemeChoice) => setThemeState(t), []);
  const setTextSize = useCallback((s: TextSize) => setTextSizeState(s), []);
  const setLanguage = useCallback((code: string) => setLanguageState(code), []);

  const resetRun = useCallback((sourceText = "") => {
    setRun({ ...emptyRun, sourceText });
  }, []);

  const beginRun = useCallback((sourceText = "") => {
    setRun({ ...emptyRun, sourceText, status: "running" });
  }, []);

  const applyEvent = useCallback((event: AgentEvent) => {
    setRun((prev) => {
      switch (event.type) {
        case "plan":
          return { ...prev, status: "running", plan: event.steps };

        case "step_start": {
          // The same step id can be re-sent while a server tool keeps running.
          if (prev.steps.some((s) => s.id === event.id)) {
            return {
              ...prev,
              steps: prev.steps.map((s) =>
                s.id === event.id ? { ...s, status: "running" } : s,
              ),
            };
          }
          return {
            ...prev,
            steps: [
              ...prev.steps,
              {
                id: event.id,
                label: event.label,
                status: "running",
                ok: true,
                summary: "",
                evidence: [],
              },
            ],
          };
        }

        case "step_done":
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === event.id
                ? { ...s, status: "done", ok: event.ok, summary: event.summary }
                : s,
            ),
          };

        case "evidence":
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === event.id
                ? {
                    ...s,
                    evidence: [
                      ...s.evidence,
                      { finding: event.finding, severity: event.severity },
                    ],
                  }
                : s,
            ),
          };

        case "verdict":
          return { ...prev, verdict: event.verdict };

        case "family_alert":
          return {
            ...prev,
            familyAlert: event.alert,
            alertResult: event.result,
          };

        case "damage_control":
          return { ...prev, damagePlan: event.plan };

        case "text":
          // Free-form agent narration is not shown as its own panel; the
          // timeline and the verdict carry the story.
          return prev;

        case "error":
          return {
            ...prev,
            status: event.recoverable ? prev.status : "error",
            errorMessage: event.message,
          };

        case "done":
          return {
            ...prev,
            status: prev.status === "error" ? "error" : "done",
          };

        default:
          return prev;
      }
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedDark,
      textSize,
      setTextSize,
      language,
      setLanguage,
      run,
      applyEvent,
      resetRun,
      beginRun,
    }),
    [
      theme,
      setTheme,
      resolvedDark,
      textSize,
      setTextSize,
      language,
      setLanguage,
      run,
      applyEvent,
      resetRun,
      beginRun,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside AppStateProvider");
  return ctx;
}
