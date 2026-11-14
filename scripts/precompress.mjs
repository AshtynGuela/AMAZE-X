import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, brotliCompress, constants } from 'node:zlib';

const gz = promisify(gzip), br = promisify(brotliCompress);
let files = 0, saved = 0;
async function compressTree(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { await compressTree(filename); continue; }
    // Some .bin assets contain their own gzip envelope and are decoded by the
    // client. Leave those and already-compressed image/audio formats alone.
    if (!/\.(js|css|json|svg|otf|woff|wasm|glb)$/i.test(entry.name)) continue;
    const source = await fs.readFile(filename);
    if (source.length < 2048) continue;
    const variants = await Promise.all([
      gz(source, { level: 8 }),
      br(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
    ]);
    for (const [index, data] of variants.entries()) {
      if (data.length >= source.length * .92) continue;
      await fs.writeFile(filename + (index ? '.br' : '.gz'), data);
      if (index) { files++; saved += source.length - data.length; }
    }
  }
}
await compressTree(path.resolve('dist'));
console.log(`Precompressed ${files} assets; Brotli saves ${(saved / 1048576).toFixed(1)} MiB across these assets.`);
