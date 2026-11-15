import { useEffect, useRef } from "react";
import { APP_NAME, APP_EXPANSION } from "../engine/app-actions.mjs";
import "./welcome.css";

type Props = { ready: boolean; begin: () => void; enter: () => void; skip: () => void; prepare: () => void };

export default function Welcome({ ready, begin, enter, skip, prepare }: Props) {
  const panel = useRef<HTMLElement>(null);
  const latest = useRef({ ready, begin, enter, prepare });
  latest.current = { ready, begin, enter, prepare };
  const drive = useRef<(delta: number, finish?: boolean) => void>(() => {});
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const root = node.parentElement!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0, displayed = 0, frame = 0, before = 0;
    let started = false, completed = false, prepared = false, touchY: number | null = null;
    const warm = () => {
      if (prepared) return;
      prepared = true;
      latest.current.prepare();
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = before ? Math.min(48, now - before) : 16;
      before = now;
      // Keep the outgoing page in place until the actual map has a frame ready.
      const destination = latest.current.ready ? target : Math.min(target, .06);
      displayed = reduced ? destination : displayed + (destination - displayed) * (1 - Math.exp(-dt / 55));
      if (Math.abs(destination - displayed) < .0005) displayed = destination;
      root.style.setProperty("--welcome-progress", String(displayed));
      if (displayed >= .999 && latest.current.ready && !completed) {
        completed = true;
        latest.current.enter();
        return;
      }
      if (Math.abs(destination - displayed) > .0001) frame = requestAnimationFrame(tick);
    };
    const animate = () => {
      if (!frame && !completed) { before = 0; frame = requestAnimationFrame(tick); }
    };
    wake.current = animate;
    drive.current = (delta, finish = false) => {
      if (completed) return;
      warm();
      if (!started && (delta > 0 || finish)) {
        started = true;
        node.dataset.scrollStarted = "true";
        latest.current.begin();
      }
      if (!started) return;
      const distance = Math.max(360, Math.min(720, node.clientHeight * .75));
      target = finish ? 1 : Math.max(0, Math.min(1, target + delta / distance));
      if (target >= .88) target = 1;
      animate();
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (event.deltaY >= 0 && target === 0) return;
      event.preventDefault();
      const pixels = -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      drive.current(pixels);
    };
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      warm();
    };
    const touchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY, delta = touchY - y;
      touchY = y;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
      if (target === 0 && (!atBottom || delta <= 0)) return;
      event.preventDefault();
      drive.current(delta);
    };
    const touchEnd = () => { touchY = null; };
    node.addEventListener("pointermove", warm, { passive: true });
    // Keep the gesture attached to the viewport as the outgoing panel moves
    // away from the pointer; the map stays inert until the reveal completes.
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", touchEnd);
    return () => {
      cancelAnimationFrame(frame);
      root.style.removeProperty("--welcome-progress");
      drive.current = () => {};
      wake.current = () => {};
      node.removeEventListener("pointermove", warm);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
    };
  }, []);
  useEffect(() => { wake.current(); }, [ready]);
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    // The welcome screen covers the application. Keep its hidden controls out
    // of keyboard navigation until the introduction has finished.
    const parent = node.parentElement!;
    const previous = new Map<HTMLElement, boolean>();
    const isolate = () => {
      for (const child of [...parent.children] as HTMLElement[]) {
        if (child === node) continue;
        if (!previous.has(child)) previous.set(child, child.inert);
        child.inert = true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(parent, { childList: true });
    node.focus({ preventScroll: true });
    return () => { observer.disconnect(); previous.forEach((inert, child) => { child.inert = inert; }); };
  }, []);
  return <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-scroll-hint"
    className="mission-welcome mission-welcome--ambient"
    onClick={event => {
      // Credits remain normal links; the rest of the page uses the same reveal
      // as scrolling, including waiting for the map's first rendered frame.
      if ((event.target as Element).closest("a,button,input,select,textarea")) return;
      drive.current(0, true);
    }}
    onKeyDown={event => {
      if (["ArrowUp", "PageUp"].includes(event.key) ||
          (event.target === event.currentTarget && ["Enter", " "].includes(event.key))) {
        event.preventDefault(); event.stopPropagation(); drive.current(0, true); return;
      }
      if (event.key === "Escape") { event.stopPropagation(); skip(); }
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]")];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <div className="mission-welcome__space" aria-hidden="true">
      <div className="mission-welcome__composition">
        <div className="mission-welcome__stars">
          {[0, 1, 2].map(strip => <div className="mission-welcome__star-strip" key={strip}><img src="/assets/welcome/astronaut.webp" alt="" width="1440" height="1024" fetchPriority={strip === 0 ? "high" : "auto"} decoding="async" /></div>)}
        </div>
        <div className="mission-welcome__stars mission-welcome__stars--near">
          {[0, 1, 2].map(strip => <div className="mission-welcome__star-strip" key={strip}><img src="/assets/welcome/astronaut.webp" alt="" width="1440" height="1024" decoding="async" /></div>)}
        </div>
        <div className="mission-welcome__glow" />
        <img className="mission-welcome__light" src="/assets/welcome/astronaut.webp" alt="" width="1440" height="1024" decoding="async" />
        <img className="mission-welcome__astronaut" src="/assets/welcome/astronaut.webp" alt="" width="1440" height="1024" decoding="async" />
      </div>
    </div>
    <div className="mission-welcome__content">
      <div className="mission-welcome__float">
      <h1 id="welcome-title" aria-label={APP_NAME}><span className="mission-welcome__wordmark">AMAZE</span><span data-node-id="23:120" className="mission-welcome__x" aria-hidden="true"><img src="/assets/welcome/x-glass.svg" alt="" width="49" height="53" /></span></h1>
      <p className="mission-welcome__expansion">{APP_EXPANSION}</p>
      <p className="mission-welcome__tagline">Navigate the moon, reactively, accurately.</p>
      <p className="mission-welcome__description">An interactive lunar navigation app to help you discover and evaluate potential lunar landing sites using Horizons.</p>
      <span className="sr-only" id="welcome-scroll-hint">Press Enter or Space to explore the Solar System. Scroll up, swipe up, Up Arrow and Page Up also work.</span>
      </div>
    </div>
    <footer className="mission-welcome__credits" aria-label="Credits">
      <a className="mission-welcome__nasa" href="https://www.nasa.gov/" target="_blank" rel="noreferrer"><img src="/assets/welcome/nasa-insignia.png" width="121" height="102" alt="NASA" /></a>
      <div className="mission-welcome__sources">
        <p><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">NASA/JPL Horizons</a><span aria-hidden="true"> · </span><a href="https://science.nasa.gov/mission/lro/" target="_blank" rel="noreferrer">LOLA &amp; LROC</a><span aria-hidden="true"> · </span><a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">QuickMap</a></p>
        <a className="mission-welcome__challenge" href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noreferrer">For the NASA Space Apps Challenge</a>
      </div>
    </footer>
  </section>;
}
