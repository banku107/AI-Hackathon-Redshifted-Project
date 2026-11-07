// lib/agent/schemas.ts  (Person 1)
// Zod versions of the contract types. Used to validate the incoming request
// and every tool input Claude sends, and to build the tools' JSON schemas.
// They must stay in sync with lib/contract.ts (the type checks at the bottom
// fail the build if they drift).

import { z } from "zod";
import type {
  AgentEvent,
  AgentRequest,
  DamageControlPlan,
  Verdict,
} from "@/lib/contract";

export const LanguageSchema = z.enum([
  "en", "es", "fr", "pt", "zh", "hi", "ar", "vi", "ko", "tl",
]);

const InputImageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z
    .string()
    .min(1)
    .refine((s) => !s.startsWith("data:"), "base64 must not include a data: prefix"),
});

export const AgentRequestSchema = z
  .object({
    text: z.string().max(20000).optional(),
    images: z.array(InputImageSchema).max(4).optional(),
    video: z
      .object({
        // Only a safe file name, so a request can never point at another file.
        videoId: z.string().regex(/^[A-Za-z0-9_-]{1,100}\.(mp4|mov|webm)$/),
        frames: z.array(InputImageSchema).min(1).max(12),
        frameTimes: z.array(z.number().nonnegative()),
        durationSec: z.number().positive(),
        fileName: z.string().max(300),
      })
      .optional(),
    language: LanguageSchema,
    alreadyActed: z.boolean().optional(),
    actionDetails: z.string().max(2000).optional(),
    familyContact: z
      .object({
        name: z.string().min(1).max(100),
        phone: z.string().max(30).optional(),
        email: z.string().email().optional(),
      })
      .optional(),
    demo: z.boolean().optional(),
  })
  .refine(
    (r) => r.demo || Boolean(r.text?.trim()) || (r.images?.length ?? 0) > 0 || Boolean(r.video),
    "Send a message text, a screenshot, or a video to check.",
  );

export const VerdictSchema = z.object({
  level: z.enum(["scam", "suspicious", "safe"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().min(1).max(200),
  reasons: z.array(z.string().min(1)).min(1).max(4),
  nextSteps: z.array(z.string().min(1)).min(1).max(5),
  scamType: z.enum([
    "grandparent", "delivery", "bank_impersonation", "romance",
    "tech_support", "government_impersonation", "prize_lottery",
    "investment_crypto", "celebrity_deepfake", "phishing_other",
    "none", "unknown",
  ]),
  officialContact: z
    .object({
      org: z.string().min(1),
      phone: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  aiMedia: z
    .object({
      level: z.enum(["likely_ai", "unclear", "likely_real"]),
      signals: z.array(z.string()),
      flaggedFrames: z.array(z.object({ index: z.number().int().nonnegative(), note: z.string() })),
    })
    .optional(),
});

export const DamageControlPlanSchema = z.object({
  steps: z
    .array(z.object({ title: z.string().min(1), detail: z.string().min(1), urgent: z.boolean() }))
    .min(1)
    .max(10),
  report: z
    .array(
      z.object({
        agency: z.enum(["FTC", "IC3", "local_police", "bank", "gift_card_company"]),
        url: z.string(),
        prefilledText: z.string().min(1),
      }),
    )
    .max(5),
});

// ---- Tool input schemas ----
export const MakePlanInput = z.object({
  steps: z.array(z.string().min(1).max(120)).min(2).max(6),
});

export const RecordEvidenceInput = z.object({
  finding: z.string().min(1).max(300),
  severity: z.enum(["red", "yellow", "green", "info"]),
});

export const VerdictInput = z.object({ verdict: VerdictSchema });

export const AlertFamilyInput = z.object({
  summary: z.string().min(1).max(500),
  riskLevel: z.enum(["scam", "suspicious", "safe"]),
  moneyInvolved: z.boolean(),
  suggestedAction: z.string().min(1).max(200),
});

export const DamageControlInput = z.object({ plan: DamageControlPlanSchema });

export const UrlInput = z.object({ url: z.string().min(3).max(2000) });
export const DomainInput = z.object({ domain: z.string().min(3).max(253) });

// ---- Live events (used to check mock and recorded event files) ----
const FamilyAlertSchema = z.object({
  contactName: z.string(),
  summary: z.string(),
  riskLevel: z.enum(["scam", "suspicious", "safe"]),
  moneyInvolved: z.boolean(),
  suggestedAction: z.string(),
  createdAt: z.string(),
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), steps: z.array(z.string()) }),
  z.object({ type: z.literal("step_start"), id: z.string(), label: z.string(), tool: z.string().optional() }),
  z.object({ type: z.literal("step_done"), id: z.string(), ok: z.boolean(), summary: z.string() }),
  z.object({
    type: z.literal("evidence"),
    id: z.string(),
    finding: z.string(),
    severity: z.enum(["red", "yellow", "green", "info"]),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("verdict"), verdict: VerdictSchema }),
  z.object({
    type: z.literal("family_alert"),
    alert: FamilyAlertSchema,
    result: z.object({
      delivered: z.boolean(),
      channel: z.enum(["sms", "email", "screen"]),
      error: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal("damage_control"), plan: DamageControlPlanSchema }),
  z.object({ type: z.literal("error"), message: z.string(), recoverable: z.boolean() }),
  z.object({ type: z.literal("done") }),
]);

// ---- Compile-time checks: schemas must produce the contract types ----
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _VerdictMatches = Assert<Same<z.infer<typeof VerdictSchema>, Verdict>>;
export type _PlanMatches = Assert<Same<z.infer<typeof DamageControlPlanSchema>, DamageControlPlan>>;
export type _RequestMatches = Assert<Same<z.infer<typeof AgentRequestSchema>, AgentRequest>>;
export type _EventMatches = Assert<Same<z.infer<typeof AgentEventSchema>, AgentEvent>>;
