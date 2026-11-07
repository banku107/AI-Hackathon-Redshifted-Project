import { domainToUnicode } from "node:url";
import { parse as parseDomain } from "tldts";
import { z } from "zod";
import type { LookalikeCheck, LookalikeResult } from "@/lib/contract";

interface Brand {
  domain: string;
  names: string[];
  validDomains?: string[];
}

const BRANDS: Brand[] = [
  { domain: "usps.com", names: ["usps"] },
  { domain: "ups.com", names: ["ups"] },
  { domain: "fedex.com", names: ["fedex"] },
  { domain: "dhl.com", names: ["dhl"] },
  { domain: "amazon.com", names: ["amazon"], validDomains: ["amazon.co.uk", "amazon.ca", "amazon.de", "amazon.fr", "amazon.co.jp", "amazon.com.au"] },
  { domain: "paypal.com", names: ["paypal"], validDomains: ["paypal.co.uk", "paypal.ca", "paypal.de", "paypal.fr", "paypal.com.au"] },
  { domain: "apple.com", names: ["apple", "icloud"], validDomains: ["icloud.com"] },
  { domain: "microsoft.com", names: ["microsoft", "outlook", "office365"], validDomains: ["outlook.com", "live.com", "office.com"] },
  { domain: "google.com", names: ["google", "gmail"], validDomains: ["gmail.com", "google.co.uk", "google.ca", "google.com.au", "google.de", "google.fr"] },
  { domain: "netflix.com", names: ["netflix"] },
  { domain: "chase.com", names: ["chase"] },
  { domain: "bankofamerica.com", names: ["bankofamerica"] },
  { domain: "wellsfargo.com", names: ["wellsfargo"] },
  { domain: "citi.com", names: ["citi"] },
  { domain: "capitalone.com", names: ["capitalone"] },
  { domain: "irs.gov", names: ["irs"] },
  { domain: "ssa.gov", names: ["ssa", "socialsecurity"] },
  { domain: "medicare.gov", names: ["medicare"] },
  { domain: "venmo.com", names: ["venmo"] },
  { domain: "zellepay.com", names: ["zelle", "zellepay"], validDomains: ["zelle.com"] },
  { domain: "cash.app", names: ["cashapp", "cash"], validDomains: ["cashapp.com"] },
  { domain: "coinbase.com", names: ["coinbase"] },
  { domain: "walmart.com", names: ["walmart"] },
  { domain: "costco.com", names: ["costco"] },
  { domain: "att.com", names: ["att"], validDomains: ["att.net"] },
  { domain: "verizon.com", names: ["verizon"] },
  { domain: "t-mobile.com", names: ["tmobile", "t-mobile"], validDomains: ["tmobile.com"] },
  { domain: "target.com", names: ["target"] },
  { domain: "bestbuy.com", names: ["bestbuy"] },
  { domain: "ebay.com", names: ["ebay"] },
  { domain: "facebook.com", names: ["facebook"], validDomains: ["fb.com"] },
  { domain: "meta.com", names: ["meta"] },
  { domain: "instagram.com", names: ["instagram"] },
  { domain: "tiktok.com", names: ["tiktok"] },
  { domain: "whatsapp.com", names: ["whatsapp"] },
  { domain: "linkedin.com", names: ["linkedin"] },
  { domain: "spotify.com", names: ["spotify"] },
  { domain: "discord.com", names: ["discord"] },
  { domain: "roblox.com", names: ["roblox"] },
  { domain: "steampowered.com", names: ["steam"], validDomains: ["steamcommunity.com", "steamgames.com"] },
  { domain: "nintendo.com", names: ["nintendo"] },
  { domain: "sony.com", names: ["sony"] },
  { domain: "samsung.com", names: ["samsung"] },
  { domain: "adobe.com", names: ["adobe"] },
  { domain: "dropbox.com", names: ["dropbox"] },
  { domain: "yahoo.com", names: ["yahoo"] },
  { domain: "xfinity.com", names: ["xfinity", "comcast"], validDomains: ["comcast.com"] },
  { domain: "geico.com", names: ["geico"] },
  { domain: "progressive.com", names: ["progressive"] },
  { domain: "statefarm.com", names: ["statefarm"] },
  { domain: "allstate.com", names: ["allstate"] },
  { domain: "fidelity.com", names: ["fidelity"] },
  { domain: "schwab.com", names: ["schwab"] },
  { domain: "vanguard.com", names: ["vanguard"] },
  { domain: "robinhood.com", names: ["robinhood"] },
  { domain: "binance.com", names: ["binance"] },
  { domain: "kraken.com", names: ["kraken"] },
  { domain: "stripe.com", names: ["stripe"] },
  { domain: "squareup.com", names: ["square"], validDomains: ["squareup.com"] },
  { domain: "intuit.com", names: ["intuit", "quickbooks"], validDomains: ["quickbooks.com"] },
  { domain: "usbank.com", names: ["usbank"] },
  { domain: "pnc.com", names: ["pnc"] },
  { domain: "td.com", names: ["td", "tdbank"] },
  { domain: "bmo.com", names: ["bmo"] },
  { domain: "truist.com", names: ["truist"] },
  { domain: "airbnb.com", names: ["airbnb"] },
  { domain: "uber.com", names: ["uber"] },
  { domain: "lyft.com", names: ["lyft"] },
  { domain: "doordash.com", names: ["doordash"] },
  { domain: "instacart.com", names: ["instacart"] },
  { domain: "temu.com", names: ["temu"] },
  { domain: "shein.com", names: ["shein"] },
  { domain: "delta.com", names: ["delta"] },
  { domain: "united.com", names: ["united"] },
  { domain: "aa.com", names: ["americanairlines"], validDomains: ["aa.com"] },
  { domain: "americanexpress.com", names: ["americanexpress", "amex"], validDomains: ["amex.com"] },
  { domain: "uscis.gov", names: ["uscis"] },
  { domain: "irs.gov", names: ["taxrefund"] },
];

const inputSchema = z.string().trim().min(1).max(2048);
const riskTerms = new Set([
  "account", "alert", "auth", "bank", "billing", "card", "claim", "customer",
  "delivery", "gift", "help", "invoice", "login", "notice", "package", "payment",
  "pay", "recovery", "redelivery", "refund", "reset", "secure", "security",
  "service", "shipment", "signin", "support", "track", "tracking", "transaction",
  "update", "verify", "verification", "wallet",
]);
const confusables: Record<string, string> = {
  "а": "a", "α": "a", "в": "b", "β": "b", "с": "c", "ϲ": "c",
  "ԁ": "d", "е": "e", "ε": "e", "ё": "e", "һ": "h", "н": "h",
  "і": "i", "ι": "i", "ј": "j", "κ": "k", "к": "k", "ӏ": "l",
  "м": "m", "μ": "m", "ո": "n", "п": "n", "о": "o", "ο": "o",
  "р": "p", "ρ": "p", "զ": "q", "г": "r", "т": "t", "τ": "t",
  "υ": "u", "ν": "v", "х": "x", "χ": "x", "у": "y", "ү": "y",
  "ѕ": "s",
};

interface Candidate {
  brand: Brand;
  similarity: number;
  technique: NonNullable<LookalikeResult["technique"]>;
}

function getHostname(value: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    const labels = hostname.split(".");
    if (
      hostname.length > 253
      || labels.some((label) => label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
    ) return null;
    return hostname;
  } catch {
    return null;
  }
}

function skeleton(value: string): string {
  return domainToUnicode(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[а-џα-ωϲ]/gu, (character) => confusables[character] ?? character)
    .replace(/[01]/g, (character) => character === "0" ? "o" : "l")
    .replace(/rn/g, "m");
}

function compact(value: string): string {
  return skeleton(value).replace(/[^a-z\d]/g, "");
}

function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 2) return 3;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let previousPrevious: number[] = [];

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        substitution,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        current[column] = Math.min(current[column], previousPrevious[column - 2] + 1);
      }
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

function isAdjacentSwap(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const mismatches: number[] = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) mismatches.push(index);
    if (mismatches.length > 2) return false;
  }
  return mismatches.length === 2
    && mismatches[1] === mismatches[0] + 1
    && left[mismatches[0]] === right[mismatches[1]]
    && left[mismatches[1]] === right[mismatches[0]];
}

function hasRiskTerm(words: string[], flat: string, brandName?: string): boolean {
  if (words.some((word) => riskTerms.has(word))) return true;
  const remainder = brandName && flat.startsWith(brandName)
    ? flat.slice(brandName.length)
    : brandName && flat.endsWith(brandName)
      ? flat.slice(0, -brandName.length)
      : flat;
  return [...riskTerms].some((term) => remainder.includes(term));
}

function officialHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function candidate(
  candidates: Candidate[],
  brand: Brand,
  similarity: number,
  technique: Candidate["technique"],
): void {
  candidates.push({ brand, similarity: Math.min(1, Math.max(0, similarity)), technique });
}

function detect(hostname: string): Candidate | null {
  const parsed = parseDomain(hostname);
  if (parsed.isIp || !parsed.domain || !parsed.domainWithoutSuffix || !parsed.publicSuffix) return null;

  const allowedBrands = BRANDS.filter((brand) =>
    [brand.domain, ...(brand.validDomains ?? [])].some((domain) => officialHost(hostname, domain)),
  );
  if (allowedBrands.length > 0) return null;

  const unicodeHostname = domainToUnicode(hostname) || hostname;
  const hostLabels = unicodeHostname.split(".").map(skeleton);
  const domainLabels = parsed.domain.split(".").length;
  const subdomainLabels = hostLabels.slice(0, Math.max(0, hostLabels.length - domainLabels));
  const baseUnicode = domainToUnicode(parsed.domainWithoutSuffix) || parsed.domainWithoutSuffix;
  const base = compact(baseUnicode);
  const rawBase = baseUnicode.normalize("NFKC").toLowerCase().replace(/[^a-z\d]/g, "");
  const words = skeleton(baseUnicode).split(/[^a-z\d]+/).filter(Boolean);
  const candidates: Candidate[] = [];

  for (const brand of BRANDS) {
    const officialLabels = brand.domain.split(".").map(skeleton);
    for (let start = 0; start <= hostLabels.length - officialLabels.length; start += 1) {
      const matches = officialLabels.every((label, index) => hostLabels[start + index] === label);
      if (matches && start + officialLabels.length < hostLabels.length) {
        candidate(candidates, brand, 0.99, "subdomain_trick");
      }
    }

    for (const name of brand.names) {
      const brandName = compact(name);
      if (!brandName) continue;

      if (base === brandName) {
        if (rawBase !== brandName) {
          candidate(candidates, brand, 0.95, "typo");
          continue;
        }
        const officialSuffix = [brand.domain, ...(brand.validDomains ?? [])]
          .some((domain) => parsed.domain === domain);
        if (!officialSuffix) candidate(candidates, brand, 0.97, "tld_swap");
        continue;
      }

      if (
        brandName.length >= 4
        && (words.includes(brandName) || base.startsWith(brandName) || base.endsWith(brandName))
        && hasRiskTerm(words, base, brandName)
      ) {
        candidate(candidates, brand, 0.92, "extra_words");
      }

      if (
        subdomainLabels.includes(brandName)
        && hasRiskTerm(words, base)
      ) {
        candidate(candidates, brand, 0.93, "subdomain_trick");
      }

      if (brandName.length < 5) continue;
      const tokens = words.filter((word) => word.length >= 4);
      const typoTargets = [base, ...tokens];
      for (const target of typoTargets) {
        if (target.length < 4 || target.length > brandName.length + 2) continue;
        if (isAdjacentSwap(target, brandName)) {
          candidate(candidates, brand, 0.91, "char_swap");
          continue;
        }
        const distance = editDistance(target, brandName);
        const maxDistance = brandName.length >= 9 ? 2 : 1;
        if (distance > 0 && distance <= maxDistance) {
          candidate(
            candidates,
            brand,
            1 - distance / Math.max(target.length, brandName.length),
            "typo",
          );
        }
      }
    }
  }

  const best = candidates.sort((a, b) => b.similarity - a.similarity)[0];
  return best ?? null;
}

export const lookalikeCheck: LookalikeCheck = async (input) => {
  const original = typeof input === "string" ? input.trim() : "";
  const fallback: LookalikeResult = {
    domain: original.toLowerCase(),
    impersonates: null,
    similarity: 0,
  };
  try {
    const validated = inputSchema.safeParse(input);
    if (!validated.success) return fallback;
    const hostname = getHostname(validated.data);
    if (!hostname) return fallback;

    const match = detect(hostname);
    if (!match) return { ...fallback, domain: hostname };
    return {
      domain: hostname,
      impersonates: match.brand.domain,
      similarity: Number(match.similarity.toFixed(2)),
      technique: match.technique,
    };
  } catch {
    return fallback;
  }
};
