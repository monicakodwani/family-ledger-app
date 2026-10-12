import { en, type MessageKey } from "./en";
import { hi } from "./hi";

export type Language = "en" | "hi";

const dictionaries: Record<Language, Partial<Record<MessageKey, string>>> = { en, hi };

let current: Language = "en";

export function setLanguage(lang: Language) {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/** Look up a message; falls back to English, then to the key itself. */
export function t(key: MessageKey): string {
  return dictionaries[current][key] ?? en[key] ?? key;
}

export type { MessageKey };
