import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let passed = 0;
let failed = 0;

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : "Unknown test failure.";
    console.error(`FAIL ${name}: ${message}`);
  }
}

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function setFetch(handler: FetchHandler): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = previous;
  };
}

async function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function makeFamilyAlert(summary: string, createdAt = new Date().toISOString()) {
  return {
    contactName: "Rosa",
    summary,
    riskLevel: "scam" as const,
    moneyInvolved: true,
    suggestedAction: "Call Rosa using a number you already trust.",
    createdAt,
  };
}

type Address = { address: string; family: 4 | 6 };
type RequestPlan = { status: number; location?: string; error?: boolean };
type RequestOptions = { method?: string; hostname?: string; headers?: { host?: string }; path?: string };
type MockResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  destroyed: boolean;
  destroy(): void;
  read(size: number): null;
};
type MockRequest = EventEmitter & { end(): void };

function installLinkNetworkMocks(): {
  setScenario: (scenario: (options: RequestOptions) => RequestPlan) => void;
  setAddresses: (addresses: Address[]) => void;
  setLookup: (lookup: () => Promise<Address[]>) => void;
  getRequestCount: () => number;
  restore: () => void;
} {
  const require = createRequire(resolve(process.cwd(), "scripts", "test-tools.ts"));
  const dns = require("node:dns/promises") as { lookup: typeof import("node:dns/promises").lookup };
  const http = require("node:http") as { request: typeof import("node:http").request };
  const https = require("node:https") as { request: typeof import("node:https").request };
  const originalLookup = dns.lookup;
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;
  let addresses: Address[] = [{ address: "93.184.216.34", family: 4 }];
  let lookupHandler = async () => addresses;
  let requestCount = 0;
  let scenario: (options: RequestOptions) => RequestPlan = () => ({ status: 200 });

  dns.lookup = (async () => lookupHandler()) as unknown as typeof dns.lookup;
  const mockedRequest = ((options: RequestOptions, callback: (response: MockResponse) => void) => {
    requestCount += 1;
    const request = new EventEmitter() as MockRequest;
    request.end = () => {
      queueMicrotask(() => {
        const plan = scenario(options);
        if (plan.error) {
          request.emit("error", new Error("Mock transport error."));
          return;
        }

        const response = new EventEmitter() as MockResponse;
        response.statusCode = plan.status;
        response.headers = plan.location ? { location: plan.location } : {};
        response.destroyed = false;
        response.destroy = () => { response.destroyed = true; };
        response.read = () => null;
        callback(response);
        if (options.method === "GET" && !response.destroyed) {
          queueMicrotask(() => response.emit("end"));
        }
      });
    };
    return request;
  }) as unknown as typeof http.request;

  http.request = mockedRequest;
  https.request = mockedRequest as typeof https.request;
  syncBuiltinESMExports();

  return {
    setScenario(nextScenario) {
      scenario = nextScenario;
    },
    setAddresses(nextAddresses) {
      addresses = nextAddresses;
    },
    setLookup(nextLookup) {
      lookupHandler = nextLookup;
    },
    getRequestCount() {
      return requestCount;
    },
    restore() {
      dns.lookup = originalLookup;
      http.request = originalHttpRequest;
      https.request = originalHttpsRequest;
      syncBuiltinESMExports();
    },
  };
}

async function testLinkExpansion(): Promise<void> {
  const mocks = installLinkNetworkMocks();
  try {
    const { expandLink } = await import("../lib/investigate/expandLink");

    await test("link expansion: ordinary URL", async () => {
      mocks.setScenario(() => ({ status: 200 }));
      const result = await expandLink("https://safe.example.com/message");
      assert.equal(result.finalUrl, "https://safe.example.com/message");
      assert.deepEqual(result.hops, [{ url: "https://safe.example.com/message", status: 200 }]);
      assert.equal(result.error, undefined);
    });

    await test("link expansion: shortened link and redirect chain", async () => {
      mocks.setScenario((options) => {
        if (options.path === "/short") return { status: 302, location: "/middle" };
        if (options.path === "/middle") return { status: 301, location: "https://destination.example.com/final" };
        return { status: 200 };
      });
      const result = await expandLink("https://short.example.com/short");
      assert.equal(result.finalUrl, "https://destination.example.com/final");
      assert.deepEqual(result.hops.map((hop) => hop.status), [302, 301, 200]);
    });

    await test("link expansion: HEAD unsupported falls back to GET", async () => {
      mocks.setScenario((options) => options.method === "HEAD"
        ? { status: 405 }
        : { status: 200 });
      const before = mocks.getRequestCount();
      const result = await expandLink("https://safe.example.com/head-only");
      assert.equal(result.hops[0]?.status, 200);
      assert.equal(mocks.getRequestCount() - before, 2);
    });

    await test("link expansion: invalid URL and protocol", async () => {
      for (const input of ["not a URL", "ftp://safe.example.com/file", "https://user:pass@safe.example.com"]) {
        const result = await expandLink(input);
        assert.ok(result.error, `${input} should be rejected`);
        assert.deepEqual(result.hops, []);
      }
    });

    await test("link expansion: redirect loop", async () => {
      mocks.setScenario((options) => ({
        status: 302,
        location: options.path === "/a" ? "/b" : "/a",
      }));
      const result = await expandLink("https://safe.example.com/a");
      assert.match(result.error ?? "", /loop/i);
      assert.equal(result.hops.length, 2);
    });

    await test("link expansion: maximum redirect count", async () => {
      mocks.setScenario((options) => {
        const index = Number(options.path?.slice(2));
        return { status: 302, location: `/r${index + 1}` };
      });
      const result = await expandLink("https://safe.example.com/r0");
      assert.match(result.error ?? "", /10-redirect/i);
      assert.equal(result.hops.length, 11);
    });

    await test("link expansion: localhost, private, metadata, reserved IPv6, and mapped IPs", async () => {
      const before = mocks.getRequestCount();
      const blocked = [
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.1",
        "http://2130706433",
        "http://0x7f000001",
        "http://0.0.0.0",
        "http://169.254.169.254",
        "http://10.0.0.1",
        "http://172.16.0.1",
        "http://100.64.0.1",
        "http://192.168.1.1",
        "http://192.0.2.1",
        "http://198.18.0.1",
        "http://203.0.113.1",
        "http://224.0.0.1",
        "http://240.0.0.1",
        "http://255.255.255.255",
        "http://[::1]",
        "http://[fd00::1]",
        "http://[fe80::1]",
        "http://[2001:db8::1]",
        "http://[2002:c000:0201::1]",
        "http://[ff02::1]",
        "http://[::ffff:127.0.0.1]",
        "http://metadata.google.internal",
      ];
      for (const input of blocked) {
        const result = await expandLink(input);
        assert.ok(result.error, `${input} should be rejected`);
      }
      assert.equal(mocks.getRequestCount(), before, "blocked destinations must never be contacted");
    });

    await test("link expansion: mixed public/private DNS answer is rejected", async () => {
      mocks.setAddresses([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
      const before = mocks.getRequestCount();
      const result = await expandLink("https://mixed.example.com/path");
      assert.match(result.error ?? "", /non-public|reserved/i);
      assert.equal(mocks.getRequestCount(), before);
      mocks.setAddresses([{ address: "93.184.216.34", family: 4 }]);
    });

    await test("link expansion: DNS rebinding cannot change the pinned connection address", async () => {
      let lookupCalls = 0;
      let connectedAddress: string | undefined;
      mocks.setLookup(async () => {
        lookupCalls += 1;
        return lookupCalls === 1
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }];
      });
      mocks.setScenario((options) => {
        connectedAddress = options.hostname;
        return { status: 200 };
      });
      const result = await expandLink("https://rebinding.example.com/path");
      assert.equal(result.error, undefined);
      assert.equal(lookupCalls, 1, "the validated hostname should not be resolved again by the request");
      assert.equal(connectedAddress, "93.184.216.34");
      mocks.setLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    });

    await test("link expansion: stalled DNS lookup times out", async () => {
      mocks.setLookup(() => new Promise<Address[]>(() => {}));
      const result = await expandLink("https://slow-dns.example.com/path");
      assert.match(result.error ?? "", /DNS lookup timed out/i);
      mocks.setLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    });

    await test("link expansion: redirect hostname resolving private is rejected before contact", async () => {
      let lookupCalls = 0;
      mocks.setLookup(async () => {
        lookupCalls += 1;
        return lookupCalls === 1
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "10.0.0.1", family: 4 }];
      });
      mocks.setScenario(() => ({ status: 302, location: "http://private-redirect.example.com/target" }));
      const before = mocks.getRequestCount();
      const result = await expandLink("https://safe.example.com/redirect");
      assert.match(result.error ?? "", /non-public|reserved/i);
      assert.equal(result.hops.length, 1);
      assert.equal(mocks.getRequestCount() - before, 1);
      assert.equal(lookupCalls, 2, "the redirect host must be resolved and checked independently");
      mocks.setLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    });

    await test("link expansion: redirect into a private destination is rejected", async () => {
      mocks.setScenario(() => ({ status: 302, location: "http://169.254.169.254/latest/meta-data" }));
      const before = mocks.getRequestCount();
      const result = await expandLink("https://safe.example.com/redirect");
      assert.match(result.error ?? "", /non-public|reserved/i);
      assert.equal(result.hops.length, 1);
      assert.equal(mocks.getRequestCount() - before, 1, "the private redirect destination must not be contacted");
    });
  } finally {
    mocks.restore();
  }
}

async function main(): Promise<void> {
  await testLinkExpansion();

  const { domainAge } = await import("../lib/investigate/domainAge");
  const { lookalikeCheck } = await import("../lib/investigate/lookalike");
  const { checkReputation } = await import("../lib/investigate/reputation");

  await test("domain age: registered domain and registrar", async () => {
    const restoreFetch = setFetch(async () => Response.json({
      events: [{ eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" }],
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Fixture Registrar"]]] }],
    }));
    try {
      const result = await domainAge("google.com");
      assert.equal(result.domain, "google.com");
      assert.ok((result.ageDays ?? 0) > 30);
      assert.equal(result.isNew, false);
      assert.equal(result.registrar, "Fixture Registrar");
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: newly registered domain fixture", async () => {
    const created = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const restoreFetch = setFetch(async () => Response.json({
      events: [{ eventAction: "registration", eventDate: created }],
    }));
    try {
      const result = await domainAge(`scamshield-${randomUUID().replace(/-/g, "")}.com`);
      assert.ok((result.ageDays ?? Infinity) < 30);
      assert.equal(result.isNew, true);
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: RDAP without registration information", async () => {
    const restoreFetch = setFetch(async () => Response.json({ events: [] }));
    try {
      const result = await domainAge(`missing-date-${randomUUID().replace(/-/g, "")}.net`);
      assert.equal(result.createdAt, null);
      assert.equal(result.ageDays, null);
      assert.ok(result.error);
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: invalid domain avoids network access", async () => {
    let calls = 0;
    const restoreFetch = setFetch(async () => {
      calls += 1;
      return Response.json({});
    });
    try {
      const result = await domainAge("http://127.0.0.1");
      assert.ok(result.error);
      assert.equal(calls, 0);
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: RDAP unavailable is not a fabricated age", async () => {
    const restoreFetch = setFetch(async () => { throw new Error("fixture outage"); });
    try {
      const result = await domainAge(`offline-${randomUUID().replace(/-/g, "")}.org`);
      assert.equal(result.createdAt, null);
      assert.equal(result.ageDays, null);
      assert.ok(result.error);
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: oversized RDAP response is rejected", async () => {
    const restoreFetch = setFetch(async () => new Response(" ".repeat(1_048_577)));
    try {
      const result = await domainAge(`oversized-${randomUUID().replace(/-/g, "")}.org`);
      assert.equal(result.createdAt, null);
      assert.equal(result.ageDays, null);
      assert.match(result.error ?? "", /1 MB limit/i);
    } finally {
      restoreFetch();
    }
  });

  await test("domain age: cache avoids duplicate lookups", async () => {
    let calls = 0;
    const restoreFetch = setFetch(async () => {
      calls += 1;
      return Response.json({ events: [{ eventAction: "registration", eventDate: "2001-01-01T00:00:00Z" }] });
    });
    try {
      const domain = `cached-${randomUUID().replace(/-/g, "")}.com`;
      await domainAge(domain);
      await domainAge(domain);
      assert.equal(calls, 1);
    } finally {
      restoreFetch();
    }
  });

  await test("lookalike detection: legitimate PayPal and USPS domains", async () => {
    for (const domain of ["paypal.com", "www.paypal.com", "usps.com"]) {
      const result = await lookalikeCheck(domain);
      assert.equal(result.impersonates, null, `${domain} should not be flagged`);
    }
  });

  await test("lookalike detection: PayPal typo and deceptive subdomain", async () => {
    const typo = await lookalikeCheck("paypa1.com");
    assert.equal(typo.impersonates, "paypal.com");
    assert.equal(typo.technique, "typo");
    assert.ok(typo.similarity > 0.8 && typo.similarity <= 1);

    const subdomain = await lookalikeCheck("paypal.com.secure-login.ru");
    assert.equal(subdomain.impersonates, "paypal.com");
    assert.equal(subdomain.technique, "subdomain_trick");
  });

  await test("lookalike detection: extra words, TLD swap, and IDN confusable", async () => {
    const usps = await lookalikeCheck("usps-redelivery-help.com");
    assert.equal(usps.impersonates, "usps.com");
    assert.equal(usps.technique, "extra_words");

    const amazon = await lookalikeCheck("amazon.support");
    assert.equal(amazon.impersonates, "amazon.com");
    assert.equal(amazon.technique, "tld_swap");

    const idn = await lookalikeCheck("раypal.com");
    assert.equal(idn.impersonates, "paypal.com");
  });

  await test("lookalike detection: unrelated domains are not accused", async () => {
    for (const domain of ["support.com", "applicationsecurity.com", "wikipedia.org"]) {
      const result = await lookalikeCheck(domain);
      assert.equal(result.impersonates, null, `${domain} should not be flagged`);
    }
  });

  await withEnvironment({
    URLHAUS_AUTH_KEY: "test-urlhaus-key",
    SAFE_BROWSING_API_KEY: "test-safe-browsing-key",
  }, async () => {
    await test("reputation: listed malicious fixture", async () => {
      const restoreFetch = setFetch(async (input) => fetchInputUrl(input).includes("urlhaus-api")
        ? Response.json({ query_status: "ok" })
        : Response.json({ matches: [{ threatType: "MALWARE", platformType: "ANY_PLATFORM", threatEntryType: "URL" }] }));
      try {
        const result = await checkReputation("https://fixture.example.com/path");
        assert.equal(result.listedAsMalicious, true);
        assert.equal(result.sources.length, 2);
      } finally {
        restoreFetch();
      }
    });

    await test("reputation: clean fixture reports not listed, not safe", async () => {
      const restoreFetch = setFetch(async (input) => fetchInputUrl(input).includes("urlhaus-api")
        ? Response.json({ query_status: "no_results" })
        : Response.json({}));
      try {
        const result = await checkReputation("https://fixture.example.com/clean");
        assert.equal(result.listedAsMalicious, false);
        assert.ok(result.sources.every((source) => source.verdict === "not listed"));
        assert.equal(result.error, undefined);
      } finally {
        restoreFetch();
      }
    });

    await test("reputation: URLhaus failure does not hide Safe Browsing result", async () => {
      const restoreFetch = setFetch(async (input) => {
        if (fetchInputUrl(input).includes("urlhaus-api")) throw new Error("fixture service outage");
        return Response.json({});
      });
      try {
        const result = await checkReputation("https://fixture.example.com/urlhaus-down");
        assert.ok(result.error);
        assert.match(result.sources[0]?.verdict ?? "", /unavailable/);
        assert.equal(result.sources[1]?.verdict, "not listed");
      } finally {
        restoreFetch();
      }
    });

    await test("reputation: Safe Browsing failure does not hide URLhaus result", async () => {
      const restoreFetch = setFetch(async (input) => fetchInputUrl(input).includes("urlhaus-api")
        ? Response.json({ query_status: "no_results" })
        : new Response("unavailable", { status: 503 }));
      try {
        const result = await checkReputation("https://fixture.example.com/safebrowsing-down");
        assert.ok(result.error);
        assert.equal(result.sources[0]?.verdict, "not listed");
        assert.match(result.sources[1]?.verdict ?? "", /unavailable/);
      } finally {
        restoreFetch();
      }
    });

    await test("reputation: malformed provider responses are unavailable", async () => {
      const restoreFetch = setFetch(async (input) => fetchInputUrl(input).includes("urlhaus-api")
        ? Response.json({})
        : Response.json({ matches: [{}] }));
      try {
        const result = await checkReputation("https://fixture.example.com/malformed");
        assert.equal(result.listedAsMalicious, false);
        assert.ok(result.error);
        assert.ok(result.sources.every((source) => source.verdict.includes("unavailable")));
      } finally {
        restoreFetch();
      }
    });

    await test("reputation: oversized provider response is unavailable", async () => {
      const restoreFetch = setFetch(async (input) => fetchInputUrl(input).includes("urlhaus-api")
        ? new Response(" ".repeat(1_048_577))
        : Response.json({}));
      try {
        const result = await checkReputation("https://fixture.example.com/oversized");
        assert.ok(result.error);
        assert.match(result.error, /1 MB limit/i);
        assert.match(result.sources[0]?.verdict ?? "", /unavailable/i);
        assert.equal(result.sources[1]?.verdict, "not listed");
      } finally {
        restoreFetch();
      }
    });
  });

  await test("reputation: missing API keys are explicit and make no requests", async () => {
    await withEnvironment({ URLHAUS_AUTH_KEY: undefined, SAFE_BROWSING_API_KEY: undefined }, async () => {
      let calls = 0;
      const restoreFetch = setFetch(async () => {
        calls += 1;
        return Response.json({});
      });
      try {
        const result = await checkReputation("https://fixture.example.com/no-keys");
        assert.ok(result.error);
        assert.equal(result.sources.length, 2);
        assert.ok(result.sources.every((source) => source.verdict.includes("unavailable")));
        assert.equal(calls, 0);
      } finally {
        restoreFetch();
      }
    });
  });

  await test("reputation: invalid URL is rejected without provider calls", async () => {
    let calls = 0;
    const restoreFetch = setFetch(async () => {
      calls += 1;
      return Response.json({});
    });
    try {
      const result = await checkReputation("file:///etc/passwd");
      assert.ok(result.error);
      assert.equal(result.sources.length, 0);
      assert.equal(calls, 0);
    } finally {
      restoreFetch();
    }
  });

  const [{ analyzeVideo }, { POST: uploadVideo }, { resolveLocalVideoId }] = await Promise.all([
    import("../lib/investigate/video"),
    import("../app/api/upload/route"),
    import("../lib/investigate/localVideo"),
  ]);
  await withEnvironment({ DETECTOR_API_KEY: undefined }, async () => {
    await test("video analysis: missing detector key is explicit", async () => {
      const result = await analyzeVideo("invalid-reference");
      assert.equal(result.detector, null);
      assert.ok(result.credentials.error);
    });

    await test("video analysis: malformed video IDs are rejected without fetching", async () => {
      const result = await analyzeVideo("../private/video.mp4");
      assert.ok(result.credentials.error);
      assert.ok(result.metadata.error);
      assert.equal(result.detector, null);
    });

    await test("video upload: oversized request is rejected", async () => {
      const response = await uploadVideo(new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "video/mp4",
          "content-length": String(50 * 1024 * 1024 + 1),
        },
        body: new Uint8Array([0]),
      }));
      assert.equal(response.status, 413);
    });

    await test("video analysis: invalid local media returns independent component errors and cleans up", async () => {
      const bytes = new Uint8Array([0, 0, 0, 16, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0]);
      const uploadResponse = await uploadVideo(new Request("http://192.168.1.23:3000/api/upload", {
        method: "POST",
        headers: { origin: "http://192.168.1.23:3000", "content-type": "video/mp4" },
        body: bytes,
      }));
      assert.equal(uploadResponse.status, 201);
      const uploaded = await uploadResponse.json() as { videoId: string; url?: string };
      assert.match(uploaded.videoId, /^[0-9a-f-]{36}\.mp4$/i);
      assert.equal(uploaded.url, undefined);
      assert.ok(resolveLocalVideoId(uploaded.videoId));

      const report = await analyzeVideo(uploaded.videoId);
      assert.equal(report.detector, null);
      assert.ok(report.credentials.error);
      assert.ok(report.metadata.error);
      const local = resolveLocalVideoId(uploaded.videoId);
      assert.ok(local);
      await assert.rejects(import("node:fs/promises").then(({ stat }) => stat(local.path)));
    });

    await test("video upload: unsupported MIME and cross-origin requests are rejected", async () => {
      const unsupported = await uploadVideo(new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/octet-stream" },
        body: new Uint8Array([0]),
      }));
      const crossOrigin = await uploadVideo(new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { origin: "http://attacker.example", "content-type": "video/mp4" },
        body: new Uint8Array([0]),
      }));
      assert.equal(unsupported.status, 415);
      assert.equal(crossOrigin.status, 403);
    });
  });

  const { configureFamilyAlertStore, getFamilyAlerts, sendFamilyAlert } =
    await import("../lib/investigate/familyAlert");

  await test("family alert: SMS acceptance, safe content, length limit, and duplicate suppression", async () => {
    const accountSid = `AC${"a".repeat(32)}`;
    const twilioSid = `SM${"b".repeat(32)}`;
    const contact = { name: "Rosa", phone: "+15555550123", email: "private@example.com" };
    const alert = makeFamilyAlert("Contact private@example.com at 415-555-0134 about account number: 12345678");
    let calls = 0;
    const restoreFetch = setFetch(async (input, init) => {
      calls += 1;
      assert.equal(fetchInputUrl(input), `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("content-type"), "application/x-www-form-urlencoded");
      const form = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(form.get("To"), contact.phone);
      assert.equal(form.get("From"), "+15555550000");
      const body = form.get("Body") ?? "";
      assert.match(body, /^ScamShield alert:/);
      assert.ok(body.length < 300);
      assert.ok(!body.includes(contact.email ?? ""));
      assert.ok(!body.includes("415-555-0134"));
      return Response.json({ sid: twilioSid, status: "queued" }, { status: 201 });
    });
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: accountSid,
        TWILIO_AUTH_TOKEN: "fixture-auth-token",
        TWILIO_PHONE_NUMBER: undefined,
        TWILIO_FROM_NUMBER: "+15555550000",
        RESEND_API_KEY: undefined,
        RESEND_FROM_EMAIL: undefined,
      }, async () => {
        const first = await sendFamilyAlert(contact, alert);
        const second = await sendFamilyAlert(contact, alert);
        assert.deepEqual(first, { delivered: true, channel: "sms" });
        assert.deepEqual(second, first);
        assert.equal(calls, 1);

        const simultaneousAlert = makeFamilyAlert("Concurrent duplicate notification fixture.");
        const simultaneous = await Promise.all([
          sendFamilyAlert(contact, simultaneousAlert),
          sendFamilyAlert(contact, simultaneousAlert),
        ]);
        assert.deepEqual(simultaneous, [first, first]);
        assert.equal(calls, 2, "concurrent duplicate requests should produce one provider call");
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: professional email accepted with sensitive text redacted", async () => {
    const alert = makeFamilyAlert(
      "Rosa received a message. Contact rosa@example.com at 415-555-0134; account number: 12345678. Visit https://unsafe.example/path <script>.",
    );
    const restoreFetch = setFetch(async (input, init) => {
      assert.equal(fetchInputUrl(input), "https://api.resend.com/emails");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-resend-key");
      assert.match(new Headers(init?.headers).get("idempotency-key") ?? "", /^[a-f0-9]{64}$/);
      const body = JSON.parse(String(init?.body ?? "")) as {
        from: string;
        to: string[];
        subject: string;
        text: string;
        html: string;
      };
      assert.equal(body.from, "ScamShield <alerts@example.com>");
      assert.deepEqual(body.to, ["family@example.com"]);
      assert.match(body.subject, /ScamShield/i);
      assert.match(body.text, /Severity: SCAM/);
      assert.match(body.text, /Money involved: Yes/);
      assert.match(body.text, /Suggested action:/);
      assert.match(body.text, /Time:/);
      assert.ok(!body.text.includes("rosa@example.com"));
      assert.ok(!body.text.includes("415-555-0134"));
      assert.ok(!body.text.includes("12345678"));
      assert.ok(!body.text.includes("https://unsafe.example"));
      assert.ok(body.html.includes("&lt;script&gt;"));
      return Response.json({ id: "email-fixture-id" }, { status: 201 });
    });
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: undefined,
        TWILIO_AUTH_TOKEN: undefined,
        TWILIO_PHONE_NUMBER: undefined,
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: "fixture-resend-key",
        RESEND_FROM_EMAIL: "ScamShield <alerts@example.com>",
      }, async () => {
        const result = await sendFamilyAlert({ name: "Rosa", email: "family@example.com" }, alert);
        assert.deepEqual(result, { delivered: true, channel: "email" });
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: failed SMS falls back to accepted email", async () => {
    const accountSid = `AC${"c".repeat(32)}`;
    const contact = { name: "Rosa", phone: "+15555550123", email: "family@example.com" };
    const alert = makeFamilyAlert("SMS failure falls back to email");
    const called: string[] = [];
    const restoreFetch = setFetch(async (input) => {
      const url = fetchInputUrl(input);
      called.push(url);
      return url.includes("api.twilio.com")
        ? Response.json({ message: "not accepted" }, { status: 503 })
        : Response.json({ id: "fallback-email-id" }, { status: 201 });
    });
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: accountSid,
        TWILIO_AUTH_TOKEN: "fixture-auth-token",
        TWILIO_PHONE_NUMBER: "+15555550000",
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: "fixture-resend-key",
        RESEND_FROM_EMAIL: "alerts@example.com",
      }, async () => {
        const result = await sendFamilyAlert(contact, alert);
        assert.deepEqual(result, { delivered: true, channel: "email" });
        assert.equal(called.length, 2);
        assert.ok(called[0]?.includes("api.twilio.com"));
        assert.equal(called[1], "https://api.resend.com/emails");
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: provider failures fall back to the saved screen alert", async () => {
    const alert = makeFamilyAlert("Both notification providers unavailable");
    const restoreFetch = setFetch(async () => new Response("provider unavailable", { status: 503 }));
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: `AC${"d".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "fixture-auth-token",
        TWILIO_PHONE_NUMBER: "+15555550000",
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: "fixture-resend-key",
        RESEND_FROM_EMAIL: "alerts@example.com",
      }, async () => {
        const result = await sendFamilyAlert(
          { name: "Rosa", phone: "+15555550123", email: "family@example.com" },
          alert,
        );
        assert.equal(result.channel, "screen");
        assert.equal(result.delivered, true);
        assert.ok(result.error);
        assert.ok((await getFamilyAlerts()).some((saved) => saved.summary === alert.summary));
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: missing provider credentials use screen fallback without requests", async () => {
    const alert = makeFamilyAlert("Screen fallback with missing credentials");
    let calls = 0;
    const restoreFetch = setFetch(async () => {
      calls += 1;
      return Response.json({});
    });
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: undefined,
        TWILIO_AUTH_TOKEN: undefined,
        TWILIO_PHONE_NUMBER: undefined,
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: undefined,
        RESEND_FROM_EMAIL: undefined,
      }, async () => {
        const result = await sendFamilyAlert(
          { name: "Rosa", phone: "+15555550123", email: "family@example.com" },
          alert,
        );
        assert.equal(result.delivered, true);
        assert.equal(result.channel, "screen");
        assert.match(result.error ?? "", /SMS is not configured/i);
        assert.match(result.error ?? "", /Email is not configured/i);
        assert.match(result.error ?? "", /saved for the family screen/i);
        assert.equal(calls, 0);
        assert.ok((await getFamilyAlerts()).some((saved) => saved.summary === alert.summary));
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: malformed provider response is not reported as accepted", async () => {
    const alert = makeFamilyAlert("Malformed Twilio acceptance fixture");
    const restoreFetch = setFetch(async () => Response.json({ unexpected: true }, { status: 201 }));
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: `AC${"e".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "fixture-auth-token",
        TWILIO_PHONE_NUMBER: "+15555550000",
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: undefined,
        RESEND_FROM_EMAIL: undefined,
      }, async () => {
        const result = await sendFamilyAlert(
          { name: "Rosa", phone: "+15555550123" },
          alert,
        );
        assert.equal(result.delivered, true);
        assert.equal(result.channel, "screen");
        assert.ok(result.error);
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: oversized provider response is not reported as accepted", async () => {
    const alert = makeFamilyAlert("Oversized Twilio response fixture");
    const restoreFetch = setFetch(async () => new Response(" ".repeat(1_048_577), { status: 201 }));
    try {
      await withEnvironment({
        TWILIO_ACCOUNT_SID: `AC${"f".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "fixture-auth-token",
        TWILIO_PHONE_NUMBER: "+15555550000",
        TWILIO_FROM_NUMBER: undefined,
        RESEND_API_KEY: undefined,
        RESEND_FROM_EMAIL: undefined,
      }, async () => {
        const result = await sendFamilyAlert(
          { name: "Rosa", phone: "+15555550123" },
          alert,
        );
        assert.equal(result.delivered, true);
        assert.equal(result.channel, "screen");
        assert.match(result.error ?? "", /oversized response/i);
      });
    } finally {
      restoreFetch();
    }
  });

  await test("family alert: stored alerts are sorted newest first", async () => {
    const older = makeFamilyAlert(`ordering-older-${randomUUID()}`, "2098-01-01T00:00:00.000Z");
    const newer = makeFamilyAlert(`ordering-newer-${randomUUID()}`, "2099-01-01T00:00:00.000Z");
    await withEnvironment({
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_PHONE_NUMBER: undefined,
      TWILIO_FROM_NUMBER: undefined,
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
    }, async () => {
      await sendFamilyAlert({ name: "Rosa" }, older);
      await sendFamilyAlert({ name: "Rosa" }, newer);
    });
    const ordered = (await getFamilyAlerts()).filter((alert) => alert.summary.startsWith("ordering-"));
    assert.equal(ordered[0]?.summary, newer.summary);
    assert.equal(ordered[1]?.summary, older.summary);
  });

  await test("family alert: malformed alert returns screen error without throwing", async () => {
    const invalid = { ...makeFamilyAlert("Invalid timestamp fixture"), createdAt: "not-a-date" };
    const result = await sendFamilyAlert(
      { name: "Rosa" },
      invalid as Parameters<typeof sendFamilyAlert>[1],
    );
    assert.equal(result.delivered, false);
    assert.equal(result.channel, "screen");
    assert.ok(result.error);
  });

  const { GET: getFamilyRoute } = await import("../app/api/family/route");

  await test("family API: returns newest-first alerts with no-store headers", async () => {
    const response = await getFamilyRoute(new Request("http://localhost:3000/api/family", {
      headers: { origin: "http://localhost:3000" },
    }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
    const alerts = await response.json() as { createdAt: string }[];
    assert.ok(Array.isArray(alerts));
    for (let index = 1; index < alerts.length; index += 1) {
      assert.ok(Date.parse(alerts[index - 1]!.createdAt) >= Date.parse(alerts[index]!.createdAt));
    }
  });

  await test("family API: rejects remote hosts and mismatched origins", async () => {
    const remoteHost = await getFamilyRoute(new Request("https://remote.example/api/family"));
    const mismatchedOrigin = await getFamilyRoute(new Request("http://localhost:3000/api/family", {
      headers: { origin: "http://attacker.example" },
    }));
    assert.equal(remoteHost.status, 403);
    assert.equal(mismatchedOrigin.status, 403);
  });

  await test("family API: allows same-origin private LAN access for phone clients", async () => {
    const response = await getFamilyRoute(new Request("http://192.168.1.23:3000/api/family", {
      headers: { origin: "http://192.168.1.23:3000" },
    }));
    assert.equal(response.status, 200);
  });

  await test("family API: storage failures return a no-store error response", async () => {
    configureFamilyAlertStore({
      async save() {},
      async list() {
        throw new Error("fixture store failure");
      },
    });
    const response = await getFamilyRoute(new Request("http://localhost:3000/api/family"));
    assert.equal(response.status, 500);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    const body = await response.json() as { error?: string };
    assert.equal(body.error, "Family alerts could not be retrieved.");
  });

  console.log(`\n${passed} passed; ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

globalThis.fetch = async () => {
  throw new Error("Unexpected network access in test-tools.");
};

void main().catch((error: unknown) => {
  failed += 1;
  console.error("FAIL test-tools setup:", error instanceof Error ? error.message : "Unknown setup failure.");
  console.log(`\n${passed} passed; ${failed} failed.`);
  process.exitCode = 1;
});
