import { useEffect, useRef, type PointerEvent } from "react";

const WIDTH_KEY = "amaze-x-inspector-width";
const WIDTH_VAR = "--inspector-user-width";

export default function InspectorResizeEdge() {
  const edge = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= 244 && saved <= 640) {
      edge.current?.closest<HTMLElement>(".app")?.style.setProperty(WIDTH_VAR, saved + "px");
    }
  }, []);

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    const app = event.currentTarget.closest<HTMLElement>(".app");
    if (!app) return;
    delete app.dataset.resizingInspector;
    const width = Number.parseFloat(app.style.getPropertyValue(WIDTH_VAR));
    if (Number.isFinite(width)) localStorage.setItem(WIDTH_KEY, String(width));
  }

  return <div ref={edge} className="inspector-resize-edge" aria-hidden="true"
    onPointerDown={event => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      const app = event.currentTarget.closest<HTMLElement>(".app");
      const panel = app?.querySelector("#site-inspector");
      if (!app || !panel) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: panel.getBoundingClientRect().width };
      app.dataset.resizingInspector = "true";
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const maximum = Math.min(640, Math.floor(innerWidth * .56));
      const width = Math.max(244, Math.min(maximum, drag.current.width + drag.current.x - event.clientX));
      event.currentTarget.closest<HTMLElement>(".app")?.style.setProperty(WIDTH_VAR, Math.round(width) + "px");
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />;
}
