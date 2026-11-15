# Next work

## Priorities from the challenge evaluation — 15 November 2026

- [x] Current UX pass: smaller header, short panel/chat/dialog transitions, control feedback, and reduced-motion support.
- [x] Rocky replies: one speech block, no secondary exposition, and consistent Question/Statement endings.
- [x] Use AMAZE-X in exported report branding and the design document.
- [ ] **P1 — New-coordinate latency:** reduce the measured 48-second preview wait; show useful coarse terrain promptly, refine progressively, reuse nearby DEM reads, and benchmark cold/warm requests on Render. Do not count pending HTTP 202 as a finished result.
- [ ] **P1 — Rocky numerical assistance:** reproduce the failed Apollo 12/IM-1 live comparison, identify provider/tool/grounding failures, and require evidence from both sites in an acceptance check. Make app-help instructions match actual control labels.
- [ ] **P1 — Independent polar skylines:** compare azimuth-by-azimuth horizon profiles at multiple south-polar/custom sites against QuickMap or an independent DEM calculation with matched lunar frame, datum and mast height. Record resolution and errors separately from SPICE direction checks.
- [ ] **P2 — Browser coverage:** repair the legacy eclipse screenshot/selector failure; separate scientific workflow checks from heavy Rocky visual checks. Complete keyboard, screen-reader, real-phone and visual regression checks.
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
