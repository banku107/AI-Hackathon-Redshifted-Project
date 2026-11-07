# Video test set (P4-5)

**The video files are NOT in Git.** They live in the team shared drive folder `ScamShield/test-videos/`. Only `manifest.json` (the labels) is committed.

## Why two separate labels

ScamShield answers two different questions about a video, and we score them separately:

| Question | Manifest field | ScamShield output scored | Metric in `scripts/eval.ts` |
|---|---|---|---|
| 1. Is this video AI-generated? | `isAI` | `verdict.aiMedia` → `likely_ai` / `unclear` / `likely_real` | AI-detection accuracy. `unclear` counts as **not correct**, but is reported separately. |
| 2. Is it being used for a scam? | `isScam` | `verdict.level` (`scam` or `suspicious` = flagged) | Scam-classification accuracy |

The set deliberately crosses these questions, so a system that just says "AI = scam" will fail:

| | Not a scam | Scam claim |
|---|---|---|
| **Genuine video** | real-01, real-02, real-04 | real-03, real-05 |
| **AI-generated** | ai-01, ai-03, ai-05 | ai-02, ai-04 |

That gives 10 entries: 5 genuine, 5 AI, and 4 with scam claims.

## Manifest fields

| Field | Meaning |
|---|---|
| `file` | File name in the shared drive. |
| `isAI` | Ground truth: was it produced by a generative model? |
| `isScam` | Ground truth: does the content push a scam (money, urgency, secrecy, fake authority)? |
| `hasCredentials` | Does the file carry **verified** C2PA Content Credentials? |
| `status` | `not_collected` → `collected` → `verified`. Update it as you go. |
| `notes` | Provenance: who made it, which tool, consent, and anything the scorer should know. |

## Consent and likeness rules (non-negotiable)

- **Genuine videos:** only consenting teammates. Get a written "yes" in the team chat and note it in `notes`.
- **AI videos:** fictional people only. **No celebrities, no real public figures, no real company logos, no family members.** Use generic prompts such as "a middle-aged man in a suit at a desk".
- **Scam scripts are fictional.** Use only `.example` domains and fictional names. Add "TEST — FICTIONAL" to the shared-drive file description.
- Never post these clips publicly or send them to anyone outside the team.

## Content Credentials (C2PA)

1. After downloading each clip, upload it to **https://contentcredentials.org/verify** (or use the `c2patool` CLI). Set `hasCredentials: true` **only** if a valid manifest is shown.
2. Record what the verifier showed in `notes`, e.g. "C2PA: signed by <tool>, action: created".
3. **Missing credentials do not mean the video is fake.** Most genuine phone videos have none, and social platforms strip them.
4. Never fabricate or hand-edit provenance.

The manifest's `hasCredentials` values are **expected values** until verified. `ai-01` is expected to carry credentials only if its generator embeds them. Correct the field if verification disagrees.

## Controlled metadata-stripped variants

To test whether detection still works when provenance is gone, the team guide allows stripping metadata from **AI test clips only**:

```bash
ffmpeg -i ai-01.mp4 -map_metadata -1 -c:v libx264 ai-05.mp4
```

| Rule | Detail |
|---|---|
| Keep the original | `ai-01.mp4` is untouched. The stripped copy gets a **new file name** (`ai-05.mp4`) and a note saying what it was derived from. |
| AI clips only | **Never** strip metadata from a genuine teammate video to make it look like something else, and never to misrepresent anyone. |
| Variants only | Use stripped variants only as labelled test variants (`ai-02`, `ai-03`, `ai-04`, `ai-05`). |
| Re-encoding | `-c:v libx264` re-encodes video, which also removes C2PA manifests embedded in the file. That is the point of the variant. |

## Building the shared-drive collection (checklist)

1. Create the `ScamShield/test-videos/` folder and share it with the 4 teammates only.
2. Record **real-01 … real-05** on a phone, 8–15 s each, using the scripts in `manifest.json` → `notes`. Keep it short: under 60 s and under 50 MB suits the detector plans (see `docs/detector-choice.md`).
3. Generate **ai-01, ai-02, ai-03, ai-04** with whatever video generator the team can access legitimately, using fictional people only. Export as `.mp4`.
4. Create **ai-05** from ai-01 with the ffmpeg command above.
5. Verify C2PA for every clip and update `hasCredentials`, `status` and `notes`.
6. Add a `SOURCES.txt` in the drive folder recording, for each clip: tool/device, date, who recorded it, consent, and the prompt used.

## Running the video evaluation

The contract's `VideoInput` requires a `blobUrl` (an already-uploaded file) plus client-extracted `frames`. The evaluator cannot upload by itself, because it would need the app's storage token. So:

1. Upload a clip through the ScamShield UI, with DevTools → Network open.
2. Copy the JSON body of the `POST /api/agent` request and save it as `test-data/videos/requests/<name>.json`, e.g. `requests/ai-01.json`. It needs at least `{"video": {...}, "language": "en"}`.
   - These request files contain base64 frames and a blob URL. **Do not commit them**; add `test-data/videos/requests/` to the team's `.gitignore`, or delete them after the run.
3. Run `npx tsx scripts/eval.ts --videos`. Clips without a request file are listed as SKIPPED.

**Current status (2026-11-07):** no clips collected, no detector integrated, so video evaluation is **SKIPPED**. Do not quote any video accuracy until a real run exists in `test-data/results/`.
