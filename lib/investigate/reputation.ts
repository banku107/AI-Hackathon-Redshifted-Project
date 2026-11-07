import { z } from "zod";
import type { CheckReputation, ReputationResult } from "@/lib/contract";
import { readJsonResponse, ResponseTooLargeError } from "@/lib/investigate/readJsonResponse";

const inputSchema = z.string().trim().min(1).max(2048);
const URLHAUS_ENDPOINT = "https://urlhaus-api.abuse.ch/v1/url/";
const SAFE_BROWSING_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const REQUEST_TIMEOUT_MS = 5_000;

const urlhausResponseSchema = z.object({
  query_status: z.string(),
}).passthrough();

const safeBrowsingResponseSchema = z.object({
  matches: z.array(z.object({
    threatType: z.string(),
    platformType: z.string(),
    threatEntryType: z.string(),
  }).passthrough()).optional(),
}).passthrough();

interface SourceCheck {
  name: string;
  malicious: boolean;
  verdict: string;
  error?: string;
}

function parseHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol)
      || !url.hostname
      || url.username
      || url.password
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function checkUrlhaus(url: string): Promise<SourceCheck> {
  const authKey = process.env.URLHAUS_AUTH_KEY?.trim();
  if (!authKey) {
    return {
      name: "URLhaus",
      malicious: false,
      verdict: "unavailable: URLHAUS_AUTH_KEY is not configured",
      error: "URLhaus requires an Auth-Key.",
    };
  }

  try {
    const response = await fetch(URLHAUS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Auth-Key": authKey,
      },
      body: new URLSearchParams({ url }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = `URLhaus returned HTTP ${response.status}.`;
      return { name: "URLhaus", malicious: false, verdict: `unavailable: HTTP ${response.status}`, error };
    }

    let responseBody: unknown;
    try {
      responseBody = await readJsonResponse(response);
    } catch (error) {
      const message = error instanceof ResponseTooLargeError
        ? "URLhaus returned a response that exceeded the 1 MB limit."
        : "URLhaus returned invalid JSON.";
      return {
        name: "URLhaus",
        malicious: false,
        verdict: "unavailable: invalid response",
        error: message,
      };
    }
    const parsed = urlhausResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      return {
        name: "URLhaus",
        malicious: false,
        verdict: "unavailable: invalid response",
        error: "URLhaus returned an invalid response.",
      };
    }

    if (parsed.data.query_status === "ok") {
      return { name: "URLhaus", malicious: true, verdict: "malicious" };
    }
    if (parsed.data.query_status === "no_results") {
      return { name: "URLhaus", malicious: false, verdict: "not listed" };
    }
    return {
      name: "URLhaus",
      malicious: false,
      verdict: `unavailable: ${parsed.data.query_status}`,
      error: "URLhaus could not complete the lookup.",
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    const detail = timeout ? "request timed out" : "request failed";
    return {
      name: "URLhaus",
      malicious: false,
      verdict: `unavailable: ${detail}`,
      error: `URLhaus ${detail}.`,
    };
  }
}

async function checkSafeBrowsing(url: string): Promise<SourceCheck> {
  const apiKey = process.env.SAFE_BROWSING_API_KEY?.trim();
  if (!apiKey) {
    return {
      name: "Google Safe Browsing",
      malicious: false,
      verdict: "unavailable: SAFE_BROWSING_API_KEY is not configured",
      error: "Google Safe Browsing requires an API key.",
    };
  }

  try {
    const endpoint = new URL(SAFE_BROWSING_ENDPOINT);
    endpoint.searchParams.set("key", apiKey);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client: { clientId: "scamshield", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = `Google Safe Browsing returned HTTP ${response.status}.`;
      return {
        name: "Google Safe Browsing",
        malicious: false,
        verdict: `unavailable: HTTP ${response.status}`,
        error,
      };
    }

    let responseBody: unknown;
    try {
      responseBody = await readJsonResponse(response);
    } catch (error) {
      const message = error instanceof ResponseTooLargeError
        ? "Google Safe Browsing returned a response that exceeded the 1 MB limit."
        : "Google Safe Browsing returned invalid JSON.";
      return {
        name: "Google Safe Browsing",
        malicious: false,
        verdict: "unavailable: invalid response",
        error: message,
      };
    }
    const parsed = safeBrowsingResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      return {
        name: "Google Safe Browsing",
        malicious: false,
        verdict: "unavailable: invalid response",
        error: "Google Safe Browsing returned an invalid response.",
      };
    }
    if (parsed.data.matches && parsed.data.matches.length > 0) {
      return { name: "Google Safe Browsing", malicious: true, verdict: "malicious" };
    }
    return { name: "Google Safe Browsing", malicious: false, verdict: "not listed" };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    const detail = timeout ? "request timed out" : "request failed";
    return {
      name: "Google Safe Browsing",
      malicious: false,
      verdict: `unavailable: ${detail}`,
      error: `Google Safe Browsing ${detail}.`,
    };
  }
}

export const checkReputation: CheckReputation = async (input) => {
  const original = typeof input === "string" ? input : "";
  const invalidResult: ReputationResult = {
    url: original,
    listedAsMalicious: false,
    sources: [],
    error: "Enter a valid HTTP or HTTPS URL.",
  };
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) return invalidResult;

  const url = parseHttpUrl(parsedInput.data);
  if (!url) return invalidResult;

  const results = await Promise.all([
    checkUrlhaus(url),
    checkSafeBrowsing(url),
  ]);
  const unavailable = results.filter((result) => result.error);
  return {
    url: original,
    listedAsMalicious: results.some((result) => result.malicious),
    sources: results.map(({ name, verdict }) => ({ name, verdict })),
    ...(unavailable.length > 0
      ? { error: unavailable.map((result) => result.error).join(" ") }
      : {}),
  };
};
