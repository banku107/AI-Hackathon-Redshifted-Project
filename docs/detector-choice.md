# P4-1 — AI Video Detector Choice

**Owner:** Person 4 (The Proof) → **for:** Person 2 (The Tools)
**Research date:** 2026-11-07, from the official documentation and pricing pages linked below.
**No accounts were created, nothing was purchased, and no detector API was called.**

Legend: **[V]** = verified on the official page cited · **[NV]** = not verified (undocumented, page blocked, or third-party only) · **[EST]** = our own estimate/inference.

---

## 1. Executive recommendation

> **Decision (2026-11-07): free Option A, built in `lib/investigate/detector.ts`.** It checks 4 frames the browser already extracted, so no ffmpeg is needed.
>
> **Use Sightengine.** It is the only one of the three with documented, self-serve, AI-generated-*video* detection at a hackathon-friendly price, a single `multipart/form-data` POST, and synchronous results for clips under 60 s.

**Important honesty note: none of the three providers offers video detection on a free plan.**

| Option | Cost | What it gives | Recommended when |
|---|---|---|---|
| **A. Free — frame-based (default)** | $0 (free account, API key required) | Sightengine **image** AI-generated detection (`models=genai`) on 4 frames that `analyzeVideo` extracts from the downloaded clip | We don't want to spend money. |
| **B. Paid — true video endpoint** | Sightengine **Starter $29/month** [V] | `video/check-sync.json` with the uploaded file sent as `media`, `models=genai` (and `deepfake`) across the whole clip. The simplest fit for `analyzeVideo(videoId)` | The team agrees to pay. **Person 4 / the team lead must decide; nothing has been purchased.** |
| Not recommended | Reality Defender video ≥ $399/mo [V]; Hive video = "Contact Sales" [V] | — | — |

Option A is honest about what it is. It analyses sampled **frames**, not motion or audio, and the UI and pitch should describe it that way: "checks frames from the video for signs of AI generation".

---

## 2. Comparison table

| | **Sightengine** | **Hive** (now branded *Deploy*) | **Reality Defender** |
|---|---|---|---|
| Video analysis | Yes: sync, async and live-stream endpoints [V] | Yes: sync and async task API [V] | Yes: async upload flow [V] |
| AI-generated video detection | Yes, `models=genai` [V] | Yes, `ai_generated` class plus source head (e.g. `sora`, `veo3`) [V] | "Manipulation" verdict; split between AI-gen and face-swap not documented [NV] |
| Face-swap / deepfake | Separate `models=deepfake` [V]. Docs only show it on images; video use [NV] | `deepfake` class, max score over detected faces [V] | Yes (core product) [V] |
| Free tier | Yes: 2,000 ops/month, max 500/day, **no video**, no deepfake [V] | No free credits listed on the official page [V]. "$50 free credits" appears only on third-party sites [NV] | "API Free": 50 scans/month, **image only** [V] |
| Video excluded from free? | **Yes** [V] | Video pricing is "Contact Sales" [V] | **Yes**. Video upload on free returns HTTP 403 `free-tier-restriction` [V] |
| Cheapest video plan | **Starter $29/mo**: 10k ops, 1 concurrent video, 50 MB max [V] | Contact sales [V] | **Growth from $399/mo** [V] |
| Formats | Not documented on pages checked [NV] | mp4, webm, avi, mkv, wmv, mov [V] | mp4, mov [V] |
| Max size / duration | Starter 50 MB, Pro 500 MB [V]. **Sync < 60 s** [V] | Sync: split into ≤ 30 s segments (90 s max) [V] | 250 MB, 30 min [V] |
| Auth | `api_user` + `api_secret` form/query params [V] | Header `authorization: token <KEY>` [V] | Header `X-API-KEY` [V] |
| Sync vs async | Both (`check-sync.json` / `check.json` + `callback_url`) [V] | Both (`/task/sync`, `/task/async`) [V] | Async only: presign → PUT → poll [V] |
| Latency | Not published [NV]. Set client timeout ≥ 60 s for sync [V] | p50 ≈ 6 s for a 60 s video [V] | SDK polls every 5 s by default [V]. Total not published [NV] |
| Rate limits | Free/Starter 1 req/s, Pro 10 req/s [V] | 25–50 tasks/s default [V] | "Configurable concurrency limits" [NV] |
| Confidence score | Per frame `type.ai_generated` 0–1 [V] | Per frame `classes[].score` 0–1 [V] | `finalScore` 0–100 overall plus per model [V] |
| JS/TS SDK | npm `sightengine` (last updated 2022). Plain `fetch` is simpler [V] | None documented [NV] | Official TS SDK `@realitydefender/realitydefender` [V] |
| TS integration difficulty [EST] | **Low**: one fetch call | Medium: needs sales contact before access | Medium: 3-step async flow, but SDK helps |

### Advantages and disadvantages

**Sightengine**
- Pros:
  - Self-serve signup.
  - Documented `genai` model on both images and video.
  - Simplest request (one POST).
  - Per-frame scores make "unclear" easy to express.
  - Cheapest paid video plan.
- Cons:
  - No video on the free plan.
  - Starter allows one concurrent video job at 1 req/s, and sync handles clips under 60 s only.
  - Deepfake on video is undocumented [NV].
  - The docs disagree on default frame sampling (1 fps vs 1 frame per 2 s).

**Hive**
- Pros:
  - Strongest documented model detail (generator attribution such as `sora`/`veo3`, threshold guidance).
  - High rate limits.
  - Published p50 latency.
- Cons:
  - AI-detection pricing is "Contact Sales", which is unrealistic inside an 8-hour hackathon.
  - Brand and domain migration (thehive.ai → deploy.com) adds doc confusion.

**Reality Defender**
- Pros:
  - Official TypeScript SDK.
  - Strong deepfake focus.
  - Large file limits.
- Cons:
  - Video starts at $399/month.
  - The free tier blocks video uploads with HTTP 403.
  - Async-only flow adds polling latency.

---

## 3. Official documentation links

| Provider | Link | What it covers |
|---|---|---|
| Sightengine | https://sightengine.com/docs/ai-generated-video-detection | AI-generated video detection |
| Sightengine | https://sightengine.com/docs/deepfake-detection | Deepfake detection |
| Sightengine | https://sightengine.com/docs/moderate-stored-video | Sync limit under 60 s |
| Sightengine | https://sightengine.com/docs/video-moderation-principles | Video moderation principles |
| Sightengine | https://sightengine.com/docs/getstarted-video | Getting started with video |
| Sightengine | https://sightengine.com/pricing | Pricing |
| Sightengine | https://sightengine.com/faq/what-is-an-operation | How operations are counted |
| Hive | https://thehive.ai/apis/ai-generated-content-classification | AI-generated content product |
| Hive | https://docs.thehive.ai/docs/ai-image-and-video-detection.md | Image and video detection |
| Hive | https://docs.thehive.ai/reference/authentication.md | Authentication |
| Hive | https://docs.thehive.ai/reference/submitting-via-task-api.md | Task API |
| Hive | https://docs.thehive.ai/docs/frequently-asked-questions-faq | FAQ |
| Hive | https://deploy.com/pricing | Pricing (thehive.ai/pricing redirects here) |
| Reality Defender | https://docs.realitydefender.com/api-reference/quickstart.md | Quickstart |
| Reality Defender | https://docs.realitydefender.com/api-reference/endpoint/presigned.md | Presigned upload |
| Reality Defender | https://docs.realitydefender.com/api-reference/endpoint/get_media_detail.md | Media detail |
| Reality Defender | https://github.com/Reality-Defender/realitydefender-sdk-typescript | TypeScript SDK |
| Reality Defender | https://www.realitydefender.com/api-email-campaign | Pricing |

---

## 4. Integration guide for Person 2 (Sightengine)

### 4.1 Environment variables (names already in the repo's `.env.example`)

These are server-side only. **Never** use the `NEXT_PUBLIC_` prefix, and never commit `.env.local`.

```bash
# .env.local  (values come from the Sightengine dashboard after a free signup)
DETECTOR_API_USER=     # Sightengine "API user"
DETECTOR_API_KEY=      # Sightengine "API secret"
```

### 4.2 Where it plugs in

The contract fixes the shape (`lib/contract.ts`):

```ts
export type AnalyzeVideo = (videoId: string) => Promise<VideoReport>; // file is .uploads/<videoId>
// VideoReport.detector: { provider: string; aiProbability: number /* 0-1 */; error?: string } | null
//   null = no detector configured
```

The team guide (P2-8) already has `analyzeVideo` download the blob to `/tmp` (max 50 MB) for the C2PA and ffprobe checks. The detector call is the third check, run in parallel inside it.

- **No keys** → `detector: null`.
- **Call failed** → `{ provider: "sightengine", aiProbability: 0, error: "…" }`. Person 1's prompt should treat a detector `error` as "couldn't check", never as "looks real".

### 4.3 Option A: free plan, frame-based

`analyzeVideo` only receives `videoId`; the frames in `VideoInput.frames` go straight to Claude. So under Option A, Person 2 extracts 4 frames from the downloaded file with `ffmpeg-static`, then sends each to the image endpoint, `POST https://api.sightengine.com/1.0/check.json` with `models=genai`.

- [V] The model name and endpoint family are documented.
- [NV] Whether the Free plan's "AI Detection" covers this exact model needs confirming in the dashboard after signup.

```bash
# Example request (one frame). Replace the placeholders; never paste real secrets into docs or chat.
curl -X POST 'https://api.sightengine.com/1.0/check.json' \
  -F 'media=@frame-01.jpg' \
  -F 'models=genai' \
  -F 'api_user={DETECTOR_API_USER}' \
  -F 'api_secret={DETECTOR_API_KEY}'
```

Example response shape (image). The field names follow the docs; the values are illustrative:

```json
{
  "status": "success",
  "request": { "id": "req_xxxxx", "timestamp": 1717159864.35, "operations": 5 },
  "type": { "ai_generated": 0.97 },
  "media": { "id": "med_xxxxx", "uri": "frame-01.jpg" }
}
```

### 4.4 Option B: paid Starter plan, full video endpoint (the simplest fit for `analyzeVideo(videoId)`)

The app runs only on the laptop, so there is no public URL for Sightengine to fetch. Upload the file itself as `media`.

```bash
curl -X POST 'https://api.sightengine.com/1.0/video/check-sync.json' \
  -F 'media=@.uploads/<videoId>' \
  -F 'models=genai' \
  -F 'interval=1' \
  -F 'api_user={DETECTOR_API_USER}' \
  -F 'api_secret={DETECTOR_API_KEY}'
# interval accepts 0.5 | 1 | 2 | 3 | 4 | 5 (seconds between analysed frames). Sync = clips under 60 s.
```

Example response (abridged from the official docs; IDs shortened):

```json
{
  "status": "success",
  "request": { "id": "req_...", "timestamp": 1717159864.348989, "operations": 40 },
  "data": {
    "frames": [
      { "info": { "id": "med_..._1", "position": 0 }, "type": { "ai_generated": 0.99 } }
    ]
  },
  "media": { "id": "med_...", "uri": "yourfile.mp4" }
}
```

### 4.5 TypeScript example: returns the contract's `VideoReport["detector"]`

This is a sketch for Person 2 to adapt inside *their* file (e.g. `lib/investigate/analyzeVideo.ts`). Person 4 does not edit `lib/`. It uses Node's built-in `fetch`, `FormData` and `Blob`, with no SDK.

```ts
import type { VideoReport } from "@/lib/contract";

type Detector = VideoReport["detector"];
const SE = "https://api.sightengine.com/1.0";
const PROVIDER = "sightengine";

function creds() {
  const user = process.env.DETECTOR_API_USER;
  const secret = process.env.DETECTOR_API_KEY;
  return user && secret ? { user, secret } : null;
}

/** Option B (paid Starter): upload the local video file to the video endpoint. */
export async function detectVideoFile(path: string): Promise<Detector> {   // path = .uploads/<videoId>
  const c = creds();
  if (!c) return null;                                   // contract: null = no detector configured
  const fd = new FormData();
  const bytes = await readFile(path);                   // import { readFile } from "node:fs/promises"
  fd.append("media", new Blob([new Uint8Array(bytes)]), "clip.mp4");
  fd.append("models", "genai");
  fd.append("interval", "1");
  fd.append("api_user", c.user);
  fd.append("api_secret", c.secret);
  return call(`${SE}/video/check-sync.json`, fd, 90_000, (j) =>
    (j?.data?.frames ?? []).map((f: any) => Number(f?.type?.ai_generated)),
  );
}

/** Option A (free): score a few JPEG frames, e.g. extracted with ffmpeg-static from the /tmp copy. */
export async function detectFrames(jpegs: Buffer[]): Promise<Detector> {
  const c = creds();
  if (!c) return null;
  const scores: number[] = [];
  for (const [i, jpg] of jpegs.slice(0, 4).entries()) {  // sequential: free plan allows 1 req/s
    const fd = new FormData();
    fd.append("media", new Blob([new Uint8Array(jpg)], { type: "image/jpeg" }), `frame-${i}.jpg`);
    fd.append("models", "genai");
    fd.append("api_user", c.user);
    fd.append("api_secret", c.secret);
    const r = await call(`${SE}/check.json`, fd, 20_000, (j) => [Number(j?.type?.ai_generated)]);
    if (!r || r.error) return r;                          // stop on the first failure, report it
    scores.push(r.aiProbability);
    if (i < jpegs.length - 1) await new Promise((res) => setTimeout(res, 1100));
  }
  return { provider: PROVIDER, aiProbability: aggregate(scores) };
}

async function call(url: string, fd: FormData, timeoutMs: number, pick: (j: any) => number[]): Promise<Detector> {
  try {
    const res = await fetch(url, { method: "POST", body: fd, signal: AbortSignal.timeout(timeoutMs) });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || j?.status !== "success") {
      // 401 bad keys · 403 plan restriction · 429 rate/quota. Log the status only, never the secret.
      return { provider: PROVIDER, aiProbability: 0, error: `Detector unavailable (HTTP ${res.status}).` };
    }
    const scores = pick(j).filter((n) => Number.isFinite(n));
    if (!scores.length) return { provider: PROVIDER, aiProbability: 0, error: "Detector returned no scores." };
    return { provider: PROVIDER, aiProbability: aggregate(scores) };
  } catch (e) {
    return { provider: PROVIDER, aiProbability: 0, error: `Detector request failed (${(e as Error).name}).` };
  }
}

/** Max of per-frame scores (Sightengine suggests combining frames yourself). Team choice [EST]. */
function aggregate(scores: number[]): number {
  return scores.length ? Math.max(...scores) : 0;
}
```

The agent (Person 1) maps `aiProbability` to the verdict's `aiMedia.level`. A wide "unclear" band, roughly 0.3–0.8, is recommended [EST], because these scores are not calibrated probabilities.

### 4.6 Error handling checklist

| Situation | What to do |
|---|---|
| Missing keys | Return `detector: null` (contract). The agent should say it *couldn't check*, not "looks real". |
| HTTP 401/403 | Bad keys or plan restriction. Return the `error` field and log the status code only. |
| HTTP 429 or quota exhausted | Free plan is 500 ops/day and 1 req/s. Back off once, then return the `error` field. |
| Timeout | Sync video needs ≥ 60 s client timeout [V]. For frames, 20 s per call is ample [EST]. |
| Clip ≥ 60 s | Use async `video/check.json` with `callback_url`, or analyse frames only. |
| File > 50 MB (Starter) | Use frames, or a `stream_url` to a shorter clip. |

### 4.7 Rate limits and quota math

| Item | Detail |
|---|---|
| Free plan | 2,000 ops/month, max 500/day, 1 req/s [V] |
| Cost per frame | `genai` costs 5 ops per image [V] |
| Frames per video | 4 frames ≈ 20 ops [EST] |
| Videos per day | ≈ 25 videos/day, ≈ 100/month [EST]. Enough for 10 test clips plus rehearsals plus the live demo. |
| Starter plan | 10,000 ops/month, 1 concurrent video, 1 req/s [V]. Video cost scales with analysed frames × models [V]. |

---

## 5. Important limitations (put these on Slide 5 and in the UI copy)

1. **Detectors are probabilistic.** A score of 0.97 is not proof. The UI should show "likely AI" / "unclear" / "likely real", never "fake" or "real".
2. **AI-generated ≠ scam, and genuine ≠ safe.** The scam verdict must come from the *claims and requests* in the video (money, urgency, secrecy, links), checked by the agent. The pixel score answers a different question.
3. **Frame-based checking (Option A) sees no audio or motion.** It cannot detect a cloned voice over genuine footage.
4. **Missing Content Credentials (C2PA) prove nothing.** Most genuine phone videos have none, and metadata is easy to strip. Present credentials are positive evidence of provenance only when they *verify*.
5. **Compression, screen recordings and re-uploads** degrade detector accuracy [EST]. Our test set includes a metadata-stripped variant (see `test-data/videos/README.md`).
6. **We have no independent accuracy numbers.** Until `scripts/eval.ts --videos` runs on our labelled clips, we must not quote detector accuracy.

---

## 6. What Person 2 needs from Person 4

| Item | Detail |
|---|---|
| Account | A Sightengine **free account** created by the team member who owns API keys. Person 4 coordinates privately. Keys go only into `.env.local` as `DETECTOR_API_USER` / `DETECTOR_API_KEY`, never into Git or chat. |
| Decision | Whether to pay for Starter ($29/mo, Option B). **Default: no, use Option A.** |
| Test clips | The labelled clips in the shared drive (`test-data/videos/manifest.json`), to run `npx tsx scripts/eval.ts --videos` once the upload pathway exists. |
