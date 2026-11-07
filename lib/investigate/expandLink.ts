import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { z } from "zod";
import type { ExpandLink } from "@/lib/contract";

const inputSchema = z.string().min(1).max(2048);
const MAX_REDIRECTS = 10;
const MAX_BODY_BYTES = 64 * 1024;
const DNS_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class UnsafeDestinationError extends Error {}

async function lookupWithTimeout(hostname: string): Promise<{ address: string; family: number }[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new UnsafeDestinationError("The destination DNS lookup timed out.")),
      DNS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([lookup(hostname, { all: true, verbatim: true }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

function inIpv4Range(address: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function isUnsafeIpv4(address: string): boolean {
  const reservedRanges: [string, number][] = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  return reservedRanges.some(([base, prefix]) => inIpv4Range(address, base, prefix));
}

function ipv6Bytes(address: string): number[] {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const octets = normalized.slice(lastColon + 1).split(".").map(Number);
    if (lastColon < 0 || octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      throw new UnsafeDestinationError("The destination address is invalid.");
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) throw new UnsafeDestinationError("The destination address is invalid.");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    throw new UnsafeDestinationError("The destination address is invalid.");
  }
  const groups = [...left, ...Array(missing).fill("0"), ...right].map((part) => Number.parseInt(part, 16));
  if (groups.length !== 8 || groups.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    throw new UnsafeDestinationError("The destination address is invalid.");
  }
  return groups.flatMap((part) => [part >> 8, part & 0xff]);
}

function isUnsafeIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  const allZero = bytes.every((part) => part === 0);
  const loopback = bytes.slice(0, 15).every((part) => part === 0) && bytes[15] === 1;
  if (allZero || loopback) return true;

  const mapped = bytes.slice(0, 10).every((part) => part === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return true;

  const globallyRoutable = (bytes[0] & 0xe0) === 0x20;
  if (!globallyRoutable) return true;

  const firstGroup = (bytes[0] << 8) | bytes[1];
  const secondGroup = (bytes[2] << 8) | bytes[3];
  const documentation = firstGroup === 0x2001 && secondGroup === 0x0db8;
  const specialPurpose = firstGroup === 0x2001 && secondGroup <= 0x01ff;
  const sixToFour = firstGroup === 0x2002;
  const documentationV2 = firstGroup === 0x3fff && (secondGroup & 0xfff0) === 0;
  return documentation || specialPurpose || sixToFour || documentationV2;
}

function isUnsafeAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return true;
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const forbiddenHost = /(?:^|\.)(?:localhost|local|internal|test|invalid|example|home\.arpa)$/i;
  if (
    !host
    || forbiddenHost.test(host)
    || ["metadata", "metadata.google.internal", "instance-data"].includes(host)
    || (!host.includes(".") && isIP(host) === 0)
  ) {
    throw new UnsafeDestinationError("Local and reserved hostnames are not allowed.");
  }

  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) as 4 | 6 }]
    : await lookupWithTimeout(host);

  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new UnsafeDestinationError("The destination resolves to a non-public or reserved network.");
  }

  const first = addresses[0];
  return { address: first.address, family: first.family as 4 | 6 };
}

function requestOnce(
  target: URL,
  address: { address: string; family: 4 | 6 },
  method: "HEAD" | "GET",
): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("Request timed out.")),
      REQUEST_TIMEOUT_MS,
    );
    let settled = false;
    const finish = (error?: Error, result?: { status: number; location?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("The request returned no response."));
    };

    const options = {
      method,
      hostname: address.address,
      family: address.family,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      headers: { host: target.host },
      agent: false,
      signal: controller.signal,
      servername: isIP(target.hostname.replace(/^\[|\]$/g, "")) ? undefined : target.hostname,
    };
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(options, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status < 100 || status > 599) {
        response.destroy();
        finish(new Error("The server returned an invalid status."));
        return;
      }

      if (method === "HEAD") {
        response.destroy();
        finish(undefined, { status, location });
        return;
      }

      let bytesRead = 0;
      response.on("readable", () => {
        while (bytesRead < MAX_BODY_BYTES) {
          const chunk = response.read(Math.min(16 * 1024, MAX_BODY_BYTES - bytesRead)) as Buffer | string | null;
          if (chunk === null) break;
          bytesRead += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        }
        if (bytesRead >= MAX_BODY_BYTES) {
          response.destroy();
          finish(undefined, { status, location });
        }
      });
      response.on("end", () => finish(undefined, { status, location }));
      response.on("error", (error) => finish(error));
    });

    request.on("error", (error) => finish(error));
    request.end();
  });
}

function redirectKey(url: URL): string {
  const withoutFragment = new URL(url);
  withoutFragment.hash = "";
  return withoutFragment.href;
}

export const expandLink: ExpandLink = async (input) => {
  const original = typeof input === "string" ? input : "";
  const fallback = { inputUrl: original, finalUrl: original, hops: [] as { url: string; status: number }[] };
  const hops: { url: string; status: number }[] = [];
  let finalUrl = fallback.finalUrl;
  try {
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) return { ...fallback, error: "The URL is empty or too long." };

    let current = new URL(input);
    finalUrl = current.href;
    if (!["http:", "https:"].includes(current.protocol)) {
      return { ...fallback, error: "Only HTTP and HTTPS URLs are allowed." };
    }
    if (current.username || current.password) {
      return { ...fallback, error: "URLs containing credentials are not allowed." };
    }

    const visited = new Set<string>();
    let redirects = 0;

    while (true) {
      const key = redirectKey(current);
      if (visited.has(key)) return { ...fallback, finalUrl: current.href, hops, error: "A redirect loop was detected." };
      visited.add(key);

      const address = await resolvePublicAddress(current.hostname.replace(/^\[|\]$/g, ""));
      let response: { status: number; location?: string };
      try {
        response = await requestOnce(current, address, "HEAD");
      } catch {
        response = await requestOnce(current, address, "GET");
      }
      if (response.status >= 400) response = await requestOnce(current, address, "GET");
      hops.push({ url: current.href, status: response.status });

      if (!REDIRECT_STATUSES.has(response.status) || !response.location) {
        return { ...fallback, finalUrl: current.href, hops };
      }
      if (redirects >= MAX_REDIRECTS) {
        return { ...fallback, finalUrl: current.href, hops, error: "The URL exceeds the 10-redirect limit." };
      }

      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        return { ...fallback, finalUrl: current.href, hops, error: "The server returned a malformed redirect destination." };
      }
      if (!["http:", "https:"].includes(next.protocol)) {
        return { ...fallback, finalUrl: current.href, hops, error: "A redirect used a disallowed URL protocol." };
      }
      if (next.username || next.password) {
        return { ...fallback, finalUrl: current.href, hops, error: "A redirect contained URL credentials." };
      }
      current = next;
      finalUrl = current.href;
      redirects += 1;
    }
  } catch (error) {
    return {
      ...fallback,
      finalUrl,
      hops,
      error: error instanceof UnsafeDestinationError
        ? error.message
        : "The URL could not be resolved or safely reached.",
    };
  }
};
