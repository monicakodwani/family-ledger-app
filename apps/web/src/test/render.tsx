/**
 * Minimal render helper using this app's own react-dom (the monorepo root can
 * hoist a different React copy, which breaks @testing-library/react's CJS build).
 * Queries come from @testing-library/dom's `screen`.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

export function render(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  mounted.push({ root, container });
  return { container };
}

export function cleanup() {
  while (mounted.length) {
    const { root, container } = mounted.pop()!;
    act(() => root.unmount());
    container.remove();
  }
}
