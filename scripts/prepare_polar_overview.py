"""Rebuild the four small, source-derived polar overview tiles shipped by the app."""
from pathlib import Path
from hashlib import sha256
import json
from polar_imagery_tile import polar_image

root = Path(__file__).resolve().parents[1]
folder = root / "public/data/polar-basemap"
folder.mkdir(parents=True, exist_ok=True)
cache = root / ".cache/surface-imagery-v4/tiles"
cache.mkdir(parents=True, exist_ok=True)
assets = []
for north in (True, False):
    name = "north" if north else "south"
    for x in range(2):
        file = folder / f"{name}-0-{x}-0.png"
        polar_image(0, x, 0, cache, cap="NP" if north else "SP").save(file, "PNG", optimize=True)
        assets.append({"file": file.name, "sha256": sha256(file.read_bytes()).hexdigest(),
                       "geographicBounds": [-180 + x*180, 60 if north else -90, x*180, 90 if north else -60]})
(folder / "provenance.json").write_text(json.dumps({
    "source": "https://lroc-tiles.quickmap.io/tiles/wac_nac_nacroi/",
    "projection": "QuickMap orthographic caps reprojected into cap-only geographic root tiles",
    "tileSize": 512, "sourceLevel": 2, "displayOnly": True,
    "scientificElevations": "NASA LOLA independently sampled; these are imagery only", "assets": assets,
}, indent=2) + "\n", encoding="utf-8")
print("Rebuilt the four polar overview tiles from QuickMap source imagery.")
