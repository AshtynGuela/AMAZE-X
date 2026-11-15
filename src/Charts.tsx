import { useEffect, useMemo, useState } from "react";
import { flightEstimate } from "../engine/mission-history.mjs";
import { comparisonTakeaway, hoursAndMinutes, missionHours, timeAmount } from "../engine/comparison.mjs";
import { formatSiteScore, siteScore } from "../engine/site-score.mjs";
import {
  conditions,
  interpolate,
  HOUR,
  DAY,
  durationLabel,
} from "../engine/index.mjs";
import {
  useScout,
  packetKey,
  getMask,
  Scenario,
  Packet,
  packetFor,
  ensureData,
  type Site,
} from "./store";
export function useMetrics(scenario: Scenario | undefined) {
  const state = useScout(),
    terrain = scenario && state.terrains[scenario.siteId],
    epoch =
      scenario?.epoch === "live"
        ? Math.floor(state.time / HOUR) * HOUR
        : Date.parse(scenario?.epoch || ""),
    packet =
      scenario &&
      packetFor(state, scenario.siteId, epoch, scenario.durationDays);
  const job = useMemo(
    () =>
      scenario && packet && Number.isFinite(epoch)
        ? {
            id: scenario.id,
            data: packet,
            start: epoch,
            duration: scenario.durationDays,
            mask: getMask(terrain, state.mastM),
            minAntennaEl: state.minAntennaEl,
            profile: scenario.profile,
            arrayMode: scenario.arrayMode,
            arrayAzimuth: scenario.arrayAzimuth,
          }
        : null,
    [
      packet,
      terrain,
      epoch,
      scenario?.id,
      scenario?.durationDays,
      scenario?.profile,
      scenario?.arrayMode,
      scenario?.arrayAzimuth,
      state.mastM,
      state.minAntennaEl,
    ],
  );
  const [result, setResult] = useState<any>(null);
  useEffect(() => {
    if (!job) return;
    const worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => setResult({ job, data: e.data });
    worker.onerror = (e) =>
      setResult({
        job,
        data: { error: e.message || "Calculation could not start." },
      });
    worker.onmessageerror = () =>
      setResult({
        job,
        data: { error: "Calculation response could not be read." },
      });
    worker.postMessage(job);
    return () => worker.terminate();
  }, [job]);
  return result?.job === job ? result.data : null;
}
export function SkyStrip({
  packet,
  time,
  mask,
}: {
  packet: Packet;
  time: number;
  mask: number[] | null;
}) {
  const c = conditions(packet, time, mask);
  if (!c) return null;
  const trails = {
    sun: Array.from({ length: 49 }, (_, i) =>
      interpolate(packet.sun, time + (i * HOUR) / 2),
    ).filter(Boolean),
    earth: Array.from({ length: 49 }, (_, i) =>
      interpolate(packet.earth, time + (i * HOUR) / 2),
    ).filter(Boolean),
  };
  const elevations = [...trails.sun, ...trails.earth].map((p) => p.el),
    low = Math.min(
      -5,
      c.sun.el - 3,
      c.earth.el - 3,
      ...(mask || [0]),
      ...elevations,
    ),
    high = Math.max(
      10,
      c.sun.el + 5,
      c.earth.el + 5,
      ...(mask || [0]),
      ...elevations,
    ),
    y = (a: number) => 110 - ((a - low) / (high - low)) * 90,
    x = (a: number) => 20 + (a / 360) * 320;
  const points = (mask || new Array(720).fill(c.sun.horizon))
    .filter((_, i) => i % 4 === 0)
    .map((v, i) => `${x(i * 2)},${y(v)}`)
    .join(" ");
  return (
    <svg
      className="sky-strip"
      viewBox="0 0 360 138"
      role="img"
      aria-label={`Sun elevation ${c.sun.el.toFixed(2)} degrees; Earth elevation ${c.earth.el.toFixed(2)} degrees above the local horizontal. ${mask ? "Terrain horizon shown." : "Terrain not included."}`}
    >
      {[0, 90, 180, 270, 360].map((a, i) => (
        <g key={a}>
          <line x1={x(a)} x2={x(a)} y1="15" y2="112" stroke="#263740" />
          <text x={x(a)} y="132" textAnchor="middle">
            {["N", "E", "S", "W", "N"][i]}
          </text>
        </g>
      ))}
      <line
        x1="20"
        x2="340"
        y1={y(0)}
        y2={y(0)}
        stroke="#5a7079"
        strokeDasharray="3 4"
      />
      <polygon points={`20,113 ${points} 340,113`} fill="#293a40" />
      <polyline
        points={points}
        fill="none"
        stroke="#92a5a7"
        strokeWidth="1.3"
      />
      {(["sun", "earth"] as const).map((body) => (
        <path
          key={body}
          d={trails[body]
            .map(
              (p, i, a) =>
                `${i === 0 || Math.abs(p.az - a[i - 1].az) > 180 ? "M" : "L"}${x(p.az)} ${y(p.el)}`,
            )
            .join(" ")}
          fill="none"
          stroke={body === "sun" ? "#f3c77b" : "#7cb8df"}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity=".65"
        />
      ))}
      {(["sun", "earth"] as const).map((b) => (
        <g key={b}>
          <circle
            cx={x(c[b].az)}
            cy={y(c[b].el)}
            r={b === "sun" ? 5 : 4}
            fill={b === "sun" ? "#f3c77b" : "#7cb8df"}
          />
          <text
            x={Math.max(38, Math.min(322, x(c[b].az)))}
            y={Math.max(12, y(c[b].el) - 11)}
            textAnchor="middle"
            fill={b === "sun" ? "#f3c77b" : "#7cb8df"}
          >
            {b === "sun" ? "Sun" : "Earth"}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function TimelineLane({
  siteId,
  start,
  days = 1,
}: {
  siteId: string;
  start: number;
  days?: number;
}) {
  const state = useScout(),
    p = packetFor(state, siteId, start, days),
    mask = getMask(state.terrains[siteId], state.mastM);
  const cells = useMemo(
    () =>
      !p
        ? []
        : Array.from({ length: 144 }, (_, i) =>
            conditions(
              p,
              start + (days * DAY * (i + 0.5)) / 144,
              mask,
              state.minAntennaEl,
            ),
          ),
    [p, start, days, mask, state.minAntennaEl],
  );
  if (!p)
    return <p className="muted">Load this scenario to see its timeline.</p>;
  return (
    <div className="timeline-lanes">
      {(["sun", "earth"] as const).map((body) => (
        <div className="timeline-lane" key={body}>
          <span>{body === "sun" ? "Sun" : "Earth"}</span>
          <div
            className="timeline-track"
            aria-label={`${body} visibility over ${days} days`}
          >
            {cells.map((c, i) => (
              <button
                key={i}
                title={new Date(start + (days * DAY * i) / 144).toISOString()}
                aria-label={`Set time to ${new Date(start + (days * DAY * i) / 144).toISOString()}`}
                onClick={() =>
                  state.set({ time: start + (days * DAY * i) / 144 })
                }
                className={!c ? "no-data" : c[body].visible ? body : "down"}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="timeline-labels">
        <span>
          {new Date(start).toISOString().slice(5, 16).replace("T", " ")} UTC
        </span>
        <span>+{days * 24} h</span>
      </div>
    </div>
  );
}
export function ComparisonForm({ sites, planLanding }: { sites: Site[]; planLanding: () => void }) {
  const state = useScout();
  const baseline = state.scenarios[0];
  const [siteId, setSiteId] = useState(state.selected);
  const [date, setDate] = useState(() => new Date(
    baseline && baseline.epoch !== "live" ? Date.parse(baseline.epoch) : state.time,
  ).toISOString().slice(0, 16));
  const [days, setDays] = useState(String(baseline?.durationDays ?? 1));
  const [error, setError] = useState("");

  if (state.scenarios.length >= 4) return <p className="data-note">Remove a plan to add another.</p>;
  return <form className="comparison-form" id="comparison-form" onSubmit={event => {
    event.preventDefault();
    const start = Date.parse(date + "Z");
    const durationDays = Number(days);
    const site = sites.find(site => site.id === siteId);
    if (!site || !Number.isFinite(start) || start < Date.UTC(1969, 0, 1) ||
        !Number.isFinite(durationDays) || durationDays < 0.1 || durationDays > 90 ||
        start + durationDays * DAY >= Date.UTC(2041, 0, 1)) {
      setError("Choose a site and a stay of 0.1–90 Earth days that fits between 1969 and 2040.");
      return;
    }
    const current = useScout.getState();
    const id = ["A", "B", "C", "D"].find(id => !current.scenarios.some(plan => plan.id === id));
    if (!id) return;
    const epoch = new Date(start).toISOString();
    if (current.scenarios.some(plan => plan.siteId === siteId && plan.epoch === epoch && plan.durationDays === durationDays &&
        !plan.profile && !plan.flightProfile && (!plan.arrayMode || plan.arrayMode === "horizontal"))) {
      setError("That site, date and stay are already in the comparison. Change one to add another plan.");
      return;
    }
    setError("");
    current.set({ scenarios: [...current.scenarios, { id, siteId, epoch, durationDays }] });
    if (current.scenarios.length > 0) {
      const tray = event.currentTarget.closest(".compare-tray");
      requestAnimationFrame(() => {
        tray?.scrollTo({ top: 0 });
        tray?.querySelector("h2")?.focus({ preventScroll: true });
      });
    }
  }}>
    <h3>{state.scenarios.length ? "Add another plan" : "Choose a site and landing date"}</h3>
    <div className="comparison-fields">
      <label>Site<select id="comparison-site" required value={siteId} onChange={event => setSiteId(event.target.value)}>
        {!sites.some(site => site.id === siteId) && <option value="">Choose a site</option>}
        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select></label>
      <label>Landing date (UTC)<input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Stay (Earth days)<input required type="number" min="0.1" max="90" step="any" value={days} onChange={event => setDays(event.target.value)} /></label>
    </div>
    <div className="comparison-actions">
      <button className="primary" type="submit">Add to comparison</button>
      <button type="button" onClick={() => {
        if (sites.some(site => site.id === siteId)) state.select(siteId);
        planLanding();
      }}>Plan landing</button>
    </div>
    {error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}

export function ComparisonBoard({ scenarios, onInspect, onEvaluate }: {
  scenarios: Scenario[];
  onInspect?: () => void;
  onEvaluate?: (scenario: Scenario) => void;
}) {
  const a=useMetrics(scenarios[0]),b=useMetrics(scenarios[1]),c=useMetrics(scenarios[2]),d=useMetrics(scenarios[3]);
  const results=[a,b,c,d];
  const state = useScout();
  const rows = scenarios.map((scenario, index) => {
    const terrain = state.terrains[scenario.siteId];
    return {
      ...scenario,
      metrics: results[index]?.metrics,
      score: siteScore(results[index]?.metrics, scenario.durationDays),
      error: results[index]?.error || state.errors[packetKey(scenario.siteId, state.mastM)],
      name: [...state.sites, ...state.custom].find(site => site.id === scenario.siteId)?.name ?? scenario.siteId,
      quality: !terrain ? "Smooth horizon" : terrain.quality && terrain.quality !== "full" ? "Terrain preview" : "Detailed terrain",
    };
  });
  const provisional = rows.some(row => row.metrics && row.quality !== "Detailed terrain");
  const unavailable = rows.some(row => row.error);
  return <>
    <p className="comparison-takeaway" role="status">{unavailable
      ? "Some plan data could not load. Use Retry data on the affected plan."
      : <>{provisional && "Preliminary · "}{comparisonTakeaway(rows, true)}</>}</p>
    {rows.length > 2 && <p className="data-note comparison-scroll-hint">Scroll the table sideways to see every plan.</p>}
    <div className="comparison-matrix-scroll" role="region" aria-label="Plan results" tabIndex={rows.length > 2 ? 0 : undefined}>
      <table className="comparison-matrix">
        <thead><tr><th scope="col">Over the stay</th>{rows.map(row =>
          <th scope="col" key={row.id}><span>Plan {row.id}</span>{row.name}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Site score</th>{rows.map((row, index) =>
            <td key={row.id}>{row.score ? <>{onEvaluate ? <button className="comparison-score-button"
              type="button" aria-label={`Explain plan ${row.id} score of ${formatSiteScore(row.score.percent)}`}
              onClick={() => onEvaluate(scenarios[index])}>{formatSiteScore(row.score.percent)}</button>
              : formatSiteScore(row.score.percent)}
              {row.quality !== "Detailed terrain" && <small className="comparison-score-quality">Preliminary</small>}
            </> : "—"}</td>)}</tr>
          <tr><th scope="row">Sunlight</th>{rows.map(row =>
            <td key={row.id}>{row.metrics ? hoursAndMinutes(missionHours(row.metrics.sunlitPct, row.durationDays)) : row.error ? "Unavailable" : "Loading…"}</td>)}</tr>
          <tr><th scope="row">Earth contact</th>{rows.map(row =>
            <td key={row.id}>{row.metrics ? hoursAndMinutes(missionHours(row.metrics.earthDtePct, row.durationDays)) : "—"}</td>)}</tr>
          <tr><th scope="row">Longest darkness</th>{rows.map(row =>
            <td key={row.id}>{row.metrics ? hoursAndMinutes(row.metrics.longestDarkH) : "—"}</td>)}</tr>
          <tr><th scope="row">Landing (UTC)</th>{rows.map(row =>
            <td key={row.id}>{row.epoch === "live" ? "Follows clock" : <time dateTime={row.epoch}>{row.epoch.slice(0, 10)}<br />{row.epoch.slice(11, 16)}</time>}</td>)}</tr>
          <tr><th scope="row">Stay</th>{rows.map(row => <td key={row.id}>{row.durationDays} d</td>)}</tr>
          <tr><th scope="row">Horizon model</th>{rows.map(row =>
            <td key={row.id}>{row.metrics ? row.quality : "—"}</td>)}</tr>
        </tbody>
      </table>
    </div>
    <p className="comparison-explainer">Earth contact applies your {state.minAntennaEl}° minimum antenna angle.</p>
    <div className="compare-grid">{scenarios.map((scenario,index)=><ScenarioColumn key={scenario.id} scenario={scenario} analysis={results[index]} onInspect={onInspect}/>)}</div>
  </>;
}
export function ScenarioColumn({ scenario, analysis, onInspect }: { scenario: Scenario; analysis?: any; onInspect?: () => void }) {
  const flight = scenario.epoch !== "live" && scenario.flightProfile
    ? flightEstimate(Date.parse(scenario.epoch), scenario.flightProfile)
    : null;
  const state = useScout(),
    site = [...state.sites, ...state.custom].find(
      (s) => s.id === scenario.siteId,
    ),
    calculated = useMetrics(analysis===undefined?scenario:undefined),
    result = analysis===undefined?calculated:analysis,
    m = result?.metrics,
    terrain = state.terrains[scenario.siteId],
    detailed = !!terrain && (!terrain.quality || terrain.quality === "full"),
    packet = m && packetFor(state, scenario.siteId, m.start, scenario.durationDays),
    startConditions = packet && conditions(packet, m.start, getMask(terrain, state.mastM), state.minAntennaEl),
    error =
      result?.error || state.errors[packetKey(scenario.siteId, state.mastM)];
  return (
    <section className="compare-column">
      <div className="compare-heading">
        <span className="scenario-id">{scenario.id}</span>
        <button
          className="scenario-select"
          title="Inspect this scenario"
          onClick={() => {
            state.select(scenario.siteId);
            state.set({
              activeScenarioId: scenario.id,
              ...(scenario.epoch !== "live"
                ? { time: Date.parse(scenario.epoch) }
                : {}),
            });
            onInspect?.();
          }}
        >
          <strong>{site?.name}</strong>
          <small>
            {scenario.epoch === "live"
              ? "Live · follows clock"
              : new Date(scenario.epoch)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ") + " UTC"}
          </small>
        </button>
        <button
          className="icon-button"
          aria-label={"Remove scenario " + scenario.id}
          onClick={() =>
            state.set({
              scenarios: state.scenarios.filter((s) => s.id !== scenario.id),
            })
          }
        >
          ×
        </button>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() =>
              site &&
              ensureData(
                site,
                scenario.epoch === "live"
                  ? state.time
                  : Date.parse(scenario.epoch),
                scenario.durationDays,
                true,
              )
            }
          >
            Retry data
          </button>
        </p>
      )}
      <details className="comparison-plan-details">
      <summary>Plan {scenario.id} details</summary>
      <dl className="comparison-values">
        <dt>Mission duration</dt>
        <dd>{scenario.durationDays} {scenario.durationDays===1?"day":"days"}</dd>
        {flight && <>
          <dt>Estimated flight</dt>
          <dd>{durationLabel(flight.flightHours * HOUR)}</dd>
          <dt>Estimated departure</dt>
          <dd>{flight.departureUtc.slice(0, 16).replace("T", " ")} UTC</dd>
        </>}
        <dt>Sunlight during stay</dt>
        <dd>{m ? `${timeAmount(missionHours(m.sunlitPct,scenario.durationDays))} (${m.sunlitPct.toFixed(1)}%)` : "Loading…"}</dd>
        <dt>Earth above terrain</dt>
        <dd>{m ? `${timeAmount(missionHours(m.earthVisiblePct,scenario.durationDays))} (${m.earthVisiblePct.toFixed(1)}%)` : "—"}</dd>
        <dt>Usable Earth contact</dt>
        <dd>{m ? `${timeAmount(missionHours(m.earthDtePct,scenario.durationDays))} (${m.earthDtePct.toFixed(1)}%)` : "—"}</dd>
        <dt>Longest darkness</dt>
        <dd>{m ? m.longestDarkH.toFixed(1) + " h" : "—"}</dd>
        <dt>Sun elevation at landing</dt>
        <dd>{startConditions ? startConditions.sun.el.toFixed(2) + "°" : "—"}</dd>
        {m && (["sun", "earth"] as const).map(body => {
          const event = m.events?.find((event: { body: string; kind: string }) => event.body === body && event.kind === "set");
          return <div className="comparison-event" key={body}>
            <dt>{body === "sun" ? "Sunset" : "Earthset"} after landing</dt>
            <dd>{event ? durationLabel(event.time - m.start) : "None in loaded dates"}</dd>
          </div>;
        })}
        <dt>Earth-shadow exposure · Sun above terrain</dt>
        <dd>{m ? m.eclipseHours.toFixed(2) + " h" : "—"}</dd>
        <dt>Relative solar power · {scenario.arrayMode || "horizontal"}</dt>
        <dd>{m ? m.meanPowerIndex.toFixed(3) : "—"}</dd>
      </dl>
      {m && (
        <TimelineLane
          siteId={scenario.siteId}
          start={m.start}
          days={scenario.durationDays}
        />
      )}
      <p className="data-note">
        {state.terrains[scenario.siteId]
          ? state.terrains[scenario.siteId].quality && state.terrains[scenario.siteId].quality !== "full" ? "Terrain preview" : "Detailed terrain"
          : "Smooth horizon"}{" "}
        · {m ? "10-minute steps" : "Loading sky positions"}
      </p>
      {!detailed && !!m && !!scenario.profile && <p className="data-note">Detailed terrain is needed to check mission limits.</p>}
      {detailed && result?.rules?.length > 0 && (
        <ul className="rules">
          {result.rules.map((r) => (
            <li key={r.id} className={r.passed ? "pass" : "fail"}>
              {r.passed ? "Pass" : "Fail"} · {r.label}
            </li>
          ))}
        </ul>
      )}
      </details>
    </section>
  );
}
export function EventList({ events, time }: { events: any[]; time: number }) {
  const next = events?.filter((e) => e.time > time) || [];
  return (
    <div className="event-list">
      {(["sun", "earth"] as const).map((body) => {
        const event = next.find((e) => e.body === body);
        return (
          <button
            key={body}
            title="Jump to the next rise or set above the terrain"
            onClick={() =>
              event && useScout.getState().set({ time: event.time })
            }
            disabled={!event}
          >
            <span>
              {body === "sun" ? "Sun" : "Earth"}
              {event ? (event.kind === "rise" ? "rise" : "set") : ""}
            </span>
            <strong>
              {event
                ? "in " + durationLabel(event.time - time)
                : "No crossing in loaded window"}
            </strong>
            {event && (
              <small>
                {new Date(event.time)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}{" "}
                UTC
              </small>
            )}
          </button>
        );
      })}
    </div>
  );
}
