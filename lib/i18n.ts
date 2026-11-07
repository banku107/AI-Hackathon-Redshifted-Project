// Languages the reader can ask for. `locale` is what we hand to
// speechSynthesis so the voice matches the language of the answer.
//
// The codes are the contract's Language union. If Person 1 adds one, add it
// here too: TypeScript will not catch a missing entry on its own.

import type { Language } from "./contract";

export interface LanguageOption {
  code: Language;
  native: string;
  locale: string;
}

// Native names only. A reader looking for their own language scans for the
// shape of the words, not for the English name of it.
export const LANGUAGES: LanguageOption[] = [
  { code: "en", native: "English", locale: "en-US" },
  { code: "es", native: "Español", locale: "es-ES" },
  { code: "zh", native: "简体中文", locale: "zh-CN" },
  { code: "vi", native: "Tiếng Việt", locale: "vi-VN" },
  { code: "ko", native: "한국어", locale: "ko-KR" },
  { code: "tl", native: "Tagalog", locale: "fil-PH" },
  { code: "fr", native: "Français", locale: "fr-FR" },
  { code: "pt", native: "Português", locale: "pt-BR" },
  { code: "hi", native: "हिन्दी", locale: "hi-IN" },
  { code: "ar", native: "العربية", locale: "ar-SA" },
];

export function localeFor(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.locale ?? "en-US";
}
