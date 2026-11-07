import { parse as parseDomain } from "tldts";
import { z } from "zod";
import type { DomainAge, DomainAgeResult } from "@/lib/contract";
import { readJsonResponse, ResponseTooLargeError } from "@/lib/investigate/readJsonResponse";

const inputSchema = z.string().trim().min(1).max(2048);
const rdapSchema = z.object({
  events: z.array(z.object({
    eventAction: z.string().optional(),
    eventDate: z.string().optional(),
  }).passthrough()).optional(),
  entities: z.array(z.object({
    roles: z.array(z.string()).optional(),
    vcardArray: z.tuple([z.string(), z.array(z.array(z.unknown()))]).optional(),
  }).passthrough()).optional(),
}).passthrough();

const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 5_000;
const cache = new Map<string, { result: DomainAgeResult; expiresAt: number }>();

function invalidResult(domain: string, error: string): DomainAgeResult {
  return { domain, createdAt: null, ageDays: null, isNew: false, error };
}

function getRegistrableDomain(value: string): string | null {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const labels = hostname.split(".");
  if (
    hostname.length > 253
    || labels.some((label) => label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
  ) return null;
  const parsed = parseDomain(hostname);
  if (parsed.isIp || !parsed.domain) return null;
  return parsed.domain.toLowerCase();
}

function extractRegistrar(entities: z.infer<typeof rdapSchema>["entities"]): string | undefined {
  const registrar = entities?.find((entity) =>
    entity.roles?.some((role) => role.toLowerCase() === "registrar"),
  );
  const vcard = registrar?.vcardArray?.[1];
  const field = vcard?.find((item) => item[0] === "fn" || item[0] === "org");
  const value = field?.[3];
  if (typeof value !== "string") return undefined;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return name || undefined;
}

function cacheResult(key: string, result: DomainAgeResult): void {
  const ttl = result.error ? FAILURE_CACHE_TTL_MS : SUCCESS_CACHE_TTL_MS;
  cache.set(key, { result, expiresAt: Date.now() + ttl });

  for (const [cachedKey, entry] of cache) {
    if (entry.expiresAt <= Date.now()) cache.delete(cachedKey);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export const domainAge: DomainAge = async (input) => {
  const raw = typeof input === "string" ? input.trim() : "";
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) return invalidResult(raw, "Enter a valid domain name.");

  const registrableDomain = getRegistrableDomain(parsedInput.data);
  if (!registrableDomain) return invalidResult(parsedInput.data.toLowerCase(), "The input is not a valid registrable domain.");

  const cached = cache.get(registrableDomain);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.result };
  if (cached) cache.delete(registrableDomain);

  try {
    const response = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`,
      {
        headers: {
          Accept: "application/rdap+json",
          "User-Agent": "ScamShield/1.0",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const result = invalidResult(
        registrableDomain,
        response.status === 404
          ? "The domain has no RDAP registration record."
          : `RDAP lookup failed (HTTP ${response.status}).`,
      );
      cacheResult(registrableDomain, result);
      return { ...result };
    }

    let responseBody: unknown;
    try {
      responseBody = await readJsonResponse(response);
    } catch (error) {
      const message = error instanceof ResponseTooLargeError
        ? "RDAP response exceeded the 1 MB limit."
        : "RDAP returned invalid JSON.";
      const result = invalidResult(registrableDomain, message);
      cacheResult(registrableDomain, result);
      return { ...result };
    }

    const parsedResponse = rdapSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      const result = invalidResult(registrableDomain, "RDAP returned an invalid response.");
      cacheResult(registrableDomain, result);
      return { ...result };
    }

    const registration = parsedResponse.data.events?.find((event) =>
      ["registration", "registered"].includes(event.eventAction?.toLowerCase() ?? ""),
    )?.eventDate;
    const timestamp = registration ? Date.parse(registration) : Number.NaN;
    if (!registration || !Number.isFinite(timestamp) || timestamp > Date.now()) {
      const result = invalidResult(registrableDomain, "RDAP did not provide a valid registration date.");
      cacheResult(registrableDomain, result);
      return { ...result, registrar: extractRegistrar(parsedResponse.data.entities) };
    }

    const ageDays = Math.floor((Date.now() - timestamp) / 86_400_000);
    const result: DomainAgeResult = {
      domain: registrableDomain,
      createdAt: new Date(timestamp).toISOString(),
      ageDays,
      registrar: extractRegistrar(parsedResponse.data.entities),
      isNew: ageDays < 30,
    };
    cacheResult(registrableDomain, result);
    return { ...result };
  } catch (error) {
    const result = invalidResult(
      registrableDomain,
      error instanceof Error && error.name === "TimeoutError"
        ? "RDAP lookup timed out."
        : "RDAP lookup is unavailable.",
    );
    cacheResult(registrableDomain, result);
    return { ...result };
  }
};
