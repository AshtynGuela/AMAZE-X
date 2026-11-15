# AMAZE-X — challenge reassessment

Assessed 15 November 2026 against the complete Lunar Landing Site Navigator brief supplied by the user. Local revision: `c5c655c`. This report updates the assessment; it does not replace the historical findings in [CHALLENGE_EVALUATION.md](CHALLENGE_EVALUATION.md), change application behavior, or deploy anything.

## Verdict

**AMAZE-X is a strong match for the challenge and demonstrates its central workflow: comparing lunar landing sites and dates using calculated sunlight and direct-to-Earth visibility.** Its remaining weakness is making that workflow consistently fast, easy to discover, and clear about the difference between a preliminary result and a detailed terrain result. Scientific validation has improved substantially since the original assessment, but does not establish accuracy at every coordinate.

The seven objectives are suggestions, and the brief explicitly makes the potential considerations optional. This is an evidence-based assessment, not an official judging score. Solar System exploration, cinematic entry, Rocky, physical transfer optimization, battery simulation, and exhaustive regional searches are not prerequisites for satisfying this challenge.

## Coverage

| Suggested objective | Current assessment | Evidence and practical limit |
| --- | --- | --- |
| Interactive site selection and comparison | Strong | Curated Apollo, CLPS and international sites; custom coordinates and globe picking; up to four scenarios; numerical trade-off sentences and nearby ranking. Nearby ranking samples a bounded set of alternatives, rather than proving the best location across a region. |
| Date and time flexibility | Strong | Editable UTC dates, historical/future coverage from 1969 through 2040, duration and mission limits, landing-window search, and continuation beyond an empty initial range. Historical flight durations provide estimates, not an optimized physical transfer solution; the latter is outside the challenge's core requirement. |
| Sun and Earth relative to the horizon | Strong, with bounded terrain validation | Airless topocentric positions, terrain horizons, surface views, and sunset/Earthset information. Independent SPICE checks support the celestial directions; independent terrain implementation checks now support three south-polar profiles. These validate different parts of the calculation. |
| Power and communication assessment | Strong for preliminary planning | Sunlight/contact duration, longest darkness, solar elevation, a relative solar power index, and mission-limit evaluation. The index is not electrical energy; Earth visibility and the antenna-angle threshold do not constitute a station-specific radio link budget. Numerical solar elevation is less prominent in Plain mode because it is inside the sky-position disclosure. |
| Multiple spatial views | Strong coverage | Lunar globe, site markers, polar terrain, close-ups and horizon views, alongside Earth–Moon context. Rendering coverage does not prove photorealism, imagery alignment everywhere, or that imagery's baked-in illumination matches the selected time. |
| Temporal dynamics | Strong | Clock playback, timelines, operational events, alternative-date search and saved mission dates. Hourly arrival candidates and ten-minute mission integration may miss short grazing windows; results are sampled opportunities rather than a continuous optimum. |
| Accessibility across skill levels | Partial | Plain/Engineer modes, practical labels, comparative sentences and tested planner keyboard behavior help. First-time comprehension, screen-reader use and physical-phone usability remain unproven. Camera controls, icon navigation, and reaching lunar comparison after the cinematic warrant novice testing. |

## Verification and changes since the earlier assessment

Fresh checks in this reassessment:

- **JavaScript: 69/69 tests passed**, no skips or failures (`npm test`).
- **Python: 20/20 tests passed** (`python -m unittest discover -s tests -p 'test_*.py'`).
- **Hosted health endpoint: HTTP 200**, reporting AMAZE-X ready with NASA terrain access. Health does not itself verify an end-to-end scientific result or provider availability.
- Reviewed current UI conditions, planner quality handling, calculation interfaces, TODOs, and the recorded evidence below. No new production build, full browser sweep, SPICE calculation, terrain benchmark or live AI request was run in this reassessment.

Recorded evidence reviewed, rather than newly executed here:

| Evidence | Result | Boundary |
| --- | --- | --- |
| Independent SPICE directions | 216 directions across nine site/date cases; maximum discrepancy **0.000202122°**, about **0.73 arcseconds**. | Supports Sun/Earth direction calculations, not terrain obstruction accuracy. See `data/validation/spice.json` and the original evaluation. |
| Independent terrain implementation, 15 November | **2,160 azimuths**, Shackleton plus two custom south-polar sites. Maximum discrepancies **0.0453°, 0.0808°, 0.0532°**; all below the predeclared 0.1° review trigger. | Independent GDAL/PROJ/Cartesian implementation using the **same NASA 20 m elevation source**. Not independent DEM or direct QuickMap validation; not a guaranteed error bound. See `data/validation/terrain-horizon-independent.json`. |
| Render preview benchmark, 15 November | New coordinate's first useful preview **2.60 s**; repeated result **72 ms**. Earlier run was 28.04 s. | The newer preview is much coarser: **72 bearings, approximately 3.79 km grid**. Existing service/raster caches retained. This is not an equal-resolution speedup or a cold full-detail benchmark. See `data/validation/render-terrain-preview-2026-11-15.json`. |
| Hosted Rocky acceptance, 15 November | Previously failing Apollo 12/IM-1 comparison passed with numerical evidence from both sites, about **6.49 s**. App-help steps also passed. | One saved live comparison and a separate distinguishing regression fixture do not prove every assistant tool or multi-step request. See `data/validation/render-release-verification-2026-11-15.json`. |
| Hosted science browser workflow, 15 November | Two-site comparison, scientific JSON/CSV assertions, eclipse power, pinned dates, planner focus/Tab/Escape restoration and 390 px inspector checks passed. | Rocky mesh rendering excluded; no physical-phone test. Earlier legacy failure remains preserved separately. See `data/validation/render-lunar-science-browser-2026-11-15.json`. |
| Latest entry cutscene, 15 November | Saved checks cover automatic entry, click entry, control restoration and reduced-motion bypass; hosted assets match release `1872f2b`. | This is separate from the earlier science browser run, not a complete rerun of every workflow on that release. See `data/validation/entry-cutscene-browser.json` and `entry-cutscene-hosted.json`. |

The previous conclusions that Rocky's numerical path failed, independent terrain implementation validation was absent, and the replacement science browser workflow was incomplete are therefore outdated for the specific cases now recorded as passing. Their broader validation limits still matter.

## Prioritized remaining problems

1. **Make preliminary mission verdicts unmistakable.** In `src/App.tsx`, the mission verdict checks that terrain exists, without requiring `terrain.quality` to be full. Consequently, a coarse preview can produce the unqualified sentence “Meets your sunlight, darkness and contact limits.” The top quality badge does identify refinement, and Travel & land is correctly restricted to detailed terrain, but the verdict itself can still mislead. The sources explanation also treats `preview` as detailed because it only branches on `quick`. Use consistent preliminary wording on verdicts, comparisons and source summaries, then refresh them when detailed terrain arrives.
2. **Put the challenge's answers first.** Make the route to Moon → site → date → comparison easy to discover. Present sunlight hours, usable contact hours, longest darkness, solar elevation and next sunset/Earthset together, with a one-sentence trade-off. The Solar System and cinematic are engaging, but additional browsing does not improve rapid scenario comparison by itself. Test the actual steps with first-time users before changing established entry preferences.
3. **Measure detailed-result latency, not just preview delivery.** Benchmark new south-polar/custom sites on Render, including cold service and raster caches, refinement completion, multiple simultaneous scenarios, and a phone connection. Report median/tail latency and distinguish first useful preview from detailed decision-ready results. A 3.79 km grid cannot resolve the small ridges central to polar mission trade-offs.
4. **Extend terrain accuracy evidence.** Add matched-coordinate, matched-frame, matched-datum and matched-mast reference profiles using regional 5 m products and a separate dataset or independently obtained QuickMap profiles. Include ridge/crater-edge cases and near-horizon contact times. Three independently implemented profiles are meaningful progress, not Moon-wide certification.
5. **Complete human and device validation.** Test real phones, screen readers, full keyboard/camera navigation, visual contrast and understanding of preview/detail states. Ask a novice to compare two sites and find an alternative date after a delay; measure completion time and interpretation accuracy. Keep science workflows separate from heavy-model visual checks and retain the historical failed run.

## Recommended challenge demonstration

Use two nearby south-polar sites with different terrain horizons. Keep mission duration and limits identical; show the difference in sunlight, contact and darkness in hours. Move the landing date to represent a schedule delay, search for the next acceptable option, and inspect the Sun/Earth against each local horizon. Finish with the comparison export and a short explanation of why a small change in location or date changes the result. This demonstrates the challenge's purpose more directly than a general Solar System tour.

**Conclusion:** feature coverage is already strong. The most valuable next work is clearer preliminary results, faster detailed comparisons, broader terrain validation and demonstrated usability rather than additional scope.
