import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTerrainWork } from "./terrain-work.mjs";

const run = promisify(execFile), root = fileURLToPath(new URL("../", import.meta.url));
const jobs = new Map();
const revision = createHash("sha256");
for (const name of ["scripts/terrain_patch.py", "scripts/lunar_terrain.py", "scripts/remote_dem.py",
  "public/data/manifest.json", "public/data/moon-height.png", "data/terrain-regional.json"])
  revision.update(await fs.readFile(path.join(root, name)));
const folder = path.join(root, ".cache", "terrain-tiles-" + revision.digest("hex").slice(0, 12));

export async function numericPatch(kind, args) {
  const key = createHash("sha256").update(JSON.stringify([kind, ...args])).digest("hex");
  const file = path.join(folder, key + ".json");
  const disk = await fs.readFile(file, "utf8").catch(() => null);
  if (disk) return disk;
  if (jobs.has(key)) return jobs.get(key);
  const job = runTerrainWork(async () => {
    const { stdout } = await run(process.env.LUNAR_TERRAIN_PYTHON || "python",
      [path.join(root, "scripts/terrain_patch.py"), kind, ...args.map(String)],
      { cwd: root, windowsHide: true, timeout: 120000, maxBuffer: 3 * 1024 * 1024 });
    JSON.parse(stdout);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(file + ".part", stdout);
    await fs.rename(file + ".part", file);
    const names = (await fs.readdir(folder)).filter(name => name.endsWith(".json"));
    if (names.length > 512) {
      const ages = await Promise.all(names.map(async name => ({ name, time: (await fs.stat(path.join(folder, name))).mtimeMs })));
      await Promise.all(ages.sort((a,b) => a.time-b.time).slice(0, names.length-512)
        .map(item => fs.unlink(path.join(folder, item.name)).catch(() => {})));
    }
    return stdout;
  }, { priority: kind === "local" || args[0] >= 10 ? 2 : 1 }).finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}
