import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Retain the last open panel during its short exit. Exiting controls are inert
// immediately, and reopening cancels removal rather than delaying interaction.
export default function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [retained, setRetained] = useState(show);
  const content = useRef(children);
  useLayoutEffect(() => {
    if (show) content.current = children;
  }, [show, children]);
  useEffect(() => {
    if (show) { setRetained(true); return; }
    const timer = window.setTimeout(() => setRetained(false), 140);
    return () => window.clearTimeout(timer);
  }, [show]);
  if (!show && !retained) return null;
  return <div className="ui-presence" data-motion={show ? "open" : "closed"}
    inert={!show} aria-hidden={show ? undefined : true}>
    {show ? children : content.current}
  </div>;
}
