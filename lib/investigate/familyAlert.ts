import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  FamilyAlert,
  FamilyAlertResult,
  FamilyContact,
  SendFamilyAlert,
} from "@/lib/contract";
import { readJsonResponse, ResponseTooLargeError } from "@/lib/investigate/readJsonResponse";

const SMS_ENDPOINT_BASE = "https://api.twilio.com/2010-04-01/Accounts";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_STORED_ALERTS = 500;
const DEDUP_TTL_MS = 10 * 60 * 1000;
const MAX_DEDUP_ENTRIES = 500;
const E164_SCHEMA = z.string().regex(/^\+[1-9]\d{7,14}$/);
const emailSchema = z.string().email().max(254);
const twilioAccountSidSchema = z.string().regex(/^AC[0-9a-f]{32}$/i);
const twilioResponseSchema = z.object({
  sid: z.string().min(1),
  status: z.string().optional(),
});
const resendResponseSchema = z.object({ id: z.string().min(1) });
const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(254).optional(),
});
const alertSchema = z.object({
  contactName: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(1).max(1000),
  riskLevel: z.enum(["scam", "suspicious", "safe"]),
  moneyInvolved: z.boolean(),
  suggestedAction: z.string().trim().min(1).max(500),
  createdAt: z.string().datetime(),
});

export interface FamilyAlertStore {
  save(alert: FamilyAlert): Promise<void>;
  list(): Promise<FamilyAlert[]>;
}

class InMemoryFamilyAlertStore implements FamilyAlertStore {
  private readonly alerts: FamilyAlert[] = [];

  async save(alert: FamilyAlert): Promise<void> {
    const serialized = JSON.stringify(alert);
    const existing = this.alerts.findIndex((entry) => JSON.stringify(entry) === serialized);
    if (existing >= 0) this.alerts.splice(existing, 1);
    this.alerts.unshift({ ...alert });
    if (this.alerts.length > MAX_STORED_ALERTS) this.alerts.length = MAX_STORED_ALERTS;
  }

  async list(): Promise<FamilyAlert[]> {
    return this.alerts.map((alert) => ({ ...alert }));
  }
}

let alertStore: FamilyAlertStore = new InMemoryFamilyAlertStore();
const acceptedNotifications = new Map<string, { result: FamilyAlertResult; expiresAt: number }>();
const inFlightNotifications = new Map<string, Promise<FamilyAlertResult>>();

export function configureFamilyAlertStore(store: FamilyAlertStore): void {
  alertStore = store;
  acceptedNotifications.clear();
}

export async function getFamilyAlerts(): Promise<FamilyAlert[]> {
  const alerts = await alertStore.list();
  return alerts
    .map((alert) => ({ ...alert }))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function notificationKey(contact: FamilyContact, alert: FamilyAlert): string {
  return createHash("sha256").update(JSON.stringify([
    contact.phone ?? "",
    contact.email?.toLowerCase() ?? "",
    alert.contactName,
    alert.summary,
    alert.riskLevel,
    alert.moneyInvolved,
    alert.suggestedAction,
  ])).digest("hex");
}

function rememberAcceptedNotification(key: string, result: FamilyAlertResult): void {
  const now = Date.now();
  for (const [cachedKey, cached] of acceptedNotifications) {
    if (cached.expiresAt <= now) acceptedNotifications.delete(cachedKey);
  }
  while (acceptedNotifications.size >= MAX_DEDUP_ENTRIES) {
    const oldestKey = acceptedNotifications.keys().next().value;
    if (oldestKey === undefined) break;
    acceptedNotifications.delete(oldestKey);
  }
  acceptedNotifications.set(key, { result, expiresAt: now + DEDUP_TTL_MS });
}

function smsBody(alert: FamilyAlert): string {
  const severity = alert.riskLevel === "scam"
    ? "high"
    : alert.riskLevel === "suspicious"
      ? "suspicious"
      : "low";
  const money = alert.moneyInvolved ? " Money may be involved." : "";
  return `ScamShield alert: A ${severity}-risk situation needs your attention.${money} Please contact your family member using a trusted number.`;
}

function sanitizeContent(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[contact omitted]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number omitted]")
    .replace(
      /\b(?:ssn|social security number|account number|card number|routing number|password|passcode|pin|verification code|one[- ]time code)\b\s*[:=]\s*\S+/gi,
      "[sensitive detail omitted]",
    )
    .replace(/\b\d{8,}\b/g, "[number omitted]")
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailContent(alert: FamilyAlert): { subject: string; text: string; html: string } {
  const summary = sanitizeContent(alert.summary, 500) || "No additional explanation was provided.";
  const action = sanitizeContent(alert.suggestedAction, 300) || "Contact your family member using a trusted number.";
  const severity = alert.riskLevel.toUpperCase();
  const money = alert.moneyInvolved ? "Yes" : "No";
  const timestamp = new Date(alert.createdAt).toISOString();
  const subject = `ScamShield ${alert.riskLevel} risk alert`;
  const text = [
    "ScamShield family alert",
    `Severity: ${severity}`,
    `Summary: ${summary}`,
    `Money involved: ${money}`,
    `Suggested action: ${action}`,
    `Time: ${timestamp}`,
    "",
    "ScamShield will never ask you to send money or share a verification code.",
  ].join("\n");
  const html = [
    "<div style=\"font-family:Arial,sans-serif;max-width:600px;color:#172033;line-height:1.5\">",
    "<h1 style=\"color:#174c8c\">ScamShield family alert</h1>",
    `<p><strong>Severity:</strong> ${escapeHtml(severity)}</p>`,
    `<p><strong>Summary:</strong> ${escapeHtml(summary)}</p>`,
    `<p><strong>Money involved:</strong> ${money}</p>`,
    `<p><strong>Suggested action:</strong> ${escapeHtml(action)}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(timestamp)}</p>`,
    "<hr><p>ScamShield will never ask you to send money or share a verification code.</p>",
    "</div>",
  ].join("");
  return { subject, text, html };
}

async function sendSms(contact: FamilyContact, alert: FamilyAlert): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = (process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER)?.trim();
  if (!accountSid || !authToken || !from) return "SMS is not configured.";
  if (
    !twilioAccountSidSchema.safeParse(accountSid).success
    || !E164_SCHEMA.safeParse(from).success
    || !contact.phone
    || !E164_SCHEMA.safeParse(contact.phone).success
  ) {
    return "The SMS configuration or recipient number is invalid.";
  }

  const body = smsBody(alert);
  if (body.length > 300) return "The SMS alert exceeds the message length limit.";
  try {
    const response = await fetch(`${SMS_ENDPOINT_BASE}/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ To: contact.phone, From: from, Body: body }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return `SMS provider returned HTTP ${response.status}.`;

    let responseBody: unknown;
    try {
      responseBody = await readJsonResponse(response);
    } catch (error) {
      return error instanceof ResponseTooLargeError
        ? "SMS provider returned an oversized response."
        : "SMS provider returned invalid JSON.";
    }
    const parsed = twilioResponseSchema.safeParse(responseBody);
    if (!parsed.success || ["failed", "undelivered", "canceled"].includes(parsed.data.status?.toLowerCase() ?? "")) {
      return "SMS provider did not confirm acceptance.";
    }
    return null;
  } catch {
    return "SMS provider request failed or timed out.";
  }
}

async function sendEmail(contact: FamilyContact, alert: FamilyAlert, key: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return "Email is not configured.";
  if (!contact.email || !emailSchema.safeParse(contact.email).success) {
    return "The email recipient address is invalid.";
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from,
        to: [contact.email],
        ...emailContent(alert),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return `Email provider returned HTTP ${response.status}.`;
    let responseBody: unknown;
    try {
      responseBody = await readJsonResponse(response);
    } catch (error) {
      return error instanceof ResponseTooLargeError
        ? "Email provider returned an oversized response."
        : "Email provider returned invalid JSON.";
    }
    const parsed = resendResponseSchema.safeParse(responseBody);
    return parsed.success ? null : "Email provider did not confirm acceptance.";
  } catch {
    return "Email provider request failed or timed out.";
  }
}

async function deliverNotifications(
  contact: FamilyContact,
  alert: FamilyAlert,
  key: string,
): Promise<FamilyAlertResult> {
  const errors: string[] = [];
  if (contact.phone) {
    const smsError = await sendSms(contact, alert);
    if (!smsError) {
      const result: FamilyAlertResult = { delivered: true, channel: "sms" };
      rememberAcceptedNotification(key, result);
      return result;
    }
    errors.push(smsError);
  }

  if (contact.email) {
    const emailError = await sendEmail(contact, alert, key);
    if (!emailError) {
      const result: FamilyAlertResult = { delivered: true, channel: "email" };
      rememberAcceptedNotification(key, result);
      return result;
    }
    errors.push(emailError);
  }

  return {
    delivered: true,
    channel: "screen",
    error: `${errors.join(" ")}${errors.length ? " " : "No valid phone or email contact was provided. "}Alert is saved for the family screen.`,
  };
}

export const sendFamilyAlert: SendFamilyAlert = async (contact, alert) => {
  const parsedAlert = alertSchema.safeParse(alert);
  if (!parsedAlert.success) {
    return { delivered: false, channel: "screen", error: "Alert data is invalid and could not be saved." };
  }

  try {
    await alertStore.save(parsedAlert.data);
  } catch {
    return { delivered: false, channel: "screen", error: "The alert could not be saved for the family screen." };
  }

  const parsedContact = contactSchema.safeParse(contact);
  if (!parsedContact.success) {
    return { delivered: true, channel: "screen", error: "The alert is saved, but the contact details are invalid." };
  }

  try {
    const key = notificationKey(parsedContact.data, parsedAlert.data);
    const cached = acceptedNotifications.get(key);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.result };
    if (cached) acceptedNotifications.delete(key);

    const pending = inFlightNotifications.get(key);
    if (pending) return { ...(await pending) };

    const delivery = deliverNotifications(parsedContact.data, parsedAlert.data, key);
    inFlightNotifications.set(key, delivery);
    try {
      return await delivery;
    } finally {
      if (inFlightNotifications.get(key) === delivery) inFlightNotifications.delete(key);
    }
  } catch {
    return {
      delivered: true,
      channel: "screen",
      error: "The alert is saved for the family screen, but notifications could not be sent.",
    };
  }
};
