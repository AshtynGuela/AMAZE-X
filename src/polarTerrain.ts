import { HeightmapTerrainData, type CesiumTerrainProvider, type Request } from "cesium";

// Preserve QuickMap's progressively loaded mesh globally. For tiles touching
// either pole, use numeric PDS LOLA stereographic heights resampled into the
// actual geographic tile. No texture value becomes a geometry displacement.
export function withPolarTerrain(base: CesiumTerrainProvider) {
  const cache = new Map<string, Promise<HeightmapTerrainData>>();
  const controllers = new Set<AbortController>();
  let disposed = false;
  const dispose = () => { disposed = true; controllers.forEach(c => c.abort()); controllers.clear(); cache.clear(); };
  const polar = (y: number, level: number) => {
    const north = 90 - y * 180 / 2 ** level;
    return level >= 3 && (north >= 80 || north - 180 / 2 ** level <= -80);
  };
  const maximum = (y: number, level: number) => y < 2 ** (level - 1) ? 12 : 14;
  const requestTileGeometry = (x: number, y: number, level: number, request?: Request) => {
    if (disposed) return Promise.reject(new DOMException("View closed", "AbortError"));
    if (!polar(y, level)) return base.requestTileGeometry(x, y, level, request);
    if (level > maximum(y, level)) return Promise.reject(new Error("Polar source resolution reached"));
    const key = `${level}/${x}/${y}`;
    if (!cache.has(key)) {
      const controller = new AbortController();
      controllers.add(controller);
      const result = fetch(`/api/polar-terrain/${key}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("NASA polar elevations could not load");
        const patch = await response.json();
        if (patch.size !== 65 || patch.heightsM.length !== 65 ** 2 ||
            !patch.heightsM.every((height: number) => Number.isFinite(height) && Math.abs(height) <= 12000))
          throw new Error("Invalid NASA polar terrain tile");
        return new HeightmapTerrainData({ buffer: new Float32Array(patch.heightsM), width: 65, height: 65,
          childTileMask: level >= 14 || (level >= 12 && patch.resolutionM >= 20) ? 0 : 15 });
      }).catch(error => { cache.delete(key); throw error; }).finally(() => controllers.delete(controller));
      cache.set(key, result);
      if (cache.size > 160) cache.delete(cache.keys().next().value!);
    }
    return cache.get(key)!;
  };
  return new Proxy(base, { get(target, property) {
    if (property === "dispose") return dispose;
    if (property === "requestTileGeometry") return requestTileGeometry;
    if (property === "getTileDataAvailable") return (x: number, y: number, level: number) =>
      polar(y, level) && level > maximum(y, level) ? false : target.getTileDataAvailable(x, y, level);
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as CesiumTerrainProvider & { dispose: () => void };
}
