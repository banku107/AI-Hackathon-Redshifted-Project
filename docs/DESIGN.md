# ScamShield design notes

Why the frontend looks and behaves the way it does. The files are in `app/` and
`components/`, and this page covers the `ui` branch as it stands today.

## Who this is for

Older adults who are worried, often on a small phone, sometimes holding it at arm's
length and reading through the wrong part of their glasses. Some are hard of
hearing. Some will hand the phone to a relative. The design starts from that person
and works backwards, not from a dashboard wireframe.

What follows from that:

- **Big controls.** The shared `Button` is 48 px tall at `md` and 64 px at `lg`.
  The main action, "Check this for me", is `lg` and full width. Checklist rows in
  damage control are 64 px tall. Two controls are still at 44 px and should be
  raised to 48 if there is time: the floating settings button and the two header
  links.
- **Large text.** Atkinson Hyperlegible is loaded in `app/layout.tsx` through
  `next/font`, so there is no flash of a fallback font. The font was drawn by the
  Braille Institute so letters that look alike stay apart. The app maps it to
  `--font-sans` in `app/globals.css`; no other font is in use.
- **Important copy is 18 px or bigger.** The message box, verdict headline,
  reasons, next steps, family reasons, and the damage control checklist all use
  `text-lg` or larger. Small text is reserved for counters, helper lines, and frame
  captions.
- **Text size mode scales the whole page.** `html[data-text="large"]` sets the root
  font size to 118% and `xlarge` to 134%. Every rem value grows with it, so the
  layout scales as a unit instead of a few headings getting bigger.
- **High contrast.** Ink on paper is close to black on a very pale grey green.
  Borders are real borders, not decoration. The faint ink tone is only used for
  helper text, never for a reason, a step, or a warning.

## Colour

The palette is calm on purpose. A scared person should not land on a page that
looks like an alarm.

- **One teal accent.** `#0c6a55` in light mode and `#5ec6a6` in dark mode. It is
  used for the primary button, focus rings, active navigation, links, and the
  "family alert" panel. It means "this is the action" or "this is active", never
  "danger".
- **Three verdict tones.**
  - Scam: deep red `#9e2128` on pale red `#fae3e4`.
  - Be careful: dark amber `#7a4c00` on pale amber `#fdefd4`.
  - Looks real: dark green `#0d6440` on pale green `#d8f0e2`.
- **Red is reserved for scam.** It is not the default error colour and it is not
  decoration. When a red block shows up, the message is a scam. That only works if
  red means one thing. Known exceptions in the current code:
  - The "likely AI" video answer borrows the scam red.
  - The copy failure line on damage control uses `text-scam`.
  - Urgent damage control steps get a soft red border and background.
  Each of these weakens the rule a little. Fix them or write them into the rule.
- **Amber is "stop and look".** Suspicious gets amber because red would tell the
  person they are in danger before the evidence supports it.
- **Dark mode is a full token swap,** not an inverted filter. The tones keep their
  meanings and get lighter text values for contrast.

## Layout

- **One idea per screen.** Each screen answers one thing: check this, what your
  family found, what to do after paying. `app/page.tsx` switches between input,
  reading, and result in place, so the person never loses the page.
- **Narrow reading column.** The reading and result states, the family screen, and
  damage control all sit in a `max-w-2xl` column. Text lines stay short enough to
  track without a finger.
- **One wide screen, two parts.** Only the home input goes wider (`max-w-5xl`). At
  `lg` and up it is two columns: the promise and the saved examples on the left,
  the input on the right. On a phone it stacks into one column, with the same
  reading order.
- **Phone first.** Type sizes, spacing, and the three-way mode control are designed
  for the small screen. The `sm:` and `lg:` breakpoints only add padding, raise the
  headline size, or split the home input into two columns.
- **Grouping with borders, not shadows.** `Panel` and `StackedSection` use a border,
  a soft background, and an 18 px corner. Nested shadow cards read busier, and they
  break up badly in large-text mode.
- **A sticky header** keeps the app name and the two safety routes reachable at all
  times. The nav labels shorten on a narrow phone ("Help" for "I already paid") so
  they fit beside the wordmark.
- **Answer first.** The verdict word and headline sit at the top of the card in a
  tinted block, before the reasons. The person can stop reading after one line if
  that is all they need.

## Interaction rules

- **One primary action per screen.** On the home screen there is one teal button,
  "Check this for me". Everything else is secondary: the mode tabs, the example
  buttons, the settings button. Settings live behind one floating button so the
  page never looks like a control panel.
- **Three input modes, not three pages.** Message, picture, and video are tabs on
  one screen. The person chooses what they have, not where to go.
- **Plain-word step labels.** The timeline shows sentences such as "Website created
  4 days ago". The labels and the summaries come from the agent, already written in
  the reader's language; `components/timeline.tsx` only lays them out.
- **A skeleton before the first step.** `components/check-skeleton.tsx` shows the
  shape of the rows that are coming, so the screen is never a lone spinner.
- **Evidence stays attached to its step.** Each finding appears under the step that
  found it, with a small colored dot: red, amber, green, or grey. The person reads
  a story, not a spreadsheet.
- **A visible progress count.** "2 of 4" sits beside the timeline heading, over a
  thin bar that fills as steps land. That reads faster than counting rows. A hidden
  status line names the step still running.
- **Read-aloud on the parts that matter.** The verdict card, the video block, and
  the damage control checklist each have a read-aloud button. The family screen
  does not yet; add one.
- **No shaming language.** No "you should have known" and no "obviously a scam".
  Damage control opens with "This happens to careful people too", and the fallback
  step says "being tricked is not your fault". The failure panel says "Nothing is
  wrong with what you sent" before it asks the person to try again.
- **The error path stays calm.** If the agent cannot be reached, the page says a
  saved example is being shown. If the check cannot finish, the page says so plainly
  and suggests calling someone they trust.

## Accessibility

- **Focus rings.** Every focusable element gets a 3 px accent outline with a 3 px
  offset (`:focus-visible` in `app/globals.css`). It is never removed. The custom
  checkbox in damage control adds its own ring because the real input is visually
  hidden.
- **`prefers-reduced-motion`.** All animation and transition durations drop to
  almost zero. The timeline spinner also has `motion-reduce:animate-none`.
- **Semantic landmarks.** `header`, a labelled `nav`, `main`, and `section` with a
  heading. Steps use `ol`, findings use `ul`, and the full timeline uses a real
  `details` block.
- **Live updates.** The timeline heading uses `aria-live="polite"`. The running
  step carries hidden text that says "in progress". The damage control counter and
  the copy result announce themselves the same way.
- **State on controls.** The mode tabs use `role="tab"` with `aria-selected`.
  Toggle buttons use `aria-pressed`. The current nav link uses `aria-current`.
  The settings button uses `aria-expanded` and `aria-controls`.
- **Alt text.** Every screenshot, video frame preview, and flagged frame has alt
  text that says what it is. Icons are `aria-hidden` because the text beside them
  already carries the meaning.
- **No colour-only signals.** The verdict is an icon, a word ("Scam", "Be careful",
  "Looks real"), a headline, and a tone. Colour supports it; colour is not it.
- **Preferences persist.** Theme and text size are saved in localStorage, and an
  inline script in `app/layout.tsx` applies them before paint so nothing flashes.

## What we deliberately did not do

- **No dashboard.** There is no home overview with counts, activity, or a sidebar.
  A worried person needs one answer, not a control centre.
- **No charts or score bars.** A confidence of 0.93 becomes "We are very sure".
  A number invites an argument about the number instead of the action.
- **No dense tables.** No evidence spreadsheet and no settings matrix. Findings are
  sentences, and the report is plain text the person can copy or download.
- **No chat box.** The agent works through a fixed timeline. A chat would ask the
  reader to keep typing while they are already upset.
- **No stock photos of smiling families.** Icons and type carry the screens. The
  only images that appear are the reader's own screenshot or video frames.

## Restyle, 2026-11-07

The screens were restyled for the demo (style: "editorial greeting"). Behaviour,
copy and accessibility rules above are unchanged; these values replace the
colour notes above where they differ.

- **Ground and panels.** White page; panels one tone step off it in a pale sage
  (`#eff4f1`). Surfaces are told apart by tone, not by borders or shadows. Form
  fields are white inside the sage panels.
- **One display face.** Instrument Serif, only for the screen titles and the
  verdict word. Every sentence a person reads is still Atkinson Hyperlegible.
- **The verdict is a field of colour.** Scam: white on `#a3201b` (7.1:1).
  Be careful: `#2b1a00` on `#f6c453` (11:1). Looks real: white on `#1d6b3c`
  (6.6:1). The family alert uses the same fields, so both people see the same
  answer.
- **Red still means scam only.** The "likely AI" video answer is now amber, not
  red: made by AI is not the same as a scam.
- **Buttons are fully round,** fields and panels keep 16px and 22px corners.
- **Settings live in the top bar** on every screen, so nothing floats over the
  form on a phone.
