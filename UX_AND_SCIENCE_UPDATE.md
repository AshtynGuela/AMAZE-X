# UX and calculation update — 15 November 2026

AMAZE-X now uses shorter, practical interface copy. Repetitive disclaimers were removed from the working views. Data-source credits, error recovery and the distinction between preview and detailed terrain remain available. Phone details open at the site heading, the toolbar opens the correct phone panel, and closing the landing planner restores keyboard focus. Lazy planner loading has a visible, cancellable opening state.

## Terrain response and accuracy

Custom coordinates receive a 72-ray first preview from a bundled, numerical NASA LOLA grid, then refine to 180 rays with detailed source heights, followed by a 720-ray skyline. The 7.63 MB compressed preview comes from a checksum-verified original NASA product, with reproducible derivation and checksums in `data/terrain/preview.json`. It is a coarse ~3.79 km grid, not an image-brightness height estimate. Detailed source rasters continue to be read in bounded NASA HTTP ranges and shared cache blocks. Exact poles share one preview height.

Full horizons now refine the three strongest local peaks per mast along each bearing. The prepared IM-1, IM-2 and Shackleton masks were refreshed. Coordinate jobs remain deduplicated; client quality ordering prevents a delayed preview or retry from replacing a detailed result. Sun/Earth requests refresh when the observer elevation changes during refinement. Landing travel remains disabled until detailed terrain is ready.

| Measurement | Result | Scope |
| --- | --- | --- |
| Old hosted preview | 28.04 s ready; 65.18 ms warm | Actual Render service, previous commit `dae8170`; existing raster caches retained. |
| New local first preview | 0.836 s ready; 6.06 ms warm | New coordinate, bundled numerical preview; worker calculation 0.160 s. Includes polling until a real HTTP 200 result; HTTP 202 was not treated as ready. |
| New hosted first preview | 2.596 s ready; 71.64 ms warm | Actual Render service, release `4ac439d`, fresh coordinate; 72 rays / 3.79 km preview. Worker calculation 0.594 s; existing service/raster caches retained. |

These compare the application's first preview tiers, not equal-resolution horizons. Detailed 20 m/regional 5 m results take longer and stay explicitly labelled while refining.

An independent validator uses the GDAL PDS reader, PROJ georeferencing, independently implemented bilinear sampling and Cartesian local-frame geometry. It imports no production projection, sampler, geodesic or skyline helpers. It checks the PDS label and original source checksum, the Mean Earth/Polar Axis frame, the 1,737,400 m radius datum, matched observer elevation and a 2 m mast. Each profile has 720 azimuths and a 150 km range. Its denser radial sampling additionally refines eight local peaks per direction.

| Site | Latitude / longitude | P95 absolute difference | Maximum absolute difference |
| --- | --- | --- | --- |
| Shackleton | −89.67°, 129.78° | 0.01393° | 0.04528° |
| Custom east | −89.0°, 120.0° | 0.02417° | 0.08082° |
| Custom west | −88.8°, −30.0° | 0.02204° | 0.05320° |

All three pass the predeclared 0.1° review trigger. This is independent implementation validation on the same 20 m NASA dataset. It is not a different elevation dataset or direct QuickMap skyline certification, and it does not validate every coordinate or regional 5 m product. The original failing/coarser reference result remains in `terrain-horizon-independent-baseline.json`; the current report records its refined reference sampling explicitly.

## Rocky

The original request failed because Nemotron emitted `compare_sites` as a client action and guessed catalogue IDs. A second failure involved valid dates/site names adjacent to sentence punctuation. Explicit comparisons with known sites, a selected stay and an unambiguous date now run the actual science tool before provider prose. Both sites receive scoped evidence. Exact verified date/name variants are repaired without admitting new numbers. Comparisons do not change settings when the request is explanatory.

The live Nemotron acceptance request compares Apollo 12 and IM-1 for one day beginning 20 November 2026 at 00:00 UTC. The latest run passed with 13 facts, both sites' calculated sunlight/Earth-visibility hours, and no actions. A separate live app-help request must name `Plan landing` and `Add to comparison`, and cannot invent a `Run comparison` button. A fixture acceptance test also checks two genuinely different outcomes (zero versus 24 hours), so equal live totals cannot conceal a one-site implementation.

The release is verified at [the hosted app](https://lu-see.onrender.com/). Its HTML references the locally built frontend assets, and fetched JavaScript/CSS SHA256 hashes match the local production build. The hosted comparison endpoint passed in 6.49 s with Nemotron and site-scoped calculated facts; hosted help passed in 0.80 s with the exact control names. Both returned HTTP 200 and no actions. The science browser workflow also passed on the deployed app, including exports and desktop/phone/keyboard checks. Deployment-dashboard access became unavailable during final verification, so these results establish public workload behavior and asset identity rather than a claimed final dashboard status. Evidence: `render-release-verification-2026-11-15.json`, `render-terrain-preview-2026-11-15.json`, and `render-lunar-science-browser-2026-11-15.json` under `data/validation/`.

## Verification and remaining work

- 66 JavaScript tests and 20 Python tests passed; TypeScript and the production build passed. Build size warnings remain for the existing large 3D chunks.
- The science browser workflow passed with real NASA data: two-site comparison, Plain/Engineer consistency, JSON/CSV exports, total eclipse zero direct power, live-clock changes preserving pinned plans, planner focus entry/tab wrap/Escape/focus restoration, and phone details opening/closing without document overflow.
- Desktop and 390 px phone captures were inspected. The science workflow excludes Rocky's GLB renderer; model motion has its own browser suite. Historical screenshot timeout evidence is retained in `eclipse-browser-legacy-failure.json`.
- Physical-phone and actual screen-reader checks remain outstanding. Broader camera/model visual checks and regional 5 m/independent-dataset skyline comparisons remain in TODO.md.

## Reproduction

Use `npm test`, the Python unittest discovery command, and `npm run build`. Start the app, set `BASE_URL` if it differs from `http://127.0.0.1:5175`, then run `npm run test:lunar-science-browser`. Set `CAPTURE_UI=1` for screenshots. `npm run test:eclipse-browser` is a compatible entrypoint to the same science workflow; `npm run test:rocky-motion-browser` remains separate.

Run `npm run test:assistant-live` with the locally configured provider environment. Set `ASSISTANT_CASE=help` for the app-help check. No credentials are written into result files. Run `npm run bench:terrain` with `BASE_URL`, `TERRAIN_QUALITY`, `TERRAIN_LAT`, `TERRAIN_LON` and optional `TERRAIN_REPORT`; use a new coordinate for a first-result measurement. Existing service/raster caches are retained unless a report explicitly says otherwise.

Independent skyline validation needs `requirements-validation.txt` and the original PDS label/raster, normally found in the sibling `lunar-scout/data/raw` folder. `LUNAR_TERRAIN_DATA_DIR` can point elsewhere. Run `npm run test:horizon-independent`. Production does not need Rasterio or the planet-wide rasters. `prepare_terrain_preview.py` and `refine_prepared_horizons.py` reproduce the derived data from the verified originals.

References: [GDAL PDS reader](https://gdal.org/en/stable/drivers/raster/pds.html), [NASA polar PDS label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_20m.lbl). Original challenge assessment: [CHALLENGE_EVALUATION.md](CHALLENGE_EVALUATION.md).
