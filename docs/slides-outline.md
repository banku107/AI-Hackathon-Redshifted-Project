# ScamShield — Six-slide outline (P4-7)

**Narrative arc:** Problem (fear) → Live demo (relief) → How it works (credibility) → Results (proof) → Safety (trust) → Impact (hope).

**Talk length:** 3:00 total, matched to `docs/pitch-script.md`. The live demo is the centrepiece; the slides frame it.

**Visual identity: "a calm detective, not an alarm"**

| Element | Choice |
|---|---|
| Background | Near-black `#0B0D12` with one soft radial light, cinematic and low-noise |
| Type | One sans family, e.g. Inter or Geist. Headlines 56–72 pt, body 24 pt minimum (judges sit far away) |
| Colour | Verdict colours only: 🟢 `#22C55E` Looks real · 🟡 `#F59E0B` Be careful · 🔴 `#EF4444` Scam. Accent `#60A5FA` for the agent's flow |
| Text per slide | No more than 15 words on screen. The speaker carries the detail |
| Product shots | Real UI screenshots in phone frames. **Never** mock a verdict the app didn't produce |
| Existing work | A draft deck already exists at `C:\Users\amakh\scamshield-deck\`. Reuse its visuals if the team prefers; this outline is the content source of truth |

Tags used below:
- **[CONFIRM]** = a capability we must check exists in the repo before saying it.
- **[FILL]** = a value that only a live evaluation can supply.

---

## Slide 1: The problem

**Headline:** AI has made scams harder to recognize.

**Exact slide text:**
> **$7.7 billion**
> lost by Americans 60+ — reported to the FBI in 2025
>
> *Up 59% in one year.*
>
> <small>FBI IC3, 2025 Internet Crime Report</small>

**Main message:** Older adults are losing life savings, and AI is making the lies more convincing.

**Visual layout:**
- One giant number, centred.
- Beneath it, a single faded phone notification: "Grandma it's me…"
- The source line sits small, bottom-left.

**Images:** A close-up of an older hand holding a phone, low light, shallow depth of field. Use licensed stock showing no identifiable real person.

**Chart:** None. A single number hits harder. Optional: a tiny two-bar sparkline, "2024 → 2025".

**Speaker notes:**
- Read the number, then pause.
- "That's only what got reported. The FTC estimates the true cost to older adults could be anywhere from 13 to nearly 120 billion dollars."
- "And the FBI now says AI-made fake content is 'increasingly difficult to detect.'"

**Key takeaway:** This is big, it's growing, and AI is making it worse.

**Transition:** "So let's meet Rosa." Cut to the live demo.

### Verified statistics for this slide

These come from official sources, research date 2026-11-07. **Before printing, check each against the PDF page cited**, because some PDF tables lose layout when copied.

| # | Statistic | Year | What it measures | Source |
|---|---|---|---|---|
| 1 | **$7.748 billion** | 2025 | Losses *reported to IC3 by complainants aged 60+*. **Not** total fraud losses. Up 59% vs 2024. | FBI IC3, *2025 Internet Crime Report*, Elder Fraud section p. 44. https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf |
| 2 | **201,266 complaints** | 2025 | Complaints filed by people aged 60+. Largest of any age group; up 37%. | Same report, p. 44 |
| 3 | **$38,500** | 2025 | Average loss per 60+ complainant | Same report, p. 44 |
| 4 | **$20.877 billion** | 2025 | Total losses reported to IC3 across **all ages** | Same report |
| 5 | **3,143 complaints / $352.5 million** | 2025 | 60+ complaints tagged "AI related", and their losses | Same report, Elder Fraud section |
| 6 | "AI-enabled synthetic content is becoming increasingly difficult to detect and easier to make." | 2025 | FBI statement | Same report, AI section p. 39 |
| 7 | **Over $3 billion** (up from about $2.4 billion in 2024) | 2025 | Fraud losses *reported to the FTC* by people 60+. A different system from IC3; **do not add the two together**. | FTC, *Protecting Older Consumers 2025–2026* report to Congress (Oct 2026). https://www.ftc.gov/system/files/ftc_gov/pdf/2026-older-adults-report-10192026.pdf |
| 8 | **$13.3 billion – $119.5 billion** | 2025 | FTC *estimate* of the overall cost of fraud to older adults, including unreported fraud. The FTC itself notes considerable uncertainty. | Same FTC report |
| 9 | "Gift cards were the most frequent payment method reported by older adults on several common fraud types, including … family- and friend-impersonation scams." | 2025 | FTC finding | Same FTC report |
| 10 | Criminals generate "short audio clips containing a loved one's voice to impersonate a close relative in a crisis situation." | Dec 2024 | FBI public service announcement I-120324-PSA | https://www.ic3.gov/PSA/2024/PSA241203 |

**Do not say:**
- "$20.9 billion stolen from seniors". That figure is **all ages**.
- "$10.7 billion", which would be FBI and FTC added together. The systems overlap, so the sum is wrong.

---

## Slide 2: The live demo

**Headline:** Meet Rosa.

**Exact slide text:** None while the app is on screen. Before the switch, show only:
> **Meet Rosa.** 74. Three messages arrived today.

**Main message:** ScamShield gives a clear, kind answer in seconds, and it knows when a message is real.

**Visual layout:**
- Switch to the **live app** via a phone frame or screen mirror.
- The "family phone" sits on a second screen, or a teammate holds it up.
- If live fails, play the backup recording (`docs/backup-demo-shot-list.md`).

**Demo sequence:**

| Step | Input | Expected result |
|---|---|---|
| 1 | Chase message | 🟢 **Looks real**. Proves we don't cry wolf. |
| 2 | USPS link message | 🔴 **Scam**, with the evidence card about the domain |
| 3 | "Grandma it's me, I'm in jail…" | 🔴 **Scam** |
| 4 | — | Family phone buzzes with the alert (only if delivery really works) |
| 5 | "I already sent one $500 gift card" | Kind damage-control checklist |
| 6 | Short AI-generated clip | Shows "likely AI" or "unclear", plus the separate scam assessment. Only if the video pipeline works; otherwise skip and say so |

**Images:** The real UI only. Verdict colour floods the frame edge (green, then red, then red) for drama.

**Chart:** None.

**Speaker notes:** Follow the pitch script exactly. Narrate *what Rosa sees*, not what the code does.

**Key takeaway:** One tap tells Rosa what's real, what's not, and what to do next.

**Transition:** "So what just happened under the hood?"

---

## Slide 3: How it works

**Headline:** A detective, not a filter.

**Exact slide text:**
> PLAN → INVESTIGATE → VERIFY → VERDICT → ACT

Under each word, 3–5 words of caption:

| Stage | Caption |
|---|---|
| Plan | decides what to check |
| Investigate | links · domains · reputation · media |
| Verify | weighs evidence vs. claims |
| Verdict | 🟢 🟡 🔴 + confidence |
| Act | next steps · family · damage control |

**Main message:** ScamShield is an agent. It chooses tools, gathers evidence, and explains itself. It is not a keyword blocklist.

**Visual layout:**
- Five glowing nodes on a horizontal line.
- Each node lights up in sequence, mirroring the live step events the UI streamed during the demo.

**Images:** Small icons per stage: map, magnifier, scales, traffic light, hand.

**Chart:** None. Optional inset: "Events streamed live: plan → evidence → verdict".

**Speaker notes:** Mention only capabilities confirmed in the repo before the pitch.

| Claim | Status |
|---|---|
| Claude reasons over the message, writes a plan (`make_plan` tool) and can run web searches | Exists in `app/api/agent/route.ts` |
| Investigation tools: `expand_link`, `domain_age`, `lookalike_check`, `check_reputation` | Wired in. As of 2026-11-07, domain age (RDAP) and the lookalike check give real answers; link expansion and reputation are honest stand-ins until Person 2's tools land. **[CONFIRM]** on pitch day |
| Video: video frames go to Claude, plus `analyzeVideo` (C2PA, ffprobe metadata, detector) | The pathway exists, but `analyzeVideo` is a stand-in until Person 2's P2-8. **[CONFIRM]** on pitch day |
| Streams each step to the UI live (Server-Sent Events) | Part of the contract |
| Answers in the user's language (10 languages in the contract) | Contract supports it; **[CONFIRM]** the outputs are actually translated |
| Family alert and damage-control guidance | Exist. Recorded runs show alerts on `channel: "screen"` (displayed, not sent). **[CONFIRM]** whether Twilio/Resend sending is live |

**Key takeaway:** It investigates like a person would, then explains its reasoning in plain words.

**Transition:** "Does it actually work? We tested it."

---

## Slide 4: Results

**Headline:** We tested it on [FILL: N] real-world-style messages.

**Exact slide text (fill only from `test-data/results/<timestamp>.json`):**
> **[FILL] / [FILL]** correct verdicts
> **[FILL] / 10** false alarms on real messages
> **[FILL] / 20** scams missed
> Average answer: **[FILL] s**

**Main message:** We measure ourselves, including the misses.

**Visual layout:** Four stat tiles across the top, with a category bar chart below.

**Chart:** Horizontal bar per category (Grandparent, Delivery, Bank/Gov, Tech support, Romance, Prize/Crypto, Legitimate), showing correct out of total.
- Grey track, solid fill.
- Label each bar with the count ("4/5"), not only a percentage. With small samples, counts are honest.

**Video tile:**
- If `--videos` has run: "AI-video detection: [FILL]/[FILL] · Scam classification: [FILL]/[FILL]".
- Otherwise: **"Video: not yet benchmarked"**. Never fill in a guess.

**Speaker notes:**
- "30 hand-labelled messages in English, Spanish and French. 10 of them are completely legitimate, because a scam detector that flags your real bank is useless."
- If there are misses, name one and say what we learned.

**If no live run exists by pitch time:**
- Replace the tiles with "Evaluation harness ready: 30 labelled cases, 7 screenshots, 10 videos labelled".
- Say "results coming". **Do not invent numbers.**

**Key takeaway:** Honest, measured, reproducible: `npx tsx scripts/eval.ts`.

**Transition:** "And when it isn't sure, it says so."

---

## Slide 5: Safety and honesty

**Headline:** It's allowed to say "I'm not sure."

**Exact slide text:**
> 🟡 "Be careful" is a real answer.
> Confidence ≠ certainty.
> AI-made ≠ scam. Real video ≠ safe.
> We check the **claim**, not just the pixels.
> Always verify through an official number.

**Main message:** Trust is earned by being honest about limits.

**Visual layout:** Left: a yellow "Be careful" verdict card from the real UI. Right: five short lines appearing one at a time.

**Images:** Real yellow verdict screenshot, e.g. from `grandparent-03`, "Hi Mum, new number".

**Chart:** None.

**Speaker notes** (cover these quickly):
- ScamShield doesn't open suspicious links on Rosa's phone. Any link checks run server-side **[CONFIRM]** with Person 2 how links are checked (lookups only vs. fetching).
- Deepfake detectors are imperfect, so we show "likely AI / unclear / likely real", never "fake".
- An AI video isn't automatically a scam, and a genuine video can still push one. That's why the agent judges what the video *asks you to do*.
- Every test deepfake we used is fictional and labelled. No real person's likeness was used.
- False alarms matter too. If we flag Rosa's real bank, she'll stop trusting us.

**Key takeaway:** Honest uncertainty protects people better than false confidence.

**Transition:** "So where does this go?"

---

## Slide 6: Impact and future

**Headline:** Scammers use AI to sound like your grandson. We use AI to protect your grandmother.

**Exact slide text:**
> 👵 Protects older adults, kindly
> 👨‍👩‍👧 Brings family in, without taking over
> 🌎 Speaks their language
> 🎥 Next: stronger media verification
>
> **ScamShield**

**Main message:** One tap can prevent financial and emotional harm, and keep families connected.

**Visual layout:**
- The closing line takes up most of the slide, in two lines.
- Four small roadmap chips above it.
- Logo bottom-centre.

**Images:** A warm, photographic moment: a grandparent and grandchild on a call. Use stock with no identifiable real person.

**Chart:** None.

**Speaker notes:** Roadmap. Say "next", not "we have":
- Forward-to-check (SMS or email forwarding)
- Voice-call screening
- Trusted-contact circles
- Bank partnerships to pause gift-card and wire purchases
- Better provenance checks as C2PA adoption grows

**Key takeaway:** AI made scams harder to see. ScamShield makes them easier to stop.

**Transition:** End on the closing line. Hold for 2 seconds of silence, then say "Thank you."
