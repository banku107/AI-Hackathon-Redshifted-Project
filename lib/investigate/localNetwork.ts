import { isIP } from "node:net";

export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;

  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    return first === 10
      || first === 127
      || (first === 172 && second !== undefined && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }

  if (isIP(host) === 6) {
    return /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host);
  }

  return false;
}

/**
 * The URL the browser actually used. With `next dev -H 0.0.0.0` (npm run
 * dev:phone), request.url reports host 0.0.0.0, so take the host from the
 * Host header instead (e.g. 10.0.0.5:3000 from a phone on the same Wi-Fi).
 */
export function browserRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url;
}
