import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DAY } from "../engine/index.mjs";
import { hoursAndMinutes, missionHours } from "../engine/comparison.mjs";
import { formatSiteScore } from "../engine/site-score.mjs";
import { compareNearby, nearbyPoints } from "../engine/nearby.mjs";
import { jsonFetch, type Scenario, type Site, type Terrain } from "./store";

export type NearbyPoint = {
  id?: string; name: string; lat: number; lon: number; distanceKm: number;
};
export type RankedSite = NearbyPoint & {
  sunlight: number; contact: number; darkness: number; meetsLimits: boolean | null; score: number;
  terrain: Terrain;
};
export type NearbyMission = {
  time: number; duration: number; mast: number; antenna: number; profile?: Scenario["profile"];
};
type Search = { points: NearbyPoint[]; mission: NearbyMission; matchingOnly: boolean };
type Evaluation = Pick<RankedSite, "sunlight" | "contact" | "darkness" | "meetsLimits" | "score">;

export default function NearbySites({ center, sites, mission, close, showMap, compare, initial }: {
  center: NearbyPoint; sites: Site[]; mission: NearbyMission; close: () => void;
  showMap: (rows: RankedSite[], mission: NearbyMission) => void;
  compare: (site: RankedSite, mission: NearbyMission) => void;
  initial?: {radiusKm:number;autoRun:boolean};
}) {
  const [radius, setRadius] = useState(String(initial?.radiusKm??20));
  const [duration, setDuration] = useState(String(mission.duration));
  const [startUtc, setStartUtc] = useState(() => new Date(mission.time).toISOString().slice(0, 16));
  const [filters, setFilters] = useState(() => ({
    minSunlitPct: String(mission.profile?.minSunlitPct ?? ""),
    minEarthDtePct: String(mission.profile?.minEarthDtePct ?? ""),
    maxDarknessHours: String(mission.profile?.maxDarknessHours ?? ""),
  }));
  const [matchingOnly, setMatchingOnly] = useState(false);
  const [search, setSearch] = useState<Search | null>(null);
  const [rows, setRows] = useState<RankedSite[]>([]);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const rankButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!search) return;
    const { time, duration, mast, antenna, profile } = search.mission;
    const { points } = search;
    const controller = new AbortController(), { signal } = controller;
    const worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), { type: "module" });
    const results = new Map<number, (result: Evaluation | null) => void>();
    worker.onmessage = ({ data }) => {
      results.get(data.id)?.(data.nearby ?? null);
      results.delete(data.id);
    };
    worker.onerror = () => {
      for (const complete of results.values()) complete(null);
      results.clear();
      controller.abort();
      setError("The calculation stopped. Start the search again.");
    };
    let next = 0;
    const checkPoint = async () => {
      while (next < points.length && !signal.aborted) {
        const id = next++, point = points[id];
        const coords = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
        try {
          const terrainUrl = point.id && !point.id.startsWith("custom-")
            ? "/api/terrain/" + encodeURIComponent(point.id) : "/api/terrain?" + coords + "&quality=full";
          let terrain;
          const deadline = Date.now() + 660000;
          do {
            terrain = await jsonFetch(terrainUrl, { signal });
            if (!terrain.pending) break;
            await new Promise(resolve => setTimeout(resolve, 1800));
          } while (!signal.aborted && Date.now() < deadline);
          if (signal.aborted) return;
          const mask = terrain.masks?.[String(mast)];
          if (!mask || (terrain.quality && terrain.quality !== "full")) throw Error("Detailed terrain unavailable");
          const start = Math.floor(time / DAY) * DAY;
          const query = new URLSearchParams(coords);
          query.set("mast", String(mast));
          query.set("start", new Date(start).toISOString());
          query.set("days", String(Math.ceil((time + duration * DAY - start) / DAY)));
          query.set("siteId", point.id || "custom-0");
          const data = await jsonFetch("/api/ephemeris?" + query, { signal });
          if (!data.observer.terrainApplied || data.observer.elevationM !== terrain.elevationM)
            throw Error("Observer height unavailable");
          const result = await new Promise<Evaluation | null>(resolve => {
            results.set(id, resolve);
            worker.postMessage({ id, kind: "nearby", data, start: time, duration, mask, minAntennaEl: antenna, profile });
          });
          if (!result) throw Error("Mission coverage unavailable");
          if (!signal.aborted) setRows(current => [...current, { ...point, ...result, terrain }].sort(compareNearby));
        } catch {
          if (!signal.aborted) setFailed(count => count + 1);
        } finally {
          if (!signal.aborted) setCompleted(count => count + 1);
        }
      }
    };
    void Promise.all([checkPoint(), checkPoint()]);
    return () => {
      controller.abort();
      worker.terminate();
      for (const complete of results.values()) complete(null);
    };
  }, [search]);
  const running = !!search && total > completed && !error;
  useEffect(() => {
    if (running) cancelButton.current?.focus({ preventScroll: true });
    else if (search && document.activeElement === document.body) rankButton.current?.focus({ preventScroll: true });
  }, [running, search]);
  const hasFilters = Object.values(filters).some(value => value !== "");
  const visibleRows = search?.matchingOnly ? rows.filter(row => row.meetsLimits) : rows;
  const run = () => {
    const days = Number(duration), km = Number(radius);
    const time = Date.parse(startUtc + "Z");
    if (!Number.isFinite(days) || days < .1 || days > 90 || !Number.isFinite(km) || km < 1 || km > 100 ||
        !Number.isFinite(time) || time < Date.UTC(1969, 0, 1) || time + days * DAY >= Date.UTC(2041, 0, 1)) {
      setError("Choose a radius of 1–100 km and a stay of 0.1–90 Earth days that fits between 1969 and 2040.");
      return;
    }
    const profile = hasFilters ? {
      minSunlitPct: Number(filters.minSunlitPct),
      minEarthDtePct: Number(filters.minEarthDtePct),
      maxDarknessHours: filters.maxDarknessHours === "" ? 2160 : Number(filters.maxDarknessHours),
    } : undefined;
    if (profile && (!Object.values(profile).every(Number.isFinite) ||
        profile.minSunlitPct < 0 || profile.minSunlitPct > 100 ||
        profile.minEarthDtePct < 0 || profile.minEarthDtePct > 100 ||
        profile.maxDarknessHours < 0 || profile.maxDarknessHours > 2160)) {
      setError("Use 0–100% for sunlight and contact, and 0–2160 hours for darkness.");
      return;
    }
    const points: NearbyPoint[] = nearbyPoints(center, km, sites);
    setRows([]); setCompleted(0); setFailed(0); setTotal(points.length); setError("");
    setSearch({ points, matchingOnly: !!profile && matchingOnly, mission: { ...mission, time, duration: days, profile } });
  };
  const autoStarted=useRef(false);
  useEffect(()=>{if(initial?.autoRun&&!autoStarted.current){autoStarted.current=true;run();}},[initial]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="scenario-dialog landing-planner" role="dialog" aria-modal="true" aria-label="Nearby sites"
      onKeyDown={e => {
        if (e.key === "Escape") close();
        if (e.key !== "Tab") return;
        const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary")]
          .filter(element => element.getClientRects().length);
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        if ((e.shiftKey && at === 0) || (!e.shiftKey && at === buttons.length - 1)) {
          e.preventDefault();
          (e.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
        }
      }}>
      <header><h2>Find better spots nearby</h2><button aria-label="Close nearby sites" className="icon-button" onClick={close}><X size={20} /></button></header>
      <p>Search around {center.name}</p>
      <form className="nearby-form" onSubmit={event => { event.preventDefault(); run(); }}>
      <fieldset disabled={!!running}>
      <label className="nearby-date">Landing date (UTC)<input autoFocus required type="datetime-local" value={startUtc} onChange={e => setStartUtc(e.target.value)} /></label>
      <div className="planner-range">
        <label>Search radius (km)<input required type="number" min="1" max="100" step="any" value={radius} onChange={e => setRadius(e.target.value)} /></label>
        <label>Surface stay (Earth days)<input required type="number" min=".1" max="90" step="any" value={duration} onChange={e => setDuration(e.target.value)} /></label>
      </div>
      <fieldset className="nearby-limits">
        <legend>Mission limits (optional)</legend>
        <div className="nearby-limit-fields">
          <label>Minimum sunlight (%)<input type="number" min="0" max="100" step="any" value={filters.minSunlitPct} onChange={e => setFilters({ ...filters, minSunlitPct: e.target.value })} /></label>
          <label>Minimum Earth contact (%)<input type="number" min="0" max="100" step="any" value={filters.minEarthDtePct} onChange={e => setFilters({ ...filters, minEarthDtePct: e.target.value })} /></label>
          <label>Maximum continuous darkness (h)<input type="number" min="0" max="2160" step="any" value={filters.maxDarknessHours} onChange={e => setFilters({ ...filters, maxDarknessHours: e.target.value })} /></label>
        </div>
        <label className="nearby-filter"><input type="checkbox" checked={matchingOnly && hasFilters} disabled={!hasFilters} onChange={e => setMatchingOnly(e.target.checked)} /> Only show sites that meet the limits</label>
      </fieldset>
      </fieldset>
      <p className="data-note">Checks eight sampled points and up to two named sites. Uses your {mission.mast} m mast and {mission.antenna}° minimum antenna angle. Sites that meet all limits rank first, followed by site score.</p>
      <div className="comparison-actions">
        <button className="primary" ref={rankButton} type="submit" disabled={running}>Rank nearby sites</button>
        {running && <button type="button" ref={cancelButton} onClick={() => {
          setSearch(null);
          setRows([]);
          requestAnimationFrame(() => rankButton.current?.focus({ preventScroll: true }));
        }}>Cancel search</button>}
      </div>
      </form>
      {search && <p role="status" className="data-note">
        Checked {completed} of {total}{failed > 0 ? ` · ${failed} without complete data` : ""}
        {running ? " · Each new point can take a few minutes. Results appear as they finish." : ""}
      </p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      {search && !running && !error && !rows.length && <p>No sites returned complete terrain and sky data.</p>}
      {search && !running && rows.length > 0 && !visibleRows.length && <p>No checked sites meet all your limits.</p>}
      {search && visibleRows.length > 0 && <>
        <p className="data-note">Results for {new Date(search.mission.time).toISOString().slice(0, 16).replace("T", " ")} UTC · {search.mission.duration} Earth days</p>
        <ol className="nearby-results">
          {visibleRows.map((row, index) => <li key={row.id || row.name}>
            <div><strong>{index + 1}. {row.name}</strong> · {row.distanceKm.toFixed(1)} km
              <p><strong>{formatSiteScore(row.score)} site score</strong></p>
              <p className="data-note">{hoursAndMinutes(missionHours(row.sunlight, search.mission.duration))} sunlight · {hoursAndMinutes(missionHours(row.contact, search.mission.duration))} Earth contact · {hoursAndMinutes(row.darkness)} longest darkness</p>
              {row.meetsLimits !== null && <small>{row.meetsLimits ? "Meets mission limits" : "Misses one or more limits"}</small>}
            </div>
            <button onClick={() => compare(row, search.mission)}>Compare</button>
          </li>)}
        </ol>
        <button onClick={() => showMap(visibleRows, search.mission)}>Show ranked pins</button>
      </>}
    </section>
  </div>;
}
