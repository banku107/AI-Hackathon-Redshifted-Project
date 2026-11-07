// Read-aloud using the browser's built-in speechSynthesis.
//
// No network, no API key, works offline. Voice availability differs by device,
// so we fall back to the closest matching language prefix rather than failing.

export interface SpeakOptions {
  locale: string;
  rate?: number;
}

// Only the browser needs to keep a handle on the active utterance; we track it
// so stopSpeaking() can null it out and avoid resuming a cancelled sentence.
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

function pickVoice(locale: string): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const exact = voices.find((v) => v.lang.replace("_", "-") === locale);
  if (exact) return exact;

  const prefix = locale.split("-")[0];
  const sameLanguage = voices.filter((v) =>
    v.lang.replace("_", "-").startsWith(prefix),
  );
  if (sameLanguage.length === 0) return null;

  // Prefer a local voice: faster and works with no connection.
  return sameLanguage.find((v) => v.localService) ?? sameLanguage[0];
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  // Dropping our reference is not enough on Safari: a collected utterance can
  // cut speech off mid-sentence, so detach handlers before cancelling.
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
  }
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

/**
 * Speaks `text`. Older voices load asynchronously, so if none are ready yet
 * this waits for the voiceschanged event once before giving up.
 */
export function speak(text: string, { locale, rate = 0.9 }: SpeakOptions): void {
  if (!speechSupported() || !text.trim()) return;

  stopSpeaking();

  const start = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(locale);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = locale;
    }
    // Slightly under normal speed: this audience benefits from the pause.
    utterance.rate = rate;
    utterance.pitch = 1;
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    let fired = false;
    const once = () => {
      if (fired) return;
      fired = true;
      window.speechSynthesis.removeEventListener("voiceschanged", once);
      start();
    };
    window.speechSynthesis.addEventListener("voiceschanged", once);
    // If the event never comes, still try with the default voice.
    window.setTimeout(once, 600);
  } else {
    start();
  }
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking;
}
