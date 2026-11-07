# Stage demonstrations (P4-3)

Each file is `{ id, stageOrder, title, request, expected, explanation }`, where `request` is a valid contract **`AgentRequest`** that you can POST unchanged.

| # | File | Message | Expected | Expected extra events |
|---|---|---|---|---|
| 1 | `demo-1-bank-safe.json` | "Chase: Did you attempt a $42.10 purchase at Target? Reply YES or NO. We'll never ask for your password." | 🟢 `safe` / `none` | — |
| 2 | `demo-2-delivery-scam.json` | "USPS: Your package is on hold due to an incomplete address. Update within 12 hrs: https://usps-package-hold.example/update" | 🔴 `scam` / `delivery` | — |
| 3 | `demo-3-grandparent-scam.json` | "Grandma it's me, I'm in jail, please send $2,000 in gift cards, don't tell mom" plus a fictional `familyContact` | 🔴 `scam` / `grandparent` | `family_alert` |
| 3-ES | `demo-3-grandparent-scam-es.json` | "Abuela, soy yo, estoy en la cárcel, por favor mándame $2,000 en tarjetas de regalo, no le digas a mamá" | 🔴 `scam` / `grandparent` | `family_alert` |
| 4 | `demo-4-already-acted.json` | Same as #3, with `alreadyActed: true` and `actionDetails: "I already sent one $500 gift card"` | 🔴 `scam` / `grandparent` | `family_alert`, `damage_control` |

## About the demo domain

The brief says `[TEAM DEMO DOMAIN]`. We use `usps-package-hold.example`.

- `.example` is reserved by IANA. It cannot be bought and never resolves, so nobody can be harmed by it.
- **No lookalike domain was registered, and no fake USPS page exists.**
- Person 2's link tools will most likely report "domain does not resolve / no registration record". The presenter should say *"this isn't a real USPS website, it doesn't even exist"*. **Do not** say "registered two days ago" unless the evidence on screen actually says so.

If the team later owns a harmless demo domain, swap it into `demo-2-delivery-scam.json`, `docs/pitch-script.md` and `docs/backup-demo-shot-list.md` together.

## About the family alert

`familyContact` is fictional: "Maria (daughter)", phone `+15555550142`, email `maria.family@example.com`.

**For the live demo, Person 3 should replace it with the phone or email of a consenting teammate who holds the "family phone".** Do that in the UI form, not in Git.

A `family_alert` *event* in the stream does **not** prove a message was delivered. Only say "her daughter just got a text" if the second phone visibly receives it.

## Expected damage-control content (demo 4)

The tone must be kind and must not blame the user. A good answer includes:

1. Stop: no more cards, no more replies.
2. Call the gift card company **now** using the number on the card or the store's official site. Give them the card number and receipt and ask them to freeze it. Act fast; recovery is possible but not guaranteed.
3. Keep the receipt, the card, and screenshots of the messages.
4. Call the real grandson or a family member on a number you already have.
5. Report it to ReportFraud.ftc.gov and ic3.gov, and to local police if you want.
6. Expect follow-up "recovery" scams. Nobody legitimate charges a fee to get your money back.

## Testing the demos against the API

```bash
npm run dev                                      # in one terminal
npx tsx scripts/eval.ts --suite demo             # in another
```

The evaluator checks the verdict **and** that `family_alert` / `damage_control` events appear.

To hand-test one request:

```bash
curl -N -X POST http://localhost:3000/api/agent \
  -H 'content-type: application/json' \
  --data "$(node -e 'console.log(JSON.stringify(require("./test-data/demo/demo-1-bank-safe.json").request))')"
```

**Never edit app code to force a demo result.** If a demo comes back wrong, log it in `docs/team-handoff.md` → "Mismatches for Person 1" and tell Person 1.

## Status

As of 2026-11-07:

- **Done:** all five fixtures pass the API's request schema. They were run through the real `/api/agent` route with `DEMO_MODE=true`, which replays Person 1's recordings; all 5 returned the expected verdicts and events. Family alerts came back on `channel: "screen"`, meaning shown in the app, not texted.
- **Not done:** that replay checks the plumbing, not live accuracy. A **live** run (real Claude, with the shared key) is still to do at a check-in: `npx tsx scripts/eval.ts --suite demo`.
- **Same link:** Person 1's `scripts/demo-cases.ts` now uses the same `usps-package-hold.example` link. The team decided not to buy a domain; the app runs locally only.

Note on `demo: true`: the contract has an optional `demo` flag. These fixtures leave it **unset** so they test the real agent. If Person 1's API has a canned "demo mode", use it only as a stage fallback, and say so if asked.
