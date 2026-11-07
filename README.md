# ScamShield

**Protect people from scams.** ScamShield is an AI detective for older adults. You paste a suspicious message, or upload a screenshot or a video. The AI investigates it, gives a clear answer with proof (SCAM / BE CAREFUL / LOOKS REAL) in your language, warns a family member if money is at risk, and gives a step-by-step recovery plan if you already paid.

**Start here:** read [`ScamShield-Team-Tasks.txt`](ScamShield-Team-Tasks.txt). It's the team guide: what each person builds, in simple words, plus the details your Claude needs.

## Run it

```bash
npm install
cp .env.example .env.local     # then put the Anthropic API key in .env.local
npm run dev                    # http://localhost:3000
```

ScamShield runs **only on your laptop**: no hosting, no domain. To open it on a phone, put the phone on the same Wi-Fi, run `npm run dev:phone`, and open `http://<laptop-ip>:3000` (find the IP with `ipconfig` on Windows). Uploaded videos are saved in `.uploads/`, which git ignores.

Try the brain from a second terminal while `npm run dev` is running:

```bash
npm run try:agent -- usps                    # a stage demo: bank | usps | jail | jail_es | jail_acted
npm run try:agent -- "your own message"      # any text
npm run try:media -- screenshot shot.png     # a screenshot
```

## Checks

| Command | What it does | Costs money? |
|---|---|---|
| `npm run typecheck` | Checks the TypeScript code | No |
| `npm run lint` | Checks code style | No |
| `npm run test:agent` | 46 tests of the brain's rules | No |
| `npm run accuracy` | Runs 12 extra messages (8 scams, 4 real) through Claude and prints a score. Last result: 12/12, 0 false alarms | Yes, a few cents |
| `npm run record:demo` | Runs the 5 stage demos through Claude, checks each answer, saves them for demo mode | Yes, a few cents |

## Demo mode (no internet needed)

Send `"demo": true` in the request, or set `DEMO_MODE=true` in `.env.local`. The app then replays recorded runs from `mock/demo-recording.json` instead of calling Claude.

## How the pieces fit

| Part | Owner | Status |
|---|---|---|
| `lib/contract.ts`: shared data shapes (don't change alone) | Person 1 | Done |
| `app/api/agent/route.ts`, `lib/agent/`, `lib/prompt.ts`: the brain | Person 1 | Done and tested |
| `lib/investigate/`: detective tools (links, website age, video checks, family alerts) | Person 2 | To do. The brain uses honest stand-ins in `lib/agent/fake-investigate.ts` until then |
| `app/page.tsx`, `components/`: the screens | Person 3 | To do. Build against `mock/mock-events.json` |
| `test-data/`, `scripts/eval.ts`, pitch | Person 4 | To do |

## The API

`POST /api/agent` with an `AgentRequest` (see `lib/contract.ts`) returns a live stream of events (`text/event-stream`). Each line looks like `data: {...}`, and the stream always ends with `{"type":"done"}`:

```
plan -> (step_start -> evidence -> step_done)... -> verdict -> [family_alert] -> [damage_control] -> done
```
