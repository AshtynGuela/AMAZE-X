"""Numeric NASA LOLA patches, with no cylindrical displacement at the poles."""
import json
import sys
import numpy as np
from lunar_terrain import elevation_sampler, forward, bilinear, ROOT


def local_patch(lat, lon, width=12000, size=129):
    elevation, used, products = elevation_sampler(lat)
    axis = np.linspace(-width / 2, width / 2, size)
    east, north = np.meshgrid(axis, axis)
    heights = elevation(*forward(lat, lon, np.arctan2(east, north), np.hypot(east, north)))
    return checked_patch(heights, used, products, size=size, widthM=width)


def checked_patch(heights, used, products, **metadata):
    if np.any(~np.isfinite(heights) | (np.abs(heights) > 12000)):
        raise ValueError("NASA elevation patch contains invalid heights")
    return {**metadata, "heightsM": heights.round(3).ravel().tolist(),
            "resolutionM": min(products[name]["mapScaleM"] for name in used),
            "sources": [products[name] for name in sorted(used)],
            "referenceRadiusM": 1737400, "frame": "Mean Earth / Polar Axis"}


def map_patch(level, x, y, size=65):
    if not (0 <= level <= 14 and 0 <= x < 2 ** (level + 1) and 0 <= y < 2 ** level):
        raise ValueError("Invalid geographic terrain tile")
    step = 180 / 2 ** level
    west, north = -180 + x * step, 90 - y * step
    longitude, latitude = np.meshgrid(np.linspace(west, west + step, size), np.linspace(north, north - step, size))
    if level <= 6:
        # Losslessly encoded numeric LDEM overview already shipped by the app.
        # Its ~7.6 km spacing is adequate only for early display LOD, never for
        # skyline calculations. This avoids sparse archive requests per globe tile.
        from PIL import Image
        overview = np.asarray(Image.open(ROOT / "public/data/moon-height.png"), dtype=float) / 65535 * 24000 - 12000
        def elevation(lat, lon):
            return bilinear(overview, (np.asarray(lon)+180-1/256)/.25,
                            (90-np.asarray(lat)-1/256)/.25, wrap=True)
        used = {"ldem_128_overview"}
        products = {"ldem_128_overview": {"product": "ldem_128_overview", "mapScaleM": 236.901*32,
                     "source": "/data/moon-height.json", "renderOnly": True}}
    else:
        elevation, used, products = elevation_sampler(north - step / 2, detailed=level >= 7)
    heights = elevation(latitude, longitude)
    # Every longitude meets at exactly one point. Query that point once, so a
    # duplicated pole row cannot become a ring of displaced, competing tips.
    for row in (0, size - 1):
        if abs(latitude[row, 0]) == 90:
            heights[row, :] = elevation(latitude[row, 0], 0)
    return checked_patch(heights, used, products, size=size, bounds=[west, north-step, west+step, north])


if __name__ == "__main__":
    if sys.argv[1] == "map":
        patch = map_patch(*map(int, sys.argv[2:5]))
    else:
        patch = local_patch(*map(float, sys.argv[2:5]))
    print(json.dumps(patch, separators=(",", ":"), allow_nan=False))
