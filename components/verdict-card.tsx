"use client";

import {
  MagnifyingGlass,
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
    field: "bg-scam",
    fieldInk: "text-white",
    text: "text-scam",
    tint: "bg-scam-soft",
  },
  suspicious: {
    word: "Be careful",
    field: "bg-warn-field",
    fieldInk: "text-[#2b1a00]",
    text: "text-warn",
    tint: "bg-warn-soft",
  },
  safe: {
    word: "Looks real",
    field: "bg-safe",
    fieldInk: "text-white",
    text: "text-safe",
    tint: "bg-safe-soft",
  },
};

// "Made by AI" is not "scam", so the video answer never borrows the scam red:
// likely AI is amber (stop and look), unclear is neutral, probably real is green.
const MEDIA_TONES = {
  likely_ai: {
    answer: "Yes, likely",
    surface: "bg-warn-soft",
    text: "text-warn",
    level: "suspicious" as VerdictLevel,
  },
  unclear: {
    answer: "Can't tell",
    surface: "bg-surface-sunk",
    text: "text-ink",
    level: "suspicious" as VerdictLevel,
  },
  likely_real: {
    answer: "Probably real",
    surface: "bg-safe-soft",
    text: "text-safe",
    level: "safe" as VerdictLevel,
  },
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
  const speech = toSpeech([
    verdict.headline,
    ...verdict.reasons,
    ...verdict.nextSteps,
  ]);
  const risky = verdict.level !== "safe";

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] bg-surface">
      {/* The answer, before anything else: one word, very large, on its own
          field of colour, then the sentence that explains it. */}
      <div className={cn("px-6 pb-7 pt-6 sm:px-9 sm:pb-9 sm:pt-8", tone.field, tone.fieldInk)}>
        <div className="flex items-center gap-3 sm:gap-4">
          <LevelIcon level={verdict.level} size={52} className="shrink-0" />
          {/* The word is the verdict. Sentence case, in the display serif. */}
          <p className="font-serif text-[3.4rem] leading-[0.95] tracking-[-0.01em] sm:text-[4.75rem]">
            {tone.word}
          </p>
        </div>

        <h2 className="mt-5 max-w-[32ch] text-[1.55rem] font-bold leading-[1.18] tracking-tight text-balance sm:text-[1.9rem]">
          {verdict.headline}
        </h2>

        <p className="mt-2 text-lg font-bold opacity-90">
          {confidenceSentence(verdict.confidence)}
        </p>

        <div className="mt-6">
          <ReadAloud
            text={speech}
            locale={locale}
            className="bg-white text-[#1f201d] hover:bg-white/85"
          />
        </div>
      </div>

      <div className="divide-y-4 divide-paper">
        {verdict.aiMedia && (
          <div className="p-5 sm:p-7">
            <VideoVerdict
              media={verdict.aiMedia}
              locale={locale}
              frameUrls={frameUrls}
            />
          </div>
        )}

        <section className="p-5 sm:p-7">
          <h3 className="text-xl font-bold tracking-tight">Why we think so</h3>
          <ul className="mt-4 space-y-3">
            {verdict.reasons.map((reason, index) => (
              <li key={index} className="flex gap-3 text-lg leading-relaxed">
                <EvidenceDot tone={verdict.level} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>

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

export function VideoVerdict({
  media,
  locale,
  frameUrls,
}: {
  media: NonNullable<Verdict["aiMedia"]>;
  locale: string;
  frameUrls?: string[];
}) {
  const tone = MEDIA_TONES[media.level];

  const frames = media.flaggedFrames.flatMap((frame) => {
    const src = frameUrls?.[frame.index];
    return src ? [{ ...frame, src }] : [];
  });

  const speech = `Was this video made by AI? ${toSpeech([
    tone.answer,
    ...media.signals,
  ])}`;

  return (
    <section>
      <h3 className="text-xl font-bold tracking-tight">
        Was this video made by AI?
      </h3>

      <div
        className={cn(
          "mt-3 flex items-center gap-3 rounded-[var(--radius-control)] px-4 py-3",
          tone.surface,
          tone.text,
        )}
      >
        <LevelIcon level={tone.level} size={24} />
        <span className="text-xl font-bold">{tone.answer}</span>
      </div>

      {media.signals.length > 0 && (
        <>
          <h4 className="mt-5 text-lg font-bold">Clues we saw</h4>
          <ul className="mt-2.5 space-y-2.5">
            {media.signals.map((signal, index) => (
              <li key={index} className="flex gap-3 text-lg leading-relaxed">
                <MagnifyingGlass
                  size={20}
                  weight="bold"
                  className="mt-1 shrink-0 text-ink-faint"
                  aria-hidden
                />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </>
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

      <div className="mt-5">
        <ReadAloud
          text={speech}
          locale={locale}
          label="Read the video result out loud"
        />
      </div>
    </section>
  );
}
