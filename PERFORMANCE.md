# Loading optimization — 14 November 2026

The production welcome screen now defers the 3D scene, planet meshes, orbit packets and Rocky until entry. An upward scroll prepares the scene code, while the two-second entry transition overlaps scene startup. Only the current space backdrop loads. Scientific sampling, terrain resolution and source data are unchanged.

## Local measurement

| Welcome screen | Unique resource URLs | Decoded resource bytes |
|---|---:|---:|
| Before | 39 | 6,770,217 |
| After | 13 | 1,136,348 |

Decoded startup resource volume fell approximately 83%. These are local browser Resource Timing captures before the entry gesture, excluding the HTML document. Repeated health polls are counted once. The baseline used a warm browser cache, so transfer bytes and localhost timing are not a fair before/after network-speed benchmark. Raw captures are in `.cache/perf-review/` and are intentionally untracked.

## Delivery and runtime changes

- Lossless welcome WebP: 393,628 bytes versus 772,251 bytes for PNG; decoded RGB pixels match.
- Build-time Brotli/gzip variants for useful text, font, WebAssembly and model assets. Already-compressed imagery/audio and application-decoded `.bin` envelopes stay unchanged. This moves repeated compression work out of the server request path.
- Hashed JS/CSS: one-year immutable caching. Unversioned assets: one hour with revalidation; HTML: always revalidate. Cache variants vary by Accept-Encoding and retain conditional GET support.
- Explicit-date solar packets: one-hour cache; curated terrain: five minutes; site status: 30 seconds. Health, assistant and API errors keep no-store behavior. Existing terrain tile policies are preserved.
- At most two Solar System packet requests concurrently, with Earth/Moon first, a six-month client cache and aborts when switching month/view.
- Identical pending ordinary JSON GETs share work; signalled requests retain independent cancellation. Completed results follow HTTP caching rather than an additional indefinite client cache.
- Closing the lunar globe aborts outstanding custom polar tile fetches. Hidden-tab Rocky rendering and welcome-screen status polling stop doing unnecessary work.
- Production Cesium workers/assets use the same compressed static delivery as the rest of the built app. Docker copies both build scripts.

## Verification

`npm run build` passed. Twelve focused checks passed with:

```sh
node --test tests/loading.test.mjs tests/solar.test.mjs tests/planet-rotation.test.mjs tests/terrain-work.test.mjs tests/lunar-scene.test.mjs
```

All 199 generated gzip/Brotli representations were decoded and compared byte-for-byte with their originals. Browser checks cover the welcome/entry flow, all Solar System destinations, Rocky and the Shackleton detailed surface. The complete scientific suite was not rerun for this loading change.

## Remaining constraints

The full Cesium globe bundle is still large, but only loads for lunar globe navigation. Uncached NASA elevation, horizon and imagery retrieval still depends on upstream response time and terrain processing. This pass does not lower source accuracy or claim faster cold scientific calculations. Real mobile/network Core Web Vitals should be measured on the deployed service before setting timing targets.
