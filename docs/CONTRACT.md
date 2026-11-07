# ScamShield contract

Everything shared between the agent, the investigation tools, and the screens lives
in `lib/contract.ts`. Person 1 owns that file. Person 2 implements the tool
functions. Person 3 builds the UI against the event stream and the recorded runs in
`mock/`.

If you need to change a shape in `lib/contract.ts`, say so in the team chat before
you merge. A silent change breaks the other three branches. The Zod schemas in
`lib/agent/schemas.ts` must match the types: compile-time checks fail the build if
they drift.

## The event stream

`POST /api/agent` answers with a stream of `AgentEvent` values. The union in
`lib/contract.ts` is the only source of truth.

| Event type | Payload | When the agent emits it | What the UI does |
| --- | --- | --- | --- |
| `plan` | `steps: string[]` | First, before any work starts | Shows the plan while the first steps are still starting |
| `step_start` | `id: string`, `label: string`, `tool?: string` | When a step begins | Adds the step to the timeline as running, with the agent's own label |
| `step_done` | `id: string`, `ok: boolean`, `summary: string` | When a step finishes | Marks the step done or failed and shows the summary under it |
| `evidence` | `id: string`, `finding: string`, `severity` | When the agent records a finding | Files the finding under the step with that id |
| `text` | `delta: string` | Optional narration while the model writes | Ignored by the reducer; the timeline carries the story |
| `verdict` | `verdict: Verdict` | Once, after verification | Stores the verdict; the result screen renders the card |
| `family_alert` | `alert: FamilyAlert`, `result: FamilyAlertResult` | After the verdict, when a contact exists and money or data is at risk | Stores the alert and result; the home page broadcasts it to `/family` |
| `damage_control` | `plan: DamageControlPlan` | Right after the verdict when the person already acted | Stores the plan; `/damage-control` renders it |
| `error` | `message: string`, `recoverable: boolean` | On a failure the agent can name | Marks the run as error and shows the message |
| `done` | none | Always last, even after an error | Marks the run as done |

`severity` is one of `red`, `yellow`, `green`, `info`. `red` means a strong scam
sign, `yellow` means caution, `green` means a sign the message is genuine, and
`info` is a neutral fact.

Event order, from the comment in `lib/contract.ts` and the sender in
`lib/agent/tools.ts`:

```text
plan -> (step_start -> evidence* -> step_done)* -> verdict
     -> [family_alert] -> [damage_control] -> done
```

`text` can appear anywhere. `done` is always sent last, including after `error`.
A successful run always ends with a plan, a verdict, and `done`. The other events
are conditional. A run that fails partway may have only `plan`, `error`, and `done`.

Recorded examples live in `mock/demo-recording.json` (five stage demos) and
`mock/mock-events.json` (scam and safe). Both are validated against the event union
by `npm run test:agent`.

## The Verdict

```ts
interface Verdict {
  level: "scam" | "suspicious" | "safe";
  confidence: number;          // 0-1
  headline: string;            // one short sentence, user's language
  reasons: string[];           // 2-3 plain-language reasons
  nextSteps: string[];
  scamType: ScamType;
  officialContact?: { org: string; phone?: string; url?: string };
  aiMedia?: {
    level: "likely_ai" | "unclear" | "likely_real";
    signals: string[];
    flaggedFrames: { index: number; note: string }[];
  };
}
```

| Field | Meaning |
| --- | --- |
| `level` | `scam` means the app is sure. `suspicious` means something is wrong but the evidence is not enough for a firm answer; the screen says "Be careful". `safe` is the contract name for LOOKS REAL. |
| `confidence` | 0 to 1. The card turns it into "We are very sure", "We are fairly sure", or "We are not sure yet" instead of a number. |
| `headline` | The big line on the card, already in the reader's language. The code does not translate it. |
| `reasons` | Two or three short sentences in plain language. No tool names, no jargon. |
| `nextSteps` | Concrete actions in order. These are the only instructions the person is asked to follow. |
| `scamType` | The family of scam. One of `grandparent`, `delivery`, `bank_impersonation`, `romance`, `tech_support`, `government_impersonation`, `prize_lottery`, `investment_crypto`, `celebrity_deepfake`, `phishing_other`, `none`, `unknown`. |
| `officialContact` | The real phone number or website the agent found itself. Optional. It must never come from the suspicious message; the verdict check rejects that. |
| `aiMedia` | Only for video. It answers the separate "was this made by AI" question. |

### The video answer

| Field | Meaning |
| --- | --- |
| `aiMedia.level` | `likely_ai`, `unclear`, or `likely_real`. This is a separate answer from `Verdict.level`. |
| `aiMedia.signals` | Plain-language clues, for example "hand has six fingers". |
| `aiMedia.flaggedFrames` | Objects with a zero-based `index` into the frames that were sent, plus a short `note`. The UI counts frames from 1 when it shows them. |

An AI video can be harmless and a real video can still be a scam. Keep the two
answers independent.

### Verdict rules the route enforces

`lib/agent/tools.ts` checks a draft verdict before it is shown:

- `scam` needs at least two `red` evidence items. `safe` needs zero.
- `reasons` has two or three entries, and `nextSteps` has at least one.
- `scamType` cannot be `none` unless the level is `safe`.
- `officialContact.phone` and `.url` cannot match a phone number or website that
  appears in the message being checked.
- If the person already acted, `damage_control` must be called first.
- If the video was checked, `aiMedia` must be present.
- A family contact is recommended for a scam with money involved.

A rejected draft goes back to the agent with the list of problems, up to two times.
If it is still wrong, the last draft is shown.

## Evidence

A finding is flat on the event. There is no nested evidence object any more.

```ts
{ type: "evidence", id: string, finding: string, severity: "red" | "yellow" | "green" | "info" }
```

`id` is the step it belongs to, or `message` for a finding taken from the text
itself. The mock runs use message step ids, web search tool ids, and `message`.
The screen groups each finding under its step; findings with an unknown id are not
shown.

## Tool contracts Person 2 implements

`lib/contract.ts` defines both the result shapes and the function types. The agent
imports everything through `lib/agent/investigate.ts`, which currently re-exports
honest stand-ins from `lib/agent/fake-investigate.ts`. To switch to the real tools,
change that one file to `export * from "@/lib/investigate";` and run
`npm run typecheck`.

```ts
type ExpandLink = (url: string) => Promise<ExpandLinkResult>;
type DomainAge = (domain: string) => Promise<DomainAgeResult>;
type LookalikeCheck = (domain: string) => Promise<LookalikeResult>;
type CheckReputation = (url: string) => Promise<ReputationResult>;
type AnalyzeVideo = (videoId: string) => Promise<VideoReport>; // reads .uploads/<videoId>
type SendFamilyAlert = (
  contact: FamilyContact,
  alert: FamilyAlert,
) => Promise<FamilyAlertResult>;
```

Result shapes:

```ts
interface ExpandLinkResult {
  inputUrl: string;
  finalUrl: string;
  hops: { url: string; status: number }[];
  error?: string;
}

interface DomainAgeResult {
  domain: string;
  createdAt: string | null;   // ISO date
  ageDays: number | null;
  registrar?: string;
  isNew: boolean;             // ageDays < 30
  error?: string;
}

interface LookalikeResult {
  domain: string;
  impersonates: string | null;  // e.g. "usps.com"
  similarity: number;           // 0-1
  technique?: "typo" | "extra_words" | "char_swap" | "subdomain_trick" | "tld_swap";
}

interface ReputationResult {
  url: string;
  listedAsMalicious: boolean;
  sources: { name: string; verdict: string }[];
  error?: string;
}

interface FamilyAlertResult {
  delivered: boolean;
  channel: "sms" | "email" | "screen";
  error?: string;
}
```

Rules for the tools:

- Never open a scam link in a browser. Follow it on the server only.
- Set a short timeout and a response size cap on every outbound request.
- Return an `error` field when a check did not really happen. The agent is told that
  a result with an `error` proves nothing, so an honest failure is safe.
- Never throw for an expected failure. Throw only for a bug.
- Do not log or return secrets, including contact phone numbers beyond what the
  alert needs.

### VideoReport

```ts
interface VideoReport {
  credentials: {
    found: boolean;
    generator?: string;   // from the C2PA manifest
    claims?: string[];
    error?: string;
  };
  metadata: {
    clues: string[];      // plain-English clues from ffprobe
    encoder?: string;
    creationTool?: string;
    hasCameraInfo: boolean;
    error?: string;
  };
  detector: {
    provider: string;
    aiProbability: number;  // 0-1
    error?: string;
  } | null;                 // null = no detector configured
}
```

- `credentials` comes from C2PA or similar content credentials.
- `metadata.clues` comes from probing the file: encoder name, missing camera
  information, signs of re-encoding.
- `detector` is `null` when no detector is configured. Do not invent a number.
- Note the mixed spelling: the contract uses `aiProbability` here, but the verdict
  uses `confidence` and `aiMedia`. Keep the names as they are.

## The request

```ts
interface AgentRequest {
  text?: string;
  images?: InputImage[];       // screenshots, max 4
  video?: VideoInput;
  language: Language;
  alreadyActed?: boolean;
  actionDetails?: string;
  familyContact?: FamilyContact;
  demo?: boolean;
}

interface InputImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;              // no "data:" prefix
}

interface VideoInput {
  videoId: string;             // from POST /api/upload; file is .uploads/<videoId>
  frames: InputImage[];        // 8-12 JPEG frames, max 768 px wide
  frameTimes: number[];        // seconds, same order as frames
  durationSec: number;
  fileName: string;
}

interface FamilyContact {
  name: string;
  phone?: string;              // E.164
  email?: string;
}
```

| Field | Meaning |
| --- | --- |
| `text` | The pasted message. Empty when only an image is sent. |
| `images` | Screenshots, up to 4. Each one is base64 with the media type beside it, not a data URL. |
| `video` | The original video URL plus the frames and their timestamps. |
| `language` | The language for every user-facing string. Same codes as `Language` below. |
| `alreadyActed` | True when the person paid, replied, clicked, or shared details. |
| `actionDetails` | What they did, in their words. Used by the damage control plan. |
| `familyContact` | Who to alert. Without it, the agent is told not to call `alert_family`. |
| `demo` | Replay a recording instead of calling Claude. |

The request is a JSON POST to `/api/agent` with `Content-Type: application/json`.
An invalid body gets a 400 with the list of problems.

`Language` is `en`, `es`, `fr`, `pt`, `zh`, `hi`, `ar`, `vi`, `ko`, `tl`. The
settings menu in `lib/i18n.ts` offers the same ten, in native names.

Video uploads: everything runs on this computer, with no cloud storage.
`lib/video-upload.ts` POSTs the raw file to `app/api/upload/route.ts` with
`XMLHttpRequest` (for upload progress) and `Content-Type` set to the file type.
The route (Person 2) accepts `video/mp4`, `video/quicktime`, and `video/webm` up to
50 MB, saves it as `.uploads/<uuid>.<ext>` (git ignores `.uploads/`), and answers
`{ videoId }`. If the route is missing or refuses the file, the upload returns null
and the page sends up to four frames as pictures with a note that the video file
itself was not checked.

## The streaming format

The route uses Server-Sent Events.

- Header: `Content-Type: text/event-stream; charset=utf-8`, from `SSE_HEADERS` in
  `lib/agent/events.ts`.
- Each event is one frame: `data: <JSON>\n\n`.
- UTF-8. No event names, no ids, no retry fields.
- `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` are set so
  proxies do not hold the stream.
- The client reader is `lib/run-stream.ts`. It splits on a blank line, keeps the
  unterminated tail, skips frames that do not parse, and accepts any line that
  starts with `data:`.
- The route starts the work in the background and returns the stream right away. On
  any failure it sends a friendly `error`, then `done`, then closes.

Example frames:

```text
data: {"type":"plan","steps":["Read the message","Check how Chase contacts customers","Decide if it is safe"]}

data: {"type":"step_start","id":"message","label":"Reading the message"}

data: {"type":"step_done","id":"message","ok":true,"summary":"Finished reading the message"}

data: {"type":"verdict","verdict":{"level":"safe","confidence":0.9,"headline":"This looks legitimate.","reasons":["..."],"nextSteps":["..."],"scamType":"none"}}

data: {"type":"done"}

```

If the check cannot start at all, `lib/run-stream.ts` throws and the page plays a
recorded run with a notice that it is a saved example. That fallback is what makes
the live demo safe.

## Changing the contract

1. Ask in the team chat. Say which shape and which branch will use it.
2. Update `lib/contract.ts`, then `lib/agent/schemas.ts`, then `mock/`.
3. Run `npm run typecheck` and `npm run test:agent`.
4. Merge to `main` at the next sync point, before the other branch merges anything
   that depends on it.
