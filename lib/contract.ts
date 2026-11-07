// lib/contract.ts
// SHARED CONTRACT - the shapes every part of ScamShield agrees on.
// Do NOT change this file on your own. Ask the team in chat first.

// ---------- Request to the agent ----------
export type Language =
  | "en" | "es" | "fr" | "pt" | "zh" | "hi" | "ar" | "vi" | "ko" | "tl";

export interface AgentRequest {
  text?: string;                 // pasted message text
  images?: InputImage[];         // screenshots (max 4)
  video?: VideoInput;
  language: Language;
  alreadyActed?: boolean;        // user already paid / replied / shared
  actionDetails?: string;        // e.g. "I sent one $500 gift card"
  familyContact?: FamilyContact;
  demo?: boolean;                // replay recorded events, no API calls
}

export interface InputImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;                // no "data:" prefix
}

export interface VideoInput {
  blobUrl: string;               // Vercel Blob URL of the original video
  frames: InputImage[];          // 8-12 JPEG frames, max 768px wide
  frameTimes: number[];          // seconds, same order as frames
  durationSec: number;
  fileName: string;
}

export interface FamilyContact {
  name: string;
  phone?: string;                // E.164, e.g. +15551234567
  email?: string;
}

// ---------- Investigation tools (P2 implements, P1 calls) ----------
export interface ExpandLinkResult {
  inputUrl: string;
  finalUrl: string;
  hops: { url: string; status: number }[];
  error?: string;
}
export type ExpandLink = (url: string) => Promise<ExpandLinkResult>;

export interface DomainAgeResult {
  domain: string;
  createdAt: string | null;      // ISO date
  ageDays: number | null;
  registrar?: string;
  isNew: boolean;                // ageDays < 30
  error?: string;
}
export type DomainAge = (domain: string) => Promise<DomainAgeResult>;

export interface LookalikeResult {
  domain: string;
  impersonates: string | null;   // e.g. "usps.com"
  similarity: number;            // 0-1
  technique?: "typo" | "extra_words" | "char_swap" | "subdomain_trick"
            | "tld_swap";
}
export type LookalikeCheck = (domain: string) => Promise<LookalikeResult>;

export interface ReputationResult {
  url: string;
  listedAsMalicious: boolean;
  sources: { name: string; verdict: string }[];
  error?: string;
}
export type CheckReputation = (url: string) => Promise<ReputationResult>;

export interface VideoReport {
  credentials: {
    found: boolean;
    generator?: string;          // from the C2PA manifest
    claims?: string[];
    error?: string;
  };
  metadata: {
    clues: string[];             // plain-English clues from ffprobe
    encoder?: string;
    creationTool?: string;
    hasCameraInfo: boolean;
    error?: string;
  };
  detector: {
    provider: string;
    aiProbability: number;       // 0-1
    error?: string;
  } | null;                      // null = no detector configured
}
export type AnalyzeVideo = (blobUrl: string) => Promise<VideoReport>;

export interface FamilyAlertResult {
  delivered: boolean;
  channel: "sms" | "email" | "screen";
  error?: string;
}
export type SendFamilyAlert = (
  contact: FamilyContact,
  alert: FamilyAlert,
) => Promise<FamilyAlertResult>;

// ---------- Verdict ----------
export type VerdictLevel = "scam" | "suspicious" | "safe";
export type AiMediaLevel = "likely_ai" | "unclear" | "likely_real";
export type ScamType =
  | "grandparent" | "delivery" | "bank_impersonation" | "romance"
  | "tech_support" | "government_impersonation" | "prize_lottery"
  | "investment_crypto" | "celebrity_deepfake" | "phishing_other"
  | "none" | "unknown";

export interface Verdict {
  level: VerdictLevel;
  confidence: number;            // 0-1
  headline: string;              // one short sentence, user's language
  reasons: string[];             // 2-3 plain-language reasons
  nextSteps: string[];
  scamType: ScamType;
  officialContact?: { org: string; phone?: string; url?: string };
  aiMedia?: {
    level: AiMediaLevel;
    signals: string[];
    flaggedFrames: { index: number; note: string }[];
  };
}

export interface FamilyAlert {
  contactName: string;
  summary: string;
  riskLevel: VerdictLevel;
  moneyInvolved: boolean;
  suggestedAction: string;       // e.g. "Call Rosa now"
  createdAt: string;             // ISO
}

export interface DamageControlPlan {
  steps: { title: string; detail: string; urgent: boolean }[];
  report: {
    agency: "FTC" | "IC3" | "local_police" | "bank" | "gift_card_company";
    url: string;
    prefilledText: string;
  }[];
}

// ---------- Live events: server -> browser ----------
// Server-Sent Events. Each event:  data: <JSON AgentEvent>\n\n
// Order: plan -> (step_start -> evidence* -> step_done)* -> verdict
//        -> [family_alert] -> [damage_control] -> done
// "text" can appear anywhere. "done" is ALWAYS sent last, even after errors.
export type AgentEvent =
  | { type: "plan"; steps: string[] }
  | { type: "step_start"; id: string; label: string; tool?: string }
  | { type: "step_done"; id: string; ok: boolean; summary: string }
  | { type: "evidence"; id: string; finding: string;
      severity: "red" | "yellow" | "green" | "info" }
  | { type: "text"; delta: string }
  | { type: "verdict"; verdict: Verdict }
  | { type: "family_alert"; alert: FamilyAlert; result: FamilyAlertResult }
  | { type: "damage_control"; plan: DamageControlPlan }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done" };

// API: POST /api/agent  body: AgentRequest  ->  text/event-stream
