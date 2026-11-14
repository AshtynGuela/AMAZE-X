"""Sample local PDS LOLA elevation grids for a coordinate and its skyline."""
import json
import os
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RADIUS = 1737400.0
MASTS = (0, 2, 5, 10)
DISTANCES = np.r_[np.arange(20, 2000, 20), np.arange(2000, 20000, 100),
                  np.arange(20000, 150001, 500)]
BEARINGS = np.radians(np.arange(720) / 2)[:, None]


def polar_pixels(latitude, longitude, shape, north=False):
    sign = 1 if north else -1
    rho = 2 * RADIUS * np.tan(np.pi / 4 - sign * np.radians(latitude) / 2)
    x = shape[1] / 2 - .5 + rho * np.sin(np.radians(longitude)) / 20
    y = shape[0] / 2 - .5 + sign * rho * np.cos(np.radians(longitude)) / 20
    return x, y


def skyline(ray_height, distances, height, mast):
    theta = distances / RADIUS
    return np.degrees(np.arctan2((RADIUS + ray_height) * np.cos(theta) - RADIUS - height - mast,
                                (RADIUS + ray_height) * np.sin(theta)))


def read_grid(source):
    rows, cols = source["rows"], source["cols"]
    file = ROOT / "data/raw" / (source["product"] + ".img")
    if os.environ.get("LUNAR_TERRAIN_MODE") != "remote" and file.is_file() and file.stat().st_size == rows * cols * 2:
        return np.memmap(file, dtype="<i2", mode="r", shape=(rows, cols))
    if os.environ.get("LUNAR_TERRAIN_MODE") == "local":
        raise FileNotFoundError(source["product"])
    from remote_dem import RemoteGrid
    source["access"] = "NASA HTTP byte ranges with bounded local block cache"
    source["integrity"] = "Offsets, lengths and dataset ETag checked; SHA256 is the previously verified whole-product reference"
    return RemoteGrid(source)


def bilinear(grid, x, y, wrap=False):
    y = np.clip(y, 0, grid.shape[0] - 1)
    x = np.mod(x, grid.shape[1]) if wrap else np.clip(x, 0, grid.shape[1] - 1)
    a, b = x.astype(int), y.astype(int)
    next_x = (a + 1) % grid.shape[1] if wrap else np.minimum(a + 1, grid.shape[1] - 1)
    next_y = np.minimum(b + 1, grid.shape[0] - 1)
    u, v = x - a, y - b
    if hasattr(grid, "corners"):
        tl, tr, bl, br = grid.corners(a, b, next_x, next_y)
        return (1-v)*((1-u)*tl+u*tr)+v*((1-u)*bl+u*br)
    return ((1-v)*((1-u)*grid[b, a] + u*grid[b, next_x])
            + v*((1-u)*grid[next_y, a] + u*grid[next_y, next_x]))


def forward(lat, lon, az, distance):
    phi, lam = np.radians([lat, lon])
    theta = distance / RADIUS
    # Rotate in the local east/north basis to handle the exact poles too.
    x = np.cos(phi) * np.cos(theta) - np.sin(phi) * np.sin(theta) * np.cos(az)
    y = np.sin(theta) * np.sin(az)
    z = np.sin(phi) * np.cos(theta) + np.cos(phi) * np.sin(theta) * np.cos(az)
    return np.degrees(np.arctan2(z, np.hypot(x, y))), np.degrees(lam + np.arctan2(y, x)) % 360


def elevation_sampler(lat, source_records=None, detailed=True):
    if source_records is None:
        source_records = json.loads((ROOT / "public/data/manifest.json").read_text())["products"]
    products = {p["product"]: p for p in source_records}
    global_source = products["ldem_128"]
    global_dem = read_grid(global_source)
    polar_name = "ldem_80n_20m" if lat >= 0 else "ldem_80s_20m"
    polar_source = products.get(polar_name)
    regional_manifest = ROOT / "data/raw/lola-regional-site04.json"
    if not regional_manifest.is_file():
        regional_manifest = ROOT / "data/terrain-regional.json"
    regional = []
    if detailed and lat <= -84 and regional_manifest.is_file():
        for source in json.loads(regional_manifest.read_text()):
            file = ROOT / "data/raw" / (source["product"] + ".f32")
            shape = source["rows"], source["cols"]
            if file.is_file() and file.stat().st_size == shape[0] * shape[1] * 4:
                regional.append([source, np.memmap(file, dtype="<f4", mode="r", shape=shape)])
                products[source["product"]] = source
            elif os.environ.get("LUNAR_TERRAIN_MODE") != "local":
                # Load only when an actual elevation query intersects coverage.
                regional.append([source, None])
                products[source["product"]] = source
    polar_dem = None
    if detailed and polar_source and abs(lat) >= 80 - np.degrees(DISTANCES[-1] / RADIUS):
        try:
            polar_dem = read_grid(polar_source)
        except FileNotFoundError:
            pass
    used = set()

    def elevation(latitude, longitude):
        latitude, longitude = np.broadcast_arrays(latitude, longitude)
        values = np.empty(latitude.shape)
        polar = np.zeros(latitude.shape, dtype=bool)
        if polar_dem is not None:
            px, py = polar_pixels(latitude, longitude, polar_dem.shape, north=lat >= 0)
            polar = ((np.abs(latitude) >= 80) & (px >= 0) & (px < polar_dem.shape[1] - 1)
                     & (py >= 0) & (py < polar_dem.shape[0] - 1))
            if polar.any():
                sample = bilinear(polar_dem, px[polar], py[polar]) * polar_source["scale"]
                values[polar] = sample
                if np.any(sample < -12000):
                    polar[polar] = sample >= -12000
                if polar.any():
                    used.add(polar_name)
        if (~polar).any():
            x = (longitude[~polar] % 360) * global_dem.shape[1] / 360 - .5
            y = (90 - latitude[~polar]) * global_dem.shape[0] / 180 - .5
            values[~polar] = bilinear(global_dem, x, y, wrap=True) * global_source["scale"]
            used.add("ldem_128")
        if regional:
            rho = 2 * RADIUS * np.tan(np.pi / 4 + np.radians(latitude) / 2)
            east = rho * np.sin(np.radians(longitude))
            north = rho * np.cos(np.radians(longitude))
            for entry in regional:
                source, grid = entry
                rows, cols = source["rows"], source["cols"]
                step = source["mapScaleM"]
                x = (east - source["westM"]) / step - .5
                y = (source["northM"] - north) / step - .5
                inside = (x >= 0) & (y >= 0) & (x < cols-1) & (y < rows-1)
                if not inside.any():
                    continue
                if grid is None:
                    from remote_dem import regional_grid
                    grid = entry[1] = regional_grid(source)
                sample = bilinear(grid, x[inside], y[inside])
                finite = np.isfinite(sample) & (np.abs(sample) < 12000)
                # Taper over 200 m to avoid introducing an artificial rim
                # where independently adjusted elevation products meet.
                edge = np.minimum(np.minimum(x[inside], y[inside]),
                    np.minimum(grid.shape[1]-1-x[inside], grid.shape[0]-1-y[inside]))
                weight = np.clip(edge * step / 200, 0, 1)
                current = values[inside]
                current[finite] += weight[finite] * (sample[finite] - current[finite])
                values[inside] = current
                if finite.any():
                    used.add(source["product"])
        return values

    return elevation, used, products


def terrain_at(lat, lon, source_records=None, quality="full"):
    started = time.monotonic()
    elevation, used, products = elevation_sampler(lat, source_records)
    height = round(float(elevation(lat, lon)), 3)
    resolution = min(products[p]["mapScaleM"] for p in used)
    distances = np.r_[np.arange(5, 500, 5), DISTANCES] if resolution < 20 else DISTANCES
    if quality == "quick":
        distances = np.r_[np.arange(100, 2000, 100), np.arange(2000, 20000, 500), np.arange(20000, 150001, 2000)]
    distances = np.unique(distances)
    bearings = np.radians(np.arange(180) * 2)[:, None] if quality == "quick" else BEARINGS
    ray_lat, ray_lon = forward(lat, lon, bearings, distances[None, :])
    ray_height = elevation(ray_lat, ray_lon)
    masks, obstructions = {}, {}
    for mast in MASTS:
        angles = skyline(ray_height, distances, height, mast)
        peak = angles.argmax(axis=1)
        ray = np.arange(len(peak))
        masks[str(mast)] = angles[ray, peak].round(5).tolist()
        obstructions[str(mast)] = {
            "distanceM": distances[peak].tolist(),
            "elevationM": ray_height[ray, peak].round(2).tolist(),
        }

    # The surface mesh uses the same DEM and curved local coordinates.
    size, width = (257, 1280) if resolution < 20 else (257 if resolution == 20 else 129, 12000)
    if quality == "quick":
        size = 65
    axis = np.linspace(-width / 2, width / 2, size)
    east, north = np.meshgrid(axis, axis)
    tile = elevation(*forward(lat, lon, np.arctan2(east, north), np.hypot(east, north)))
    return {
        "lat": lat, "lon": lon, "elevationM": height, "resolutionM": resolution,
        "azStepDeg": 2 if quality == "quick" else 0.5, "quality": quality, "masks": masks, "obstructions": obstructions,
        "sources": [p for name, p in products.items() if name in used],
        "maxDistanceM": int(distances[-1]),
        "distanceStepsM": [100, 500, 2000] if quality == "quick" else [5, 20, 100, 500] if resolution < 20 else [20, 100, 500],
        "frame": "Mean Earth / Polar Axis",
        "calculationSeconds": round(time.monotonic() - started, 3),
        "note": "Bilinear PDS LOLA heights with lunar curvature to 150 km. " + ("Preliminary 2 degree / sparse-distance screening; narrow ridges can be missed. Detailed evaluation follows." if quality == "quick" else "Detailed skyline sampled at 0.5 degree bearings."),
        "tile": {"size": size, "widthM": width, "heightsM": tile.round(2).ravel().tolist()},
    }


if __name__ == "__main__":
    import sys
    print(json.dumps(terrain_at(float(sys.argv[1]), float(sys.argv[2]), quality=sys.argv[3] if len(sys.argv) > 3 else "full"),
                     separators=(",", ":"), allow_nan=False))
