// lib/agent/fake-investigate.ts  (Person 1)
//
// TEMPORARY stand-ins for Person 2's tools, so the brain works before the
// real tools exist. They follow the contract types exactly and are honest:
// when a fake can't really check something, it says so in `error`, so the
// agent never treats a fake result as proof.
//
// When Person 2 finishes lib/investigate/, change ONE line in
// lib/agent/investigate.ts (see the comment there). Nothing else changes.

import type {
  AnalyzeVideo,
  CheckReputation,
  DomainAge,
  ExpandLink,
  FamilyAlert,
  LookalikeCheck,
  SendFamilyAlert,
} from "@/lib/contract";

const NOT_READY = "This check is not built yet (Person 2). Do not count it as evidence.";

export const expandLink: ExpandLink = async (url) => ({
  inputUrl: url,
  finalUrl: url,
  hops: [],
  error: NOT_READY,
});

// Real lookup against the public RDAP service (fixed, trusted host only).
// Uses the last two labels of the domain, which is good enough until Person 2
// adds proper public-suffix handling.
export const domainAge: DomainAge = async (domain) => {
  const clean = domain.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
  const registrable = clean.split(".").slice(-2).join(".");
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/rdap+json" },
    });
    if (res.status === 404) {
      return { domain: registrable, createdAt: null, ageDays: null, isNew: false, error: "Domain not found in the registry (it may not exist)." };
    }
    if (!res.ok) {
      return { domain: registrable, createdAt: null, ageDays: null, isNew: false, error: `Registry lookup failed (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
      entities?: { roles?: string[]; vcardArray?: [string, [string, object, string, string][]] }[];
    };
    const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate ?? null;
    const registrar = data.entities
      ?.find((e) => e.roles?.includes("registrar"))
      ?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
    if (!reg) {
      return { domain: registrable, createdAt: null, ageDays: null, registrar, isNew: false, error: "Registry did not share a creation date." };
    }
    const ageDays = Math.floor((Date.now() - new Date(reg).getTime()) / 86_400_000);
    return { domain: registrable, createdAt: reg, ageDays, registrar, isNew: ageDays < 30 };
  } catch {
    return { domain: registrable, createdAt: null, ageDays: null, isNew: false, error: "Registry lookup timed out." };
  }
};

const BRANDS: Record<string, string> = {
  usps: "usps.com", ups: "ups.com", fedex: "fedex.com", dhl: "dhl.com",
  amazon: "amazon.com", paypal: "paypal.com", apple: "apple.com",
  microsoft: "microsoft.com", google: "google.com", netflix: "netflix.com",
  chase: "chase.com", bankofamerica: "bankofamerica.com", wellsfargo: "wellsfargo.com",
  citi: "citi.com", capitalone: "capitalone.com", irs: "irs.gov", ssa: "ssa.gov",
  medicare: "medicare.gov", venmo: "venmo.com", zelle: "zellepay.com",
  cashapp: "cash.app", coinbase: "coinbase.com", walmart: "walmart.com",
  costco: "costco.com", verizon: "verizon.com", tmobile: "t-mobile.com",
};

// Simple stand-in: only catches "brand name inside a longer domain".
export const lookalikeCheck: LookalikeCheck = async (domain) => {
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const registrable = host.split(".").slice(-2).join(".");
  for (const real of Object.values(BRANDS)) {
    if (registrable === real || host.endsWith(`.${real}`)) {
      return { domain: host, impersonates: null, similarity: 0 };
    }
  }
  const flat = host.replace(/[^a-z0-9]/g, "");
  for (const [brand, real] of Object.entries(BRANDS)) {
    if (brand.length >= 4 && flat.includes(brand)) {
      return { domain: host, impersonates: real, similarity: 0.8, technique: "extra_words" };
    }
  }
  return { domain: host, impersonates: null, similarity: 0 };
};

export const checkReputation: CheckReputation = async (url) => ({
  url,
  listedAsMalicious: false,
  sources: [],
  error: NOT_READY,
});

export const analyzeVideo: AnalyzeVideo = async () => ({
  credentials: { found: false, error: NOT_READY },
  metadata: { clues: [], hasCameraInfo: false, error: NOT_READY },
  detector: null,
});

// Stores alerts in memory so a /family screen can show them later.
export const savedAlerts: FamilyAlert[] = [];

export const sendFamilyAlert: SendFamilyAlert = async (_contact, alert) => {
  savedAlerts.unshift(alert);
  return { delivered: true, channel: "screen" };
};
