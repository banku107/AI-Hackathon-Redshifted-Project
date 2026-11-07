/**
 * ScamShield — automated evaluation engine (Person 4, P4-6).
 *
 * Sends every test case in test-data/messages/ to the real API
 * (POST /api/agent, Server-Sent Events), extracts the `verdict` event and
 * scores it against the dataset's expected labels.
 *
 * Usage:
 *   npx tsx scripts/eval.ts [options]
 *   node scripts/eval.ts [options]          # Node >= 23.6 (built-in type stripping)
 *
 * Options:
 *   --suite <messages|demo|all>   which fixtures to run (default: messages)
 *   --limit <n>                   only run the first n cases (sorted by id)
 *   --only <substring>            only run cases whose id contains substring
 *   --concurrency <1|2>           parallel requests (default 2, hard max 2)
 *   --timeout <seconds>           per-request timeout (default 120)
 *   --images <both|off|only>      screenshot handling (default both):
 *                                   both = send text + PNG screenshot when present
 *                                   off  = text only
 *                                   only = for cases with a screenshot, send ONLY the image
 *   --videos                      also run the video manifest (needs prepared requests)
 *   --dry-run                     validate data + build requests; make NO API calls
 *   --no-save                     do not write test-data/results/<timestamp>.json
 *   --verbose                     print every SSE event type and verdict headline
 *   --help
 *
 * Environment:
 *   BASE_URL   default http://localhost:3000. No other env vars are read; no secrets needed.
 *
 * CONTRACT: all types come from lib/contract.ts (type-only import, erased at
 * runtime, so the script has no runtime dependency on app code). Runtime
 * parsing below is still defensive, so a contract drift shows up as an error
 * instead of being silently mis-scored.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, extname, basename } from "node:path";
import type {
  AgentEvent, AgentRequest, AiMediaLevel, InputImage, Language, ScamType, Verdict, VerdictLevel, VideoInput,
} from "../lib/contract";

type AgentEventType = AgentEvent["type"];
const AGENT_EVENT_TYPES: readonly AgentEventType[] = [
  "plan", "step_start", "step_done", "evidence", "text", "verdict",
  "family_alert", "damage_control", "error", "done",
];

const LANGUAGES: readonly Language[] = ["en", "es", "fr", "pt", "zh", "hi", "ar", "vi", "ko", "tl"];
const LEVELS: readonly VerdictLevel[] = ["scam", "suspicious", "safe"];
const AI_LEVELS: readonly AiMediaLevel[] = ["likely_ai", "unclear", "likely_real"];
const SCAM_TYPES: readonly ScamType[] = [
  "grandparent", "delivery", "bank_impersonation", "romance", "tech_support",
  "government_impersonation", "prize_lottery", "investment_crypto",
  "celebrity_deepfake", "phishing_other", "none", "unknown",
];
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", zh: "Chinese",
  hi: "Hindi", ar: "Arabic", vi: "Vietnamese", ko: "Korean", tl: "Tagalog",
};
const IMAGE_TYPES: Record<string, InputImage["mediaType"]> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};
const MAX_CONCURRENCY = 2;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Locate the repo from the script's own path (works under tsx, node, ESM or CommonJS),
// falling back to the current directory.
const SCRIPT_PATH = process.argv[1] ? resolve(process.argv[1]) : resolve("scripts/eval.ts");
const ROOT = existsSync(join(dirname(SCRIPT_PATH), "..", "test-data")) ? resolve(dirname(SCRIPT_PATH), "..") : process.cwd();
const DATA = join(ROOT, "test-data");

// ─────────────────────────────── CLI options ───────────────────────────────
interface Options {
  suite: "messages" | "demo" | "all";
  limit: number | null;
  only: string | null;
  concurrency: number;
  timeoutMs: number;
  images: "both" | "off" | "only";
  videos: boolean;
  dryRun: boolean;
  save: boolean;
  verbose: boolean;
  retries: number;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    suite: "messages", limit: null, only: null, concurrency: 2, timeoutMs: 120_000,
    images: "both", videos: false, dryRun: false, save: true, verbose: false, retries: 2,
  };
  const need = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    // Support --flag=value as well as --flag value.
    const [flag, inline] = raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];
    const val = (): string => {
      if (inline !== undefined) return inline;
      const v = need(i, flag);
      i++;
      return v;
    };
    switch (flag) {
      case "--suite": {
        const v = val();
        if (v !== "messages" && v !== "demo" && v !== "all") fail(`--suite must be messages|demo|all (got "${v}")`);
        o.suite = v;
        break;
      }
      case "--limit": {
        const n = Number(val());
        if (!Number.isInteger(n) || n < 1) fail("--limit must be a positive integer");
        o.limit = n;
        break;
      }
      case "--only": o.only = val(); break;
      case "--concurrency": {
        const n = Number(val());
        if (!Number.isInteger(n) || n < 1) fail("--concurrency must be a positive integer");
        if (n > MAX_CONCURRENCY) warn(`--concurrency ${n} exceeds the team limit; using ${MAX_CONCURRENCY}.`);
        o.concurrency = Math.min(n, MAX_CONCURRENCY);
        break;
      }
      case "--timeout": {
        const n = Number(val());
        if (!(n > 0)) fail("--timeout must be a positive number of seconds");
        o.timeoutMs = Math.round(n * 1000);
        break;
      }
      case "--images": {
        const v = val();
        if (v !== "both" && v !== "off" && v !== "only") fail(`--images must be both|off|only (got "${v}")`);
        o.images = v;
        break;
      }
      case "--videos": o.videos = true; break;
      case "--dry-run": o.dryRun = true; break;
      case "--no-save": o.save = false; break;
      case "--verbose": case "-v": o.verbose = true; break;
      case "--help": case "-h": printHelp(); process.exit(0);
      default: fail(`Unknown option "${raw}". Run with --help.`);
    }
  }
  return o;
}

function printHelp(): void {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  const header = src.slice(src.indexOf("/**") + 3, src.indexOf("*/"));
  console.log(header.split("\n").map((l) => l.replace(/^ \* ?/, "")).join("\n").trim());
}

// ───────────────────────────── Output helpers ──────────────────────────────
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = c(31), green = c(32), yellow = c(33), dim = c(2), bold = c(1);
function warn(msg: string): void { console.warn(yellow(`! ${msg}`)); }
function fail(msg: string): never { console.error(red(`✖ ${msg}`)); process.exit(2); }
const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const secs = (ms: number | null): string => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
const LINE = "=".repeat(60);

/** Never print credentials that might be embedded in BASE_URL (user:pass@host). */
function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.username || url.password) { url.username = "***"; url.password = ""; }
    return url.toString().replace(/\/$/, "");
  } catch { return "<invalid BASE_URL>"; }
}

// ───────────────────────────── Dataset loading ─────────────────────────────
interface Expected { level: VerdictLevel; scamType: ScamType; events?: AgentEventType[] }
interface TestCase {
  suite: "messages" | "demo" | "video";
  id: string;
  file: string;
  language: Language;
  category: string;
  expected: Expected;
  request: AgentRequest;
  imageNote: string | null;
  notes: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function categoryOf(scamType: ScamType): string {
  switch (scamType) {
    case "grandparent": return "Grandparent / family emergency";
    case "delivery": return "Delivery";
    case "bank_impersonation": return "Bank impersonation";
    case "government_impersonation": return "Government impersonation";
    case "tech_support": return "Technical support";
    case "romance": return "Romance";
    case "prize_lottery": case "investment_crypto": return "Prize / lottery / crypto";
    case "none": return "Legitimate messages";
    default: return "Other";
  }
}

function validateExpected(e: unknown, where: string, problems: string[]): Expected | null {
  if (!isObj(e)) { problems.push(`${where}: "expected" must be an object`); return null; }
  const level = e.level, scamType = e.scamType;
  let ok = true;
  if (!LEVELS.includes(level as VerdictLevel)) { problems.push(`${where}: invalid expected.level "${String(level)}"`); ok = false; }
  if (!SCAM_TYPES.includes(scamType as ScamType)) { problems.push(`${where}: invalid expected.scamType "${String(scamType)}"`); ok = false; }
  if (level === "safe" && scamType !== "none") { problems.push(`${where}: safe cases must use scamType "none"`); ok = false; }
  if (level !== "safe" && scamType === "none") { problems.push(`${where}: scam/suspicious cases cannot use scamType "none"`); ok = false; }
  let events: AgentEventType[] | undefined;
  if (e.events !== undefined) {
    if (!Array.isArray(e.events) || !e.events.every((x) => AGENT_EVENT_TYPES.includes(x as AgentEventType))) {
      problems.push(`${where}: expected.events must be an array of AgentEvent types`); ok = false;
    } else events = e.events as AgentEventType[];
  }
  return ok ? { level: level as VerdictLevel, scamType: scamType as ScamType, events } : null;
}

/** Converts a PNG/JPEG/WEBP fixture into the contract's InputImage. SVGs are not supported by the contract. */
function loadImage(relPath: string): { image: InputImage | null; note: string } {
  const abs = resolve(DATA, relPath);
  if (!abs.startsWith(DATA)) return { image: null, note: `image path escapes test-data/: ${relPath}` };
  const mediaType = IMAGE_TYPES[extname(abs).toLowerCase()];
  if (!mediaType) return { image: null, note: `unsupported image type ${extname(abs)} (contract allows png/jpeg/webp)` };
  if (!existsSync(abs)) return { image: null, note: `screenshot ${relPath} not found (run: node test-data/screenshots/generate.mjs --png)` };
  const buf = readFileSync(abs);
  if (buf.length > MAX_IMAGE_BYTES) return { image: null, note: `screenshot ${relPath} is larger than 4 MB` };
  return { image: { mediaType, base64: buf.toString("base64") }, note: `screenshot ${relPath} (${(buf.length / 1024).toFixed(0)} KB)` };
}

function loadMessages(opts: Options, problems: string[]): TestCase[] {
  const dir = join(DATA, "messages");
  if (!existsSync(dir)) { problems.push("test-data/messages/ does not exist"); return []; }
  const out: TestCase[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const where = `messages/${f}`;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (err) { problems.push(`${where}: malformed JSON (${(err as Error).message})`); continue; }
    if (!isObj(raw)) { problems.push(`${where}: top level must be an object`); continue; }
    const before = problems.length;
    const id = raw.id;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) problems.push(`${where}: "id" must be a lowercase slug`);
    else if (`${id}.json` !== f) problems.push(`${where}: id "${id}" does not match file name`);
    const text = raw.text;
    if (text !== undefined && text !== null && typeof text !== "string") problems.push(`${where}: "text" must be a string`);
    const image = raw.image;
    if (image !== undefined && image !== null && typeof image !== "string") problems.push(`${where}: "image" must be a path string or null`);
    if ((typeof text !== "string" || !text.trim()) && typeof image !== "string") problems.push(`${where}: needs non-empty "text" or an "image"`);
    if (!LANGUAGES.includes(raw.language as Language)) problems.push(`${where}: invalid language "${String(raw.language)}"`);
    if (raw.alreadyActed !== undefined && typeof raw.alreadyActed !== "boolean") problems.push(`${where}: "alreadyActed" must be boolean`);
    if (raw.actionDetails !== undefined && raw.actionDetails !== null && typeof raw.actionDetails !== "string") problems.push(`${where}: "actionDetails" must be a string`);
    const expected = validateExpected(raw.expected, where, problems);
    if (problems.length > before || !expected) continue;

    const request: AgentRequest = { language: raw.language as Language };
    let imageNote: string | null = null;
    let img: InputImage | null = null;
    if (typeof image === "string" && opts.images !== "off") {
      const r = loadImage(image);
      img = r.image;
      imageNote = r.note;
    }
    const imageOnly = opts.images === "only" && img !== null;
    if (typeof text === "string" && text.trim() && !imageOnly) request.text = text;
    if (img) request.images = [img];
    if (!request.text && !request.images) { problems.push(`${where}: nothing to send (${imageNote ?? "no text"})`); continue; }
    if (raw.alreadyActed === true) request.alreadyActed = true;
    if (typeof raw.actionDetails === "string" && raw.actionDetails.trim()) request.actionDetails = raw.actionDetails;

    out.push({
      suite: "messages", id: id as string, file: where, language: request.language,
      category: categoryOf(expected.scamType), expected, request, imageNote,
      notes: typeof raw.notes === "string" ? raw.notes : "",
    });
  }
  return out;
}

const REQUEST_KEYS = new Set(["text", "images", "video", "language", "alreadyActed", "actionDetails", "familyContact", "demo"]);

function loadDemos(problems: string[]): TestCase[] {
  const dir = join(DATA, "demo");
  if (!existsSync(dir)) { problems.push("test-data/demo/ does not exist"); return []; }
  const out: TestCase[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const where = `demo/${f}`;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (err) { problems.push(`${where}: malformed JSON (${(err as Error).message})`); continue; }
    if (!isObj(raw) || typeof raw.id !== "string" || !isObj(raw.request)) { problems.push(`${where}: needs "id" and "request" object`); continue; }
    const before = problems.length;
    const req = raw.request;
    for (const k of Object.keys(req)) if (!REQUEST_KEYS.has(k)) problems.push(`${where}: request.${k} is not an AgentRequest field`);
    if (!LANGUAGES.includes(req.language as Language)) problems.push(`${where}: invalid request.language`);
    if (req.text !== undefined && typeof req.text !== "string") problems.push(`${where}: request.text must be a string`);
    if (req.alreadyActed !== undefined && typeof req.alreadyActed !== "boolean") problems.push(`${where}: request.alreadyActed must be boolean`);
    if (req.familyContact !== undefined && !(isObj(req.familyContact) && typeof req.familyContact.name === "string")) problems.push(`${where}: request.familyContact needs a name`);
    if (req.demo === true) warn(`${where}: request.demo=true asks the API for its canned demo path — this does not test the real agent.`);
    const expected = validateExpected(raw.expected, where, problems);
    if (problems.length > before || !expected) continue;
    out.push({
      suite: "demo", id: raw.id, file: where, language: req.language as Language,
      category: `Demo: ${categoryOf(expected.scamType)}`, expected,
      request: req as unknown as AgentRequest, imageNote: null,
      notes: typeof raw.explanation === "string" ? raw.explanation : "",
    });
  }
  return out;
}

// ───────────────────────────── Video manifest ──────────────────────────────
interface ManifestEntry { file: string; isAI: boolean; isScam: boolean; hasCredentials: boolean; notes: string }
interface VideoPlan { entries: ManifestEntry[]; runnable: { entry: ManifestEntry; request: AgentRequest }[]; skipped: { file: string; reason: string }[]; problems: string[] }

/**
 * The contract's VideoInput needs a videoId (file already uploaded through the
 * app's /api/upload, saved in .uploads/) plus client-extracted frames. The
 * evaluator does not upload by itself, so it runs a video only when a
 * prepared request exists at test-data/videos/requests/<name>.json containing
 * { "video": VideoInput, "text"?: string, "language"?: Language } — e.g. copied
 * from the browser DevTools Network tab after uploading the clip in the UI.
 */
function planVideos(): VideoPlan {
  const plan: VideoPlan = { entries: [], runnable: [], skipped: [], problems: [] };
  const mPath = join(DATA, "videos", "manifest.json");
  if (!existsSync(mPath)) { plan.problems.push("test-data/videos/manifest.json not found"); return plan; }
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(mPath, "utf8")); }
  catch (err) { plan.problems.push(`videos/manifest.json: malformed JSON (${(err as Error).message})`); return plan; }
  if (!Array.isArray(raw)) { plan.problems.push("videos/manifest.json must be an array"); return plan; }
  const seen = new Set<string>();
  raw.forEach((e, i) => {
    const where = `videos/manifest.json[${i}]`;
    if (!isObj(e) || typeof e.file !== "string" || typeof e.isAI !== "boolean" || typeof e.isScam !== "boolean" ||
        typeof e.hasCredentials !== "boolean" || typeof e.notes !== "string") {
      plan.problems.push(`${where}: needs file, isAI, isScam, hasCredentials (booleans) and notes`); return;
    }
    if (seen.has(e.file)) plan.problems.push(`${where}: duplicate file ${e.file}`);
    seen.add(e.file);
    const entry: ManifestEntry = { file: e.file, isAI: e.isAI, isScam: e.isScam, hasCredentials: e.hasCredentials, notes: e.notes };
    plan.entries.push(entry);
    const reqPath = join(DATA, "videos", "requests", `${basename(e.file, extname(e.file))}.json`);
    if (!existsSync(reqPath)) { plan.skipped.push({ file: e.file, reason: "no prepared request (videos/requests/<name>.json with an uploaded videoId + frames)" }); return; }
    try {
      const r = JSON.parse(readFileSync(reqPath, "utf8"));
      const v = r?.video;
      if (!isObj(v) || typeof v.videoId !== "string" || !Array.isArray(v.frames) || !Array.isArray(v.frameTimes) ||
          typeof v.durationSec !== "number" || typeof v.fileName !== "string") {
        plan.skipped.push({ file: e.file, reason: "prepared request is missing VideoInput fields" }); return;
      }
      const request: AgentRequest = { video: v as unknown as VideoInput, language: LANGUAGES.includes(r.language) ? r.language : "en" };
      if (typeof r.text === "string" && r.text.trim()) request.text = r.text;
      plan.runnable.push({ entry, request });
    } catch (err) {
      plan.skipped.push({ file: e.file, reason: `prepared request unreadable: ${(err as Error).message}` });
    }
  });
  return plan;
}

// ──────────────────────────────── SSE client ───────────────────────────────
interface RunOutcome {
  status: "ok" | "error";
  error: string | null;
  httpStatus: number | null;
  verdict: Verdict | null;
  aiMediaLevel: AiMediaLevel | null;
  eventTypes: string[];
  eventCounts: Record<string, number>;
  /** From the family_alert event's FamilyAlertResult: was it really sent? */
  familyAlert: { delivered: boolean; channel: string; error?: string } | null;
  damageControlSteps: number | null;
  warnings: string[];
  ms: number;
  attempts: number;
}

/** Pull the Verdict out of a verdict event, tolerating {verdict}, {data}, {payload} or flat shapes. */
function extractVerdict(evt: Record<string, unknown>): Verdict | null {
  for (const cand of [evt.verdict, evt.data, evt.payload, evt]) {
    if (isObj(cand) && LEVELS.includes(cand.level as VerdictLevel)) return cand as unknown as Verdict;
  }
  return null;
}

function extractAiLevel(v: Verdict): AiMediaLevel | null {
  const level = v.aiMedia?.level;
  return level && AI_LEVELS.includes(level) ? level : null;
}

/** Parses one SSE block ("data: ..." lines, possibly multi-line, possibly with event:/id:/comments). */
function parseSseBlock(block: string): { data: string | null; eventName: string | null } {
  const dataLines: string[] = [];
  let eventName: string | null = null;
  for (const line of block.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
    else if (field === "event") eventName = value;
  }
  return { data: dataLines.length ? dataLines.join("\n") : null, eventName };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAgent(baseUrl: string, req: AgentRequest, opts: Options, log: (s: string) => void): Promise<RunOutcome> {
  const started = performance.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    const out = await callAgentOnce(baseUrl, req, opts, log);
    out.attempts = attempts;
    const retryable = out.httpStatus === 429 || out.httpStatus === 503;
    if (!retryable || attempts > opts.retries) { out.ms = Math.round(performance.now() - started); return out; }
    const wait = Math.min(30_000, (out.retryAfterMs ?? 2_000 * attempts));
    log(yellow(`HTTP ${out.httpStatus}; retrying in ${(wait / 1000).toFixed(0)} s (attempt ${attempts + 1}/${opts.retries + 1})`));
    await sleep(wait);
  }
}

async function callAgentOnce(baseUrl: string, req: AgentRequest, opts: Options, log: (s: string) => void): Promise<RunOutcome & { retryAfterMs?: number }> {
  const out: RunOutcome & { retryAfterMs?: number } = {
    status: "error", error: null, httpStatus: null, verdict: null, aiMediaLevel: null,
    eventTypes: [], eventCounts: {}, familyAlert: null, damageControlSteps: null, warnings: [], ms: 0, attempts: 1,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), opts.timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${baseUrl}/api/agent`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    out.httpStatus = res.status;
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) out.retryAfterMs = ra * 1000;
      let body = "";
      try { body = (await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch { /* ignore */ }
      out.error = `HTTP ${res.status}${body ? `: ${body}` : ""}`;
      return out;
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/event-stream")) out.warnings.push(`unexpected content-type "${ctype}"`);
    if (!res.body) { out.error = "response has no body"; return out; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawDone = false;
    let streamError: string | null = null;
    const handle = (block: string): void => {
      const { data, eventName } = parseSseBlock(block);
      if (data === null) return;
      let evt: unknown;
      try { evt = JSON.parse(data); }
      catch { out.warnings.push(`invalid JSON event: ${data.slice(0, 80)}`); return; }
      if (!isObj(evt)) { out.warnings.push("event is not an object"); return; }
      const type = typeof evt.type === "string" ? evt.type : eventName ?? "<missing type>";
      if (sawDone) out.warnings.push(`event "${type}" arrived after done`);
      if (!AGENT_EVENT_TYPES.includes(type as AgentEventType)) out.warnings.push(`unknown event type "${type}"`);
      out.eventTypes.push(type);
      out.eventCounts[type] = (out.eventCounts[type] ?? 0) + 1;
      if (opts.verbose) log(dim(`  ← ${type}`));
      if (type === "verdict") {
        const v = extractVerdict(evt);
        if (!v) out.warnings.push("verdict event without a valid level");
        else {
          if (out.verdict) out.warnings.push("more than one verdict event; using the last");
          out.verdict = v;
          if (!SCAM_TYPES.includes(v.scamType)) out.warnings.push(`verdict has unknown scamType "${String(v.scamType)}"`);
        }
      } else if (type === "error") {
        const m = evt.message ?? evt.error ?? (isObj(evt.data) ? evt.data.message : undefined);
        streamError = typeof m === "string" ? m : JSON.stringify(evt).slice(0, 200);
      } else if (type === "family_alert") {
        const r = evt.result;
        if (isObj(r) && typeof r.delivered === "boolean") {
          out.familyAlert = { delivered: r.delivered, channel: String(r.channel ?? "unknown"), ...(typeof r.error === "string" ? { error: r.error } : {}) };
        } else out.warnings.push("family_alert event without a FamilyAlertResult");
      } else if (type === "damage_control") {
        const plan = evt.plan;
        out.damageControlSteps = isObj(plan) && Array.isArray(plan.steps) ? plan.steps.length : 0;
        if (!out.damageControlSteps) out.warnings.push("damage_control event with no steps");
      } else if (type === "done") {
        sawDone = true;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Events are separated by a blank line (\n\n, \r\n\r\n or \r\r).
      let m: RegExpExecArray | null;
      const sep = /\r\n\r\n|\n\n|\r\r/;
      while ((m = sep.exec(buf)) !== null) {
        handle(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
      }
      if (sawDone) { await reader.cancel().catch(() => undefined); break; }
    }
    buf += decoder.decode();
    if (buf.trim()) handle(buf);

    // Order checks (warnings only; they do not change scoring).
    const first = out.eventTypes[0];
    if (first && first !== "plan" && first !== "error") out.warnings.push(`first event was "${first}", expected "plan"`);
    const vi = out.eventTypes.indexOf("verdict");
    for (const t of ["family_alert", "damage_control"]) {
      const ti = out.eventTypes.indexOf(t);
      if (ti !== -1 && vi !== -1 && ti < vi) out.warnings.push(`${t} arrived before verdict`);
    }
    if (sawDone && out.eventTypes[out.eventTypes.length - 1] !== "done") out.warnings.push("done was not the last event");

    if (!sawDone) out.error = "stream ended without a done event (disconnected?)";
    else if (!out.verdict) out.error = streamError ? `agent error: ${streamError}` : "no verdict event in stream";
    else {
      out.status = "ok";
      out.aiMediaLevel = extractAiLevel(out.verdict);
      if (streamError) out.warnings.push(`error event alongside verdict: ${streamError}`);
    }
    return out;
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (ctrl.signal.aborted) out.error = `timed out after ${opts.timeoutMs / 1000} s`;
    else if (e.cause?.code === "ECONNREFUSED") out.error = "connection refused (is the app running?)";
    else out.error = `request failed: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
    return out;
  } finally {
    clearTimeout(timer);
    out.ms = Math.round(performance.now() - t0);
  }
}

// ─────────────────────────────── Scoring ───────────────────────────────────
interface CaseResult {
  suite: string;
  id: string;
  file: string;
  category: string;
  language: Language;
  sentImage: boolean;
  sentText: boolean;
  expected: Expected;
  actual: { level: VerdictLevel; scamType: ScamType; confidence: number | null; headline: string | null; aiMedia: AiMediaLevel | null } | null;
  status: "ok" | "error";
  verdictCorrect: boolean;
  scamTypeCorrect: boolean | null;
  eventsMissing: string[];
  familyAlert: RunOutcome["familyAlert"];
  damageControlSteps: number | null;
  responseMs: number;
  attempts: number;
  httpStatus: number | null;
  error: string | null;
  warnings: string[];
  eventTypes: string[];
}

function toCaseResult(tc: TestCase, o: RunOutcome): CaseResult {
  const v = o.verdict;
  const ok = o.status === "ok" && v !== null;
  const eventsMissing = ok ? (tc.expected.events ?? []).filter((t) => !o.eventTypes.includes(t)) : [];
  return {
    suite: tc.suite, id: tc.id, file: tc.file, category: tc.category, language: tc.language,
    sentImage: !!tc.request.images?.length, sentText: !!tc.request.text,
    expected: tc.expected,
    actual: v ? {
      level: v.level, scamType: v.scamType,
      confidence: typeof v.confidence === "number" ? v.confidence : null,
      headline: typeof v.headline === "string" ? v.headline : null,
      aiMedia: o.aiMediaLevel,
    } : null,
    status: ok ? "ok" : "error",
    verdictCorrect: ok && v.level === tc.expected.level,
    scamTypeCorrect: ok ? v.scamType === tc.expected.scamType : null,
    eventsMissing,
    familyAlert: o.familyAlert, damageControlSteps: o.damageControlSteps,
    responseMs: o.ms, attempts: o.attempts, httpStatus: o.httpStatus,
    error: o.error, warnings: o.warnings, eventTypes: o.eventTypes,
  };
}

interface Bucket { name: string; total: number; correct: number; errors: number }
function bucketize(rs: CaseResult[], key: (r: CaseResult) => string): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const r of rs) {
    const k = key(r);
    const b = m.get(k) ?? { name: k, total: 0, correct: 0, errors: 0 };
    b.total++;
    if (r.verdictCorrect) b.correct++;
    if (r.status === "error") b.errors++;
    m.set(k, b);
  }
  return [...m.values()];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

const CATEGORY_ORDER = [
  "Grandparent / family emergency", "Delivery", "Bank impersonation", "Government impersonation",
  "Technical support", "Romance", "Prize / lottery / crypto", "Legitimate messages", "Other",
];

function computeMetrics(rs: CaseResult[]) {
  const completed = rs.filter((r) => r.status === "ok");
  const legit = rs.filter((r) => r.expected.level === "safe");
  const risky = rs.filter((r) => r.expected.level !== "safe");
  const flagged = (r: CaseResult) => r.actual !== null && r.actual.level !== "safe";
  const falsePositives = legit.filter((r) => r.status === "ok" && flagged(r));
  const missed = risky.filter((r) => r.status === "ok" && !flagged(r));
  const downgraded = rs.filter((r) => r.expected.level === "scam" && r.actual?.level === "suspicious");
  const upgraded = rs.filter((r) => r.expected.level === "suspicious" && r.actual?.level === "scam");
  const binaryCorrect = rs.filter((r) => r.status === "ok" && flagged(r) === (r.expected.level !== "safe"));
  const typeEval = completed;
  const typeCorrect = typeEval.filter((r) => r.scamTypeCorrect);
  const riskyCompleted = completed.filter((r) => r.expected.level !== "safe");
  const lat = completed.map((r) => r.responseMs);
  const withEvents = rs.filter((r) => r.expected.events && r.expected.events.length);

  const byCategory = bucketize(rs, (r) => r.category).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.name), ib = CATEGORY_ORDER.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  const byLanguage = bucketize(rs, (r) => LANGUAGE_NAMES[r.language] ?? r.language).sort((a, b) => b.total - a.total);

  return {
    total: rs.length,
    completed: completed.length,
    errors: rs.length - completed.length,
    verdictCorrect: rs.filter((r) => r.verdictCorrect).length,
    verdictIncorrect: rs.length - rs.filter((r) => r.verdictCorrect).length,
    accuracy: rs.length ? rs.filter((r) => r.verdictCorrect).length / rs.length : null,
    binaryDetectionCorrect: binaryCorrect.length,
    legitimateTotal: legit.length,
    falsePositives: falsePositives.length,
    falsePositiveIds: falsePositives.map((r) => r.id),
    falsePositiveRate: legit.length ? falsePositives.length / legit.length : null,
    scamTotal: risky.length,
    missedScams: missed.length,
    missedScamIds: missed.map((r) => r.id),
    missedScamRate: risky.length ? missed.length / risky.length : null,
    scamDowngradedToSuspicious: downgraded.map((r) => r.id),
    suspiciousUpgradedToScam: upgraded.map((r) => r.id),
    scamTypeEvaluated: typeEval.length,
    scamTypeCorrect: typeCorrect.length,
    scamTypeAccuracy: typeEval.length ? typeCorrect.length / typeEval.length : null,
    scamTypeAccuracyOnRiskyCases: riskyCompleted.length ? riskyCompleted.filter((r) => r.scamTypeCorrect).length / riskyCompleted.length : null,
    verdictCorrectButScamTypeWrong: rs.filter((r) => r.verdictCorrect && r.scamTypeCorrect === false)
      .map((r) => ({ id: r.id, expected: r.expected.scamType, actual: r.actual?.scamType })),
    familyAlertsEmitted: rs.filter((r) => r.familyAlert).length,
    // Only SMS/email count as "sent". channel "screen" means it was only shown in the app.
    familyAlertsSent: rs.filter((r) => r.familyAlert?.delivered && r.familyAlert.channel !== "screen").length,
    familyAlertsScreenOnly: rs.filter((r) => r.familyAlert?.channel === "screen").length,
    familyAlertChannels: [...new Set(rs.flatMap((r) => (r.familyAlert ? [r.familyAlert.channel] : [])))],
    expectedEventsChecked: withEvents.length,
    expectedEventsMissing: withEvents.filter((r) => r.eventsMissing.length).map((r) => ({ id: r.id, missing: r.eventsMissing })),
    latencyMs: { average: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null, median: median(lat), p90: percentile(lat, 90), max: lat.length ? Math.max(...lat) : null },
    byCategory,
    byLanguage,
  };
}
type Metrics = ReturnType<typeof computeMetrics>;

// ───────────────────────────── Video scoring ───────────────────────────────
interface VideoResult {
  file: string;
  expected: { isAI: boolean; isScam: boolean; hasCredentials: boolean };
  status: "ok" | "error";
  actualAiMedia: AiMediaLevel | null;
  actualLevel: VerdictLevel | null;
  aiCorrect: boolean | null;
  scamCorrect: boolean | null;
  responseMs: number;
  error: string | null;
}
function scoreVideos(results: VideoResult[]) {
  const ok = results.filter((r) => r.status === "ok");
  const aiScored = ok.filter((r) => r.aiCorrect !== null);
  return {
    tested: results.length,
    errors: results.length - ok.length,
    // Metric 1 — "Is this video AI-generated?" (likely_ai vs likely_real; "unclear" counts as not correct)
    aiDetection: {
      evaluated: aiScored.length,
      correct: aiScored.filter((r) => r.aiCorrect).length,
      unclear: ok.filter((r) => r.actualAiMedia === "unclear").length,
      missingAiMedia: ok.filter((r) => r.actualAiMedia === null).length,
    },
    // Metric 2 — "Is this video being used for a scam?" (scam/suspicious vs safe)
    scamClassification: {
      evaluated: ok.length,
      correct: ok.filter((r) => r.scamCorrect).length,
    },
  };
}

// ──────────────────────────────── Concurrency ──────────────────────────────
async function pool<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const n = Math.max(1, Math.min(limit, MAX_CONCURRENCY));
  const results: R[] = new Array(items.length);
  let next = 0;
  let active = 0;
  let peak = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      active++;
      peak = Math.max(peak, active);
      try { results[i] = await fn(items[i], i); }
      finally { active--; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  if (peak > MAX_CONCURRENCY) throw new Error(`internal error: concurrency reached ${peak}`);
  return results;
}

// ──────────────────────────────── Reporting ────────────────────────────────
function printReport(m: Metrics, baseUrl: string, video: ReturnType<typeof scoreVideos> | null, videoSkipReason: string | null, plan: VideoPlan): void {
  const row = (label: string, b: Bucket): string =>
    `  ${label.padEnd(40)} ${`${b.correct}/${b.total}`.padStart(7)}  ${pct(b.correct, b.total).padStart(6)}${b.errors ? red(`  (${b.errors} error${b.errors > 1 ? "s" : ""})`) : ""}`;
  console.log("\n" + bold(LINE));
  console.log(bold("SCAMSHIELD EVALUATION REPORT"));
  console.log(bold(LINE));
  console.log(`Target:                     ${redactUrl(baseUrl)}/api/agent`);
  console.log(`Cases tested:               ${m.total}  (completed ${m.completed}, errors ${m.errors})`);
  console.log(`Correct verdicts:           ${m.verdictCorrect}/${m.total}`);
  console.log(`Verdict accuracy:           ${bold(pct(m.verdictCorrect, m.total))}  ${dim("(errors count as incorrect)")}`);
  console.log(`Scam-vs-safe detection:     ${m.binaryDetectionCorrect}/${m.total}  ${pct(m.binaryDetectionCorrect, m.total)}  ${dim("(scam & suspicious both = flagged)")}`);
  console.log("");
  const fp = `${m.falsePositives}/${m.legitimateTotal}`;
  const ms = `${m.missedScams}/${m.scamTotal}`;
  console.log(`False alarms on legitimate: ${m.falsePositives ? red(fp) : green(fp)}  ${pct(m.falsePositives, m.legitimateTotal)}${m.falsePositiveIds.length ? dim(`  [${m.falsePositiveIds.join(", ")}]`) : ""}`);
  console.log(`Missed scams (said safe):   ${m.missedScams ? red(ms) : green(ms)}  ${pct(m.missedScams, m.scamTotal)}${m.missedScamIds.length ? dim(`  [${m.missedScamIds.join(", ")}]`) : ""}`);
  if (m.scamDowngradedToSuspicious.length) console.log(`Scam → "suspicious":        ${m.scamDowngradedToSuspicious.length}  ${dim(`[${m.scamDowngradedToSuspicious.join(", ")}] (still flagged, but verdict counted wrong)`)}`);
  if (m.suspiciousUpgradedToScam.length) console.log(`Suspicious → "scam":        ${m.suspiciousUpgradedToScam.length}  ${dim(`[${m.suspiciousUpgradedToScam.join(", ")}]`)}`);
  console.log("");
  console.log(`ScamType accuracy:          ${m.scamTypeCorrect}/${m.scamTypeEvaluated}  ${pct(m.scamTypeCorrect, m.scamTypeEvaluated)}  ${dim("(completed cases; separate from verdict)")}`);
  if (m.verdictCorrectButScamTypeWrong.length) {
    console.log(`Right verdict, wrong type:  ${m.verdictCorrectButScamTypeWrong.length}`);
    for (const x of m.verdictCorrectButScamTypeWrong) console.log(dim(`    ${x.id}: expected ${x.expected}, got ${x.actual}`));
  }
  if (m.expectedEventsChecked) {
    console.log(`Expected events present:    ${m.expectedEventsChecked - m.expectedEventsMissing.length}/${m.expectedEventsChecked}`);
    for (const x of m.expectedEventsMissing) console.log(red(`    ${x.id}: missing ${x.missing.join(", ")}`));
  }
  if (m.familyAlertsEmitted) {
    console.log(`Family alerts sent:         ${m.familyAlertsSent}/${m.familyAlertsEmitted} by SMS/email · ${m.familyAlertsScreenOnly} shown on screen only  ${dim(`(channels: ${m.familyAlertChannels.join(", ")})`)}`);
  }
  console.log("");
  console.log(`Response time:              avg ${secs(m.latencyMs.average)} · median ${secs(m.latencyMs.median)} · p90 ${secs(m.latencyMs.p90)} · max ${secs(m.latencyMs.max)}`);
  console.log("\n" + bold("CATEGORY PERFORMANCE (verdict level)"));
  for (const b of m.byCategory) console.log(row(b.name, b));
  console.log("\n" + bold("LANGUAGE PERFORMANCE (verdict level)"));
  for (const b of m.byLanguage) console.log(row(b.name, b));
  console.log("\n" + bold("VIDEO EVALUATION"));
  if (!video) {
    console.log(`  AI-generated detection:     ${yellow("SKIPPED")}`);
    console.log(`  Scam classification:        ${yellow("SKIPPED")}`);
    console.log(dim(`  Reason: ${videoSkipReason}`));
    if (plan.entries.length) console.log(dim(`  Manifest: ${plan.entries.length} entries (${plan.entries.filter((e) => e.isAI).length} AI, ${plan.entries.filter((e) => !e.isAI).length} real); ${plan.runnable.length} runnable.`));
  } else {
    const a = video.aiDetection, s = video.scamClassification;
    console.log(`  AI-generated detection:     ${a.correct}/${a.evaluated}  ${pct(a.correct, a.evaluated)}  ${dim(`(unclear: ${a.unclear}, no aiMedia: ${a.missingAiMedia})`)}`);
    console.log(`  Scam classification:        ${s.correct}/${s.evaluated}  ${pct(s.correct, s.evaluated)}`);
    console.log(dim(`  Videos run: ${video.tested}, errors: ${video.errors}, skipped: ${plan.skipped.length}`));
  }
  console.log(bold(LINE));
  // One-line summary in the format the team guide asks for (P4-6).
  console.log(bold(`Messages: ${m.verdictCorrect}/${m.total} correct | False alarms on real messages: ${m.falsePositives}/${m.legitimateTotal} | Missed scams: ${m.missedScams}/${m.scamTotal} | Avg time: ${m.latencyMs.average === null ? "n/a" : (m.latencyMs.average / 1000).toFixed(1)} s`));
}

// ─────────────────────────────────── Main ──────────────────────────────────
async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  try { new URL(baseUrl); } catch { fail("BASE_URL is not a valid URL"); }

  // 1. Load + validate fixtures.
  const problems: string[] = [];
  let cases: TestCase[] = [];
  if (opts.suite !== "demo") cases.push(...loadMessages(opts, problems));
  if (opts.suite !== "messages") cases.push(...loadDemos(problems));
  const ids = new Map<string, string>();
  for (const tc of cases) {
    const prev = ids.get(tc.id);
    if (prev) problems.push(`duplicate id "${tc.id}" in ${prev} and ${tc.file}`);
    ids.set(tc.id, tc.file);
  }
  const videoPlan = planVideos();
  problems.push(...videoPlan.problems);

  console.log(bold("ScamShield evaluator") + dim(`  suite=${opts.suite} concurrency=${opts.concurrency} timeout=${opts.timeoutMs / 1000}s images=${opts.images}${opts.dryRun ? " DRY-RUN" : ""}`));
  console.log(`Loaded ${cases.length} valid case(s); video manifest: ${videoPlan.entries.length} entr${videoPlan.entries.length === 1 ? "y" : "ies"}.`);
  if (problems.length) {
    console.error(red(`\n✖ ${problems.length} dataset problem(s):`));
    for (const p of problems) console.error(red(`  - ${p}`));
    console.error(red("Fix the dataset before evaluating (no API calls were made)."));
    process.exit(1);
  }
  console.log(green("✔ Dataset valid") + dim(" (JSON parses, unique ids, valid levels/scamTypes/languages)"));

  if (opts.only) cases = cases.filter((tc) => tc.id.includes(opts.only as string));
  if (opts.limit !== null) cases = cases.slice(0, opts.limit);
  if (!cases.length) fail("no cases selected");

  const imageNotes = cases.filter((tc) => tc.imageNote);
  for (const tc of imageNotes) {
    const sent = !!tc.request.images?.length;
    const msg = `${tc.id}: ${tc.imageNote}${sent ? (tc.request.text ? " → sending text + image" : " → sending image only") : " → text only"}`;
    console.log(sent ? dim(`  ${msg}`) : yellow(`  ! ${msg}`));
  }

  let videoSkipReason: string | null = null;
  if (!opts.videos) videoSkipReason = "not requested (run with --videos once prepared requests exist).";
  else if (!videoPlan.runnable.length) videoSkipReason = "no runnable videos. Needs: (1) clips in the shared drive, (2) Person 2's detector live with API key, (3) each clip uploaded via the app so a videoId + frames exist, saved as test-data/videos/requests/<name>.json.";

  // 2. Dry run: show what would be sent; no network.
  if (opts.dryRun) {
    console.log("\n" + bold("DRY RUN — no API requests will be made"));
    for (const tc of cases) {
      const r = tc.request;
      const parts = [
        `lang=${r.language}`,
        r.text ? `text=${r.text.length}ch` : null,
        r.images?.length ? `images=${r.images.length}` : null,
        r.alreadyActed ? "alreadyActed" : null,
        r.actionDetails ? "actionDetails" : null,
        r.familyContact ? "familyContact" : null,
      ].filter(Boolean).join(" ");
      console.log(`  ${tc.id.padEnd(30)} expect ${`${tc.expected.level}/${tc.expected.scamType}`.padEnd(34)} ${dim(parts)}`);
      const extra = Object.keys(r).filter((k) => !REQUEST_KEYS.has(k));
      if (extra.length) fail(`${tc.id}: request contains non-contract keys ${extra.join(", ")}`);
    }
    console.log(dim(`\nWould POST ${cases.length} request(s) to ${redactUrl(baseUrl)}/api/agent with concurrency ${opts.concurrency}.`));
    console.log(dim(`Video: ${videoPlan.runnable.length} runnable, ${videoPlan.skipped.length} skipped (${videoSkipReason ?? "would run"})`));
    if (opts.save) {
      const file = saveResults({ mode: "dry-run", baseUrl, opts, cases: cases.map((tc) => ({ id: tc.id, expected: tc.expected, request: summarizeRequest(tc.request) })) });
      console.log(dim(`Saved dry-run summary to ${file}`));
    }
    console.log(green("\n✔ Dry run complete."));
    return;
  }

  // 3. Preflight: is the app reachable?
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(baseUrl, { method: "GET", signal: ctrl.signal }).finally(() => clearTimeout(t));
  } catch (err) {
    console.error(red(`\n✖ Cannot reach ${redactUrl(baseUrl)} (${(err as Error & { cause?: { code?: string } }).cause?.code ?? (err as Error).message}).`));
    console.error("  Start the app first:  npm install  →  npm run dev   (needs .env.local with the team's API keys)");
    console.error("  Or point at another laptop on the Wi-Fi:  BASE_URL=http://<laptop-ip>:3000 npx tsx scripts/eval.ts");
    process.exit(3);
  }

  // 4. Run message/demo cases.
  console.log(`\nRunning ${cases.length} case(s) against ${redactUrl(baseUrl)}/api/agent …`);
  let done = 0;
  const results = await pool(cases, opts.concurrency, async (tc) => {
    const prefix = (s: string) => console.log(`  ${dim(tc.id)} ${s}`);
    const o = await callAgent(baseUrl, tc.request, opts, prefix);
    const r = toCaseResult(tc, o);
    done++;
    const tag = r.status === "error" ? red("ERROR") : r.verdictCorrect ? green("PASS ") : red("FAIL ");
    const got = r.actual ? `${r.actual.level}/${r.actual.scamType}` : r.error ?? "no verdict";
    const typeNote = r.status === "ok" && r.verdictCorrect && !r.scamTypeCorrect ? yellow(" (type mismatch)") : "";
    const evNote = r.eventsMissing.length ? yellow(` (missing ${r.eventsMissing.join(",")})`) : "";
    console.log(`[${String(done).padStart(2)}/${cases.length}] ${tag} ${tc.id.padEnd(28)} expected ${`${tc.expected.level}/${tc.expected.scamType}`.padEnd(32)} got ${got}${typeNote}${evNote} ${dim(secs(r.responseMs))}`);
    if (opts.verbose) {
      if (r.actual?.headline) console.log(dim(`        “${r.actual.headline}”`));
      for (const w of r.warnings) console.log(yellow(`        ! ${w}`));
    }
    return r;
  });

  // 5. Video cases (only via a real, prepared pathway).
  let videoResults: VideoResult[] = [];
  let videoScore: ReturnType<typeof scoreVideos> | null = null;
  if (opts.videos && videoPlan.runnable.length) {
    console.log(`\nRunning ${videoPlan.runnable.length} video case(s) …`);
    videoResults = await pool(videoPlan.runnable, opts.concurrency, async ({ entry, request }) => {
      const o = await callAgent(baseUrl, request, opts, (s) => console.log(`  ${dim(entry.file)} ${s}`));
      const ok = o.status === "ok" && o.verdict !== null;
      const ai = o.aiMediaLevel;
      const r: VideoResult = {
        file: entry.file,
        expected: { isAI: entry.isAI, isScam: entry.isScam, hasCredentials: entry.hasCredentials },
        status: ok ? "ok" : "error",
        actualAiMedia: ai,
        actualLevel: o.verdict?.level ?? null,
        aiCorrect: ok && ai !== null ? (entry.isAI ? ai === "likely_ai" : ai === "likely_real") : null,
        scamCorrect: ok ? (o.verdict!.level !== "safe") === entry.isScam : null,
        responseMs: o.ms,
        error: o.error,
      };
      console.log(`  ${r.status === "ok" ? "" : red("ERROR ")}${entry.file.padEnd(14)} AI expected ${String(entry.isAI).padEnd(5)} got ${ai ?? "—"} · scam expected ${String(entry.isScam).padEnd(5)} got ${r.actualLevel ?? r.error}`);
      return r;
    });
    videoScore = scoreVideos(videoResults);
  }

  // 6. Report + save.
  const metrics = computeMetrics(results);
  printReport(metrics, baseUrl, videoScore, videoSkipReason, videoPlan);
  if (opts.save) {
    const file = saveResults({
      mode: "live", baseUrl, opts,
      datasetSize: cases.length,
      metrics,
      results,
      video: videoScore
        ? { status: "run", metrics: videoScore, results: videoResults, skipped: videoPlan.skipped }
        : { status: "skipped", reason: videoSkipReason, manifestEntries: videoPlan.entries.length, skipped: videoPlan.skipped },
      skippedTests: [],
    });
    console.log(`Results saved to ${file}`);
  }
  if (metrics.errors === metrics.total) {
    console.error(red("Every request failed — check the server logs and API keys."));
    process.exit(4);
  }
}

function summarizeRequest(r: AgentRequest): Record<string, unknown> {
  return {
    ...r,
    images: r.images?.map((i) => ({ mediaType: i.mediaType, base64Bytes: i.base64.length })),
  };
}

function saveResults(payload: Record<string, unknown> & { mode: string; baseUrl: string; opts: Options }): string {
  const dir = join(DATA, "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `${stamp}${payload.mode === "dry-run" ? "-dry-run" : ""}.json`);
  const { opts, baseUrl, ...rest } = payload;
  const body = {
    tool: "scripts/eval.ts",
    timestamp: new Date().toISOString(),
    baseUrl: redactUrl(baseUrl),
    options: { suite: opts.suite, limit: opts.limit, only: opts.only, concurrency: opts.concurrency, timeoutMs: opts.timeoutMs, images: opts.images, videos: opts.videos },
    ...rest,
  };
  writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  return file.slice(ROOT.length + 1).replace(/\\/g, "/");
}

main().catch((err) => {
  console.error(red(`✖ Unexpected failure: ${(err as Error).stack ?? err}`));
  process.exit(1);
});
