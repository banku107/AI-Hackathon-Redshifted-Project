"use client";

import { useEffect, useState } from "react";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { isSpeaking, speak, speechSupported, stopSpeaking } from "@/lib/speech";

/**
 * Reads a block of text out loud in the reader's own language.
 * Hidden entirely when the browser has no speech engine (some desktop Linux).
 */
export function ReadAloud({
  text,
  locale,
  label = "Read this out loud",
  className,
}: {
  text: string;
  locale: string;
  label?: string;
  className?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // Reading browser capability once after mount keeps server and client
    // markup identical on the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(speechSupported());
    return () => stopSpeaking();
  }, []);

  // speechSynthesis has no reliable "ended" event across browsers when the
  // utterance is cancelled, so poll while speaking.
  useEffect(() => {
    if (!speaking) return;
    const id = window.setInterval(() => {
      if (!isSpeaking()) setSpeaking(false);
    }, 400);
    return () => window.clearInterval(id);
  }, [speaking]);

  if (!supported) return null;

  return (
    <>
      <Button
        variant="secondary"
        className={className}
        onClick={() => {
          if (speaking) {
            stopSpeaking();
            setSpeaking(false);
          } else {
            speak(text, { locale });
            setSpeaking(true);
          }
        }}
        aria-pressed={speaking}
      >
        {speaking ? (
          <SpeakerSlash size={22} weight="bold" aria-hidden />
        ) : (
          <SpeakerHigh size={22} weight="bold" aria-hidden />
        )}
        {speaking ? "Stop reading" : label}
      </Button>
      {/* The button's own label changes, but a screen reader does not announce
          that on its own. This live region does, in one short phrase. */}
      <span role="status" aria-live="polite" className="sr-only">
        {speaking ? "Reading aloud" : ""}
      </span>
    </>
  );
}
