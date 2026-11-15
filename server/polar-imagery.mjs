import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTerrainWork } from "./terrain-work.mjs";
const run = promisify(execFile), root = fileURLToPath(new URL("../", import.meta.url));
const folder = path.join(root, ".cache/polar-imagery-cap-v4"), jobs = new Map();
export async function polarImagery(level, x, y, hemisphere) {
  const cap = hemisphere === 'north' ? 'NP' : hemisphere === 'south' ? 'SP' : null;
  // Source-derived, cap-only overview tiles make each pole correct before
  // remote/high-resolution imagery is available. Descendants still stream.
  if (level === 0 && cap) {
    const overview = await fs.readFile(path.join(root, 'public/data/polar-basemap', `${hemisphere}-0-${x}-0.png`)).catch(() => null);
    if (overview) return overview;
  }
  const key = `${cap ?? 'global'}-${level}-${x}-${y}`, file = path.join(folder, key + ".png");
  const cached = await fs.readFile(file).catch(() => null);
  if (cached) return cached;
  if (jobs.has(key)) return jobs.get(key);
  const job = runTerrainWork(async () => {
    await fs.mkdir(folder, { recursive: true });
    const temporary = file + ".part";
    try {
      await run(process.env.LUNAR_TERRAIN_PYTHON || "python", [path.join(root, "scripts/polar_imagery_tile.py"),
        String(level), String(x), String(y), temporary, path.join(root, ".cache/surface-imagery-v4/tiles"), ...(cap ? [cap] : [])],
      { cwd: root, timeout: 90000, windowsHide: true });
      await fs.rename(temporary, file);
      const names = (await fs.readdir(folder)).filter(name => name.endsWith(".png"));
      if (names.length > 384) {
        const files = await Promise.all(names.map(async name => ({name, time:(await fs.stat(path.join(folder,name))).mtimeMs})));
        await Promise.all(files.sort((a,b)=>a.time-b.time).slice(0,names.length-384)
          .map(item=>fs.unlink(path.join(folder,item.name)).catch(()=>{})));
      }
      return fs.readFile(file);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }, { priority: level >= 10 ? 2 : 0 }).finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}
