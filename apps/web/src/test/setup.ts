import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "./render";

afterEach(() => {
  cleanup();
});

// jsdom lacks these browser APIs used by the app.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
window.scrollTo = (() => undefined) as typeof window.scrollTo;
