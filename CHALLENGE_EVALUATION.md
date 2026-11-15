# AMAZE-X — challenge evaluation

Follow-up implementation and newer measurements are recorded in [UX_AND_SCIENCE_UPDATE.md](UX_AND_SCIENCE_UPDATE.md). The findings below preserve the original evaluation run.

Evaluated 15 November 2026 against the [official Lunar Landing Site Navigator details](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=details), last published 13 November 2026. Local production build, revision `8dbce6998e51b0369ac20bdec652d62e26e5ccdd`. This assessment changes documentation and test evidence only; it does not fix, push, or deploy application code.

## Overall assessment

**AMAZE-X substantially covers the challenge's core screening workflows.** Its strongest evidence is real NASA/JPL ephemeris use, independent SPICE direction validation, scenario comparison, and working landing-window search. It is a credible prototype for explaining and comparing lunar conditions. Rapid evaluation at new coordinates, independently verified terrain skylines, and reliable AI calculations remain incomplete.

The challenge lists seven suggested objectives using “may include”; its potential considerations are explicitly optional. The statuses below assess demonstrated coverage, not invented mandatory acceptance requirements. No official weighted score is assigned.

## Coverage of the challenge objectives

| Suggested objective | Assessment | Evidence and remaining limit |
| --- | --- | --- |
| Select and compare lunar sites | Strong coverage | Curated Apollo, CLPS and international sites, custom coordinates, comparison scenarios, nearby alternatives. A fresh two-site browser comparison produced a numerical trade-off sentence. Nearby ranking samples eight radial alternatives and up to two catalogue neighbours; it is not an exhaustive regional search. |
| Explore dates and times | Strong coverage | Editable UTC clock, pinned mission dates, duration controls, historical and future ephemerides. Changing the clock from eclipse to daylight preserved a pinned mission's calculated metrics. |
| Show Sun/Earth against the horizon | Covered, terrain validation partial | Airless topocentric directions, horizon views and event calculations exist. Independent SPICE validation passed for directions. That does not independently validate each terrain skyline or the appearance of the 3D surface. |
| Assess power and communication | Strong screening coverage | Sunlight/contact percentages, darkness intervals, solar elevation and power index, scenario summaries and exports. Power is an idealized index, not electrical energy or a battery/thermal model. Direct contact uses Earth-centre geometry and an antenna-angle threshold, not a station link budget. |
| Offer spatial visualizations | Covered | Moon globe, site markers, terrain tiles and surface/horizon views. Numeric polar checks passed. Photorealism, imagery alignment everywhere and visual equivalence to QuickMap were not certified by this run. |
| Show temporal dynamics | Covered | Timeline, playback, events and date search. The next-window workflow extended an empty range and saved a matching mission on a phone-sized viewport. Hourly candidate sampling and ten-minute integration can miss short grazing windows. |
| Serve specialists and non-specialists | Partial | Plain/Engineer modes preserve numerical readings; comparison explanations work; tested phone layouts had no horizontal document overflow. No user study, screen-reader audit, complete keyboard audit or physical-phone performance test was performed. Overflow tests alone do not prove legibility. |

## Tests performed

| Check | Result | Measured evidence |
| --- | --- | --- |
| JavaScript suite, `npm test` | Pass | 61/61, no failures or skips. |
| Python suite, `python -m unittest discover -s tests -p 'test_*.py'` | Pass | 18/18. |
| Production build, `npm run build` | Pass with size warning | 37.36 seconds. LunarGlobe chunk 4,259.32 kB minified / 1,145.48 kB gzip; precompression generated for 103 assets. |
| Independent SPICE, `validate-spice.mjs` | Pass | 216 Sun/Earth directions across nine historical/future site/date cases. Maximum discrepancy 0.000202122 degrees (about 0.73 arcseconds), below 0.005-degree tolerance. |
| Direct Horizons interpolation, `validate-live.mjs` | Pass | 824 off-grid directions; maximum discrepancy 0.00000202145 degrees. This is same-provider interpolation validation, separate from SPICE independence. |
| Prepared terrain, `validate-terrain.py` | Pass | 14 sites: finite masks/tiles, 720 rays, mast-height monotonicity, obstruction reconstruction and analytical flat-sphere limb test. Three height references passed their configured tolerances. |
| Polar terrain API, `validate-polar-topography.mjs` | Pass | Both poles constant across longitude, shared tile-edge height discrepancy 0 m, real 20 m northern/20 m and regional 5 m southern sources. Quick/full profile reconstruction passed. |
| Eclipse, `validate-eclipse.mjs` | Pass | Apollo 11 at 2025-03-14 07:00 UTC: total eclipse and zero direct power; outside-event checks passed. This is not precise contact-time validation. |
| Planet vector interpolation, `validate-solar.mjs` | Pass | Eight planets, maximum error 0.07377 km against direct Horizons; same-provider comparison. |
| Next-window browser workflow | Pass | Real NASA data, empty initial range, extension to next match, earliest/best selection, mobile save and retained mission limits. Earliest saved arrival 2025-04-03 06:00 UTC for a three-day stay. |
| Targeted comparison/export/clock browser workflow | Pass | Two loaded site scenarios, numerical trade-off sentence, JSON/CSV scientific assertions, zero direct power in eclipse, live-clock changes preserving pinned mission metrics, no horizontal overflow at 390 px, no unexpected page errors. |
| Legacy eclipse browser script | Incomplete | Timed out on a screenshot after downloads. Its later date selector also uses obsolete wording. Assertions on the downloaded data were subsequently run successfully in the targeted workflow. The original end-to-end script remains failing; a full visual regression pass was not completed. |
| Live Rocky app-help request | Partial | Nemotron/OpenRouter returned HTTP 200 in 1.69 seconds. Its instructions referred generically to running a comparison rather than accurately walking through the current scenario controls. Availability passed; guidance precision needs work. |
| Live Rocky calculated comparison | Fail | Asked for Apollo 12 vs IM-1, one-day stay starting 2026-11-20 UTC. HTTP 502 in 2.73 seconds: evidence-backed answer could not be produced. The failure was surfaced instead of presenting unsupported numbers. |

Browser scope: local production server, headless Chromium using SwiftShader. Scientific workflow tests excluded Rocky's GLB rendering to isolate the workflows and avoid the full mesh's software-rendering cost. The separate legacy run with rendering enabled timed out on a screenshot; that does not by itself prove a GPU performance defect. Rocky animation quality, complete mobile usability and deployed Render performance were not validated here.

SPICE used CSPICE N0067, DE440s, MOON_ME and CN+S versus the app's interpolated Horizons DE441 airless observer tables, with matching LOLA observer height and mast. Kernel URLs and checksums are recorded in the evidence. This establishes direction agreement within the stated sample, not independent terrain, photometry or mission-system certification.

## Measured rapid-evaluation performance

A genuinely new result-cache coordinate at **89.81321 N, 41.23765 E** took **48.44 seconds** from first request until a 180-ray preview was ready. The server correctly returned pending HTTP 202 while computing, then HTTP 200. Repeating the ready request took **11.11 ms**. Its worker reported 47.018 seconds of calculation.

Existing NASA raster/block caches were retained, and other browser checks were running. This is a new-coordinate benchmark, **not** an empty-cache NASA network benchmark or a production load test. Cached polar tile/profile responses were approximately 16–125 ms. A previously cached full profile records a 277.949-second calculation, but that cold calculation was not timed again in this run. Fast cached responses must not be presented as first-use latency.

## Prioritized problems

1. **New-coordinate latency conflicts with rapid comparison.** Prioritize a visibly useful coarse preview, progressively refine rays, reuse nearby elevation samples, deduplicate work and benchmark on the actual Render instance. Keep preview/full resolution explicit. Target measured time-to-first-useful-result, not HTTP 202 response time.
2. **Rocky's numerical comparison path failed live.** Reproduce the saved request, inspect server-side tool/provider failures without exposing secrets, and add a repeatable acceptance case that requires calculated evidence from both sites. Improve app-help steps to match the actual controls. Passing provider connectivity and unit tests is insufficient.
3. **Independent terrain-horizon accuracy remains unproven.** Compare skyline elevation by azimuth at multiple south-polar/custom sites against an independently generated QuickMap or equivalent profile using matched coordinates, lunar frame, vertical datum and observer height. Record terrain resolution and error statistics. Tile continuity and SPICE directions do not establish correct polar obstructions.
4. **Browser regression coverage needs repair.** Update stale selectors and separate scientific workflows from heavy-model visual checks. Complete visual, keyboard and physical-phone checks. Preserve the recorded legacy failure rather than counting a partial run as a pass.
5. **Presentation and onboarding need tighter challenge focus.** Large lazy-loaded 3D assets remain a loading risk. Measure cold mobile/deployed loading; make lunar comparison easy to reach after the cinematic. Validate that solar elevation, darkness duration and contact windows can be understood by a first-time user. Review idle assistant wording for an educational demo.
6. **Export branding is stale.** Downloaded JSON still identifies the application as `Very Best Lunar Site Scouter`, while the interface uses AMAZE-X. Update the report application label in a separate fix.

Historical flight-duration offsets are useful context but are not physical transfer optimization. Other planets, a full transfer solver and an exhaustive local search grid are not mandatory requirements in this challenge statement; they should not displace work on fast, understandable lunar comparisons.

## Qualitative judging lens

The [official 2026 Ajmer event page](https://www.spaceappschallenge.org/2026/local-events/ajmer/) lists Impact, Creativity, Validity, Relevance and Presentation. These are used here as a supplementary lens, without assumed weights or an official judge's score.

| Lens | Assessment |
| --- | --- |
| Impact | Promising: alternate dates/sites and plain-language trade-offs address real schedule-slip decisions. End-user evidence and new-site speed remain gaps. |
| Creativity | Strong concept: interactive exploration, horizon geometry, constrained date search and an animated assistant. The assistant must reliably improve the task, not merely add visual novelty. |
| Validity | Strong ephemeris evidence and traceable NASA inputs; partial terrain validation. Polar skylines and narrow-window completeness need further independent checks. |
| Relevance | Strong: lunar illumination, horizon obstruction, contact and comparison directly address the brief. Keep wider Solar System exploration secondary in the demonstration. |
| Presentation | Promising but not fully validated: numerical comparison explanation works; first-load waiting, assistant failure, mobile legibility and visual regressions still need attention. |

## Evidence and reproducibility

Compact results and fresh-run provenance are saved in `data/validation/challenge-evaluation-2026-11-15.json`. Detailed run logs, the retrieved official statement, temporary current-UI browser harness, exports and benchmarks are under `.cache/challenge-evaluation/` (ignored by Git). Existing validator reports in `data/validation/` are separate artifacts; consult their timestamps before assuming they belong to this run.

Run the JavaScript/Python suites and build with the commands above; run each scientific validator individually. The temporary browser harnesses target local port 5242 and require a production server. API-based checks require external NASA connectivity; live assistant checks additionally require locally configured provider credentials. No credentials are included in this report or its evidence file.
