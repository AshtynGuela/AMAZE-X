# Next work

## Priorities from the challenge evaluation — 15 November 2026

- [x] **Welcome fade:** scroll up, swipe up or click to fade into the Solar System. Reduced motion opens the map immediately. ENTRY_FLIGHT.md records the earlier spaceship intro.

- [x] Current UX pass: smaller header, short panel/chat/dialog transitions, control feedback, and reduced-motion support.
- [x] Rocky replies: one speech block, no secondary exposition, and consistent Question/Statement endings.
- [x] Use AMAZE-X in exported report branding and the design document.
- [x] **P1 — First useful terrain:** numerical NASA preview, then 72 → 180 → 720 rays. Shared result jobs and NASA block caches reuse work; late replies cannot replace a more detailed horizon. Local first result measured at 0.84 s, separate from HTTP 202 acknowledgement.
- [x] **P1 — Hosted benchmark:** actual Render first preview improved from 28.04 s to 2.60 s; new cached response 72 ms. The new first result is a coarse 72-ray / 3.79 km grid, followed by detailed refinement. The deployed assets match the local build, and hosted Rocky help/comparison plus the science browser workflow pass.
- [x] **P1 — Rocky numerical assistance:** reproduced the invalid calculation-as-action/site-ID failure and strict date-punctuation issue. Server precomputes explicit site comparisons; live Nemotron and fixture acceptance require sunlight and Earth-visibility evidence from both sites. Exact app-help controls are checked separately.
- [x] **P1 — Independent polar skylines:** 2,160 bearings at Shackleton and two custom south-polar points compared with an independent GDAL/PROJ/Cartesian calculation on checksum-verified 20 m NASA PDS data. Peak refinement and refreshed curated polar masks pass a 0.1° review trigger; maximum discrepancy 0.081°.
- [ ] **P1 — Broader terrain validation:** extend reference checks to the regional 5 m products and an independent elevation dataset or direct QuickMap profiles; the completed GDAL check independently validates the implementation on the same NASA source.
- [x] **P2 — Browser regression repair:** current UTC selector, separate science entrypoint and model-motion suite, actual downloads/calculations, desktop/phone visual captures and planner keyboard focus/trap/Escape checks. The original failure remains recorded separately.
- [ ] **P2 — Device accessibility:** physical-phone and actual screen-reader testing, plus broader camera/terrain visual regression coverage. Phone-sized Chromium tests do not replace these.
- [x] **UX — Simpler copy:** remove repetitive disclaimer text; use practical labels for terrain, sensor height, contact and panel direction. Keep preview/detail and unavailable-data states explicit. Phone details reopen at the site heading; planner focus returns to its trigger.
- [ ] **P2 — Loading and comprehension:** measure cold deployed/mobile loading and large 3D chunks; make lunar comparison easy to reach after the introduction; test first-time understanding of elevation, darkness and contact. Review idle Rocky wording for an educational demo.

See [CHALLENGE_EVALUATION.md](CHALLENGE_EVALUATION.md) for measurements and scope. Other planets and physical transfer optimization remain secondary to rapid lunar site/date comparison.

## Horizon View

- Extend native high-resolution imagery coverage beyond the available mosaics; custom-coordinate topography and close-up navigation are implemented.
- Prefer imagery with corrected acquisition lighting when suitable products are available.

## Nearby sites

- Add the dense 500 m grid from the specification with batch elevation reads and horizon evaluation.
- Add the option to map out available sites by itself, with atleast a 50-500 km validation so it doesn't pick a ton of sites
- Validate additional polar sites independently; both caps now use stereographic LOLA height tiles, shared pole vertices, and reprojected NASA polar imagery.

## Validation

- Compare numerical terrain profiles against an independently sampled elevation service or model.
- Expand live assistant evaluations across every app tool and multi-step science request, including Nemotron after its provider quota resets.
