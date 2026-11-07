"use client";

import {
  Phone,
  ShieldCheck,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import { EvidenceDot } from "@/components/evidence-dot";
import { ReadAloud } from "@/components/read-aloud";
import { Button } from "@/components/ui/button";
import type { Verdict, VerdictLevel } from "@/lib/contract";
import { cn } from "@/lib/utils";

// The answer is a whole field of colour: the one place on the screen allowed
// to be loud. Each field keeps icon, word and sentence, so colour is never the
// only carrier of the verdict. Contrast: white on #a3201b is 7.1:1, white on
// #1d6b3c 6.6:1, #2b1a00 on #f6c453 11:1.
const TONES: Record<
  VerdictLevel,
  { word: string; field: string; fieldInk: string; text: string; tint: string }
> = {
  scam: {
    word: "Scam",
    field: "field-scam",
    fieldInk: "",
    text: "text-scam",
    tint: "bg-scam-soft",
  },
  suspicious: {
    word: "Be careful",
    field: "field-warn",
    fieldInk: "",
    text: "text-warn",
    tint: "bg-warn-soft",
  },
  safe: {
    word: "Looks real",
    field: "field-safe",
    fieldInk: "",
    text: "text-safe",
    tint: "bg-safe-soft",
  },
};

// The second answer, "Made by AI?", uses the same three fields as the scam
// answer: good (no signs of AI), warning (can't tell), bad (likely AI).
const AI_TONES: Record<
  NonNullable<Verdict["aiMedia"]>["level"],
  { word: string; level: VerdictLevel }
> = {
  likely_real: { word: "No signs of AI", level: "safe" },
  unclear: { word: "Can't tell", level: "suspicious" },
  likely_ai: { word: "Likely AI", level: "scam" },
};

/**
 * A number invites an argument about the number. This audience needs one word
 * they can act on, so 0.93 becomes "We are very sure".
 */
function confidenceSentence(confidence: number): string {
  if (confidence >= 0.8) return "We are very sure.";
  if (confidence >= 0.5) return "We are fairly sure.";
  return "We are not sure yet.";
}

/**
 * Joins phrases into one spoken paragraph. Trailing punctuation is stripped
 * from each phrase so the join never produces doubled stops or "?. ".
 */
function toSpeech(parts: string[]): string {
  const cleaned = parts
    .map((part) => part.trim().replace(/[.!?]+$/, ""))
    .filter((part) => part.length > 0);
  return cleaned.length > 0 ? `${cleaned.join(". ")}.` : "";
}

function LevelIcon({
  level,
  size = 40,
  className,
}: {
  level: VerdictLevel;
  size?: number;
  className?: string;
}) {
  if (level === "scam") {
    return (
      <WarningOctagon size={size} weight="fill" className={className} aria-hidden />
    );
  }
  if (level === "suspicious") {
    return <Warning size={size} weight="fill" className={className} aria-hidden />;
  }
  return <ShieldCheck size={size} weight="fill" className={className} aria-hidden />;
}

export function VerdictCard({
  verdict,
  locale,
  onDamageControl,
  frameUrls,
}: {
  verdict: Verdict;
  locale: string;
  onDamageControl?: () => void;
  frameUrls?: string[];
}) {
  const tone = TONES[verdict.level];
  const aiTone = verdict.aiMedia ? AI_TONES[verdict.aiMedia.level] : null;
  const speech = toSpeech([
    `Is it a scam? ${tone.word}`,
    ...(aiTone ? [`Made by AI? ${aiTone.word}`] : []),
    verdict.headline,
    ...verdict.reasons,
    ...verdict.nextSteps,
  ]);
  const risky = verdict.level !== "safe";

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] bg-surface">
      {/* Two answers, before anything else, each a word on its own field of
          colour: is it a scam, and was it made by AI. Icon, word and label
          together, so colour is never the only carrier. */}
      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        <AnswerField question="Is it a scam?" word={tone.word} level={verdict.level} />
        {aiTone ? (
          <AnswerField question="Made by AI?" word={aiTone.word} level={aiTone.level} />
        ) : (
          <div className="flex flex-col justify-center rounded-xl bg-surface-sunk px-5 py-5 sm:px-6">
            <p className="font-mono text-sm font-semibold text-ink-soft">Made by AI?</p>
            <p className="mt-2 font-serif text-[1.9rem] leading-none text-ink">Not checked</p>
          </div>
        )}
      </div>

      <div className="px-6 pb-7 pt-6 sm:px-9 sm:pb-8">
        <h2 className="max-w-[34ch] text-[1.55rem] font-bold leading-[1.18] tracking-tight text-balance sm:text-[1.9rem]">
          {verdict.headline}
        </h2>
        <p className="mt-2 text-lg font-bold text-ink-soft">
          {confidenceSentence(verdict.confidence)}
        </p>
        <div className="mt-5">
          <ReadAloud text={speech} locale={locale} />
        </div>
      </div>

      <div className="divide-y divide-line">
        <section className="p-5 sm:p-7">
          <h3 className="text-xl font-bold tracking-tight">Why we think it is {tone.word.toLowerCase() === "scam" ? "a scam" : tone.word === "Be careful" ? "worth being careful" : "real"}</h3>
          <ul className="mt-4 space-y-3">
            {verdict.reasons.map((reason, index) => (
              <li key={index} className="flex gap-3 text-lg leading-relaxed">
                <EvidenceDot tone={verdict.level} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>

        {verdict.aiMedia && (
          <AiReasons media={verdict.aiMedia} frameUrls={frameUrls} />
        )}

        {/* Actions carry the weight of the page, so they get a raised surface
            and a larger numeral instead of a border per row. */}
        <section className="bg-accent-soft p-5 sm:p-7">
          <h3 className="text-xl font-bold tracking-tight">What to do now</h3>
          <ol className="mt-4 space-y-4">
            {verdict.nextSteps.map((step, index) => (
              <li key={index} className="flex gap-3.5 text-lg leading-relaxed">
                <span
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold tabular-nums text-accent-ink"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="font-bold">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {verdict.officialContact && (
          <section className="p-5 sm:p-7">
            <h3 className="text-xl font-bold tracking-tight">The real place to go</h3>
            <p className="mt-2 text-lg font-bold">{verdict.officialContact.org}</p>
            <div className="mt-3 flex flex-col gap-1">
              {verdict.officialContact.phone && (
                // Only the number the agent verified. Never a number from the
                // message being checked.
                <a
                  href={`tel:${verdict.officialContact.phone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex min-h-12 items-center gap-2.5 text-lg font-bold text-accent underline underline-offset-4"
                >
                  <Phone size={22} weight="bold" aria-hidden />
                  Call {verdict.officialContact.phone}
                </a>
              )}
              {verdict.officialContact.url && (
                <a
                  href={verdict.officialContact.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center break-all text-lg font-bold text-accent underline underline-offset-4"
                >
                  {verdict.officialContact.url}
                </a>
              )}
            </div>
          </section>
        )}

        {onDamageControl && risky && (
          <div className="p-5 sm:p-7">
            <p className="text-lg leading-relaxed text-ink-soft">
              Money already gone? There is still something you can do.
            </p>
            <Button
              variant="secondary"
              size="lg"
              onClick={onDamageControl}
              className="mt-3.5 w-full sm:w-auto"
            >
              I already sent money
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function AnswerField({
  question,
  word,
  level,
}: {
  question: string;
  word: string;
  level: VerdictLevel;
}) {
  const t = TONES[level];
  return (
    <div className={cn("rounded-xl px-5 pb-5 pt-4 sm:px-6", t.field, t.fieldInk)}>
      <p className="font-mono text-sm font-semibold">{question}</p>
      <div className="field-word mt-2 flex items-center gap-3">
        <LevelIcon level={level} size={34} className="shrink-0" />
        <p className="font-serif text-[1.9rem] leading-[1] sm:text-[2.15rem]">{word}</p>
      </div>
    </div>
  );
}

/** Why we gave the AI answer, plus any video frames that stood out. */
function AiReasons({
  media,
  frameUrls,
}: {
  media: NonNullable<Verdict["aiMedia"]>;
  frameUrls?: string[];
}) {
  const aiTone = AI_TONES[media.level];
  const frames = media.flaggedFrames.flatMap((frame) => {
    const src = frameUrls?.[frame.index];
    return src ? [{ ...frame, src }] : [];
  });

  return (
    <section className="p-5 sm:p-7">
      <h3 className="text-xl font-bold tracking-tight">Why we said &ldquo;{aiTone.word}&rdquo; for AI</h3>
      {media.signals.length > 0 && (
        <ul className="mt-4 space-y-3">
          {media.signals.map((signal, index) => (
            <li key={index} className="flex gap-3 text-lg leading-relaxed">
              <EvidenceDot tone={aiTone.level} />
              <span>{signal}</span>
            </li>
          ))}
        </ul>
      )}

      {frames.length > 0 && (
        <div className="mt-5">
          <h4 className="text-lg font-bold">Frames that stood out</h4>
          <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
            {frames.map(({ index, note, src }) => (
              <li key={index} className="shrink-0 snap-start">
                <figure className="w-32">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the local canvas */}
                  <img
                    src={src}
                    alt={`Frame ${index + 1} from the video`}
                    width={128}
                    height={128}
                    className="aspect-square w-32 rounded-lg object-cover"
                  />
                  <figcaption className="mt-1.5 text-base leading-snug text-ink-soft">
                    <span className="font-bold">Frame {index + 1}.</span> {note}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
