# Person 4 → team handoff

**Status as of 2026-11-07:** Person 4's files are in the repo, uncommitted, on a local clone of `main`.

## Verified in the repo

| Check | Result |
|---|---|
| Contract | `scripts/eval.ts` imports its types straight from `lib/contract.ts` (type-only) |
| `npm run typecheck` | Passes |
| `npx eslint scripts/eval.ts` | Passes |
| `npx tsx scripts/eval.ts --dry-run --suite all` | Passes: 35 valid cases. Every request passes the API's zod schema rules (max 4 images, E.164-style phone, valid email) |
| Real-route plumbing test | The app ran with `DEMO_MODE=true` (replays Person 1's recordings, so no API key and no cost), then `--suite demo`. All 5 demo cases streamed `plan … verdict … done`. The evaluator extracted every verdict and saw `family_alert` and `damage_control` where expected. |

The plumbing test checks the **parsing only**. Replays are recordings, so they say nothing about accuracy. No results were saved, and no live (real-Claude) evaluation has been run yet.

## Person 1 (The Brain)

- **Accuracy runs.** `npx tsx scripts/eval.ts` (30 messages) complements your `npm run accuracy` (12 cases). It uses the shared Anthropic key heavily, so only run it at check-ins, as the guide says.
- **Dataset expectations to sanity-check:**
  - `grandparent-03` ("Hi Mum, new number", no request yet) is labelled **suspicious**, not scam.
  - Safe messages must return `scamType: "none"`.
  - Delivery-fee texts should be `delivery`, not `phishing_other`.
  - Prize texts should be `prize_lottery`; crypto pitches should be `investment_crypto`.
- **USPS demo link: decided.** No domain will be bought, and the app runs locally only. Both `scripts/demo-cases.ts` and Person 4's fixture use `https://usps-package-hold.example/update`, which is reserved and can never resolve.
- **Family alert delivery.** The recorded demo alerts come back `channel: "screen"`, meaning shown in the app, not texted. The evaluator now reports "sent by SMS/email" separately from "shown on screen only". The pitch says "her daughter got a heads-up" **only** if the second phone really buzzes.
- **Mismatches:** log them in the table below after each live run.

### Mismatches for Person 1

| Date | Case | Expected | Got | Notes |
|---|---|---|---|---|
| — | — | — | — | No live run yet |

## Person 2 (The Tools)

- **Detector:** read `docs/detector-choice.md`. It recommends **Sightengine**.
  - The free plan has **no video**.
  - Option A (free): call the image `genai` model on 4 frames extracted inside `analyzeVideo`.
  - Option B ($29/mo Starter): upload the local file (`.uploads/<videoId>`) as `media` to the video endpoint.
  - Keys go in `.env.local` as `DETECTOR_API_USER` / `DETECTOR_API_KEY`, the names already in `.env.example`.
  - No keys → `detector: null`. A failed call → set the `error` field. Never fake a score.
- **Payment:** nothing has been purchased. Option B needs a team decision.
- **Test links:** the test messages use `.example` domains. Your RDAP/WHOIS tools will find no record for them; please make sure that produces sensible evidence text rather than a crash.
- **Video evaluation:** needs real uploads (a `videoId` and frames, on the laptop that did the upload). See `test-data/videos/README.md`.

## Person 3 (The Screens)

- **The pitch needs these UI pieces:**
  - an **"I already did something"** toggle, plus a details field;
  - a family contact field;
  - a video upload;
  - a visible evidence card for the USPS link.
- **Family alerts:** if they are only displayed on screen (`channel: "screen"`), tell the narrator.
- **Image testing:** `test-data/screenshots/*.png` are good inputs for testing image upload. Each carries a "TEST FIXTURE" banner.
- **Slide screenshots:** please export real UI shots of the green, yellow and red verdicts, the damage-control panel and the video result into `docs/screens/`, which you own.

## Git notes for Person 4

- The team guide says Person 4 works on a branch called **`demo`**. Create it *before* committing.
- **Never commit:**
  - `.env.local` (already ignored by `.gitignore`);
  - video files;
  - `test-data/videos/requests/` (it contains video ids and frames; already in `.gitignore`).
