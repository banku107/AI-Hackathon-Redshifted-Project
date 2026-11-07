import { WarningOctagon } from "@phosphor-icons/react";
import { EvidenceDot } from "@/components/evidence-dot";

/**
 * The home screen's one moment: a real answer, so people see what they will
 * get before they paste anything. The words are from the recorded check of
 * the jail text (mock/demo-recording.json, "jail"), not written for show.
 */
const EXAMPLE = {
  message:
    "Grandma it's me, I'm in jail, please send $2,000 in gift cards, don't tell mom",
  headline: "This is a scam. Please do not buy any gift cards.",
  reasons: [
    "It asks for $2,000 in gift cards. Real jails and courts never take gift cards.",
    "It says \"don't tell mom.\" Scammers want secrecy so no one can warn you.",
  ],
};

export function VerdictPreview() {
  return (
    <section aria-labelledby="example-heading">
      <h2 id="example-heading" className="text-xl font-bold">
        What an answer looks like
      </h2>
      <p className="mt-1.5 text-base leading-snug text-ink-soft">
        A real check of a text someone got
      </p>

      <figure className="mt-4 overflow-hidden rounded-[var(--radius-card)] bg-surface">
        {/* The message, as it arrived */}
        <blockquote className="px-5 pb-4 pt-5">
          <p className="max-w-[34ch] rounded-[16px] rounded-bl-[4px] bg-surface-sunk px-4 py-3 text-lg leading-snug text-ink">
            {EXAMPLE.message}
          </p>
        </blockquote>

        {/* The answer, in the same field the real result uses */}
        <div className="bg-scam px-5 pb-5 pt-4 text-white">
          <div className="flex items-center gap-3">
            <WarningOctagon size={36} weight="fill" aria-hidden />
            <p className="font-serif text-[2.6rem] leading-none">Scam</p>
          </div>
          <p className="mt-3 max-w-[30ch] text-lg font-bold leading-snug">{EXAMPLE.headline}</p>
        </div>

        <figcaption className="sr-only">Example result for the message above</figcaption>
        <ul className="space-y-2.5 px-5 py-5">
          {EXAMPLE.reasons.map((reason) => (
            <li key={reason} className="flex gap-3 text-lg leading-relaxed">
              <EvidenceDot tone="scam" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
