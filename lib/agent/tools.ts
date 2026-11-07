// lib/agent/tools.ts  (Person 1)
// The tools Claude can use, and the code that runs them.
//
// Two kinds of tools:
//  - "UI tools" (make_plan, record_evidence, verify_verdict, give_verdict,
//    alert_family, damage_control): Claude uses them to report what it is
//    doing. We turn each call into a live AgentEvent for the screen.
//  - "Investigation tools" (expand_link, domain_age, lookalike_check,
//    check_reputation): call Person 2's functions (via ./investigate).
// Plus Claude's built-in web search, which runs on Anthropic's servers.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  AgentEvent,
  AgentRequest,
  FamilyAlert,
  Language,
  Verdict,
} from "@/lib/contract";
import * as investigate from "./investigate";
import {
  AlertFamilyInput,
  DamageControlInput,
  DomainInput,
  MakePlanInput,
  RecordEvidenceInput,
  UrlInput,
  VerdictInput,
} from "./schemas";

type BetaTool = Anthropic.Beta.Messages.BetaTool;
type BetaToolUnion = Anthropic.Beta.Messages.BetaToolUnion;

// ---------------------------------------------------------------------------
// Session: everything we remember during one check
// ---------------------------------------------------------------------------

export interface Evidence {
  id: string;
  finding: string;
  severity: "red" | "yellow" | "green" | "info";
}

export interface AgentSession {
  request: AgentRequest;
  send: (e: AgentEvent) => void;
  planSent: boolean;
  stepCounter: number;
  openSteps: Set<string>;
  evidence: Evidence[];
  /** family_alert / damage_control wait here so they arrive AFTER the verdict. */
  familyAlertEvent: AgentEvent | null;
  damageControlEvent: AgentEvent | null;
  verdict: Verdict | null;
  verdictRejections: number;
  /** Events to show right after the plan (e.g. the video file check). */
  afterPlan: AgentEvent[];
}

export function createSession(request: AgentRequest, send: (e: AgentEvent) => void): AgentSession {
  return {
    request,
    send,
    planSent: false,
    stepCounter: 0,
    openSteps: new Set(),
    evidence: [],
    familyAlertEvent: null,
    damageControlEvent: null,
    verdict: null,
    verdictRejections: 0,
    afterPlan: [],
  };
}

function sendPlan(s: AgentSession, steps: string[]) {
  s.planSent = true;
  s.send({ type: "plan", steps });
  for (const e of s.afterPlan.splice(0)) s.send(e);
}

const MESSAGE_STEP_ID = "message";
const MAX_VERDICT_REJECTIONS = 2;

// ---------------------------------------------------------------------------
// Short labels shown on screen for steps we create ourselves (en + es;
// other languages fall back to English).
// ---------------------------------------------------------------------------

type LabelKey =
  | "defaultPlan1" | "defaultPlan2" | "defaultPlan3"
  | "readMessage" | "readMessageDone"
  | "expand" | "expandOk" | "expandFail"
  | "age" | "ageOk" | "ageFail"
  | "lookalike" | "lookalikeHit" | "lookalikeMiss"
  | "reputation" | "reputationHit" | "reputationClean" | "reputationFail"
  | "search" | "searchOk" | "searchFail"
  | "video" | "videoDone";

const LABELS: Record<"en" | "es", Record<LabelKey, string>> = {
  en: {
    defaultPlan1: "Read the message for warning signs",
    defaultPlan2: "Check any links and senders",
    defaultPlan3: "Decide if it's safe",
    readMessage: "Reading the message for warning signs",
    readMessageDone: "Finished reading the message",
    expand: "Following the link to see where it really goes",
    expandOk: "The link leads to {0}",
    expandFail: "Couldn't follow the link",
    age: "Checking how old the website {0} is",
    ageOk: "Website created {0} days ago",
    ageFail: "Couldn't find when this website was made",
    lookalike: "Checking if {0} copies a real company",
    lookalikeHit: "Looks like a copy of {0}",
    lookalikeMiss: "Doesn't copy a well-known company name",
    reputation: "Checking lists of known scam websites",
    reputationHit: "Listed as a dangerous website",
    reputationClean: "Not on known scam lists",
    reputationFail: "Couldn't check the scam lists",
    search: "Searching the web: “{0}”",
    searchOk: "Found {0} results",
    searchFail: "The web search didn't work",
    video: "Checking the video file",
    videoDone: "Finished checking the video file",
  },
  es: {
    defaultPlan1: "Leer el mensaje buscando señales de alerta",
    defaultPlan2: "Revisar enlaces y remitentes",
    defaultPlan3: "Decidir si es seguro",
    readMessage: "Leyendo el mensaje en busca de señales de alerta",
    readMessageDone: "Terminé de leer el mensaje",
    expand: "Siguiendo el enlace para ver a dónde lleva",
    expandOk: "El enlace lleva a {0}",
    expandFail: "No pude seguir el enlace",
    age: "Revisando cuántos años tiene el sitio {0}",
    ageOk: "Sitio web creado hace {0} días",
    ageFail: "No encontré cuándo se creó este sitio",
    lookalike: "Revisando si {0} copia a una empresa real",
    lookalikeHit: "Parece una copia de {0}",
    lookalikeMiss: "No copia el nombre de una empresa conocida",
    reputation: "Revisando listas de sitios de estafa conocidos",
    reputationHit: "Aparece como sitio peligroso",
    reputationClean: "No aparece en listas de estafas",
    reputationFail: "No pude revisar las listas de estafas",
    search: "Buscando en internet: “{0}”",
    searchOk: "Encontré {0} resultados",
    searchFail: "La búsqueda no funcionó",
    video: "Revisando el archivo de video",
    videoDone: "Terminé de revisar el archivo de video",
  },
};

export function label(lang: Language, key: LabelKey, ...args: (string | number)[]): string {
  const table = lang === "es" ? LABELS.es : LABELS.en;
  return table[key].replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ""));
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

export function ensurePlan(s: AgentSession) {
  if (s.planSent) return;
  const l = s.request.language;
  sendPlan(s, [label(l, "defaultPlan1"), label(l, "defaultPlan2"), label(l, "defaultPlan3")]);
}

export function startStep(s: AgentSession, labelText: string, tool?: string, id?: string): string {
  ensurePlan(s);
  const stepId = id ?? `s${++s.stepCounter}`;
  s.openSteps.add(stepId);
  s.send({ type: "step_start", id: stepId, label: labelText, ...(tool ? { tool } : {}) });
  return stepId;
}

export function finishStep(s: AgentSession, id: string, ok: boolean, summary: string) {
  if (!s.openSteps.has(id)) return;
  s.openSteps.delete(id);
  s.send({ type: "step_done", id, ok, summary });
}

/** Close any step still open (called just before the verdict). */
export function closeOpenSteps(s: AgentSession) {
  for (const id of [...s.openSteps]) {
    finishStep(s, id, true, id === MESSAGE_STEP_ID ? label(s.request.language, "readMessageDone") : "");
  }
}

function hostOf(urlOrDomain: string): string {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(urlOrDomain) ? urlOrDomain : `http://${urlOrDomain}`;
    return new URL(withScheme).hostname;
  } catch {
    return urlOrDomain;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions (what Claude sees)
// ---------------------------------------------------------------------------

function inputSchema(schema: z.ZodType): BetaTool["input_schema"] {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json as BetaTool["input_schema"];
}

const RecordEvidenceToolInput = RecordEvidenceInput.extend({
  stepId: z
    .string()
    .optional()
    .describe("The stepId from the tool result this finding came from. Leave out for findings from reading the message itself."),
});

function clientTool(name: string, description: string, schema: z.ZodType): BetaTool {
  return { name, description, input_schema: inputSchema(schema), eager_input_streaming: true };
}

export const TOOLS: BetaToolUnion[] = [
  clientTool(
    "make_plan",
    "Show the person your investigation plan before you start. Call this first, once, with 3-5 short steps written in the person's language.",
    MakePlanInput,
  ),
  clientTool(
    "expand_link",
    "Safely follow a link (including short links) on our server and report every redirect and the final web address. Never opens the link on the person's device.",
    UrlInput,
  ),
  clientTool(
    "domain_age",
    "Look up when a website was first registered. Websites created in the last 30 days are a strong scam signal when they ask for money or information.",
    DomainInput,
  ),
  clientTool(
    "lookalike_check",
    "Check whether a website name imitates a well-known brand (for example usps-redelivery-help.com or paypa1.com). Real brand websites return no match.",
    DomainInput,
  ),
  clientTool(
    "check_reputation",
    "Check a web address against public lists of known malicious or scam websites.",
    UrlInput,
  ),
  clientTool(
    "record_evidence",
    "Record one finding for the person to see, in their language, with a severity: red (strong scam sign), yellow (caution), green (sign it is genuine), info (neutral). Call once per meaningful finding.",
    RecordEvidenceToolInput,
  ),
  clientTool(
    "alert_family",
    "Send a short alert to the person's trusted family contact. Use only when the verdict is scam or suspicious, money or personal information is involved, and the request says a family contact is available. Write the summary in English for the family member.",
    AlertFamilyInput,
  ),
  clientTool(
    "damage_control",
    "Give a step-by-step recovery plan and ready-to-paste reports when the person already paid, replied, clicked, shared information, or gave remote access. Write it in the person's language.",
    DamageControlInput,
  ),
  clientTool(
    "verify_verdict",
    "Check your draft verdict before giving it. Returns a list of problems to fix (empty if it is ready).",
    VerdictInput,
  ),
  clientTool(
    "give_verdict",
    "Give the final verdict to the person. This must be your last tool call. If it returns problems, fix them and call it again.",
    VerdictInput,
  ),
  { type: "web_search_20260209", name: "web_search", max_uses: 6 },
];

/** Order for tools called in the same turn: plan first, verdict last. */
const ORDER: Record<string, number> = { make_plan: -1, verify_verdict: 1, give_verdict: 2 };
export function toolOrder(name: string): number {
  return ORDER[name] ?? 0;
}

// ---------------------------------------------------------------------------
// The verdict check (used by verify_verdict and give_verdict)
// ---------------------------------------------------------------------------

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export function checkVerdict(s: AgentSession, v: Verdict): string[] {
  const problems: string[] = [];
  const reds = s.evidence.filter((e) => e.severity === "red").length;
  const req = s.request;
  const messageText = `${req.text ?? ""}`;

  if (s.evidence.length === 0) {
    problems.push("No evidence recorded. Call record_evidence for each finding before giving a verdict.");
  }
  if (v.level === "scam" && reds < 2) {
    problems.push(`A "scam" verdict needs at least 2 red findings, but only ${reds} were recorded. Record the missing red evidence if it exists, or use "suspicious".`);
  }
  if (v.level === "safe" && reds > 0) {
    problems.push(`A "safe" verdict can't have red findings, but ${reds} were recorded. Use "suspicious" or "scam".`);
  }
  if (v.reasons.length < 2 || v.reasons.length > 3) {
    problems.push("Give 2-3 reasons.");
  }
  if (v.nextSteps.length < 1) {
    problems.push("Give at least one next step.");
  }
  if (v.level !== "safe" && v.scamType === "none") {
    problems.push('scamType "none" is only for safe messages.');
  }

  // Never give back a phone number or website that came from the message.
  if (v.level !== "safe" && v.officialContact) {
    const phone = digits(v.officialContact.phone ?? "");
    if (phone.length >= 7 && digits(messageText).includes(phone.slice(-7))) {
      problems.push("officialContact.phone appears in the suspicious message. Give the organization's official number that you found yourself, or leave the phone out.");
    }
    const url = v.officialContact.url;
    if (url) {
      const host = hostOf(url).replace(/^www\./, "");
      if (host && messageText.toLowerCase().includes(host.toLowerCase())) {
        problems.push("officialContact.url appears in the suspicious message. Give the official website you found yourself, or leave the url out.");
      }
    }
  }

  if (req.alreadyActed && !s.damageControlEvent) {
    problems.push("The person already acted. Call damage_control with a recovery plan before giving the verdict.");
  }
  if (req.video && !v.aiMedia) {
    problems.push("A video was checked, so fill aiMedia (level, signals, flaggedFrames).");
  }
  if (v.aiMedia) {
    const frameCount = req.video?.frames.length ?? req.images?.length ?? 0;
    const bad = v.aiMedia.flaggedFrames.find((f) => f.index >= frameCount);
    if (bad) problems.push(`flaggedFrames index ${bad.index} doesn't exist (there are ${frameCount} frames, numbered from 0).`);
  }
  if (
    req.familyContact &&
    v.level === "scam" &&
    !s.familyAlertEvent &&
    s.verdictRejections === 0
  ) {
    problems.push("A family contact is available and this is a scam. If money or personal information is involved, call alert_family first. If not, call again with the same verdict.");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Running a tool call
// ---------------------------------------------------------------------------

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

function invalidInput(error: z.ZodError, input: unknown): ToolOutcome {
  return {
    isError: true,
    content: JSON.stringify({
      INVALID_INPUT: z.prettifyError(error),
      received: JSON.stringify(input).slice(0, 2000),
    }),
  };
}

export async function runTool(s: AgentSession, name: string, input: unknown): Promise<ToolOutcome> {
  const lang = s.request.language;

  switch (name) {
    case "make_plan": {
      const p = MakePlanInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      if (s.planSent) return { content: "A plan is already showing. Continue the investigation." };
      sendPlan(s, p.data.steps);
      return { content: "Plan shown. Now investigate." };
    }

    case "record_evidence": {
      const p = RecordEvidenceToolInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      ensurePlan(s);
      let id = p.data.stepId;
      if (!id || !/^s\d+$|^video$/.test(id)) {
        id = MESSAGE_STEP_ID;
        if (!s.openSteps.has(MESSAGE_STEP_ID) && !s.evidence.some((e) => e.id === MESSAGE_STEP_ID)) {
          startStep(s, label(lang, "readMessage"), undefined, MESSAGE_STEP_ID);
        }
      }
      s.evidence.push({ id, finding: p.data.finding, severity: p.data.severity });
      s.send({ type: "evidence", id, finding: p.data.finding, severity: p.data.severity });
      return { content: "Recorded." };
    }

    case "expand_link": {
      const p = UrlInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const id = startStep(s, label(lang, "expand"), name);
      const r = await investigate.expandLink(p.data.url);
      finishStep(s, id, !r.error, r.error ? label(lang, "expandFail") : label(lang, "expandOk", hostOf(r.finalUrl)));
      return { content: JSON.stringify({ stepId: id, ...r }) };
    }

    case "domain_age": {
      const p = DomainInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const host = hostOf(p.data.domain);
      const id = startStep(s, label(lang, "age", host), name);
      const r = await investigate.domainAge(host);
      const ok = !r.error && r.ageDays !== null;
      finishStep(s, id, ok, ok ? label(lang, "ageOk", r.ageDays as number) : label(lang, "ageFail"));
      return { content: JSON.stringify({ stepId: id, ...r }) };
    }

    case "lookalike_check": {
      const p = DomainInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const host = hostOf(p.data.domain);
      const id = startStep(s, label(lang, "lookalike", host), name);
      const r = await investigate.lookalikeCheck(host);
      finishStep(s, id, true, r.impersonates ? label(lang, "lookalikeHit", r.impersonates) : label(lang, "lookalikeMiss"));
      return { content: JSON.stringify({ stepId: id, ...r }) };
    }

    case "check_reputation": {
      const p = UrlInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const id = startStep(s, label(lang, "reputation"), name);
      const r = await investigate.checkReputation(p.data.url);
      finishStep(
        s,
        id,
        !r.error,
        r.listedAsMalicious ? label(lang, "reputationHit") : r.error ? label(lang, "reputationFail") : label(lang, "reputationClean"),
      );
      return { content: JSON.stringify({ stepId: id, ...r }) };
    }

    case "alert_family": {
      const p = AlertFamilyInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const contact = s.request.familyContact;
      if (!contact) {
        return { isError: true, content: "No family contact was provided, so no alert can be sent. Continue without it." };
      }
      if (s.familyAlertEvent) return { content: "The family alert was already sent." };
      const alert: FamilyAlert = {
        contactName: contact.name,
        summary: p.data.summary,
        riskLevel: p.data.riskLevel,
        moneyInvolved: p.data.moneyInvolved,
        suggestedAction: p.data.suggestedAction,
        createdAt: new Date().toISOString(),
      };
      let result;
      try {
        result = await investigate.sendFamilyAlert(contact, alert);
      } catch {
        result = { delivered: false, channel: "screen" as const, error: "Sending failed." };
      }
      s.familyAlertEvent = { type: "family_alert", alert, result };
      // Contact details stay on our server; Claude only learns if it worked.
      return { content: JSON.stringify({ delivered: result.delivered, channel: result.channel, error: result.error }) };
    }

    case "damage_control": {
      const p = DamageControlInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const steps = [...p.data.plan.steps].sort((a, b) => Number(b.urgent) - Number(a.urgent));
      // Only keep reports with a real web address, so the screen never shows a broken link.
      const report = p.data.plan.report.filter((r) => /^https:\/\/[^\s[\]]+\.[^\s[\]]+$/.test(r.url));
      s.damageControlEvent = { type: "damage_control", plan: { steps, report } };
      return { content: "Damage control plan saved. It will be shown with the verdict." };
    }

    case "verify_verdict": {
      const p = VerdictInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      const problems = checkVerdict(s, p.data.verdict);
      return { content: JSON.stringify({ ok: problems.length === 0, problems }) };
    }

    case "give_verdict": {
      const p = VerdictInput.safeParse(input);
      if (!p.success) return invalidInput(p.error, input);
      if (s.verdict) return { content: "The verdict was already given. Stop now." };
      const problems = checkVerdict(s, p.data.verdict);
      if (problems.length > 0 && s.verdictRejections < MAX_VERDICT_REJECTIONS) {
        s.verdictRejections++;
        return { isError: true, content: JSON.stringify({ accepted: false, problems }) };
      }
      s.verdict = p.data.verdict;
      return { content: "Verdict delivered to the person. You are done." };
    }

    default:
      return { isError: true, content: `Unknown tool "${name}".` };
  }
}

/** Send the verdict and the actions that wait for it, in contract order. */
export function deliverVerdict(s: AgentSession) {
  if (!s.verdict) return;
  closeOpenSteps(s);
  s.send({ type: "verdict", verdict: s.verdict });
  if (s.familyAlertEvent) s.send(s.familyAlertEvent);
  if (s.damageControlEvent) s.send(s.damageControlEvent);
}
