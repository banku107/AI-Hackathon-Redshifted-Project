# ScamShield — 3-minute pitch script (P4-9)

## Roles and timing

| Role | Who | Job |
|---|---|---|
| **[A] Narrator** | `<name>` | Speaks everything below |
| **[B] Driver** | `<name>` | Laptop and app. Never speaks. Follows the **▶ CLICK** cues |
| **[C] Family phone** | `<name>` | Holds the second phone, raises it on cue |
| **[D] Slides and backup** | `<name>` | Advances slides. Owns the backup video, cued and paused |

- **Spoken words:** about 370. At a calm 140–150 wpm that is about 2:35 of speech, which leaves **about 25 s of silence** for the agent to stream results on screen.
- If live answers take longer than about 8 s, follow the **⏱ Running long** notes.

### Before you walk on

- App open on the **input screen**.
- Language set to English.
- Family contact set to [C]'s real phone. A consenting teammate only, entered in the UI, not committed to Git.
- Copy the five demo messages into a text file, in order, so [B] can paste them. Never retype on stage.
- Video clip `ai-01.mp4` sits on the desktop, if the video demo is enabled.
- Backup video loaded at 0:00 and paused on a second tab.
- Phone on Do Not Disturb, **except** [C]'s phone, which must receive the alert.

---

## 0:00–0:25 · Emotional hook *(Slide 1 on screen)*

**[A]:**
> This is Rosa. She's seventy-four.
>
> Last spring, her phone buzzed: *"Grandma, it's me. I'm in jail. Please send two thousand dollars in gift cards — and don't tell Mom."*
>
> Scared, urgent, secret. Built to make a loving grandmother act before she thinks.
>
> Last year, Americans over sixty reported **seven point seven billion dollars** in losses to the FBI. And now AI can copy your grandson's voice and face.

**[D]:** At "face", switch to the live app (Slide 2).

*Rosa is a composite character. Do not claim she is a real person. If asked: "She's based on the most common scam the FBI and FTC describe."*

---

## 0:25–2:00 · Live demo *(app on screen)*

### Beat 1: Green, a real bank alert (0:25–0:40)

**▶ CLICK [B]:** Paste the message and tap **Check**.
> Chase: Did you attempt a $42.10 purchase at Target? Reply YES or NO. We'll never ask for your password.

**[A]** (while it streams):
> First, a real bank alert. No link, no money, no password requested.

**[A]** (verdict shows 🟢):
> **Looks real.** Because a scam detector that flags your actual bank is useless.

### Beat 2: Red, fake delivery (0:40–0:58)

**▶ CLICK [B]:** New check. Paste:
> USPS: Your package is on hold due to an incomplete address. Update within 12 hrs: https://usps-package-hold.example/update

**[A]:**
> Now a delivery text. Watch it investigate the link, without opening it on Rosa's phone.

**[A]** (point at the evidence card; say only what the card says):
> That's not USPS. That website doesn't even exist as a real postal site. **Scam.**

*Do not say "registered two days ago" unless the evidence card literally says so (see `test-data/demo/README.md`).*

### Beat 3: Red, grandparent emergency (0:58–1:15)

**▶ CLICK [B]:** New check. Paste:
> Grandma it's me, I'm in jail, please send $2,000 in gift cards, don't tell mom

**[A]:**
> And here's Rosa's message. Gift cards. Secrecy. Panic. And he never even says his name.

**[A]** (verdict shows 🔴):
> **Scam.** And it tells her, kindly, to call her grandson on the number she already has.

### Beat 4: Family alert (1:15–1:25)

**[C]:** Raise the phone toward the judges **only when it actually buzzes**.

**[A]:**
> Rosa also chose her daughter Maria as a trusted contact, and Maria just got a heads-up.

*If the phone does not buzz within about 3 s, say instead: "In the app, a family alert is ready to send to Maria," and point at the on-screen alert. **Never claim delivery that didn't happen.***

### Beat 5: Rosa already paid, damage control (1:25–1:45)

**▶ CLICK [B]:** Toggle **"I already did something"**, type `I already sent one $500 gift card`, then **Check**.

**[A]:**
> But what if Rosa already sent one card? ScamShield doesn't scold her. It helps.

**[A]** (checklist appears):
> Call the gift card company *now* with the card number. Keep the receipt. Report it. Call family. No blame, just next steps.

### Beat 6: AI video (1:45–2:00)

**▶ CLICK [B]:** Upload `ai-01.mp4`, a fictional AI-generated person.

**[A]:**
> Last: video. ScamShield asks two separate questions. *Is this AI-made?* And *is it trying to scam you?*

**[A]** (read the actual result):
> Here: **[likely AI / unclear]**, but **[safe / scam]**. An AI video isn't automatically a scam. What matters is what it asks you to do.

*If the video pipeline isn't working, **skip this beat** and say: "Video checks are in progress. We'll show you after." Never show a mocked detector result as real.*

⏱ **Running long?** If you are past 1:50 at the start of Beat 6, skip it and mention video in one sentence during the safety section.

---

## 2:00–2:30 · How it works and results *(Slides 3 → 4)*

**[D]:** Slide 3.

**[A]:**
> Under the hood, it's an agent. It **plans** what to check, **investigates** the links, domains and media, **verifies** the claims against the evidence, gives a **verdict**, and then **acts**: next steps, family, damage control.

**[D]:** Slide 4.

**[A]** (if real results exist; fill from `test-data/results/`):
> We tested it on thirty labelled messages in three languages, ten of them completely legitimate. It got **[X] of 30** right, with **[Y]** false alarms on real messages.

**[A]** (if NO live results exist, use this instead):
> We built a thirty-message test set in three languages, ten of them deliberately legitimate, to measure false alarms as hard as missed scams.

---

## 2:30–3:00 · Safety and closing *(Slides 5 → 6)*

**[D]:** Slide 5.

**[A]:**
> Two things we refused to compromise on. **False alarms**: if we cry wolf on Rosa's real bank, she stops listening. And **honesty**: deepfake detectors aren't perfect, so ScamShield can say *"be careful, I'm not sure"*, and it checks what a message *asks you to do*, not just how it looks.

**[D]:** Slide 6. Pause one beat.

**[A]** (slowly, eyes up):
> Scammers use AI to sound like your grandson.
> **We use AI to protect your grandmother.**

Hold for 2 seconds, then:

> Thank you.

---

## Backup instructions

| Failure | Action |
|---|---|
| App will not load, or Wi-Fi is down | [D] plays the backup recording from 0:25 while [A] narrates live over it, or lets its narration play. Say once: "We'll show you our recorded run." |
| One verdict is wrong live | Don't hide it: "Interesting — it's being cautious there. That's exactly what our evaluation measures." Move on. |
| An answer takes over 10 s | [A] fills: "It's checking the link's registration right now…", then skip the next beat if needed. |
| Family phone does not buzz | Point at the on-screen alert. Never claim it was sent. |
| Video upload fails | Skip Beat 6 (see above). |

## Rehearsal notes

- Rehearse **3 full run-throughs with a stopwatch**, at least one on the venue Wi-Fi.
- Record the real latency of each beat. If the total demo exceeds 95 s, cut Beat 6 first, then shorten Beat 2's narration.
- [A] should practise the hook from memory. Eye contact for the first 25 seconds matters more than anything else.
- Say numbers plainly: "seven point seven billion", not "7.748".
- Slow down for the closing line. It should take about 6 seconds.
- Before the pitch, re-run `npx tsx scripts/eval.ts --suite demo` against the deployed URL to confirm all demo verdicts still match.
- Rosa and Maria are fictional. Never imply real victims or real family members.
