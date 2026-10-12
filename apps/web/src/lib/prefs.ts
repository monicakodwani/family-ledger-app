/**
 * UI preferences — the ONLY things this app writes to localStorage.
 * Family financial data is never stored on the device.
 */
export type TextSize = "normal" | "large" | "xlarge";

export const PREF_KEYS = {
  textSize: "fl.pref.textSize",
  language: "fl.pref.language",
  passkeyOfferDismissed: "fl.pref.passkeyOfferDismissed",
} as const;

export const ALLOWED_STORAGE_KEYS: readonly string[] = Object.values(PREF_KEYS);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: preferences just won't be remembered.
  }
}

export function getTextSize(): TextSize {
  const v = read(PREF_KEYS.textSize);
  return v === "large" || v === "xlarge" ? v : "normal";
}

export function setTextSize(size: TextSize) {
  write(PREF_KEYS.textSize, size);
  applyTextSize(size);
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
}

export function getPasskeyOfferDismissed(): boolean {
  return read(PREF_KEYS.passkeyOfferDismissed) === "1";
}

export function setPasskeyOfferDismissed() {
  write(PREF_KEYS.passkeyOfferDismissed, "1");
}

export function getLanguagePref(): "en" | "hi" {
  return read(PREF_KEYS.language) === "hi" ? "hi" : "en";
}

export function setLanguagePref(lang: "en" | "hi") {
  write(PREF_KEYS.language, lang);
}
