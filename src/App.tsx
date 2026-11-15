import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Orbit,
  MapPin,
  Clock3,
  Layers,
  Columns2,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Globe2,
  Compass,
  LocateFixed,
  Sun,
  Radio,
  ArrowUpRight,
  Plus,
  X,
  ExternalLink,
  Info,
  RotateCcw,
  Download,
  Keyboard,
  PanelRightClose,
  PanelRightOpen,
  Check,
  Flag,
  Focus,
} from "lucide-react";
import {
  useScout,
  selectedScenario,
  allSites,
  ensureData,
  ensureTerrain,
  getMask,
  jsonFetch,
  packetKey,
  packetFor,
  Site,
  Scenario,
} from "./store";
import { conditions, HOUR, DAY, durationLabel } from "../engine/index.mjs";
import {
  SkyStrip,
  TimelineLane,
  ScenarioColumn,
  EventList,
  useMetrics,
  ComparisonBoard,
  ComparisonForm,
} from "./Charts";
import { APP_NAME } from "../engine/app-actions.mjs";
import { formatSiteScore, siteScore } from "../engine/site-score.mjs";
import Welcome from "./Welcome";
import { SiteAsset, SiteBackdrop, SiteWordmark } from "./SiteChrome";
import "./site-ui.css";
import "./motion.css";
import Presence from "./Presence";
import { FEATURE_EVENT, type ActionResult } from "./app-actions";
import { encodeSession, decodeSession } from "./share.mjs";
import type { NearbyMission, NearbyPoint, RankedSite } from "./NearbySites";
import {
  createAnalysisReport,
  missionEpoch,
  reportCsv,
} from "../engine/report.mjs";
const prepareWorld = () => import("./World");
const World = lazy(prepareWorld);
const Rocky = lazy(() => import("./Rocky"));
const DateSlip = lazy(() => import("./DateSlip"));
const loadScenarioDialog = () => import("./LandingPlanner");
const ScenarioDialog = lazy(loadScenarioDialog);
const NearbySites = lazy(() => import("./NearbySites"));
const SiteAnalysis = lazy(() => import("./SiteAnalysis"));
const orbitViews = [
  ["earth_moon_orbit", "Earth–Moon orbit"],
  ["solar_orbit", "Sun–Earth orbit"],
  ["earth", "Earth"],
  ["sun", "Sun"],
] as const;
class SceneBoundary extends Component<any, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="webgl-error">
        <h2>The 3D view could not start</h2>
        <p>{this.state.error}</p>
        <p>
          The site list and numerical analysis remain available. Use a
          WebGL2-capable browser.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
const deg = (v: number | undefined) =>
  v === undefined ? "—" : v.toFixed(2) + "°";
const utc = (t: number) =>
  new Date(t).toISOString().slice(0, 19).replace("T", " ");
const bearing = (az: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((az % 360 + 360) % 360) / 45) % 8];
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: any;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={"icon-button" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function App() {
  const [phoneLayout,setPhoneLayout]=useState(()=>matchMedia("(max-width:760px), (max-width:960px) and (max-height:500px)").matches);
  useEffect(()=>{
    const media=matchMedia("(max-width:760px), (max-width:960px) and (max-height:500px)");
    const update=()=>setPhoneLayout(media.matches);media.addEventListener("change",update);
    return ()=>media.removeEventListener("change",update);
  },[]);
  const state = useScout(),
    [siteFilter, setSiteFilter] = useState(""),
    [inspector, setInspector] = useState(true),
    [phoneDetails, setPhoneDetails] = useState(false),
    [menu, setMenu] = useState<any>(null),
    [customDialog, setCustomDialog] = useState<any>(null),
    [customName, setCustomName] = useState(""),
    [customLat, setCustomLat] = useState(""),
    [customLon, setCustomLon] = useState(""),
    [slip, setSlip] = useState(false),
    [health, setHealth] = useState<any>(null),
    [initError, setInitError] = useState(""),
    [dateDraft, setDateDraft] = useState(""),
    [clockEditing, setClockEditing] = useState(false),
    [intro, setIntro] = useState(false),
    [entryReady, setEntryReady] = useState(false),
    [rockyStarted, setRockyStarted] = useState(false),
    [help, setHelp] = useState(false),
    [sources, setSources] = useState(false),
    [nearby, setNearby] = useState<{ center: NearbyPoint; mission: NearbyMission; initial?: {radiusKm:number;autoRun:boolean} } | null>(null),
    [plannerInitial, setPlannerInitial] = useState<any>(null),
    [ranked, setRanked] = useState<{ center: NearbyPoint; rows: RankedSite[]; mission: NearbyMission } | null>(null),
    snapshot = useRef<() => string>(() => ""),
    menuRef = useRef<HTMLDivElement>(null);
  const markEntryReady = useCallback(() => setEntryReady(true), []);
  const comparisonTrigger = useRef<HTMLElement | null>(null);
  const nearbyTrigger = useRef<HTMLElement | null>(null);
  const analysisTrigger = useRef<HTMLElement | null>(null);
  const [siteEvaluation, setSiteEvaluation] = useState<{ site: Site; plan: Scenario } | null>(null);
  useEffect(()=>{
    if(phoneDetails){
      const panel=document.getElementById("site-inspector");
      if(panel){panel.scrollTop=0;panel.focus({preventScroll:true});}
    }
  },[phoneDetails,state.selected]);
  const updateSnapshot = useCallback((fn: () => string) => { snapshot.current = fn; }, []);
  const sites = useMemo(() => [...state.sites, ...state.custom], [state.sites, state.custom]);
  const nativeFeature = useRef<(action:any)=>Promise<ActionResult>>(null);
  const
    site = sites.find((s) => s.id === state.selected),
    key = packetKey(state.selected, state.mastM),
    packet = packetFor(state, state.selected),
    terrain = state.terrains[state.selected],
    mask = getMask(terrain, state.mastM);
  const current = useMemo(() => packet
    ? conditions(packet, state.time, mask, state.minAntennaEl)
    : null, [packet, state.time, mask, state.minAntennaEl]);
  const solar = state.view === "solar_system";
  useEffect(() => {
    const current = useScout.getState();
    if (current.compare && current.rail) current.set({ rail: null });
    else if (!solar && !phoneLayout && !current.compare && !current.rail) current.set({ rail: "sites" });
  }, [solar, phoneLayout]);
  useEffect(() => {
    if (state.compare && useScout.getState().rail) useScout.getState().set({ rail: null });
  }, [state.compare]);
  const activeScenario = selectedScenario(state),
    probe = useMemo(
      () => ({
        id: "probe",
        siteId: state.selected,
        epoch: new Date(Math.floor(state.time / DAY) * DAY).toISOString(),
        durationDays: 1,
      }),
      [state.selected, Math.floor(state.time / DAY)],
    ),
    analysis = useMetrics(solar && !packet ? undefined : activeScenario || probe),
    probeAnalysis = useMetrics((!solar || !!packet) && activeScenario && (inspector || state.rail === "clock") ? probe : undefined),
    eventAnalysis = activeScenario ? probeAnalysis : analysis,
    m = analysis?.metrics;
  const missionScore = activeScenario && siteScore(m, activeScenario.durationDays);
  function openSiteAnalysis(target: Site, scenario?: Scenario) {
    analysisTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const time = scenario?.epoch === "live" ? Math.floor(state.time / HOUR) * HOUR : state.time;
    setSiteEvaluation({
      site: target,
      plan: {
        ...(scenario ?? { id: "evaluation", siteId: target.id, durationDays: 1 }),
        epoch: scenario && scenario.epoch !== "live" ? scenario.epoch : new Date(time).toISOString(),
      },
    });
  }
  function closeSiteAnalysis() {
    setSiteEvaluation(null);
    requestAnimationFrame(() => analysisTrigger.current?.focus({ preventScroll: true }));
  }
  const filteredSites = sites.filter((s) =>
    (s.name + " " + s.region).toLowerCase().includes(siteFilter.toLowerCase()),
  );
  useEffect(() => {
    if (state.welcome) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setRockyStarted(true), { timeout: 800 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(() => setRockyStarted(true), 250);
    return () => clearTimeout(timer);
  }, [state.welcome]);
  useEffect(() => {
    jsonFetch("/layers/manifest.json")
      .then((l) =>
        state.set({ layerManifest: { ...state.layerManifest, ...l } }),
      )
      .catch(() => {});
    jsonFetch("/api/sites")
      .then((sites) => {
        state.set({ sites });
        const value = new URLSearchParams(location.search).get("session");
        if (value)
          try {
            const shared = decodeSession(value, sites);
            state.set({ ...shared, scenarios: shared.scenarios as Scenario[] });
          } catch {
            state.message(
              "This shared session is invalid or includes an unknown site.",
            );
          }
      })
      .catch((e) => setInitError(e.message));
    jsonFetch("/api/health")
      .then((h) => {
        setHealth(h);
        state.set({
          layerManifest: {
            ...useScout.getState().layerManifest,
            heightReady: h.heightReady,
          },
        });
      })
      .catch(() => {});
    const poll = setInterval(() => {
      if (document.hidden) return;
      const latest = useScout.getState();
      if (latest.welcome) return;
      if (latest.sites.length && latest.sites.every(site => site.terrainReady) &&
          latest.layerManifest.heightReady && latest.rail !== "settings") return;
      jsonFetch("/api/sites")
        .then((sites) => {
          const current = useScout.getState().sites;
          if (JSON.stringify(current) !== JSON.stringify(sites)) state.set({ sites });
        })
        .catch(() => {});
      jsonFetch("/api/health")
        .then((h) => {
          setHealth(previous => JSON.stringify(previous) === JSON.stringify(h) ? previous : h);
          const manifest = useScout.getState().layerManifest;
          if (manifest.heightReady !== h.heightReady)
            state.set({ layerManifest: { ...manifest, heightReady: h.heightReady } });
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(poll);
  }, []);
  useEffect(() => {
    if (!site || solar || state.travel || state.welcome) return;
    const timer = setTimeout(
      () => ensureData(site, state.time, activeScenario?.durationDays || 1),
      250,
    );
    return () => clearTimeout(timer);
  }, [
    site?.id,
    site?.terrainReady,
    state.mastM,
    Math.floor(state.time / DAY),
    activeScenario?.durationDays,
    state.epochVersion,
    terrain?.elevationM,
    !!state.travel,
    state.welcome,
    solar,
  ]);
  useEffect(() => {
    if (solar || state.travel || state.welcome) return;
    state.scenarios.forEach((s) => {
      const loc = sites.find((site) => site.id === s.siteId);
      if (loc)
        ensureData(
          loc,
          s.epoch === "live" ? state.time : Date.parse(s.epoch),
          s.durationDays,
        );
    });
  }, [
    state.scenarios,
    state.sites,
    state.mastM,
    Math.floor(state.time / DAY),
    state.packets,
    state.loading,
    !!state.travel,
    state.welcome,
    solar,
  ]);
  useEffect(() => {
    let previous = performance.now();
    const timer = setInterval(() => {
      const s = useScout.getState(),
        now = performance.now(),
        dt = Math.min(1, (now - previous) / 1000);
      previous = now;
      if (s.travel) {
        const u = Math.min(1, (now - s.travel.started) / 5500),
          ease = u * u * (3 - 2 * u);
        s.set({ time: s.travel.from + (s.travel.to - s.travel.from) * ease });
        if (u >= 1) s.set({ travel: null, view: "surface", landed: true });
      } else if (s.playing) {
        const next = s.time + dt * s.speed * 1000;
        if (next < Date.parse("2041-01-01")) s.set({ time: next });
        else s.set({ playing: false });
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest("input,textarea,select,button,a,.rocky-overlay,[role=dialog]")
      )
        return;
      const s = useScout.getState();
      if (e.key === "Escape") {
        setMenu(null);
        setHelp(false);
        setSources(false);
        s.set({ rail: null });
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        s.set({ playing: !s.playing });
      }
      if (e.key === ",") s.set({ time: s.time - HOUR });
      if (e.key === ".") s.set({ time: s.time + HOUR });
      if (["1", "2", "3", "4"].includes(e.key))
        s.set({ speed: [1, 60, 3600, 86400][+e.key - 1] });
      if (e.key.toLowerCase() === "c") s.set({ compare: !s.compare });
      if (e.key.toLowerCase() === "l")
        s.set({ rail: s.rail === "layers" ? null : "layers" });
      if (e.key.toLowerCase() === "t") s.set({ timeline: !s.timeline });
      if (e.key === "F10" && e.shiftKey) {
        e.preventDefault();
        setMenu({ x: innerWidth / 2, y: innerHeight / 2, siteId: s.selected });
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (menu)
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  const rail = (id: string) =>
    state.set({
      rail: state.rail === id ? null : id,
      ...(id !== 'compare' ? {compare:false} : {}),
      ...(solar && id !== "clock" ? { view: "globe" as const } : {}),
    });
  const openComparison = () => {
    comparisonTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.set({ compare: true, rail: null, timeline: false, ...(solar ? { view: "globe" as const } : {}) });
  };
  const closeComparison = () => {
    state.set({ compare: false });
    requestAnimationFrame(() => {
      const target = comparisonTrigger.current;
      if (target && target.getClientRects().length) target.focus();
      else document.querySelector<HTMLButtonElement>('.instrument-rail [aria-label="Compare"]')?.focus();
    });
  };
  useEffect(() => {
    if (state.compare && !solar && !state.welcome) document.getElementById("comparison-heading")?.focus({ preventScroll: true });
  }, [state.compare, solar, state.welcome]);
  const share = async ():Promise<ActionResult> => {
    try {
      const value=encodeSession(useScout.getState());
      await navigator.clipboard.writeText(location.origin + "/?session=" + encodeURIComponent(value));
      const message="Share link copied, including saved plans, sites and settings.";
      state.message(message); return {ok:true,message};
    } catch {
      const message="The link could not be copied. Check browser clipboard access and your saved plan dates.";
      state.message(message); return {ok:false,message};
    }
  };
  const download = (format: "json" | "csv") => {
    let payload;
    try {
      payload = createAnalysisReport({
        site,
        time: state.time,
        mastM: state.mastM,
        minAntennaEl: state.minAntennaEl,
        current,
        packet,
        scenario: activeScenario,
        metrics: m,
        scenarioPacket:
          activeScenario &&
          packetFor(
            state,
            state.selected,
            missionEpoch(activeScenario, state.time),
            activeScenario.durationDays,
          ),
        terrain,
      });
    } catch (e) {
      state.message(e.message);
      return {ok:false,message:e.message};
    }
    const url = URL.createObjectURL(
        new Blob(
          [
            format === "csv"
              ? reportCsv(payload)
              : JSON.stringify(payload, null, 2),
          ],
          {
            type:
              format === "csv" ? "text/csv;charset=utf-8" : "application/json",
          },
        ),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "amaze-x-analysis-" + site.id + "." + format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {ok:true,message:"Your " + format.toUpperCase() + " download has started."};
  };
  const saveCustom = () => {
    const lat = +customLat,
      lon = +customLon;
    if (
      !customName.trim() ||
      customName.length > 64 ||
      !customLat ||
      !customLon ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      state.message(
        "Enter a name and valid latitude (−90 to 90) and longitude (−180 to 180).",
      );
      return;
    }
    const s: Site = {
      id: "custom-" + crypto.randomUUID(),
      name: customName.trim(),
      lat,
      lon,
      region: "Custom coordinates",
      family: "custom",
      source: "User-selected coordinates",
      description: "A lunar site at your selected coordinates.",
    };
    state.set({
      custom: [...state.custom, s],
      selected: s.id,
      view: "globe",
      rail: null,
      focusVersion: state.focusVersion + 1,
    });
    setCustomDialog(null);
  };
  const openCustom = (point: any) => {
    setCustomName("");
    setCustomLat(point?.lat?.toFixed(5) || "");
    setCustomLon(point?.lon?.toFixed(5) || "");
    setCustomDialog(point || {});
    setMenu(null);
  };
  const openNearby = (point: Pick<NearbyPoint, "id" | "name" | "lat" | "lon">) => {
    nearbyTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scenario = state.scenarios.find(s => s.id === state.activeScenarioId && s.siteId === point.id)
      ?? state.scenarios.find(s => s.siteId === point.id);
    setNearby({
      center: { ...point, distanceKm: 0 },
      mission: { time: scenario && scenario.epoch !== "live" ? Date.parse(scenario.epoch) : state.time,
        duration: scenario?.durationDays ?? 1, mast: state.mastM,
        antenna: state.minAntennaEl, profile: scenario?.profile },
    });
  };
  const compareNearbySite = (point: RankedSite, mission: NearbyMission) => {
    const current = useScout.getState();
    const epoch = new Date(mission.time).toISOString();
    const custom = [...current.custom];
    const scenarios = [...current.scenarios];
    const center = nearby?.center ?? ranked?.center;
    const asSite = (location: NearbyPoint, name: string) => {
      const existing = [...current.sites, ...custom].find(site => site.id === location.id ||
        (site.lat === location.lat && site.lon === location.lon));
      if (existing) return existing;
      const site: Site = {
        id: "custom-" + crypto.randomUUID(), name, region: "Nearby site search",
        lat: location.lat, lon: location.lon, family: "custom", source: "", description: "Sampled lunar coordinates.",
      };
      custom.push(site);
      return site;
    };
    const add = (siteId: string) => {
      const existing = scenarios.find(plan => plan.siteId === siteId && plan.epoch === epoch &&
        plan.durationDays === mission.duration && plan.profile?.minSunlitPct === mission.profile?.minSunlitPct &&
        plan.profile?.minEarthDtePct === mission.profile?.minEarthDtePct &&
        plan.profile?.maxDarknessHours === mission.profile?.maxDarknessHours);
      if (existing) return existing.id;
      const id = ["A", "B", "C", "D"].find(id => !scenarios.some(plan => plan.id === id));
      if (id) scenarios.push({ id, siteId, epoch, durationDays: mission.duration, profile: mission.profile });
      return id;
    };
    const candidate = asSite(point, `Nearby · ${point.name}`);
    const id = add(candidate.id);
    if (!id) { current.message("Four plans are open. Remove one to compare this site."); return; }
    if (center && scenarios.length < 4) add(asSite(center, center.name).id);
    current.set({
      custom, scenarios, activeScenarioId: id, compare: true, rail: null, timeline: false,
      terrains: { ...current.terrains, [candidate.id]: { ...point.terrain, siteId: candidate.id } },
    });
    current.fly(candidate.id);
    setRanked(null);
    setNearby(null);
  };
  nativeFeature.current = async (action) => {
    const current=useScout.getState();
    const chosen=sites.find(row=>row.id===(action.siteId??current.selected));
    const selectedPlan=current.scenarios.find(row=>row.id===current.activeScenarioId&&row.siteId===chosen?.id)??current.scenarios.find(row=>row.siteId===chosen?.id);
    const needsSite=["fly_to","open_inspector","add_to_compare","plan_landing","rank_nearby","export_report"].includes(action.type);
    if(needsSite&&!chosen)return {ok:false,message:"Choose a lunar site first. The site list may still be loading."};
    if(action.siteId){current.select(action.siteId);setInspector(true);}
    if(action.type==="fly_to"||action.type==="open_inspector") {current.fly(action.siteId);setInspector(true);setPhoneDetails(true);}
    else if(action.type==="open_panel") {
      if(["landing","nearby","date_slip"].includes(action.panel)&&!chosen)return {ok:false,message:"Choose a lunar site first."};
      if(["sites","time","layers","settings"].includes(action.panel))current.set({rail:action.panel==="time"?"clock":action.panel,...(current.view==="solar_system"&&action.panel!=="time"?{view:"globe"}: {})});
      else if(action.panel==="comparison")current.set({view:current.view==="solar_system"?"globe":current.view,compare:true});
      else if(action.panel==="timeline")current.set({view:current.view==="solar_system"?"globe":current.view,timeline:true});
      else if(action.panel==="landing"){setPlannerInitial(null);current.set({scenarioDialog:true,view:current.view==="solar_system"?"globe":current.view});}
      else if(action.panel==="nearby")openNearby(chosen!);
      else if(action.panel==="help")setHelp(true);
      else if(action.panel==="sources")setSources(true);
      else if(action.panel==="date_slip"){
        if(!selectedPlan)return {ok:false,message:"Save a plan with a surface duration before comparing date changes."};
        setSlip(true);
      }
    } else if(action.type==="plan_landing"||action.type==="add_to_compare") {
      current.set({view:current.view==="solar_system"?"globe":current.view,scenarioDialog:true});
      setPlannerInitial({...action,requestId:performance.now()});
    } else if(action.type==="rank_nearby") {
      const duration=action.durationDays??selectedPlan?.durationDays;
      if(action.autoRun&&!duration)return {ok:false,message:"Choose a surface-stay duration before starting the nearby search."};
      setNearby({center:{...chosen!,distanceKm:0},mission:{time:current.time,duration:duration??1,mast:current.mastM,antenna:current.minAntennaEl,profile:selectedPlan?.profile},initial:{radiusKm:action.radiusKm,autoRun:action.autoRun}});
    } else if(action.type==="export_report")return download(action.format);
    else if(action.type==="share_session")return await share();
    return {ok:true,message:"Opened the requested app feature."};
  };
  useEffect(() => {
    const listener=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      detail.accept();
      Promise.resolve(nativeFeature.current!(detail.action)).then(detail.resolve).catch(error=>detail.resolve({ok:false,message:error.message}));
    };
    window.addEventListener(FEATURE_EVENT,listener);
    return()=>window.removeEventListener(FEATURE_EVENT,listener);
  }, []);
  const menuItems = menu?.siteId
    ? [
        [
          "Open inspector",
          () => {
            state.select(menu.siteId);
            setInspector(true);
          },
        ],
        [
          "Plan / add to comparison",
          () => {
            state.select(menu.siteId);
            state.set({ scenarioDialog: true });
          },
        ],
        ["Fly to site", () => state.fly(menu.siteId)],
        ["Find better spots nearby", () => {
          const center = sites.find(s => s.id === menu.siteId);
          if (center) openNearby(center);
        }],
        [
          "Show horizon",
          () => {
            state.select(menu.siteId);
            state.set({ view: "horizon", rail: null });
          },
        ],
        [
          "Ask Rocky",
          () => {
            state.select(menu.siteId);
            window.dispatchEvent(new Event("ask-rocky"));
          },
        ],
        ...(state.custom.some((s) => s.id === menu.siteId)
          ? [
              [
                "Delete custom site",
                () =>
                  state.set({
                    custom: state.custom.filter((s) => s.id !== menu.siteId),
                    scenarios: state.scenarios.filter(
                      (s) => s.siteId !== menu.siteId,
                    ),
                    selected: "im1",
                  }),
              ],
            ]
          : []),
      ]
    : menu
      ? [
          ["Create site here", () => openCustom(menu)],
          ["Find better spots nearby", () => openNearby({ name: "Map point", lat: menu.lat, lon: menu.lon })],
          [
            "Copy coordinates",
            () =>
              navigator.clipboard.writeText(
                `${menu.lat.toFixed(5)}, ${menu.lon.toFixed(5)}`,
              ),
          ],
          [
            "Reset camera",
            () =>
              state.set({
                view: "overview",
                focusVersion: state.focusVersion + 1,
              }),
          ],
        ]
      : [];
  return (
    <main
      data-mode={state.mode}
      data-phone-details={phoneDetails && inspector ? "open" : "closed"}
      className={
        "app" +
        (inspector ? " has-inspector" : "") +
        " lunar-ui" + (solar ? " solar-mode" : "") +
        (intro ? " app--entering" : "")
      }
      onPointerDown={() => menu && setMenu(null)}
    >
      <SiteBackdrop />
      <a className="skip-link" href="#site-inspector">
        Skip to site analysis
      </a>
      {(!state.welcome || intro) && <SceneBoundary>
        <Suspense
          fallback={
            <div className="scene-loading">Preparing space navigation…</div>
          }
        >
          <World
            onReady={markEntryReady}
            inspectorOpen={inspector}
            onHorizonExpand={() => { if (innerWidth <= 1000) setInspector(false); }}
            nearbyPins={ranked?.rows}
            nearbyCenter={ranked?.center}
            onNearbyPin={row => { if (ranked) compareNearbySite(row, ranked.mission); }}
            onContext={(point) => {
              if (useScout.getState().pickingSite) {
                setCustomLat(point.lat.toFixed(5));
                setCustomLon(point.lon.toFixed(5));
                setCustomDialog(point);
                state.set({ pickingSite: false });
              } else setMenu(point);
            }}
            onSnapshot={updateSnapshot}
          />
        </Suspense>
      </SceneBoundary>}
      <header className="topbar">
        <a
          href="#"
          className="brand"
          aria-label={APP_NAME}
          onClick={(e) => {
            e.preventDefault();
            setPhoneDetails(false);
            state.set({
              view: "solar_system",
              rail: null,
              focusVersion: state.focusVersion + 1,
            });
          }}
        >
          <SiteWordmark />
        </a>
        <div className="top-centre">
          <span className="live-dot" />{" "}
          {solar ? "SOLAR SYSTEM" : "EARTH–MOON EXPLORER"}{" "}
          <span className="top-divider" />{" "}
          <span>
            {state.view === "overview"
              ? "Navigation"
              : state.view.replace("_", " ").replace("_", " ")}
          </span>
        </div>
        <div className="top-actions">
          <button className="phone-only phone-rocky" disabled={!rockyStarted}
            onClick={() => window.dispatchEvent(new Event("ask-rocky"))}
            onContextMenu={event=>{event.preventDefault();window.dispatchEvent(new Event("rocky-menu"));}}>Rocky</button>
          <button
            className="mode-toggle"
            onClick={() =>
              state.set({ mode: state.mode === "plain" ? "engineer" : "plain" })
            }
          >
            {state.mode === "plain" ? "Plain" : "Engineer"}
            <ChevronRight size={13} />
          </button>
          <IconButton
            label="Controls and shortcuts"
            onClick={() => setHelp((v) => !v)}
          >
            <Keyboard size={18} />
          </IconButton>
          <a
            className="challenge-link"
            href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/"
            target="_blank"
            rel="noreferrer"
          >
            The challenge <ExternalLink size={12} />
          </a>
        </div>
      </header>
      <nav className="instrument-rail" aria-label="Map tools">
        {[
          [MapPin, "sites", "Sites"],
          [Clock3, "clock", "Time"],
          [Layers, "layers", "Layers"],
          [Columns2, "compare", "Compare"],
          [SlidersHorizontal, "settings", "Settings"],
        ].map(([Icon, id, label]: any) => (
          <button
            key={id}
            className={
              (id === "compare" ? state.compare : state.rail === id)
                ? "active"
                : ""
            }
            title={label}
            aria-label={label}
            aria-pressed={id === "compare" ? state.compare : state.rail === id}
            onClick={() =>
              id === "compare"
                ? state.compare && !solar ? closeComparison() : openComparison()
                : rail(id)
            }
          >
            <span className={`site-rail-icon site-rail-${id}`}><SiteAsset name={id === "sites" ? "sites" : id === "clock" ? "clock" : id as string} /></span>
            <span>{label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <IconButton
          label="Data and methodology"
          onClick={() => setSources(true)}
        >
          <Info size={19} />
          <span className="phone-only">Sources</span>
        </IconButton>
      </nav>
      <Presence show={!!state.rail}>{state.rail && (
        <section key={state.rail} className="flyout" data-tool={state.rail} aria-label={state.rail + " controls"}>
          <header>
            <h2>
              {
                {
                  sites: solar ? "Landing sites" : "Landing Sites",
                  clock: "Mission Clock",
                  layers: "Map Layers",
                  settings: "Settings",
                }[state.rail]
              }
            </h2>
            <IconButton
              label="Close tools"
              onClick={() => state.set({ rail: null })}
            >
              <SiteAsset name="collapse" />
            </IconButton>
          </header>
          {state.rail === "sites" && (
            <>
              <p className="muted">Find a place. Explore its possibilities.</p>
              {!solar && <div className="site-sidebar-rule"><SiteAsset name="sidebar-rule" /></div>}
              <input
                className="site-search"
                placeholder="Search the Moon…"
                aria-label="Search lunar sites"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
              />
              <div className="site-list">
                {filteredSites.map((s, i) => (
                  <button
                    key={s.id}
                    className={state.selected === s.id ? "selected" : ""}
                    onClick={() => {
                      state.select(s.id);
                      setInspector(true);
                      setPhoneDetails(true);
                      if(matchMedia("(max-width: 760px), (max-width: 960px) and (max-height: 500px)").matches)state.set({rail:null});
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, siteId: s.id });
                    }}
                  >
                    <span className="site-family">
                      {s.family === "apollo"
                        ? "AP"
                        : s.family === "clps"
                          ? "CL"
                          : s.family === "polar"
                            ? "SP"
                            : "CU"}
                    </span>
                    <span className="site-text">
                      <strong>{s.name}</strong>
                      <small>{s.region}</small>
                      <span>
                        {Math.abs(s.lat).toFixed(3)}°{s.lat < 0 ? "S" : "N"} ·{" "}
                        {Math.abs(s.lon).toFixed(3)}°{s.lon < 0 ? "W" : "E"}
                      </span>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {initError && (
                <p className="error-text">
                  Site catalogue unavailable: {initError}
                </p>
              )}
              <button className="add-site" onClick={() => openCustom(null)}>
                <Plus size={16} /> Add custom coordinates
              </button>
            </>
          )}
          {state.rail === "clock" && (
            <>
              <p className="muted">Every live scenario follows this clock.</p>
              <div className="site-sidebar-rule"><SiteAsset name="sidebar-rule" /></div>
              <div className="site-clock-fields">
              <label>
                Date and Time (UTC)
                <span className="site-date-field">
                <input
                  type="datetime-local"
                  min="1969-01-01T00:00"
                  max="2040-12-31T23:59"
                  value={
                    clockEditing
                      ? dateDraft
                      : new Date(state.time).toISOString().slice(0, 16)
                  }
                  onFocus={() => {
                    setDateDraft(
                      new Date(state.time).toISOString().slice(0, 16),
                    );
                    setClockEditing(true);
                  }}
                  onChange={(e) => setDateDraft(e.target.value)}
                  onBlur={() => {
                    const t = Date.parse(dateDraft + "Z");
                    if (
                      Number.isFinite(t) &&
                      t >= Date.parse("1969-01-01") &&
                      t < Date.parse("2041-01-01")
                    )
                      state.set({ time: t, playing: false });
                    else
                      state.message(
                        "Choose a valid UTC date from 1969 through 2040.",
                      );
                    setClockEditing(false);
                  }}
                />
                <span className="site-calendar-icon"><SiteAsset name="calendar" /></span>
                </span>
              </label>
              <div className="button-row">
                <button
                  onClick={() =>
                    state.set({ time: Date.now(), playing: false })
                  }
                >
                  Now
                </button>
                <button
                  disabled={!activeScenario || activeScenario.epoch === "live"}
                  onClick={() =>
                    state.set({ time: Date.parse(activeScenario!.epoch) })
                  }
                >
                  Landing Site
                </button>
              </div>
              <h3>Playback Speed</h3>
              <div className="speed-buttons">
                {[1, 3600, 60, 86400].map((s, i) => (
                  <button
                    key={s}
                    className={state.speed === s ? "active" : ""}
                    onClick={() => state.set({ speed: s })}
                  >
                    {["1×", "1 h/s", "60×", "1 d/s"][i]}
                  </button>
                ))}
              </div>
              <p className="data-note">
                UTC throughout. Future times use Horizons’ currently known
                leap-second assumptions.
              </p>
              <details className="site-extra-controls"><summary>Next crossing</summary>
                <EventList events={eventAnalysis?.metrics?.events || []} time={state.time} />
              </details>
              </div>
            </>
          )}
          {state.rail === "layers" && (
            <>
              <p className="muted">
                Explore the surface without losing context.
              </p>
              <div className="site-sidebar-rule"><SiteAsset name="sidebar-rule" /></div>
              <div className="site-layer-fields">
              {[
                ["grid", "Coordinate grid"],
                ["markers", "Landing-site markers"],
                ["lunarTerrain", "3D terrain"],
              ].map(([id, label]) => (
                <label className="switch-row" key={id}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={state[id]}
                    onChange={(e) => state.set({ [id]: e.target.checked })}
                  />
                </label>
              ))}
              <label className="switch-row">
                <span>True physical body sizes</span>
                <input
                  type="checkbox"
                  checked={state.trueScale}
                  onChange={(e) => state.set({ trueScale: e.target.checked })}
                />
              </label>
              <p className="data-note">
                Readable scale enlarges the Sun, planets and Moon. Distance
                readouts use JPL positions.
              </p>
              <h3>NASA precomputed layers</h3>
              <span className="site-map-select">
              <select
                aria-label="Precomputed map overlay"
                value={state.statLayer || ""}
                onChange={(e) =>
                  state.set({
                    statLayer: e.target.value || null,
                    view: "polar_south",
                  })
                }
              >
                <option value="">Albedo base only</option>
                <option
                  value="illumination"
                  disabled={!state.layerManifest.illumination}
                >
                  Average sunlight · LOLA{" "}
                  {!state.layerManifest.illumination ? "(preparing)" : ""}
                </option>
                <option
                  value="earth_visibility"
                  disabled={!state.layerManifest.earth_visibility}
                >
                  Average Earth visibility{" "}
                  {!state.layerManifest.earth_visibility ? "(preparing)" : ""}
                </option>
              </select>
              <span className="site-map-select-arrow"><SiteAsset name="select-arrow" /></span>
              </span>
              <p className="data-note">
                Precomputed NASA Moon Trek products cover part of the south
                polar region. Their source period differs from the selected
                clock. No-data remains transparent; use the inspector for
                date-specific values.
              </p>
              <h3 className="desktop-map-switch">Polar views</h3>
              <div className="button-row desktop-map-switch">
                <button onClick={() => state.set({ view: "polar_south" })}>
                  South pole
                </button>
                <button onClick={() => state.set({ view: "polar_north" })}>
                  North pole
                </button>
              </div>
              <p className="data-note">
                Sunlight follows the selected date. Terrain shadows are shown in
                the flyover and horizon views.
              </p>
              </div>
            </>
          )}
          {state.rail === "settings" && (
            <>
              <div className="site-sidebar-rule"><SiteAsset name="sidebar-rule" /></div>
              <div className="site-settings-fields">
              <label>
                Sensor height above ground
                <span className="site-select-field">
                <select
                  value={state.mastM}
                  onChange={(e) => state.set({ mastM: +e.target.value })}
                >
                  {[0, 2, 5, 10].map((m) => (
                    <option key={m} value={m}>
                      {m} m
                    </option>
                  ))}
                </select>
                <span className="site-field-arrow"><SiteAsset name="spin-down" /></span>
                </span>
              </label>
              <label>
                Minimum usable Earth angle (degrees)
                <span className="site-number-field">
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={state.minAntennaEl}
                  onChange={(e) =>
                    state.set({
                      minAntennaEl: Math.max(0, Math.min(90, +e.target.value)),
                    })
                  }
                />
                <span className="site-field-spinner"><SiteAsset name="spin-up" /></span>
                </span>
              </label>
              <p className="data-note">
                Earth contact requires Earth’s centre to clear the horizon and
                your antenna’s minimum elevation.
              </p>
              <h3>Rocky Connection</h3>
              <p className="connection">
                {!health ? "Checking connection…" : health.primaryConfigured
                  ? "Text and map questions"
                  : health.fallbackConfigured ? "Text questions" : "Chat unavailable"}
              </p>
              <button className="full-width" onClick={() => state.set({ welcome: true })}>Replay Welcome</button>
              <details className="site-extra-controls"><summary>Navigation and help</summary>
                <label className="desktop-map-switch">Explore view<select aria-label="Explore view" value={state.view} onChange={event => state.set({ view: event.target.value as any })}>
                  <option value="solar_system">Solar System</option><option value="overview">Earth–Moon</option>
                  <option value="globe">Moon</option><option value="polar_south">South pole</option><option value="polar_north">North pole</option>
                  <option value="surface">Terrain flyover</option><option value="horizon">Horizon</option>
                </select></label>
                <label><input type="checkbox" checked={inspector} onChange={event => setInspector(event.target.checked)} /> Show site details</label>
                <button onClick={() => setSources(true)}>Data and methodology</button>
                <button onClick={() => setHelp(true)}>Controls and shortcuts</button>
              </details>
              </div>
            </>
          )}
        </section>
      )}
      </Presence>
      <div className="phone-only phone-map-controls" aria-label="Phone map controls">
        <label><span>View</span><select aria-label="Map view"
          value={((state.view === "overview" || state.view === "globe") &&
            orbitViews.find(([mode]) => mode === state.cameraCommand?.mode)?.[0]) || state.view}
          onChange={event => {
            const value = event.target.value;
            const orbit = orbitViews.find(([mode]) => mode === value);
            state.set({
              view: orbit ? (state.view === "overview" ? "overview" : "globe") : value as typeof state.view,
              cameraCommand: orbit ? { mode: orbit[0], version: (state.cameraCommand?.version ?? 0) + 1 } : null,
              focusVersion: state.focusVersion + (orbit ? 0 : 1),
              rail: null,
              ...(value === "solar_system" ? { compare: false } : {}),
            });
            setPhoneDetails(false);
          }}>
          <option value="solar_system">Solar System</option><option value="overview">Earth–Moon</option><option value="globe">Moon</option>
          <option value="polar_south">South pole</option><option value="polar_north">North pole</option><option value="surface">Terrain flyover</option><option value="horizon">Horizon</option>
          <optgroup label="Orbits and bodies">
            {orbitViews.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
          </optgroup>
        </select></label>
        <button aria-expanded={phoneDetails && inspector} onClick={()=>{setInspector(true);setPhoneDetails(value=>!value);state.set({rail:null,compare:false,timeline:false});}}>
          {phoneDetails && inspector ? "Close details" : solar ? "Body details" : "Site details"}
        </button>
      </div>
      <button className="phone-only phone-details-close" aria-label="Close details" onClick={()=>{setPhoneDetails(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(".phone-map-controls > button")?.focus());}}><X size={18}/>Close</button>
      <div className="view-toolbar" aria-label="View controls">
        {[
          [Orbit, "solar_system", "Solar System"],
          [Globe2, "overview", "Earth–Moon"],
          [Focus, "globe", "Moon"],
          [Compass, "polar_south", "South pole"],
        ].map(([Icon, view, label]: any) => (
          <button
            key={view}
            aria-label={label}
            className={state.view === view ? "active" : ""}
            onClick={() => state.set({ view, cameraCommand: null, focusVersion: state.focusVersion + 1,
              ...(view === 'solar_system' ? {rail:null,compare:false} : {}) })}
          >
            <span className={`site-view-icon site-view-${view}`}><SiteAsset name={view === 'solar_system' ? 'nav-solar' : view === 'overview' ? 'nav-earth-moon' : view === 'globe' ? 'nav-moon' : 'nav-south'} />{view === 'overview' && <SiteAsset name="nav-moon" />}</span>
            <span>{label}</span>
          </button>
        ))}
        <IconButton
          label="Focus selected site"
          onClick={() => site && state.fly(site.id)}
        >
          <LocateFixed size={17} />
        </IconButton>
        {(
          <IconButton
            label={inspector && (!phoneLayout || phoneDetails) ? "Hide inspector" : "Show inspector"}
            onClick={() => {
              if(phoneLayout){setInspector(true);setPhoneDetails(value=>!value);state.set({rail:null,compare:false,timeline:false});}
              else setInspector(value=>!value);
            }}
          >
            {inspector && (!phoneLayout || phoneDetails) ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </IconButton>
        )}
      </div>
      {inspector && site && (
        <aside id="site-inspector" className="inspector" tabIndex={-1}>
          <header>
            <div>
              <h1>{site.name}</h1>
              <p>{site.region}</p>
              <span className="site-kind">
                {site.family === "clps"
                  ? "Commercial lunar delivery"
                  : site.family === "apollo"
                    ? "Historic landing site"
                    : site.family === "custom"
                      ? "Custom coordinates"
                      : site.family === "international"
                        ? "International lunar mission"
                        : "Named polar feature"}
              </span>
            </div>
            <IconButton
              label="Site actions"
              onClick={() =>
                setMenu({ x: innerWidth - 80, y: 180, siteId: site.id })
              }
            >
              <SlidersHorizontal size={17} />
            </IconButton>
          </header>
          <div className="site-quick-actions">
            <button onClick={() => openSiteAnalysis(site, activeScenario)}>Evaluate landing site</button>
            <button onClick={openComparison}><Columns2 size={16} /> Compare sites or dates</button>
            <button onClick={() => openNearby(site)}>Find better spots nearby</button>
          </div>
          <div className="coordinates">
            <span>
              {Math.abs(site.lat).toFixed(5)}° {site.lat < 0 ? "S" : "N"}
            </span>
            <span>
              {Math.abs(site.lon).toFixed(5)}° {site.lon < 0 ? "W" : "E"}
            </span>
            <span>
              {terrain
                ? terrain.elevationM.toFixed(0) + " m"
                : "Elevation pending"}
            </span>
          </div>
          <div className={"quality " + (terrain && (!terrain.quality || terrain.quality === "full") ? "verified" : "limited")}>
            <span className="quality-dot" />
            {terrain
              ? `${terrain.quality === "preview" ? "Terrain preview · refining" : terrain.quality === "quick" ? "Terrain check · refining" : "Detailed terrain"} · ${terrain.resolutionM.toFixed(0)} m grid`
              : state.loading[key]
                ? "Loading terrain"
                : packet?.terrainPending
                  ? "Smooth horizon"
                  : "Terrain pending"}
            {terrain?.quality && terrain.quality !== "full" && <button className="text-button" onClick={() => ensureTerrain(site, true)}>Refine terrain</button>}
            {!terrain && packet?.terrainPending && !state.loading[key] && (
              <button className="text-button" onClick={() => ensureData(
                site, state.time, activeScenario?.durationDays || 1, true,
              )}>Retry terrain</button>
            )}
            <button className="text-button" onClick={() => setSources(true)}>
              Details
            </button>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>Conditions now</h2>
              <span>
                UTC {new Date(state.time).toISOString().slice(11, 16)}
              </span>
            </div>
            {current ? (
              <>
                <SkyStrip packet={packet} time={state.time} mask={mask} />
                <div className="condition-readings">
                  <section className="condition-reading sunlight-reading">
                    <h3><Sun size={18} /> Sunlight now</h3>
                    <strong>{current.sun.visible ? "Sunlight available" : "Little or no direct sunlight"}</strong>
                    <p>{(current.sun.visibleFraction * 100).toFixed(0)}% of the Sun's disc is visible.</p>
                    <p>Sun elevation: {deg(current.sun.el)}</p>
                    <small>{current.sun.terrainVisibleFraction === 0
                      ? (mask ? "Terrain blocks the Sun." : "The Sun is below the smooth horizon.")
                      : current.sun.eclipse.state !== "none"
                        ? "Earth's shadow reduces direct sunlight."
                        : "Sun clears the terrain."}</small>
                    <details className="condition-geometry" open={state.mode === "engineer" ? true : undefined}><summary>Position in the sky</summary><dl><dt>Height above level horizon</dt><dd>{deg(current.sun.el)}</dd>
                      <dt>Compass bearing</dt><dd>{deg(current.sun.az)} ({bearing(current.sun.az)})</dd></dl></details>
                  </section>
                  <section className="condition-reading contact-reading">
                    <h3><Radio size={18} /> Earth contact now</h3>
                    <strong>{current.earth.dte ? "Clear line of sight" : "Direct contact blocked"}</strong>
                    <p>{!current.earth.visible
                      ? "Earth's centre is below the horizon."
                      : !current.earth.dte
                        ? `Earth clears the horizon but is below your ${state.minAntennaEl}° antenna limit.`
                        : `Earth clears the horizon and your ${state.minAntennaEl}° antenna limit.`}</p>
                    <details className="condition-geometry" open={state.mode === "engineer" ? true : undefined}><summary>Position in the sky</summary><dl><dt>Height above level horizon</dt><dd>{deg(current.earth.el)}</dd>
                      <dt>Compass bearing</dt><dd>{deg(current.earth.az)} ({bearing(current.earth.az)})</dd></dl></details>
                  </section>
                </div>
                <h2 className="site-crossing-title">Next Crossing</h2>
                <p
                  className={
                    "eclipse-status" +
                    (current.sun.eclipse.state !== "none"
                      ? " eclipse-active"
                      : "")
                  }
                >
                  <strong>Earth shadow: {current.sun.eclipse.state}</strong>
                  {current.sun.eclipse.state !== "none" && (
                    <span>
                      {(current.sun.eclipse.blockedFraction * 100).toFixed(1)}%
                      of solar disc blocked
                    </span>
                  )}
                </p>
                {state.mode === "engineer" ? (
                  <details className="engineering-readings" open>
                    <summary>Observer and horizon measurements</summary>
                    <dl className="comparison-values">
                      <dt>Sun terrain horizon</dt>
                      <dd>{deg(current.sun.horizon)}</dd>
                      <dt>Earth terrain horizon</dt>
                      <dd>{deg(current.earth.horizon)}</dd>
                      <dt>Solar angular radius</dt>
                      <dd>{deg(current.sun.radius)}</dd>
                      <dt>Earth angular radius</dt>
                      <dd>{deg(current.earth.radius)}</dd>
                      <dt>Sun above terrain</dt>
                      <dd>
                        {(current.sun.terrainVisibleFraction * 100).toFixed(1)}%
                      </dd>
                      <dt>Direct solar disc visible</dt>
                      <dd>{(current.sun.visibleFraction * 100).toFixed(1)}%</dd>
                      <dt>Sun–Earth separation</dt>
                      <dd>{deg(current.sun.eclipse.separationDeg)}</dd>
                      <dt>Earth range from observer</dt>
                      <dd>{current.earth.distanceKm.toFixed(1)} km</dd>
                      <dt>Sensor height above ground</dt>
                      <dd>{state.mastM} m</dd>
                      <dt>Minimum angle for direct Earth contact</dt>
                      <dd>{state.minAntennaEl}°</dd>
                    </dl>
                    <p className="data-note">
                      Skyline samples:{" "}
                      {mask
                        ? `${terrain?.azStepDeg ?? 360/mask.length}° apart, out to 150 km`
                        : "smooth horizon"}
                      . Earth’s shadow is included.
                    </p>
                  </details>
                ) : null}
              </>
            ) : (
              <div className="pending-data">
                <Orbit size={22} className={state.loading[key] ? "spin" : ""} />
                <p>
                  {state.errors[key]
                    ? "Could not reach NASA/JPL"
                    : state.loading[key]
                      ? "Loading Sun and Earth positions from NASA/JPL…"
                      : "Choose a site to load scientific data."}
                </p>
                {state.errors[key] && (
                  <>
                    <small>{state.errors[key]}</small>
                    <button
                      onClick={() =>
                        ensureData(
                          site,
                          state.time,
                          activeScenario?.durationDays || 1,
                          true,
                        )
                      }
                    >
                      <RotateCcw size={14} /> Retry
                    </button>
                  </>
                )}
              </div>
            )}
            {current && (
              <EventList
                events={eventAnalysis?.metrics?.events || []}
                time={state.time}
              />
            )}
            <button
              className="sky-link"
              onClick={() =>
                state.set({
                  view: "horizon",
                  rail: null,
                  focusVersion: state.focusVersion + 1,
                })
              }
            >
              Open horizon view <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>
                {activeScenario ? "Over your whole mission" : "Find your landing date"}
              </h2>
              {activeScenario && <span>{activeScenario.durationDays} d</span>}
            </div>
            {activeScenario && m && (
              <p className="data-note">
                Scenario {activeScenario.id} · {utc(m.start)} → {utc(m.end)} UTC
                ·{" "}
                {activeScenario.epoch === "live"
                  ? "follows clock"
                  : "pinned landing date"}
              </p>
            )}
            {activeScenario && m ? (
              <>
                {missionScore && <button className="full-width" onClick={() => openSiteAnalysis(site, activeScenario)}>
                  Site score {formatSiteScore(missionScore.percent)}{(!mask || (terrain?.quality && terrain.quality !== "full")) && " · Preliminary"} <ArrowUpRight size={14} />
                </button>}
                {activeScenario.profile && (
                  <p className="mission-verdict">
                    {terrain?.quality === "preview" || terrain?.quality === "quick"
                      ? "Preliminary result. Wait for detailed terrain to check your mission limits."
                      : terrain && analysis?.rules?.length ? (analysis.rules.every((r: any) => r.passed)
                      ? "Meets your sunlight, darkness and contact limits."
                      : "Does not meet all your mission limits. Open the site score for details.")
                      : "Smooth horizon estimate. Add terrain data to check your mission limits."}
                  </p>
                )}
                <div className="metrics-grid">
                  <div>
                    <span>Time in sunlight</span>
                    <strong>
                      {m.sunlitPct.toFixed(1)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Time with Earth contact</span>
                    <strong>
                      {m.earthDtePct.toFixed(1)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Longest darkness</span>
                    <strong>
                      {m.longestDarkH.toFixed(1)}
                      <small>h</small>
                    </strong>
                  </div>
                  <div>
                    <span>Relative solar power (index)</span>
                    <strong>{m.meanPowerIndex.toFixed(3)}</strong>
                  </div>
                </div>
                <p className="data-note">
                  Average sunlight on a {activeScenario.arrayMode || "horizontal"} panel, compared with direct sunlight at Earth's orbit.
                </p>
                <p className="data-note">
                  Time in Earth's shadow: {m.eclipseHours.toFixed(2)} h.
                </p>
              </>
            ) : (
              <p className="muted">
                {activeScenario
                  ? analysis?.error ||
                    state.errors[key] ||
                    "Calculating the selected mission window"
                  : "Set your mission duration and requirements to calculate possible landing dates."}
              </p>
            )}
            <button
              className="primary full-width"
              onPointerEnter={() => void loadScenarioDialog()}
              onFocus={() => void loadScenarioDialog()}
              onClick={() => state.set({ scenarioDialog: true })}
            >
              <Flag size={16} /> Plan landing <ArrowUpRight size={16} />
            </button>
            {ranked && <button className="text-button" onClick={() => setRanked(null)}>Clear ranked pins</button>}
            <div className="button-row">
              <button onClick={() => state.set({ timeline: !state.timeline })}>
                <Clock3 size={14} /> Timeline
              </button>
              <button
                aria-label="Export data as JSON"
                disabled={!current || (!!activeScenario && !m)}
                onClick={() => download("json")}
              >
                <Download size={14} /> JSON
              </button>
              <button
                aria-label="Export data as CSV"
                disabled={!current || (!!activeScenario && !m)}
                onClick={() => download("csv")}
              >
                <Download size={14} /> CSV
              </button>
            </div>
          </div>
          <div className="inspector-section">
            <button
              className="sky-link"
              onClick={() => {
                if (!activeScenario) {
                  state.set({ scenarioDialog: true });
                  state.message(
                    "Choose a mission duration before analysing date slips.",
                  );
                } else setSlip(true);
              }}
            >
              See the effect of a later landing <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="inspector-section site-source">
            <p>{site.family === "custom" ? "A lunar site at your selected coordinates." : site.description}</p>
            {site.source.startsWith("http") && (
              <a href={site.source} target="_blank" rel="noreferrer">
                Coordinate source <ExternalLink size={12} />
              </a>
            )}
            <button className="text-button" onClick={() => setSources(true)}>
              Data sources
            </button>
          </div>
        </aside>
      )}
      <Presence show={state.timeline && !state.compare && !solar}>{state.timeline && !state.compare && !solar && (
        <section className="timeline-drawer">
          <header>
            <h2>{site?.name} · next 24 hours</h2>
            <IconButton
              label="Close timeline"
              onClick={() => state.set({ timeline: false })}
            >
              <X size={17} />
            </IconButton>
          </header>
          <TimelineLane siteId={state.selected} start={state.time} />
          <p className="data-note">
            Click a segment to scrub time. Patterned intervals indicate no
            visibility; gaps mean no data.
          </p>
        </section>
      )}
      </Presence>
      <Presence show={state.compare && !solar}>{state.compare && !solar && (
        <section className="compare-tray" aria-labelledby="comparison-heading" onKeyDown={event => {
          if (event.key === "Escape") closeComparison();
        }}>
          <header>
            <h2 id="comparison-heading" tabIndex={-1}>
              Compare landing plans{" "}
              <span>{state.scenarios.length} / 4</span>
            </h2>
            <div className="button-row">
              {state.scenarios.length > 0 && state.scenarios.length < 4 && <button
                onClick={() => document.getElementById("comparison-site")?.focus()}
              >Add plan</button>}
              {state.scenarios.length > 0 && <button onClick={share}>Share</button>}
              <IconButton
                label="Close comparison"
                onClick={closeComparison}
              >
                <X size={18} />
              </IconButton>
            </div>
          </header>
          {state.scenarios.length > 0 && <ComparisonBoard scenarios={state.scenarios} onEvaluate={scenario => {
            const location = sites.find(site => site.id === scenario.siteId);
            if (location) openSiteAnalysis(location, scenario);
          }} onInspect={phoneLayout ? () => {
            setInspector(true);
            setPhoneDetails(true);
            state.set({ compare: false, rail: null });
            requestAnimationFrame(() => document.getElementById("site-inspector")?.focus({ preventScroll: true }));
          } : undefined} />}
          <ComparisonForm sites={sites} planLanding={() => state.set({ scenarioDialog: true })} />
        </section>
      )}
      </Presence>
      <div className="clockbar">
        {<button className="site-view-360" aria-label="Show whole Moon" title="Show whole Moon" onClick={() => state.set({ view: "globe", cameraCommand: { mode: "whole_moon", version: (state.cameraCommand?.version ?? 0) + 1 } })}><SiteAsset name="view-360" /></button>}
        <div className="transport">
          <IconButton
            label="Step back one hour"
            onClick={() => state.set({ time: state.time - HOUR })}
          >
            <SiteAsset name="previous" />
          </IconButton>
          <IconButton
            label={state.playing ? "Pause time" : "Play time"}
            onClick={() => state.set({ playing: !state.playing })}
          >
            {state.playing ? <Pause size={17} /> : <SiteAsset name="play" />}
          </IconButton>
          <IconButton
            label="Step forward one hour"
            onClick={() => state.set({ time: state.time + HOUR })}
          >
            <SiteAsset name="next" />
          </IconButton>
        </div>
        <button className="clock-readout" title="Mission time in UTC · open time controls" onClick={() => rail("clock")}>
          <span>{utc(state.time)}</span>
          <small>UTC</small>
        </button>
        <button
          className="speed-readout"
          onClick={() =>
            state.set({
              speed: [1, 60, 3600, 86400][
                ([1, 60, 3600, 86400].indexOf(state.speed) + 1) % 4
              ],
            })
          }
        >
          {state.speed === 3600
            ? "1 h/s"
            : state.speed === 86400
              ? "1 d/s"
              : state.speed + "×"}
        </button>
        <div className="clockbar-spacer" />
        <span className="map-status">
          {solar
            ? state.trueScale
              ? "Physical AU scale"
              : "Readable Solar System"
            : state.trueScale
              ? "True physical sizes"
              : "Body sizes enlarged"}
          {!solar &&
            current &&
            " · Earth " +
              Math.round(current.earth.distanceKm).toLocaleString() +
              " km from site"}
        </span>
        <button className="text-button" onClick={() => setSources(true)}>
          {solar
            ? "Lunar data & methodology"
            : packet
              ? "JPL Horizons"
              : "Data connecting"}{" "}
          <ExternalLink size={11} />
        </button>
      </div>
      {state.statLayer &&
        state.view === "polar_south" &&
        state.layerManifest[state.statLayer] && (
          <div className="layer-legend">
            <strong>
              {state.statLayer === "illumination"
                ? "Long-term sunlight"
                : "Long-term Earth visibility"}
            </strong>
            <span>Precomputed · not the selected date</span>
            {state.layerManifest[state.statLayer].legend && (
              <>
                <div
                  style={{
                    background: `linear-gradient(90deg,${state.layerManifest[state.statLayer].legend.low},${state.layerManifest[state.statLayer].legend.high})`,
                  }}
                />
                <small>
                  0% <span>100%</span>
                </small>
              </>
            )}
            <a
              href={
                state.layerManifest[state.statLayer].sourcePage ||
                state.layerManifest[state.statLayer].capabilities
              }
              target="_blank"
              rel="noreferrer"
            >
              Source & definition <ExternalLink size={10} />
            </a>
          </div>
        )}
      {state.travel && (
        <div className="travel-banner">
          <Orbit className="spin" size={18} />
          <span>
            Approaching {site?.name}
            <small>Previewing the trip to your selected arrival time</small>
          </span>
          <button onClick={() => state.set({ chase: !state.chase })}>
            {state.chase ? "Free map camera" : "Follow shuttle"}
          </button>
          <button
            onClick={() =>
              state.set({
                time: state.travel!.to,
                travel: null,
                view: "surface",
                landed: true,
              })
            }
          >
            Skip travel
          </button>
        </div>
      )}
      {state.landed && (
        <div className="landing-choice">
          <h2>{site ? `Arrived at ${site.name}` : "Surface arrival"}</h2>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => state.set({ view: "horizon", landed: false })}
            >
              Look at the horizon
            </button>
            <button
              onClick={() => state.set({ view: "surface", landed: false })}
            >
              Overhead analysis
            </button>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        {slip && <DateSlip close={() => setSlip(false)} />}
      </Suspense>
      <Suspense fallback={null}>
        {rockyStarted && !state.welcome && <Rocky snapshot={() => snapshot.current()} hasInspector={inspector} />}
      </Suspense>
      {state.welcome && <Welcome ready={intro && entryReady} prepare={prepareWorld} begin={() => {
        setEntryReady(false);
        state.set({ rail: null, view: "solar_system", focusVersion: state.focusVersion + 1 });
        setIntro(true);
      }} enter={() => { setIntro(false); state.set({ welcome: false }); }}
        skip={() => { setIntro(false); state.set({ welcome: false }); }} />}
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          style={{
            left: Math.max(8, Math.min(menu.x, innerWidth - 245)),
            top: Math.max(8, Math.min(menu.y, innerHeight - 290)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            const buttons = Array.from(
                menuRef.current!.querySelectorAll("button"),
              ),
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
              ].focus();
            }
            if (e.key === "Escape") setMenu(null);
          }}
        >
          {menuItems.map(([label, fn]: any) => (
            <button
              role="menuitem"
              key={label}
              onClick={() => {
                fn();
                setMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {siteEvaluation && <Suspense fallback={<div className="modal-backdrop"><p role="status">Opening landing site analysis…</p></div>}>
        <SiteAnalysis site={siteEvaluation.site} initial={siteEvaluation.plan} close={closeSiteAnalysis} />
      </Suspense>}
      {state.scenarioDialog && (
        <Suspense fallback={<div className="modal-backdrop"><section className="scenario-dialog" role="dialog" aria-label="Opening landing planner"><p role="status">Opening landing planner…</p><button onClick={()=>state.set({scenarioDialog:false})}>Cancel</button></section></div>}>
          <ScenarioDialog key={plannerInitial?.requestId??"manual"} initial={plannerInitial} close={() => { setPlannerInitial(null); state.set({ scenarioDialog: false }); }} />
        </Suspense>
      )}
      {nearby && <Suspense fallback={null}>
        <NearbySites {...nearby} sites={sites} close={() => {
          setNearby(null);
          requestAnimationFrame(() => nearbyTrigger.current?.focus());
        }} compare={compareNearbySite}
          showMap={(rows, mission) => {
            setRanked({ center: nearby.center, rows, mission });
            setPhoneDetails(false);
            state.set({ view: "globe", markers: true, rail: null });
            setNearby(null);
          }} />
      </Suspense>}
      {state.pickingSite && (
        <div className="coordinate-picker" role="status">
          <span>Click or tap a point on the Moon. Drag to rotate.</span>
          <button
            onClick={() => {
              state.set({ pickingSite: false });
              setCustomDialog({});
            }}
          >
            Cancel picking
          </button>
        </div>
      )}
      {customDialog && (
        <div className="modal-backdrop">
          <form
            className="scenario-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-title"
            onSubmit={(e) => {
              e.preventDefault();
              saveCustom();
            }}
          >
            <header>
              <h2 id="custom-title">Create a lunar site</h2>
              <IconButton
                label="Close custom site"
                onClick={() => setCustomDialog(null)}
              >
                <X size={18} />
              </IconButton>
            </header>
            <label>
              Site name
              <input
                autoFocus
                required
                maxLength={64}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setCustomDialog(null);
                setPhoneDetails(false);
                state.set({
                  pickingSite: true,
                  view: "globe",
                  rail: null,
                  playing: false,
                });
              }}
            >
              Pick point on Moon
            </button>
            <p className="data-note">
              Pick a point on the globe to fill latitude and longitude, or enter
              them below before saving.
            </p>
            <label>
              Latitude · north positive
              <input
                required
                type="number"
                step="any"
                min="-90"
                max="90"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
              />
            </label>
            <label>
              Longitude · east positive
              <input
                required
                type="number"
                step="any"
                min="-180"
                max="180"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
              />
            </label>
            <p className="data-note">
              The site uses the LOLA elevation and skyline at these coordinates.
            </p>
            <button className="primary">Create site</button>
          </form>
        </div>
      )}
      {(help || sources) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setHelp(false);
              setSources(false);
            }
          }}
        >
          <section
            className="info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-title"
          >
            <header>
              <h2 id="info-title">
                {help ? "Explore with confidence" : "Data & methodology"}
              </h2>
              <IconButton
                label="Close information"
                onClick={() => {
                  setHelp(false);
                  setSources(false);
                }}
              >
                <X size={20} />
              </IconButton>
            </header>
            {help ? (
              <>
                <p>
                  Drag to orbit. Scroll or pinch to zoom. Middle-drag pans. In
                  horizon view, drag or use the arrow keys to look around; the
                  observer stays fixed at the site and mast height. Click a site
                  to inspect it; right-click a marker or the lunar globe for
                  actions.
                </p>
                <dl className="shortcuts">
                  <dt>W / A / S / D</dt>
                  <dd>Free camera travel</dd>
                  <dt>Q / E</dt>
                  <dd>Move down / up</dd>
                  <dt>Shift</dt>
                  <dd>Faster camera travel</dd>
                  <dt>Space</dt>
                  <dd>Play / pause time</dd>
                  <dt>, / .</dt>
                  <dd>Step one hour</dd>
                  <dt>1 / 2 / 3 / 4</dt>
                  <dd>Playback speed</dd>
                  <dt>C / L / T</dt>
                  <dd>Compare / layers / timeline</dd>
                  <dt>Shift + F10</dt>
                  <dd>Selected site's action menu</dd>
                </dl>
              </>
            ) : (
              <>
                <p>
                  Every Sun/Earth angle comes from the NASA/JPL Horizons
                  observer API at the selected lunar latitude, longitude and
                  sensor height.
                </p>
                <h3>Geometry</h3>
                <p>
                  High-precision MEAN_ME body frame, planetocentric coordinates,
                  east-positive longitude, airless apparent azimuth and
                  elevation, apparent angular diameter and topocentric range.
                  Directions between 10-minute samples use normalized
                  unit-vector interpolation, including north-wrap and zenith
                  passages. Requests and raw responses are cached.
                </p>
                <h3>Terrain</h3>
                <p>
                  {terrain
                    ? `The ${terrain.quality && terrain.quality !== "full" ? "preliminary" : "detailed"} horizon uses a ${terrain.resolutionM.toFixed(0)} m LOLA elevation grid, ${terrain.masks[String(state.mastM)]?.length ?? 720} bearings out to 150 km, lunar curvature and a ${state.mastM} m mast.`
                    : "The smooth horizon uses the Moon’s curvature and the observer’s height."}
                </p>
                <p>
                  Globe imagery uses the LROC WAC mosaic from{" "}
                  <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">NASA Moon Trek</a>.
                  Use{" "}
                  <a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">LROC QuickMap</a>
                  {" "}to compare elevation{site ? ` at ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}` : ""}
                  {" "}or inspect available regional terrain models.
                </p>
                <h3>Events and metrics</h3>
                <p>
                  Sunrise and sunset mark when the Sun’s centre crosses the
                  terrain skyline. The visible fraction of the Sun combines
                  terrain blockage and overlap with Earth’s apparent disc.
                  Mission percentages use 10-minute samples. Earth contact
                  applies the antenna elevation setting to Earth’s centre.
                </p>
                <p>
                  <a
                    href="https://science.nasa.gov/moon/eclipses/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA: Earth’s shadow and lunar eclipses{" "}
                    <ExternalLink size={12} />
                  </a>
                </p>
                <h3>Source traceability</h3>
                <ul className="source-list">
                  <li>
                    <a
                      href="https://ssd-api.jpl.nasa.gov/doc/horizons.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NASA/JPL Horizons API documentation{" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDS / LRO LOLA elevation products{" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://svs.gsfc.nasa.gov/4720/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NASA CGI Moon Kit imagery (visual only){" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  {packet?.sources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={
                          "/api/provenance/" + s.rawFile.replace(".txt", "")
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Raw {i === 0 ? "Sun" : "Earth"} response · {s.model}{" "}
                        <ExternalLink size={12} />
                      </a>
                      <small>
                        Retrieved {s.retrievedUtc}
                        <br />
                        SHA-256 {s.sha256}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
      {state.toast && (
        <div className="toast" role="status">
          {state.toast}
        </div>
      )}
    </main>
  );
}
