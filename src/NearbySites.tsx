import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DAY } from "../engine/index.mjs";
import { hoursAndMinutes, missionHours } from "../engine/comparison.mjs";
import { formatSiteScore } from "../engine/site-score.mjs";
import { compareNearby, nearbyPoints } from "../engine/nearby.mjs";
import { getMask, jsonFetch, packetFor, packetKey, useScout, type Packet, type Scenario, type Site, type Terrain } from "./store";

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
    let worker: Worker | undefined;
    const stop = (message: string) => {
      if (signal.aborted) return;
      setError(message);
      controller.abort();
      worker?.terminate();
    };
    const deadline = window.setTimeout(
      () => stop("The search reached its 25-second limit. Any results shown are from the points already checked. Try again to reuse any sky data that finished loading."),
      25000,
    );

    const evaluate = async () => {
      const state = useScout.getState();
      const cached = center.id && state.mastM === mast ? packetFor(state, center.id, time, duration) : undefined;
      const midnight = Math.floor(time / DAY) * DAY;
      const days = center.id && state.loading[packetKey(center.id, mast)]
        ? Math.max(33, Math.ceil(duration) + 2)
        : Math.ceil((time - midnight) / DAY + duration);
      const query = new URLSearchParams({
        lat: String(center.lat), lon: String(center.lon), mast: String(mast),
        start: new Date(midnight).toISOString(), days: String(days),
        terrainQuality: "preview",
      });
      if (center.id) query.set("siteId", center.id);
      const [packet, batch]: [Packet, { terrain: Terrain[] }] = await Promise.all([
        cached ?? jsonFetch("/api/ephemeris?" + query, { signal }),
        jsonFetch("/api/terrain/nearby-preview", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({ points: points.map(({ id, lat, lon }) => ({ id, lat, lon })) }),
        }),
      ]);
      if (signal.aborted) return;
      if (batch.terrain.length !== points.length) throw Error("Incomplete terrain preview");
      worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), { type: "module" });
      worker.onerror = () => stop("The calculation stopped. Start the search again.");
      worker.onmessage = ({ data }) => {
        if (signal.aborted) return;
        if (data.error) return stop("The calculation stopped. Start the search again.");
        if (data.done) {
          window.clearTimeout(deadline);
          worker?.terminate();
          return;
        }
        const index = data.index;
        if (data.nearby) {
          const row: RankedSite = { ...points[index], ...data.nearby, terrain: batch.terrain[index] };
          setRows(current => [...current, row].sort(compareNearby));
        } else {
          setFailed(count => count + 1);
        }
        setCompleted(count => count + 1);
      };
      worker.postMessage({
        kind: "nearby-preview", data: packet, start: time, duration, mast, minAntennaEl: antenna, profile,
        candidates: points.map((point, index) => ({
          point, elevationM: batch.terrain[index].elevationM, mask: getMask(batch.terrain[index], mast),
        })),
      });
    };
    void evaluate().catch(() => stop("Could not load the terrain preview or JPL sky data. Rank nearby sites again to retry."));
    return () => {
      window.clearTimeout(deadline);
      controller.abort();
      worker?.terminate();
    };
  }, [search, center]);
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
      <p className="data-note">Checks eight sampled points and up to two named sites. Uses your {mission.mast} m mast and {mission.antenna}° minimum antenna angle. The search uses a coarse LOLA horizon and shared JPL sky data. Estimated matches rank first, followed by site score.</p>
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
        {running ? " · Loading terrain previews and JPL sky data…" : ""}
      </p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      {search && !running && !error && !rows.length && <p>No points returned enough terrain and sky data to rank.</p>}
      {search && !running && rows.length > 0 && !visibleRows.length && <p>No checked sites matched all limits in the preview.</p>}
      {search && visibleRows.length > 0 && <>
        <p className="data-note">Choose Compare to calculate a site’s own sky positions and refine its terrain.</p>
        <p className="data-note">Results for {new Date(search.mission.time).toISOString().slice(0, 16).replace("T", " ")} UTC · {search.mission.duration} Earth days</p>
        <ol className="nearby-results">
          {visibleRows.map((row, index) => <li key={row.id || row.name}>
            <div><strong>{index + 1}. {row.name}</strong> · {row.distanceKm.toFixed(1)} km
              <p><strong>{formatSiteScore(row.score)} preliminary site score</strong></p>
              <p className="data-note">{hoursAndMinutes(missionHours(row.sunlight, search.mission.duration))} sunlight · {hoursAndMinutes(missionHours(row.contact, search.mission.duration))} Earth contact · {hoursAndMinutes(row.darkness)} longest darkness</p>
              {row.meetsLimits !== null && <small>{row.meetsLimits ? "Likely meets mission limits" : "Likely misses a mission limit"}</small>}
            </div>
            <button onClick={() => compare(row, search.mission)}>Compare</button>
          </li>)}
        </ol>
        <button onClick={() => showMap(visibleRows, search.mission)}>Show ranked pins</button>
      </>}
    </section>
  </div>;
}
