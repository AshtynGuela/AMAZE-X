import { useEffect, useRef, useState } from "react";
import { APP_NAME, APP_EXPANSION } from "../engine/app-actions.mjs";
import "./welcome.css";

type Props = { ready: boolean; begin: () => void; enter: () => void; skip: () => void; prepare: () => Promise<unknown> };

export default function Welcome({ ready, begin, enter, skip, prepare }: Props) {
  const panel = useRef<HTMLElement>(null);
  const callbacks = useRef({ begin, enter, prepare });
  callbacks.current = { begin, enter, prepare };
  const started = useRef(false);
  const [entering, setEntering] = useState(false);
  const [fading, setFading] = useState(false);
  const [reducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  function startEntry() {
    if (started.current) return;
    started.current = true;
    callbacks.current.begin();
    setEntering(true);
  }

  useEffect(() => {
    if (!entering) return;
    if (ready || reducedMotion) {
      setFading(true);
      return;
    }
    // A slow or unavailable 3D renderer must not trap users on the welcome page.
    const timeout = window.setTimeout(() => setFading(true), 3500);
    return () => window.clearTimeout(timeout);
  }, [entering, ready, reducedMotion]);

  useEffect(() => {
    if (!fading) return;
    const timeout = window.setTimeout(() => callbacks.current.enter(), reducedMotion ? 0 : 520);
    return () => window.clearTimeout(timeout);
  }, [fading, reducedMotion]);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    let touchY: number | null = null;
    const warm = () => { void callbacks.current.prepare().catch(() => {}); };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (event.deltaY >= 0 && !started.current) return;
      event.preventDefault();
      startEntry();
    };
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      warm();
    };
    const touchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
      if (!started.current && (!atBottom || touchY - y < 18)) return;
      event.preventDefault();
      startEntry();
    };
    const touchEnd = () => { touchY = null; };
    node.addEventListener("pointermove", warm, { passive: true, once: true });
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", touchEnd);
    return () => {
      node.removeEventListener("pointermove", warm);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
    };
  }, []);
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
    className="mission-welcome mission-welcome--ambient" data-scene-ready={ready} data-fading={fading || undefined}
    onTransitionEnd={event => {
      if (fading && event.target === event.currentTarget && event.propertyName === "opacity") enter();
    }}
    onClick={event => {
      if ((event.target as Element).closest("a,button,input,select,textarea")) return;
      startEntry();
    }}
    onKeyDown={event => {
      if (["ArrowUp", "PageUp"].includes(event.key) ||
          (event.target === event.currentTarget && ["Enter", " "].includes(event.key))) {
        event.preventDefault();
        event.stopPropagation();
        startEntry();
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        skip();
      }
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href]")];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
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
      <span className="sr-only" id="welcome-scroll-hint">Scroll up, swipe up, click, or press Enter to enter the Solar System. Escape skips it.</span>
      </div>
    </div>
    <footer className="mission-welcome__credits" aria-label="Credits">
      <div className="mission-welcome__sources">
        <p><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">NASA/JPL Horizons</a><span aria-hidden="true"> · </span><a href="https://science.nasa.gov/mission/lro/" target="_blank" rel="noreferrer">LOLA &amp; LROC</a><span aria-hidden="true"> · </span><a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">QuickMap</a></p>
        <a className="mission-welcome__challenge" href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noreferrer">For the NASA Space Apps Challenge</a>
      </div>
    </footer>
  </section>;
}
