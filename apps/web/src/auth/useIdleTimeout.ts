import { useEffect, useRef } from "react";

const EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * Calls onIdle after `seconds` without any interaction. The server enforces
 * its own idle limit too; this just makes the phone forget sooner.
 */
export function useIdleTimeout(seconds: number | undefined, onIdle: () => void) {
  const callback = useRef(onIdle);
  callback.current = onIdle;

  useEffect(() => {
    if (!seconds || seconds <= 0) return;
    let last = Date.now();
    let timer = 0;
    const check = () => {
      if (Date.now() - last >= seconds * 1000) callback.current();
      else timer = window.setTimeout(check, Math.min(seconds * 1000, 30_000));
    };
    const bump = () => {
      last = Date.now();
    };
    // A phone may sleep with the app open: re-check as soon as it comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        check();
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    timer = window.setTimeout(check, Math.min(seconds * 1000, 30_000));
    return () => {
      window.clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);
}
