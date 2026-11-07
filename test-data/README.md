# ScamShield test data

Owner: **Person 4 (The Proof)**. Everything here is fictional test material for evaluating ScamShield. None of it is a real communication from any person or institution.

```
test-data/
├── messages/        30 labelled message cases, one JSON file each (P4-2)
├── screenshots/     7 phone-style fixtures (.svg source + .png for the API) + generate.mjs
├── demo/            stage demo requests
├── videos/          video manifest + collection guide (P4-5); videos live in the shared drive, NOT in Git
└── results/         output of scripts/eval.ts (one timestamped JSON per run)
```

## Purpose

These files measure how well ScamShield's verdict (`scam` / `suspicious` / `safe`) and `scamType` match human labels.

The dataset is built to test **reasoning, not keyword matching**:

- Several scams contain no link at all: `delivery-04`, `bank-02`, `techsupport-03`.
- Some scams are polite and professional: `grandparent-02`, `bank-02`.
- The legitimate messages include bank, delivery, security and 2FA notifications that share vocabulary with scams but contain no scam indicators.

## Case format

```json
{
  "id": "grandparent-01",
  "text": "Grandma it's me...",
  "image": "screenshots/grandparent-01.png",
  "language": "en",
  "alreadyActed": false,
  "expected": { "level": "scam", "scamType": "grandparent" },
  "notes": "Why this label is correct"
}
```

| Field | Rule |
|---|---|
| `id` | Lowercase slug that **must equal the file name** (without `.json`). Must be unique. |
| `text` | Sent as `AgentRequest.text`. |
| `image` | `null` or a path relative to `test-data/` to a **png/jpeg/webp**, sent as `AgentRequest.images[0]` (`{ mediaType, base64 }`). SVGs are not sent because the contract does not allow them. |
| `language` | One of `en es fr pt zh hi ar vi ko tl`. |
| `alreadyActed` / `actionDetails` | Optional. Mapped 1:1 onto the `AgentRequest` fields. |
| `expected.level` | `scam` \| `suspicious` \| `safe`. |
| `expected.scamType` | A contract `ScamType`. Safe cases must use `none`; scam and suspicious cases must not. |
| `notes` | Human explanation. Never sent to the API. |

## Category distribution (30 cases)

| Category | Count | IDs | `scamType` |
|---|---|---|---|
| Grandparent / family emergency | 5 | grandparent-01 … 05 | `grandparent` |
| Delivery | 4 | delivery-01 … 04 | `delivery` |
| Bank / government impersonation | 4 | bank-01, bank-02, government-01, government-02 | `bank_impersonation`, `government_impersonation` |
| Tech support | 3 | techsupport-01 … 03 | `tech_support` |
| Romance | 2 | romance-01, romance-02 | `romance` |
| Prize / lottery / crypto | 2 | prize-01, crypto-01 | `prize_lottery`, `investment_crypto` |
| **Legitimate** | **10** | legit-01 … 10 | `none` |

The expected levels are 19 `scam`, 1 `suspicious` and 10 `safe`. The suspicious case is `grandparent-03`: a "Hi Mum, new number" opener with no request yet. The honest answer there is "be careful, verify on the old number", not "scam".

## Language distribution

| Language | Count | IDs |
|---|---|---|
| English | 22 | — |
| Spanish | 7 | grandparent-04, grandparent-05, delivery-03, government-02, romance-02, legit-08, legit-09 |
| French | 1 | legit-10 |

The Spanish cases cover 5 scams (grandparent ×2, delivery, government, romance) and 2 legitimate messages, so a model that flags everything in Spanish will be caught.

## Screenshot fixtures (7)

| Case | Style | Files |
|---|---|---|
| grandparent-01 | SMS from unknown number | `.svg` + `.png` |
| grandparent-04 | SMS (Spanish) | `.svg` + `.png` |
| delivery-01 | SMS with lookalike link | `.svg` + `.png` |
| bank-01 | Short-code bank alert | `.svg` + `.png` |
| government-02 | SMS (Spanish tax refund) | `.svg` + `.png` |
| techsupport-01 | Browser pop-up warning | `.svg` + `.png` |
| legit-01 | Genuine-style bank alert | `.svg` + `.png` |

### How the fixtures are made

- The text inside each mockup is copied **verbatim** from the case's `text` field.
- Every mockup carries a visible "TEST FIXTURE · FICTIONAL · NOT A REAL MESSAGE" banner.
- Sender numbers use the fictional 555-01xx range.
- Links use the IANA-reserved `.example` TLD.

### Regenerating

Run from the repo root:

```bash
node test-data/screenshots/generate.mjs --png   # rewrites .svg and renders .png via local Chrome/Edge/Brave (headless, offline)
node test-data/screenshots/generate.mjs         # .svg only
```

### Without the script

Any of these turns an SVG into a PNG:

1. Open the `.svg` in Chrome, press F12, then Ctrl+Shift+P, and choose "Capture full size screenshot".
2. Inkscape: File → Export PNG.
3. Windows Snipping Tool (Win+Shift+S) on the SVG opened in a browser.

Save the result as `<id>.png` in `test-data/screenshots/`, under 4 MB. To test **vision only**, without the typed text, run:

```bash
npx tsx scripts/eval.ts --images only
```

## Link safety

- Every URL uses the reserved `.example` TLD (RFC 2606/6761). These domains can never be registered and never resolve.
- No working phishing pages exist.
- Do **not** replace these with real lookalike domains.
- Phone numbers are fictional 555-01xx numbers.
- All names and addresses are made up.

## Validating the dataset

Run from the repo root. This makes no API calls:

```bash
npx tsx scripts/eval.ts --dry-run --suite all --no-save
```

It checks:

- every file parses;
- IDs are unique and match file names;
- levels, scamTypes and languages are valid;
- safe cases use `none`;
- each screenshot converts to a contract `InputImage`.

## Adding a case

1. Copy an existing file, rename it to `<new-id>.json`, and set `"id"` to the same value.
2. Write realistic text. **No real people, real phone numbers or working links.** Use `.example` domains and 555-01xx numbers.
3. Set `expected`. Use `suspicious` only when a careful human genuinely couldn't decide from the message alone.
4. Explain the label in `notes`.
5. Optional screenshot: set `"image": "screenshots/<id>.png"`, add a `STYLE` entry in `screenshots/generate.mjs` if you want a custom sender, and run `generate.mjs --png`.
6. Re-run the dry run.

## Known limitations

| Limitation | Detail |
|---|---|
| Small sample | 30 cases. One wrong answer moves accuracy by about 3 points, so report counts (e.g. "27/30") as well as percentages. |
| Mostly US-centric scenarios | Spanish cases mix Latin American and Spain contexts. Only one non-English/Spanish case. |
| Single labeller | Labels were written by Person 4, not independently double-annotated. |
| Synthetic screenshots | Fixtures are clean renders. Real screenshots have compression, notifications and dark mode. |
| `.example` domains | Domain-age and WHOIS tools will report "no registration / does not resolve" rather than "registered 3 days ago". That still counts as valid evidence, but it is not identical to a live lookalike domain. |
| Model non-determinism | LLM verdicts can vary between runs. Run the evaluation 2–3 times before quoting numbers. |
