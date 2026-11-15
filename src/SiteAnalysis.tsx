import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DAY } from "../engine/index.mjs";
import { hoursAndMinutes, missionHours } from "../engine/comparison.mjs";
import { formatSiteScore, siteScore } from "../engine/site-score.mjs";
import { useMetrics } from "./Charts";
import { ensureData, getMask, packetKey, useScout, type Scenario, type Site } from "./store";
import "./site-analysis.css";

const factorLabels = { sunlight: "Sunlight", contact: "Direct Earth contact", darkness: "Continuous darkness" };
const pointValue = (value: number) => value.toFixed(1);

export default function SiteAnalysis({ site, initial, close }: {
  site: Site;
  initial: Scenario;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState(initial);
  const [date, setDate] = useState(initial.epoch.slice(0, 16));
  const [days, setDays] = useState(String(initial.durationDays));
  const [formError, setFormError] = useState("");
  const state = useScout();
  const terrain = state.terrains[site.id];
  const key = packetKey(site.id, state.mastM);
  const loading = state.loading[key];
  const result = useMetrics(plan);
  const metrics = result?.metrics;
  const error = result?.error || state.errors[key];
  const score = siteScore(metrics, plan.durationDays);
  const hasMask = !!getMask(terrain, state.mastM);
  const detailed = hasMask && (!terrain?.quality || terrain.quality === "full");
  const start = Date.parse(plan.epoch);

  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  useEffect(() => {
    void ensureData(site, start, plan.durationDays);
  }, [site, start, plan.durationDays, state.mastM, terrain?.elevationM, loading]);

  const observations = metrics && score ? {
    sunlight: `${hoursAndMinutes(missionHours(metrics.sunlitPct, plan.durationDays))} in sunlight (${formatSiteScore(metrics.sunlitPct)} of the stay)`,
    contact: `${hoursAndMinutes(missionHours(metrics.earthDtePct, plan.durationDays))} with direct Earth contact (${formatSiteScore(metrics.earthDtePct)} of the stay)`,
    darkness: `${hoursAndMinutes(metrics.longestDarkH)} in the longest dark stretch (${formatSiteScore(score.darknessShare)} of the stay)`,
  } : null;
  const limits = metrics && plan.profile ? [
    { name: "Sunlight", value: formatSiteScore(metrics.sunlitPct), target: `at least ${plan.profile.minSunlitPct}%`, rule: "sunlight" },
    { name: "Direct Earth contact", value: formatSiteScore(metrics.earthDtePct), target: `at least ${plan.profile.minEarthDtePct}%`, rule: "dte" },
    { name: "Longest darkness", value: hoursAndMinutes(metrics.longestDarkH), target: `at most ${plan.profile.maxDarknessHours} h`, rule: "darkness" },
  ] : [];

  return <dialog ref={dialog} className="scenario-dialog site-analysis-dialog" aria-labelledby="site-analysis-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header>
      <div><h2 id="site-analysis-title">Landing site analysis</h2><p>{site.name}</p></div>
      <button type="button" className="icon-button" aria-label="Close landing site analysis" onClick={close}><X size={20} /></button>
    </header>
    <form className="site-analysis-form" onSubmit={event => {
      event.preventDefault();
      const epoch = Date.parse(date + "Z");
      const durationDays = Number(days);
      if (!Number.isFinite(epoch) || epoch < Date.UTC(1969, 0, 1) ||
          !Number.isFinite(durationDays) || durationDays < 0.1 || durationDays > 90 ||
          epoch + durationDays * DAY >= Date.UTC(2041, 0, 1)) {
        setFormError("Choose a stay of 0.1–90 Earth days that fits between 1969 and 2040.");
        return;
      }
      setFormError("");
      setPlan({ ...plan, epoch: new Date(epoch).toISOString(), durationDays });
    }}>
      <label>Landing date (UTC)<input type="datetime-local" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Stay (Earth days)<input type="number" min="0.1" max="90" step="any" required value={days} onChange={event => setDays(event.target.value)} /></label>
      <button type="submit">Evaluate</button>
    </form>
    {formError && <p role="alert" className="error-text">{formError}</p>}
    <p className="data-note site-analysis-settings">Observer height {state.mastM} m · Minimum antenna elevation {state.minAntennaEl}°</p>
    {error && !score ? <div role="alert" className="error-text">
      <p>{error}</p>
      <button type="button" onClick={() => void ensureData(site, start, plan.durationDays, true)}>Retry data</button>
    </div> : !score || !observations ? <p role="status">Calculating sunlight and Earth contact for this stay…</p> : <>
      <div className="site-analysis-score" role="status">
        <div><span>Landing site score</span><strong>{formatSiteScore(score.percent)}</strong></div>
        <div>
          <strong>{detailed ? "Detailed terrain" : hasMask ? "Preliminary · terrain preview" : "Preliminary · smooth horizon"}</strong>
          {hasMask && terrain && <span>{terrain.resolutionM.toLocaleString(undefined, { maximumFractionDigits: 0 })} m LOLA elevation grid</span>}
        </div>
      </div>
      <p className="data-note">
        {new Date(start).toISOString().slice(0, 16).replace("T", " ")} UTC · {plan.durationDays} Earth {plan.durationDays === 1 ? "day" : "days"}
      </p>
      <h3>How the score was calculated</h3>
      <ul className="site-score-factors">
        {score.factors.map(({ id, weight, points }) => <li key={id}>
          <div className="site-score-factor-heading">
            <strong>{factorLabels[id]}</strong>
            <span>{pointValue(points)} / {weight} points</span>
          </div>
          <progress aria-label={`${factorLabels[id]} points`} value={points} max={weight} />
          <p>{observations[id]}</p>
          <p className="data-note">{id === "darkness"
            ? `${weight} × (100% − ${formatSiteScore(score.darknessShare)})`
            : `${weight} × ${formatSiteScore(id === "sunlight" ? metrics.sunlitPct : metrics.earthDtePct)}`}
            {" = "}{pointValue(points)} points</p>
        </li>)}
      </ul>
      <p className="data-note">The score adds the three point totals before rounding. Compare stays of the same length when choosing between sites.</p>
      <h3>Mission requirements</h3>
      {limits.length ? <ul className="site-analysis-limits">
        {limits.map(limit => {
          const rule = result.rules?.find((rule: { id: string; passed: boolean }) => rule.id === limit.rule);
          return <li key={limit.rule}>
            <strong>{limit.name}</strong>
            <span>{limit.value} · Required {limit.target}</span>
            <span>{!detailed || !rule ? "Awaiting detailed terrain" : rule.passed ? "Met" : "Missed"}</span>
          </li>;
        })}
      </ul> : <p className="data-note">Set mission limits in Plan landing to check specific requirements. The percentage summarizes conditions for the selected stay.</p>}
    </>}
  </dialog>;
}
