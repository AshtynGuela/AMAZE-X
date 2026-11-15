import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArcType, BoundingSphere, CameraEventType, Cartesian2, Cartesian3, Cartographic,
  CesiumTerrainProvider, Color, Credit, DirectionalLight, DistanceDisplayCondition, CustomDataSource, ImageMaterialProperty,
  Ellipsoid, EllipsoidTerrainProvider, EllipsoidalOccluder, Entity, GeographicTilingScheme, SceneTransforms,
  HeadingPitchRange, HeightReference, JulianDate, KeyboardEventModifier,
  Math as CesiumMath, Matrix3, Quaternion as CesiumQuaternion, ScreenSpaceEventHandler, ScreenSpaceEventType, ShadowMode,
  UrlTemplateImageryProvider, Viewer, sampleTerrain, Rectangle,
  Primitive, GeometryInstance, EllipsoidGeometry, MaterialAppearance, Material, Matrix4,
} from "cesium";
import { ArrowDown, ArrowUp, Compass, Globe2, Info, Minus, Mountain, Plus, Settings2, X } from "lucide-react";
import { conditions } from "../engine/index.mjs";
import { lunarCameraDelta, lunarSunPosition } from "../engine/lunar-scene.mjs";
import { LUNAR_RADIUS_M, LUNAR_IMAGERY_URL, LUNAR_MAP_CREDIT, LUNAR_MAP_SOURCE } from "../engine/lunar-map.mjs";
import { getMask, packetFor, useScout } from "./store";
import { captureMap } from "./mapSnapshot";
import { formatCoordinate } from "./SiteChrome";
import type { RankedSite } from "./NearbySites";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./lunar-map.css";
import { withPolarTerrain } from "./polarTerrain";
import type { CelestialContext } from './celestial-context';
import { lunarBodyOrientation } from '../engine/celestial-context.mjs';
import { useEarthOrientation } from './EarthGlobe';
import { Vector3 } from 'three';

const moon = new Ellipsoid(LUNAR_RADIUS_M, LUNAR_RADIUS_M, LUNAR_RADIUS_M);
const angle = CesiumMath.toRadians;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
type Cursor = { lat: number; lon: number; height: number; resolution: number; distance: number };
type Props = {
  celestial?: CelestialContext;
  onContext: (point: { x: number; y: number; lat: number; lon: number }) => void;
  onSnapshot: (capture: () => string) => void;
  onBearing: (bearing: number) => void;
  targetBearing: { az: number; el: number } | null;
  terrainLighting: boolean;
  onToggleLighting: () => void;
  nearbyPins?: RankedSite[];
  nearbyCenter?: { lat: number; lon: number };
  onNearbyPin: (site: RankedSite) => void;
};

function position(lat: number, lon: number, height = 0) {
  return Cartesian3.fromDegrees(lon, lat, height, moon);
}
const meters = (value: number) => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value.toFixed(1)} m`;
function cameraClearance(v: Viewer) {
  const point = v.camera.positionCartographic;
  return Math.max(5, point.height - (v.scene.globe.getHeight(point) ?? 0));
}

export default function LunarGlobe(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const terrain = useRef<ReturnType<typeof withPolarTerrain> | null>(null);
  const previousTime = useRef(useScout.getState().time);
  const cameraFlying = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const state = useScout();
  const earthOrientation = useEarthOrientation();
  const selected = [...state.sites, ...state.custom].find(site => site.id === state.selected);
  const [ready, setReady] = useState(false);
  const [bodyLabels, setBodyLabels] = useState<{ name: string; mode: string; x: number; y: number }[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const horizonSite = state.view === "horizon" ? selected : undefined;
  const coordinates = cursor ?? horizonSite;
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const showTerrain = state.lunarTerrain, freeAxis = state.freeCameraAxis;
  const setShowTerrain = (value:boolean) => state.set({lunarTerrain:value});
  const setFreeAxis = (value:boolean) => state.set({freeCameraAxis:value});
  const [retry, setRetry] = useState(0);
  const [surfacePending, setSurfacePending] = useState(false);
  const [closeUp, setCloseUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [measurementHelp, setMeasurementHelp] = useState(false);
  useEffect(() => { setCursor(null); }, [state.selected, state.view]);
  const inertialView = state.lunarRotation;
  const setInertialView = (value:boolean) => state.set({lunarRotation:value});
  const home = useCallback(() => {
    const v = viewer.current;
    if (!v) return;
    v.camera.cancelFlight();
    cameraFlying.current = true;
    v.camera.flyTo({
      destination: position(8, 0, LUNAR_RADIUS_M * 2),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: reducedMotion() ? 0 : 1,
      complete: () => { cameraFlying.current = false; },
      cancel: () => { cameraFlying.current = false; },
    });
  }, []);

  useEffect(() => {
    if (!host.current) return;
    Object.assign(window, { CESIUM_BASE_URL: "/cesium/" });
    let alive = true;
    setReady(false);
    setError("");
    const v = new Viewer(host.current, {
      ellipsoid: moon,
      baseLayer: false,
      animation: false, timeline: false, homeButton: false, geocoder: false,
      sceneModePicker: false, baseLayerPicker: false, fullscreenButton: false,
      navigationHelpButton: false, selectionIndicator: false, infoBox: false,
      skyAtmosphere: false, skyBox: false, scene3DOnly: true,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      useBrowserRecommendedResolution: false,
      contextOptions: { webgl: { alpha: true, antialias: true, preserveDrawingBuffer: true } },
    });
    viewer.current = v;
    // The Sun and annual Earth orbit are beyond Cesium's default far plane.
    // Cesium splits the depth range into frustums, retaining near-surface detail.
    v.camera.frustum.far = 1e13;
    previousTime.current = useScout.getState().time;
    v.resolutionScale = Math.min(devicePixelRatio, 1.5) / devicePixelRatio;
    v.scene.backgroundColor = Color.TRANSPARENT;
    v.scene.fog.enabled = false;
    if (v.scene.sun) v.scene.sun.show = false;
    if (v.scene.moon) v.scene.moon.show = false;
    v.scene.globe.baseColor = Color.fromCssColorString("#797b78");
    v.scene.globe.showGroundAtmosphere = false;
    v.scene.globe.depthTestAgainstTerrain = true;
    v.scene.globe.maximumScreenSpaceError = 3;
    v.scene.globe.tileCacheSize = 160;
    v.scene.globe.preloadAncestors = true;
    v.scene.globe.preloadSiblings = false;
    // Moon lighting must not fade to full brightness near the surface.
    v.scene.globe.lightingFadeOutDistance = 0;
    v.scene.globe.lightingFadeInDistance = 1;
    v.scene.globe.lambertDiffuseMultiplier = 1;
    v.scene.globe.vertexShadowDarkness = 0;
    v.shadowMap.size = innerWidth <= 760 ? 1024 : 2048;
    v.shadowMap.maximumDistance = 20000;
    v.shadowMap.softShadows = true;
    v.shadowMap.darkness = 0.05;
    const controls = v.scene.screenSpaceCameraController;
    controls.minimumZoomDistance = 0.5;
    controls.maximumZoomDistance = 2e12;
    controls.enableCollisionDetection = true;
    controls.rotateEventTypes = [CameraEventType.LEFT_DRAG];
    controls.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH, CameraEventType.RIGHT_DRAG];
    controls.tiltEventTypes = [CameraEventType.MIDDLE_DRAG, CameraEventType.PINCH,
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL }];
    v.camera.constrainedAxis = undefined;
    v.camera.percentageChanged = 0.01;
    v.scene.globe.tileLoadProgressEvent.addEventListener(count => {
      if (alive) setPending(count);
    });
    v.camera.changed.addEventListener(() => {
      if (alive) latest.current.onBearing((Math.round(CesiumMath.toDegrees(v.camera.heading)) + 360) % 360);
    });
    const imagery = new UrlTemplateImageryProvider({
      url: LUNAR_IMAGERY_URL + "/{quickmapLevel}/{x}/{y}.jpg",
      customTags: { quickmapLevel: (_provider, _x, _y, level) => String(level + 1) },
      tilingScheme: new GeographicTilingScheme({ ellipsoid: moon }),
      tileWidth: 512, tileHeight: 512,
      maximumLevel: 17,
      credit: new Credit(LUNAR_MAP_CREDIT),
    });
    imagery.errorEvent.addEventListener(event => {
      if (alive && event.level === 0) setError("Lunar imagery could not load. Retry the connection.");
    });
    v.imageryLayers.addImageryProvider(imagery);
    for (const north of [true, false]) {
      const rectangle = Rectangle.fromDegrees(-180, north ? 60 : -90, 180, north ? 90 : -60);
      v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: `/api/polar-imagery/{z}/{x}/{y}.png?source=cap-v4&hemisphere=${north ? 'north' : 'south'}`,
        tilingScheme: new GeographicTilingScheme({ ellipsoid: moon, rectangle }),
        rectangle,
        tileWidth: 512, tileHeight: 512, maximumLevel: 13,
        credit: new Credit("ACT QuickMap · LROC orthographic polar mosaics"),
        hasAlphaChannel: true,
      }));
    }
    home();

    CesiumTerrainProvider.fromUrl("/api/lunar-terrain-v2/", { ellipsoid: moon, requestVertexNormals: true }).then(source => {
      if (!alive) return;
      const provider = withPolarTerrain(source);
      terrain.current = provider;
      provider.errorEvent.addEventListener(event => {
        if (alive && event.level === 0) setError("Lunar terrain could not load. Retry the connection.");
      });
      v.terrainProvider = provider;
      v.scene.requestRender();
      setReady(true);
    }).catch(() => {
      if (alive) setError("Lunar terrain is unavailable. Retry the connection.");
    });

    const inputs = new ScreenSpaceEventHandler(v.canvas);
    let touchInspection = false;
    let lastHover = 0;
    const hit = (point: Cartesian2) => {
      const overlay=v.scene.pick(point)?.id;
      if (v.scene.pickPositionSupported && !(overlay instanceof Entity && overlay.id.startsWith("grid-"))) {
        const rendered = v.scene.pickPosition(point);
        if (rendered) return rendered;
      }
      const ray = v.camera.getPickRay(point);
      return ray && v.scene.globe.pick(ray, v.scene);
    };
    const inspect = (endPosition: Cartesian2, pin = false) => {
      const now = performance.now();
      if (!pin && (touchInspection || now - lastHover < 70)) return;
      lastHover = now;
      const point = hit(endPosition);
      if (!point) { setCursor(null); return; }
      const ll = moon.cartesianToCartographic(point);
      const adjacent = hit(new Cartesian2(endPosition.x + 1, endPosition.y));
      const resolution = adjacent ? Cartesian3.distance(point, adjacent)
        : v.camera.getPixelSize(new BoundingSphere(point, 1), v.canvas.clientWidth, v.canvas.clientHeight);
      setCursor({
        lat: CesiumMath.toDegrees(ll.latitude), lon: CesiumMath.toDegrees(ll.longitude),
        height: ll.height, resolution, distance: Cartesian3.distance(v.camera.positionWC, point),
      });
      if (pin) {
        v.entities.removeById("terrain-inspection");
        v.entities.add({ id: "terrain-inspection", position: point,
          point: { pixelSize: 9, color: Color.fromCssColorString("#c9e787"), outlineColor: Color.fromCssColorString("#080d12"), outlineWidth: 2 } });
        v.scene.requestRender();
      }
    };
    inputs.setInputAction(({endPosition}: {endPosition: Cartesian2}) => inspect(endPosition), ScreenSpaceEventType.MOUSE_MOVE);
    const select = (point: Cartesian2, context: boolean) => {
      const ground = hit(point);
      if (!ground) return;
      inspect(point, true);
      const ll = moon.cartesianToCartographic(ground);
      const s = useScout.getState();
      if (context || s.pickingSite) {
        const rect = v.canvas.getBoundingClientRect();
        latest.current.onContext({
          x: point.x + rect.left, y: point.y + rect.top,
          lat: CesiumMath.toDegrees(ll.latitude), lon: CesiumMath.toDegrees(ll.longitude),
        });
        return;
      }
      const picked = v.scene.pick(point);
      const id = picked?.id;
      if (id instanceof Entity) {
        const nearby = latest.current.nearbyPins?.find((_item, i) => id.id === "nearby-" + i);
        if (nearby) latest.current.onNearbyPin(nearby);
        else if (id.id.startsWith("site-")) s.select(id.id.slice(5));
      }
    };
    inputs.setInputAction(({ position }: { position: Cartesian2 }) => select(position, false), ScreenSpaceEventType.LEFT_CLICK);
    inputs.setInputAction(({ position }: { position: Cartesian2 }) => select(position, true), ScreenSpaceEventType.RIGHT_CLICK);
    const leave = () => { if (!touchInspection) setCursor(null); };
    const suppressContext = (event: MouseEvent) => event.preventDefault();
    const stopFlight = (event: PointerEvent) => { touchInspection = event.pointerType === "touch"; v.camera.cancelFlight(); };
    const mouseHover = (event: PointerEvent) => { if (event.pointerType === "mouse") touchInspection = false; };
    v.canvas.addEventListener("pointerleave", leave);
    v.canvas.addEventListener("pointerdown", stopFlight);
    v.canvas.addEventListener("pointermove", mouseHover);
    v.canvas.addEventListener("contextmenu", suppressContext);
    v.canvas.tabIndex = 0;
    v.canvas.setAttribute("aria-label", "Lunar 3D terrain. Drag to pan, middle-drag to tilt, wheel to zoom. Press B for horizon, X to descend.");
    latest.current.onSnapshot(() => {
      if (v.isDestroyed()) return "";
      v.scene.render();
      return captureMap(v.canvas);
    });
    return () => {
      alive = false;
      latest.current.onSnapshot(() => "");
      v.canvas.removeEventListener("pointerleave", leave);
      v.canvas.removeEventListener("pointerdown", stopFlight);
      v.canvas.removeEventListener("pointermove", mouseHover);
      v.canvas.removeEventListener("contextmenu", suppressContext);
      terrain.current?.dispose();
      inputs.destroy();
      v.destroy();
      viewer.current = null;
      terrain.current = null;
    };
  }, [home, retry]);

  useEffect(() => {
    const before = previousTime.current;
    previousTime.current = state.time;
    const v = viewer.current;
    if (!v || !ready || !inertialView || cameraFlying.current || state.view !== "globe" || state.pickingSite || before === state.time) return;
    const q = lunarCameraDelta(before, state.time, true);
    const rotation = Matrix3.fromQuaternion(new CesiumQuaternion(q.x, q.y, q.z, q.w));
    const transform = (p: Cartesian3) => Matrix3.multiplyByVector(rotation, p, new Cartesian3());
    v.camera.cancelFlight();
    v.camera.setView({ destination: transform(v.camera.positionWC), orientation: {
      direction: transform(v.camera.directionWC), up: transform(v.camera.upWC),
    }});
    v.scene.requestRender();
  }, [ready, state.time, state.view, state.pickingSite, inertialView]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.terrainProvider = showTerrain && terrain.current ? terrain.current : new EllipsoidTerrainProvider({ ellipsoid: moon });
    v.scene.requestRender();
  }, [ready, showTerrain]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.camera.constrainedAxis = freeAxis ? undefined : Cartesian3.UNIT_Z;
    v.scene.requestRender();
  }, [ready, freeAxis]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.entities.removeAll();
    if (state.markers) {
      for (const site of [...state.sites, ...state.custom]) {
        const active = site.id === state.selected;
        v.entities.add({
          id: "site-" + site.id,
          position: position(site.lat, site.lon, site.elevationM ?? 0),
          point: { pixelSize: active ? 10 : 6, color: Color.fromCssColorString(active ? "#c9e787" : "#edf1e9"),
            outlineColor: Color.fromCssColorString("#080d12"), outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 100000 },
          label: { text: site.name, font: '14px "D-DIN"', fillColor: Color.fromCssColorString("#edf1e9"),
            showBackground: true, backgroundColor: Color.fromCssColorString("#101920"),
            pixelOffset: new Cartesian2(0, -20), heightReference: HeightReference.CLAMP_TO_GROUND,
            distanceDisplayCondition: new DistanceDisplayCondition(0, active ? 1200000 : 180000) },
        });
      }
      for (const [i, site] of (props.nearbyPins ?? []).entries()) {
        v.entities.add({
          id: "nearby-" + i, position: position(site.lat, site.lon),
          point: {pixelSize: 10, color: Color.fromCssColorString("#c9e787"), heightReference: HeightReference.CLAMP_TO_GROUND},
          label: {text: String(i+1), font: '14px "D-DIN"', pixelOffset: new Cartesian2(0,-18),
            heightReference: HeightReference.CLAMP_TO_GROUND},
        });
      }
    }
    if(state.grid && !["surface","horizon"].includes(state.view)) {
      const line=(id:string,points:Cartesian3[])=>v.entities.add({id:"grid-"+id,polyline:{positions:points,width:1,arcType:ArcType.NONE,material:Color.fromCssColorString("#c9e787").withAlpha(.4)}});
      for(let lat=-75;lat<=75;lat+=15)line("lat-"+lat,Array.from({length:361},(_,i)=>position(lat,i-180,11000)));
      for(let lon=-180;lon<180;lon+=15)line("lon-"+lon,Array.from({length:181},(_,i)=>position(i-90,lon,11000)));
    }
    v.scene.requestRender();
  }, [ready, state.sites, state.custom, state.selected, state.markers, state.grid, state.view, props.nearbyPins]);

  useEffect(() => {
    const v = viewer.current, context = props.celestial;
    if (!v || !ready || !context) return;
    const bodies = new CustomDataSource('Earth, Sun and JPL orbit paths');
    let alive = true;
    const cartesian = (xyz: number[]) => Cartesian3.fromArray(xyz);
    bodies.entities.add({ id: 'celestial-earth', position: cartesian(context.earthM),
      orientation: CesiumQuaternion.unpack(lunarBodyOrientation('earth', state.time, earthOrientation)),
      ellipsoid: { radii: new Cartesian3(6371008.4, 6371008.4, 6371008.4),
        material: new ImageMaterialProperty({ image: '/assets/planets/earth-map.jpg' }) },
    });
    // A self-lit solar sphere must not inherit the Moon's directional light.
    const sun = v.scene.primitives.add(new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new EllipsoidGeometry({ radii: new Cartesian3(696340000,696340000,696340000),
          stackPartitions: 24, slicePartitions: 48, vertexFormat: MaterialAppearance.MaterialSupport.BASIC.vertexFormat }),
        modelMatrix: Matrix4.fromTranslation(cartesian(context.sunM)),
      }),
      appearance: new MaterialAppearance({ flat: true, closed: true, translucent: false,
        materialSupport: MaterialAppearance.MaterialSupport.BASIC,
        material: Material.fromType('Color', { color: Color.fromCssColorString('#ffce68') }) }),
    }));
    for (const [id, points, color] of [
      ['lunar-orbit', context.earthLunarOrbitM, '#8db7e4'],
      ['solar-orbit', context.earthSolarOrbitM, '#d4bd7c'],
    ] as const) if (points.length > 1) bodies.entities.add({ id,
      polyline: { positions: points.map(cartesian), width: 1.3, arcType: ArcType.NONE,
        material: Color.fromCssColorString(color).withAlpha(.6) },
    });
    void v.dataSources.add(bodies).then(() => {
      if (!alive) { if (!v.isDestroyed()) v.dataSources.remove(bodies, true); return; }
      v.scene.requestRender();
    });
    return () => {
      alive = false;
      if (!v.isDestroyed()) { v.dataSources.remove(bodies, true); v.scene.primitives.remove(sun); }
    };
  }, [ready, props.celestial, state.time, earthOrientation]);

  useEffect(() => {
    const v = viewer.current, context = props.celestial;
    if (!v || !ready || !context) return;
    // Project labels in double precision: GPU glyph offsets lose precision at
    // Sun–Earth distances even though the body geometry remains valid.
    const update = () => {
      const occluder = new EllipsoidalOccluder(moon, v.camera.positionWC);
      const volume = v.camera.frustum.computeCullingVolume(v.camera.positionWC, v.camera.directionWC, v.camera.upWC);
      const labels = [{ name: 'EARTH', mode: 'earth', at: context.earthM }, { name: 'SUN', mode: 'sun', at: context.sunM }].flatMap(body => {
        const at = Cartesian3.fromArray(body.at);
        if (!occluder.isPointVisible(at) || volume.computeVisibility(new BoundingSphere(at, 0)) < 0) return [];
        const point = SceneTransforms.worldToWindowCoordinates(v.scene, at);
        return point && point.x >= 0 && point.y >= 0 && point.x <= v.canvas.clientWidth && point.y <= v.canvas.clientHeight
          ? [{ name: body.name, mode: body.mode, x: Math.round(point.x), y: Math.round(point.y) }] : [];
      });
      setBodyLabels(before => JSON.stringify(before) === JSON.stringify(labels) ? before : labels);
    };
    const remove = v.scene.postRender.addEventListener(update);
    v.scene.requestRender();
    return remove;
  }, [ready, props.celestial]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    const polar = state.view === "polar_south" || state.view === "polar_north";
    const isGround = state.view === "horizon" || state.view === "surface";
    if (!polar && !selected) return;
    if (state.view === "globe" && state.focusVersion === 0) { home(); return; }
    let active = true;
    const destination = polar ? { lat: state.view === "polar_south" ? -90 : 90, lon: 0 } : selected!;
    const fly = (height: number, pitch: number) => {
      if (!active) return;
      v.camera.cancelFlight();
      cameraFlying.current = true;
      v.camera.flyTo({
        destination: position(destination.lat, destination.lon, height),
        orientation: { heading: 0, pitch, roll: 0 }, duration: reducedMotion() ? 0 : 1,
        complete: () => { cameraFlying.current = false; },
        cancel: () => { cameraFlying.current = false; },
      });
    };
    if (isGround && terrain.current) {
      const knownHeight = state.terrains[state.selected]?.elevationM ?? selected?.elevationM;
      const earlyFlyover = state.view === "surface" && !closeUp && Number.isFinite(knownHeight);
      // A numeric LOLA observer height can open a flyover immediately while
      // the display tiles refine. A 2 m horizon still waits for rendered ground.
      if (earlyFlyover) fly(knownHeight! + (closeUp ? 60 : 900), angle(closeUp ? -60 : -42));
      setSurfacePending(!earlyFlyover);
      const carto = Cartographic.fromDegrees(destination.lon, destination.lat);
      // Some regions have no finest-level tile. Descend only after obtaining
      // real heights, trying progressively coarser coverage when necessary.
      const provider = terrain.current;
      const groundHeight = async () => {
        if (Math.abs(destination.lat) >= 80) {
          // Warm the small ancestor chain at this coordinate before a close
          // descent, instead of showing a globe-scale triangle under the camera.
          const samples = await Promise.allSettled([7, 8, 9, 10, 11, 12].map(level =>
            sampleTerrain(provider, level, [Cartographic.clone(carto)], true)));
          if (!active) throw new Error("Site changed");
          for (const sample of samples.reverse()) {
            if (sample.status === "fulfilled" && Number.isFinite(sample.value[0].height)) return sample.value[0];
          }
          throw new Error("Missing polar terrain elevation");
        }
        for (const level of (Math.abs(destination.lat) >= 80 ? [12, 10, 8] : [14, 12, 10, 8])) {
          try {
            const [point] = await sampleTerrain(provider, level, [Cartographic.clone(carto)], true);
            if (Number.isFinite(point.height)) return point;
          } catch { /* Try the next real terrain level. */ }
          if (!active) throw new Error("Site changed");
        }
        throw new Error("Missing terrain elevation");
      };
      groundHeight().then(point => {
        if (!Number.isFinite(point.height)) throw new Error("Missing terrain elevation");
        if (!earlyFlyover) fly(point.height + (state.view === "horizon" ? Math.max(2, state.mastM) : closeUp ? 60 : 900), state.view === "horizon" ? angle(-3) : angle(closeUp ? -60 : -42));
      }).catch(() => {
        if (!active) return;
        if (earlyFlyover) return;
        const height = state.terrains[state.selected]?.elevationM ?? selected?.elevationM;
        if (Number.isFinite(height)) fly(height! + (state.view === "horizon" ? Math.max(2, state.mastM) : 900), angle(-8));
        else setError("The surface height could not load. Retry before descending.");
      }).finally(() => { if (active) setSurfacePending(false); });
    } else {
      setSurfacePending(false);
      fly(polar ? LUNAR_RADIUS_M * .9 : 140000, -Math.PI / 2);
    }
    return () => { active = false; };
  }, [ready, state.view, state.selected, state.focusVersion, state.mastM, closeUp, state.terrains[state.selected]?.elevationM]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const local = state.view === "surface" || state.view === "horizon";
    v.scene.globe.maximumScreenSpaceError = local ? 1 : 3;
    v.scene.requestRender();
  }, [ready, state.view]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !props.targetBearing || state.view !== "horizon") return;
    v.camera.setView({ orientation: { heading: angle(props.targetBearing.az), pitch: angle(props.targetBearing.el), roll: v.camera.roll } });
  }, [props.targetBearing, state.view]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.clock.currentTime = JulianDate.fromDate(new Date(state.time));
    const packet = packetFor(state, state.selected);
    const terrainRecord = state.terrains[state.selected];
    const sky = packet && conditions(packet, state.time, getMask(terrainRecord, state.mastM), state.minAntennaEl);
    const sunPosition = (sky && packet && lunarSunPosition(sky.sun, {
      ...packet.observer, elevationM: (packet.observer.elevationM ?? 0) + state.mastM,
    })) || (props.celestial ? new Vector3().fromArray(props.celestial.sunM) : null);
    const missionLighting = !props.terrainLighting && !!sunPosition;
    const local = state.view === "surface" || state.view === "horizon";
    v.scene.globe.enableLighting = missionLighting;
    v.shadows = missionLighting && local && showTerrain;
    v.scene.globe.shadows = v.shadows ? ShadowMode.ENABLED : ShadowMode.DISABLED;
    if (missionLighting && sunPosition) {
      sunPosition.normalize().negate();
      v.scene.light = new DirectionalLight({ direction: new Cartesian3(sunPosition.x, sunPosition.y, sunPosition.z),
        color: Color.WHITE, intensity: 2 * (local ? (sky?.sun.eclipse.transmission ?? 1) : 1) });
    }
    host.current?.setAttribute("data-lighting", missionLighting ? "sunlight" : "imagery");
    host.current?.setAttribute("data-terrain-shadows", String(v.shadows));
    v.scene.requestRender();
  }, [ready, state.time, state.view, state.selected, state.packets, state.terrains, state.mastM, state.minAntennaEl, props.terrainLighting, showTerrain, props.celestial]);

  const look = useCallback((pitch: number) => {
    const v = viewer.current;
    if (!v) return;
    v.camera.setView({ orientation: { heading: v.camera.heading, pitch, roll: v.camera.roll } });
  }, []);
  useEffect(() => {
    const v=viewer.current, command=state.cameraCommand;
    if(!v||!ready||!command)return;
    const context = props.celestial;
    if (['earth_moon_orbit','solar_orbit','earth','sun'].includes(command.mode)) {
      if (!context) return;
      const earth = Cartesian3.fromArray(context.earthM), sun = Cartesian3.fromArray(context.sunM);
      let sphere: BoundingSphere;
      if (command.mode === 'earth' || command.mode === 'sun')
        sphere = new BoundingSphere(command.mode === 'earth' ? earth : sun, command.mode === 'earth' ? 6371008.4 : 696340000);
      else sphere = BoundingSphere.fromPoints(command.mode === 'solar_orbit'
        ? [Cartesian3.ZERO, sun, ...context.earthSolarOrbitM.map(p => Cartesian3.fromArray(p))]
        : [Cartesian3.ZERO, earth, ...context.earthLunarOrbitM.map(p => Cartesian3.fromArray(p))]);
      v.camera.cancelFlight();
      const orbit = command.mode === 'solar_orbit' || command.mode === 'earth_moon_orbit';
      v.camera.flyToBoundingSphere(sphere, { duration: reducedMotion() ? 0 : 1.2,
        offset: new HeadingPitchRange(0,-.65,Math.max(10000000,sphere.radius*(orbit ? 6 : 3.3))) });
      v.scene.requestRender();
      return;
    }
    if(command.mode==="whole_moon")home();
    else if(command.mode==="site")state.set({focusVersion:useScout.getState().focusVersion+1});
    else if(command.mode==="horizon")look(angle(-3));
    else if(command.mode==="overhead")look(-Math.PI/2);
    else v.camera.setView({orientation:{heading:command.mode==="north"?0:angle(command.az??0),pitch:command.el===undefined?v.camera.pitch:angle(command.el),roll:0}});
    v.scene.requestRender();
  }, [ready,state.cameraCommand,home,look,!!props.celestial]);
  const zoom = (factor: number) => {
    const v = viewer.current;
    if (!v) return;
    const height = cameraClearance(v);
    v.camera.zoomIn(height * factor);
    v.scene.requestRender();
  };
  useEffect(() => {
    const keys = new Set<string>();
    const down = (event: KeyboardEvent) => {
      if (event.repeat || (event.target as HTMLElement).closest("input,textarea,select,button,a,.rocky-overlay,[role=dialog],[role=menu]")) return;
      const code = event.code;
      const v = viewer.current;
      if (!v) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyA","KeyZ","KeyE","KeyD","KeyS","KeyF","KeyT","KeyG","KeyU","KeyH","KeyO","KeyP"].includes(code)) {
        keys.add(code); event.preventDefault(); event.stopImmediatePropagation();
      } else if (code === "KeyB") {
        event.preventDefault(); event.stopImmediatePropagation(); look(v.camera.pitch < angle(-45) ? angle(-3) : -Math.PI/2);
      } else if (code === "KeyV") {
        event.preventDefault(); event.stopImmediatePropagation();
        v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC, new Cartesian3()), Math.max(50,cameraClearance(v))); v.scene.requestRender();
      } else if (code === "KeyX") {
        event.preventDefault(); event.stopImmediatePropagation();
        const s = useScout.getState();
        const site = [...s.sites,...s.custom].find(site=>site.id===s.selected);
        if (site) s.set({view:"horizon",focusVersion:s.focusVersion+1});
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    let before = performance.now();
    const tick = setInterval(() => {
      const v = viewer.current, now = performance.now();
      const seconds = Math.min(.1,(now-before)/1000); before=now;
      if (!v || document.hidden || !keys.size) return;
      const step = cameraClearance(v) * seconds;
      for (const key of keys) {
        switch (key) {
          case "ArrowUp": v.camera.moveUp(step); break;
          case "ArrowDown": v.camera.moveDown(step); break;
          case "ArrowLeft": v.camera.moveLeft(step); break;
          case "ArrowRight": v.camera.moveRight(step); break;
          case "KeyA": v.camera.zoomIn(step); break;
          case "KeyZ": v.camera.zoomOut(step); break;
          case "KeyE": v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC,new Cartesian3()),step); break;
          case "KeyD": v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC,new Cartesian3()),-step); break;
          case "KeyS": v.camera.lookLeft(seconds*.5); break;
          case "KeyF": v.camera.lookRight(seconds*.5); break;
          case "KeyT": case "KeyU": v.camera.lookUp(seconds*.5); break;
          case "KeyG": case "KeyH": v.camera.lookDown(seconds*.5); break;
          case "KeyO": v.camera.twistLeft(seconds*.5); break;
          case "KeyP": v.camera.twistRight(seconds*.5); break;
        }
      }
      v.scene.requestRender();
    }, 33);
    const clear = () => keys.clear();
    window.addEventListener("keydown",down,true);
    window.addEventListener("keyup",up);
    window.addEventListener("blur",clear);
    return () => { clearInterval(tick); window.removeEventListener("keydown",down,true); window.removeEventListener("keyup",up);window.removeEventListener("blur",clear); };
  }, [look]);

  return <>
    <div ref={host} className="lunar-canvas" />
    {bodyLabels.map(body => <button key={body.mode} className={`lunar-body-label ${body.mode}`}
      aria-label={`Focus ${body.name === 'SUN' ? 'Sun' : 'Earth'} in lunar scene`} style={{ left: body.x, top: body.y }}
      onClick={() => state.set({ cameraCommand: { mode: body.mode, version: (state.cameraCommand?.version ?? 0) + 1 } })}>{body.name}</button>)}
    <nav className="lunar-camera" aria-label="Lunar camera controls">
      <button type="button" aria-label="Zoom in on Moon" title="Zoom in" onClick={()=>zoom(.45)}><Plus size={17}/></button>
      <button type="button" aria-label="Zoom out from Moon" title="Zoom out" onClick={()=>zoom(-.8)}><Minus size={17}/></button>
      <button type="button" aria-label="Show whole Moon" title="Whole Moon" onClick={home}><Globe2 size={17}/></button>
      <button type="button" className="desktop-map-switch" aria-label="Terrain flyover at selected site" title="Terrain flyover · 900 m" onClick={() => {
        const s = useScout.getState(); s.set({view:"surface",focusVersion:s.focusVersion+1});
      }}><Mountain size={17}/></button>
      <button type="button" aria-label="Face lunar north" title="Face north" onClick={()=>{
        const v=viewer.current;if(v)v.camera.setView({orientation:{heading:0,pitch:v.camera.pitch,roll:0}});
      }}><Compass size={17}/></button>
      <button type="button" aria-label="Look along lunar horizon" title="Horizon · B" onClick={()=>look(angle(-3))}><ArrowUp size={17}/></button>
      <button type="button" aria-label="Look straight down at Moon" title="Overhead · B" onClick={()=>look(-Math.PI/2)}><ArrowDown size={17}/></button>
      <button type="button" aria-label="Lunar navigation settings" title="Navigation settings" aria-expanded={settings} onClick={()=>setSettings(value=>!value)}><Settings2 size={17}/></button>
    </nav>
    {settings && <section className="lunar-settings" aria-label="Lunar navigation settings">
      <header><strong>Navigation</strong><button className="icon-button" aria-label="Close lunar settings" onClick={()=>setSettings(false)}><X size={15}/></button></header>
      <label><input type="checkbox" checked={showTerrain} onChange={e=>setShowTerrain(e.target.checked)}/>3D terrain</label>
      <label><input type="checkbox" checked={freeAxis} onChange={e=>setFreeAxis(e.target.checked)}/>Unlock camera Z-axis</label>
      <label><input type="checkbox" checked={inertialView} onChange={e=>setInertialView(e.target.checked)}/>Show lunar rotation in globe view</label>
      <label><input type="checkbox" checked={!props.terrainLighting} onChange={props.onToggleLighting}/>Sunlight and terrain shadows</label>
      <button type="button" aria-expanded={showHelp} onClick={()=>setShowHelp(value=>!value)}>Camera controls</button>
      {showHelp && <div className="lunar-control-help">
        <p>Drag to pan. Wheel or right-drag to zoom. Middle-drag or Ctrl-drag to tilt. Pinch and drag with two fingers on touchscreens.</p>
        <dl><dt>Pan</dt><dd>Arrow keys</dd><dt>Zoom</dt><dd>A / Z</dd><dt>Pitch</dt><dd>T / G</dd><dt>Turn</dt><dd>S / F</dd><dt>Roll</dt><dd>O / P</dd><dt>Horizon / overhead</dt><dd>B</dd><dt>Selected site's surface</dt><dd>X</dd><dt>Move higher</dt><dd>V</dd></dl>
      </div>}
    </section>}
    <div className="lunar-stream-state" role="status" aria-live="polite">
      {error ? <><span>{error}</span><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></>
        : surfacePending ? "Loading surface elevation…" : !ready ? "Connecting lunar terrain…" : pending > 0 ? "Refining terrain…" : ""}
    </div>
    <div className="lunar-cursor" aria-label="Lunar cursor measurements">
      <dl>
        <div><dt>Lat</dt><dd>{coordinates ? formatCoordinate(coordinates.lat, "N", "S") : "—"}</dd></div>
        <div><dt>Lon</dt><dd>{coordinates ? formatCoordinate(coordinates.lon, "E", "W") : "—"}</dd></div>
        <div><dt title="Displayed terrain elevation relative to the 1,737.4 km lunar reference sphere">Height</dt><dd>{cursor && showTerrain ? meters(cursor.height) : "—"}</dd></div>
        <div><dt title="Ground distance represented by one screen pixel at the cursor">Res</dt><dd>{cursor ? `${cursor.resolution.toFixed(2)} m/px` : "—"}</dd></div>
        <div><dt>Dist to cursor</dt><dd>{cursor ? meters(cursor.distance) : "—"}</dd></div>
      </dl>
      <a href={LUNAR_MAP_SOURCE} target="_blank" rel="noreferrer">QuickMap · LROC</a>
      <button type="button" className="lunar-measurement-help" aria-label="Measurement details" aria-expanded={measurementHelp} onClick={() => setMeasurementHelp(value => !value)}><Info size={14}/></button>
      {measurementHelp && <div className="lunar-measurement-note">Horizon coordinates start at the selected site. Tap the ground to pin a point. Height uses the Moon's reference level. Res shows metres per screen pixel; distance is measured from the camera to your point.</div>}
    </div>
    {(state.view === "surface" || state.view === "horizon") && <div className={`lunar-view-mode${state.view === "horizon" ? " horizon-mode-switch" : ""}`}>
      <span>{state.view === "surface" ? "Terrain flyover" : "Observer horizon"}</span>
      <button type="button" className="desktop-map-switch" onClick={() => { const s=useScout.getState();s.set({view:s.view === "surface" ? "horizon" : "surface",focusVersion:s.focusVersion+1}); }}>{state.view === "surface" ? "Observer horizon" : "Terrain flyover"}</button>
      {state.view === "surface" && <button type="button" aria-pressed={closeUp} onClick={() => setCloseUp(value => !value)}>{closeUp ? "Wide view" : "Close-up · 60 m"}</button>}
    </div>}
  </>;
}
