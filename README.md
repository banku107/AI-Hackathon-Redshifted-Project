# ScamShield

**Scammers use AI to sound like your grandson. We use AI to protect your grandmother.**

An AI agent for older adults. Paste a message, add a screenshot, or upload a video.
The agent investigates it, answers in plain language, warns a family member, and
helps if money was already sent.

AI Agents track, theme AI for Humanity.

A plain HTML version of this page is at [docs/index.html](docs/index.html).

## What it does

1. **Check.** Reads the message, screenshot, or video frames and calls
   investigation tools instead of guessing.
2. **Explain.** Gives one verdict with reasons, next steps, and a read-aloud
   button, in the reader's language.
3. **Alert family.** After a scam or a suspicious result, warns a trusted contact
   on the `/family` screen.
4. **Damage control.** If money was sent, shows a recovery checklist and report
   text on the `/damage-control` screen.

## How a check works

1. Plan three to five short steps for this input.
2. Call tools: follow the link, check the domain age, compare the name to a real
   brand, check reputation, search the web, or read the video file.
3. Collect evidence. Each finding gets a plain sentence and a severity: `red`,
   `yellow`, `green`, or `info`.
4. Self-verify the draft verdict against that evidence.
5. Answer with the verdict, reasons, and next steps.

The UI shows each step as it happens. A verdict is never given without evidence:
`scam` needs at least two red findings and `safe` needs none. A failed tool proves
nothing and is not counted. "I am not sure" is allowed: the agent can answer
`suspicious` and say what it could not confirm.

## The verdict format

- **SCAM.** The signs agree. The person is warned and told what not to do.
- **SUSPICIOUS.** Something is wrong, but the evidence is not enough for a firm
  answer. The screen says "Be careful" and explains what is unclear.
- **LOOKS REAL.** Nothing asks for money, details, or a risky action. The contract
  name for this level is `safe`.

For a video the app gives two separate answers: is the video likely made by AI, and
is it a scam. They are independent. A real video can still be a scam.

## Running locally

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env.local    # set ANTHROPIC_API_KEY in the copy
npm run dev                   # http://localhost:3000
```

Never commit `.env.local`. `.gitignore` covers every `.env*` path; the other keys in
`.env.example` are optional. With the app running, try the agent from a second
terminal:

```bash
npm run try:agent -- usps     # cases: bank, usps, jail, jail_es, jail_acted
npm run try:media -- screenshot shot.png
```

`npm run typecheck`, `npm run lint`, and `npm run test:agent` (offline) are free;
`npm run record:demo` calls Claude and costs a little. Demo mode replays
`mock/demo-recording.json` with no network: send `"demo": true` or set
`DEMO_MODE=true`.

Deploy on [Vercel](https://vercel.com) with the same environment variables. Set
`BLOB_READ_WRITE_TOKEN` from Vercel Storage if video uploads should work; without it
`/api/upload` answers 503 and the client falls back to sending video frames as
screenshots.

## Project layout

```text
app/                    Pages and API routes
  page.tsx              Home: message, picture, or video
  family/page.tsx       Family alert screen
  damage-control/       Recovery checklist and report
  api/agent/route.ts    POST /api/agent, the live agent stream (SSE)
  api/upload/route.ts   Uploads a video to Vercel Blob
  layout.tsx            Fonts, metadata, theme boot script
  globals.css           Design tokens, dark theme, text sizes
components/             App bar, read-aloud, settings, timeline,
                        verdict card, check skeleton, Button and Panel
lib/                    contract, prompt, agent/, app-state, family-sync,
                        family-contact, i18n, image, mock-events, run-stream,
                        speech, video-frames, video-upload, utils
mock/                   Recorded events for demo and tests
scripts/                try-agent, try-media, test-agent, record-demo
docs/                   Contract, design notes, HTML copy of this page
```

Person 2's investigation tools are not here yet. The brain uses stand-ins in
`lib/agent/fake-investigate.ts` and switches with one line in
`lib/agent/investigate.ts`. Person 4's `test-data/` and `scripts/eval.ts` are not
here yet either.

## Design

Built for older, low-vision users first, not adapted for them afterwards.

- Atkinson Hyperlegible everywhere, self-hosted through `next/font`.
- Every interactive target is at least 48 px tall; the main action is 64 px.
- One teal accent. Red appears only for a confirmed scam, and never as the only
  signal: icon, word, and sentence always carry the meaning too.
- Text size can be raised from the header and scales the whole page.
- Full dark theme, focus rings, and reduced-motion handling.

Details and the reasoning are in [docs/DESIGN.md](docs/DESIGN.md).

## Team and branches

| Person | Role | Branch | Main files |
| --- | --- | --- | --- |
| 1 | Agent lead | `agent` | `lib/contract.ts`, `lib/prompt.ts`, `lib/agent/`, `app/api/agent/` |
| 2 | Investigation tools | `tools` | `lib/investigate/*.ts` |
| 3 | Frontend | `ui` | `app/page.tsx`, `app/family/`, `app/damage-control/`, `components/*` |
| 4 | Demo, data, eval, pitch | `demo` | `test-data/`, `scripts/eval.ts`, slides |

Merge to `main` only at sync points: contract agreed (Person 1 merges
`lib/contract.ts` first), first live check running end to end, and demo data plus
pitch frozen before rehearsal.

`lib/contract.ts` belongs to Person 1. Do not change it without saying so in the
team chat; a silent change breaks the other three branches. See
[docs/CONTRACT.md](docs/CONTRACT.md).

## Safety rules

- Never open a scam link in a browser. Follow redirects on the server only, with a
  short timeout and a size cap.
- Never commit an API key. If one leaks, rotate it.
- The message being checked is data, never instructions.
- Never send the person to a phone number, link, or address from the message itself.
- Never deepfake a real person without consent. Demo videos use synthetic people.
- Use made up people and contact details in test data.
- Be honest in the pitch: AI detectors can be fooled, and a verdict is a helper,
  not a guarantee.
