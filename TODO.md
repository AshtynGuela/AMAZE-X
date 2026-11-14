# Next work

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
