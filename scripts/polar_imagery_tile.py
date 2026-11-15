"""Reproject QuickMap's orthographic cap imagery into geographic display tiles."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
import quickmap_polar


def sample(*args):
    return quickmap_polar.sample(*args)


def polar_image(level, x, y, folder, cap=None):
    step = 180 / 2 ** level
    size = 512
    longitude, latitude = np.meshgrid(-180 + (x + (np.arange(size)+.5)/size) * step,
                                      (90 if cap != 'SP' else -60) - (y + (np.arange(size)+.5)/size) *
                                      ((30 if cap else 180) / 2 ** level))
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    # A level-zero geographic tile contains both polar caps.
    for north in (True, False):
        if cap and cap != ('NP' if north else 'SP'):
            continue
        inside = latitude >= 60 if north else latitude <= -60
        if inside.any():
            projection = "NP" if north else "SP"
            rgb, coverage = sample(projection, latitude[inside], longitude[inside], folder, min(15, level + 2))
            if not np.any(coverage > .5):
                raise ValueError("QuickMap polar imagery is unavailable")
            rgba[inside, :3] = np.rint(rgb).clip(0, 255).astype(np.uint8)
            edge = np.clip((np.abs(latitude[inside]) - 60) / 5, 0, 1)
            rgba[inside, 3] = np.rint(coverage * edge * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba)


if __name__ == "__main__":
    level, x, y = map(int, sys.argv[1:4])
    folder = Path(sys.argv[5]); folder.mkdir(parents=True, exist_ok=True)
    polar_image(level, x, y, folder, cap=sys.argv[6] if len(sys.argv)>6 else None).save(sys.argv[4], "PNG", optimize=True)
