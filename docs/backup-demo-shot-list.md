# ScamShield — Backup demo recording (P4-8)

**Target length: 2:45. Hard limit: under 3:00.**

**Purpose:** if Wi-Fi, the API or a phone fails on stage, we play this instead of the live demo. The recording also serves as the hackathon submission video if one is required.

**The integrity rule:**

- Record the real app producing real results.
- If a feature does not work at recording time, either cut that shot or show it with an on-screen label **"SIMULATED — feature in development"**.
- Never edit, stage or mock a verdict, a detector score or a delivered family alert and present it as real.
- Keep the raw, unedited capture files (see Backup storage) so anyone can verify the cut.

---

## Shot list

**Common settings:**

- Primary screen: the ScamShield app, in a phone-sized browser window or a real phone mirrored with scrcpy or QuickTime.
- Second phone: the "family phone", filmed by another phone or mirrored.
- Narration: the voice-over lines below, about 340 words at 135 wpm, recorded separately and laid over the footage.

| # | Time | Dur. | Screen | Exact action | Expected output | Narration | Visual emphasis | Transition |
|---|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:12 | 12 s | Title card, then app home | None. Title card fades into the home screen. | ScamShield logo, then the input screen | "This is ScamShield, an AI detective that helps older adults check suspicious messages before they act." | Logo centred; slow zoom-in on the input box | Cross-fade |
| 2 | 0:12–0:22 | 10 s | App input | Paste the Demo 1 text (Chase $42.10) and tap **Check** | Plan and step events start streaming | "Rosa gets a text from her bank. Is it real?" | Highlight the pasted text; cursor click visible | Hard cut on the verdict |
| 3 | 0:22–0:32 | 10 s | App verdict | None. Hold on the verdict. | 🟢 **Looks real**, plus reasons (no link, no money request, no password request) | "Looks real. No link, no money, no password requested. ScamShield doesn't cry wolf." | Green edge glow; zoom on the headline and first reason | Swipe left |
| 4 | 0:32–0:42 | 10 s | App input | New check. Paste the Demo 2 USPS text with `usps-package-hold.example` and tap **Check** | Investigation steps stream: link and domain checks | "Next, a delivery text with a link. ScamShield checks the link without opening it on her phone." | Ring highlight on the link and the "Investigating" step | Hard cut |
| 5 | 0:42–0:59 | 17 s | App evidence, then verdict | Scroll slowly through the evidence cards | Evidence about the domain (whatever the tool really returns), then 🔴 **Scam** / delivery | "It isn't a USPS address, and the site doesn't exist as a real postal service. Scam." **Narrate only what the evidence card actually says.** | Red glow; callout box on the domain evidence | Swipe left |
| 6 | 0:59–1:14 | 15 s | App input, then verdict | Make sure the family contact is set. Paste the Demo 3 grandparent text and tap **Check** | 🔴 **Scam** / grandparent: gift cards, secrecy, urgency | "Then the message every grandparent fears. Gift cards, secrecy, panic. Scam, with advice to call her grandson on a number she already knows." | Underline "gift cards" and "don't tell mom" in the reasons | Split-screen wipe |
| 7 | 1:14–1:26 | 12 s | Split: app (left) and family phone (right) | Film the second phone receiving the alert | The real alert arriving on the family phone | "Her daughter gets a heads-up at the same moment." | Notification pop on the right; small timestamp | Cut |
| 8 | 1:26–1:38 | 12 s | App input | Toggle **"I already acted"**, type `I already sent one $500 gift card`, tap **Check** | Streaming steps, then 🔴 verdict | "But what if Rosa already sent one gift card?" | Highlight the toggle and typed text | Hard cut |
| 9 | 1:38–1:58 | 20 s | App damage-control panel | Scroll slowly through the checklist | Damage-control steps: call the card issuer, keep receipts, report to FTC/IC3, call family | "ScamShield doesn't blame her. It gives her a calm checklist: call the gift card company now, keep the receipt, report it, call family." | Each checklist item fades to full opacity as it's read | Cross-fade |
| 10 | 1:58–2:30 | 32 s | App video upload, then result | Upload `ai-01.mp4` (fictional AI person). Wait for the result. | The real `aiMedia` result (likely AI / unclear / likely real) **and** a separate scam assessment | "Video too. ScamShield asks two questions: is this AI-generated, and is it a scam? Here it reports [read the real result]. AI-made doesn't automatically mean scam. It checks what the video asks you to do." | Two labelled result chips side by side: "AI-generated?" and "Scam?" | Fade to black |
| 11 | 2:30–2:45 | 15 s | Closing card | None | Logo, plus "Scammers use AI to sound like your grandson. We use AI to protect your grandmother." | Read the closing line slowly. | Text animates line by line; 2 s hold on the logo | End |

**Total: 2:45.**

**If shot 7 or 10 cannot be recorded truthfully:**
- **Shot 7:** cut it and extend shot 9 by 12 s. If the alert only appears in the app, show *that* and say "a family alert is ready to send".
- **Shot 10:** if the detector isn't integrated, replace it with a 10 s card: "Video analysis: in development (detector research done, see `docs/detector-choice.md`)". Total becomes about 2:23, which is fine.

---

## Recording checklist

- [ ] Use a local production build: `npm run build && npm start`. Do not use dev mode, which shows the Next.js dev overlay.
- [ ] Run `npx tsx scripts/eval.ts --suite demo` against the same URL first. All demos should pass.
- [ ] Browser: clean profile, 100% zoom, no extensions, bookmarks bar hidden, notifications off.
- [ ] Phone frame window at **390×844**, or mirror a real phone.
- [ ] Family contact set to a consenting teammate's phone. **Blur their number** in the edit.
- [ ] Demo texts ready in a notes file for copy-paste.
- [ ] `ai-01.mp4` on the desktop.
- [ ] Capture with OBS Studio (free) at 1920×1080, 30 fps, MKV (recover-safe), then remux to MP4.
- [ ] Record **each shot as its own take**, two takes each. Keep every raw file.

## Audio checklist

- [ ] Record the voice-over separately in a quiet, soft-furnished room. Avoid kitchens and stairwells.
- [ ] USB or headset mic about 15 cm from the mouth, angled slightly off-axis to avoid pops.
- [ ] Test level: peaks around −12 dB, never clipping.
- [ ] Record 5 s of room silence first, for noise reduction.
- [ ] Read at a relaxed pace, about 135 wpm, and smile on the closing line.
- [ ] Optional music: royalty-free, at −28 dB under the voice. None during the closing line.

## Editing instructions

Any free editor works: CapCut desktop, DaVinci Resolve or Clipchamp.

1. Lay the voice-over track first, then cut the screen footage to fit it.
2. Speed up **waiting time only**, to at most 2×, and add a small "⏩ sped up" label while it's applied. Never cut out an error or a wrong verdict and replace it with a different take's verdict without the label.
3. Add callouts and zooms per the "Visual emphasis" column.
4. Burn in captions. Many judges watch muted, and captions help older viewers.
5. Blur any real phone numbers, emails or API keys visible on screen.
6. Check the final runtime is **≤ 2:50**.

## Export settings

| Setting | Value |
|---|---|
| Container / codec | MP4, H.264 (High profile), AAC 48 kHz 192 kbps |
| Resolution / frame rate | 1920×1080, 30 fps |
| Bitrate | 8–12 Mbps VBR (file ≈ 200 MB) |
| Name | `ScamShield-backup-demo-v1.mp4` |

## Backup storage

Keep at least three copies, one of which needs no internet:

1. On the presenting laptop's **desktop**. It must open offline in VLC or the default player.
2. On a **USB stick** in [D]'s pocket.
3. In the team shared drive `ScamShield/presentation/`, together with the raw takes and the voice-over WAV.
4. Optional: an unlisted YouTube or Vimeo link in the submission form, if allowed.

**Do not commit video files to Git.**

## Common mistakes

| Mistake | Fix |
|---|---|
| Recording dev mode with error overlays | Use the deployed or production build |
| Narration claims something the screen doesn't show ("registered 2 days ago") | Script narration from the real evidence cards, after recording |
| Showing a family alert that wasn't actually sent | Film the real phone, or label it honestly |
| Real phone number visible | Blur it |
| Over 3:00 | Cut shot 10 narration first, then trim shot 9 |
| Tiny text | Use the phone-frame window and zoom in during editing |
| Silent first 3 seconds | Start narration on frame 1 |

## Offline presentation instructions

1. Before the pitch, open the MP4 in VLC, **paused at 0:00, in full screen**, on a second desktop or virtual workspace.
2. Switch to it with Win+Ctrl+→ on Windows, or a three-finger swipe on macOS.
3. Also export the slides to **PDF** and keep them on the desktop, in case the slide tool needs internet.
4. If the room has no internet at all, play the backup from shot 2 (0:12) when the pitch reaches the demo. The narrator can talk over it using the pitch script lines.
