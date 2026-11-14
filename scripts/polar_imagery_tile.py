"""Reproject native NASA polar imagery into a geographic display tile."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from surface_imagery import sample


def polar_image(level, x, y, folder):
    step = 180 / 2 ** level
    longitude, latitude = np.meshgrid(-180 + (x + (np.arange(256)+.5)/256) * step,
                                      90 - (y + (np.arange(256)+.5)/256) * step)
    rgba = np.zeros((256, 256, 4), dtype=np.uint8)
    # A level-zero geographic tile contains both polar caps.
    for north in (True, False):
        inside = latitude >= 80 if north else latitude <= -80
        if inside.any():
            projection = "NP" if north else "SP"
            # Both WAC polar WMTS capabilities stop at source level 4. Requesting
            # higher levels returns missing images, not higher resolution.
            rgb, coverage = sample(projection, latitude[inside], longitude[inside], folder, 4)
            detail_inside = np.abs(latitude[inside]) >= 85.5
            if level >= 3 and detail_inside.any():
                try:
                    detail, weight = sample("NNAC" if north else "NAC", latitude[inside][detail_inside], longitude[inside][detail_inside], folder, min(11, level+1))
                    blend = np.clip(weight, 0, 1)
                    rgb[detail_inside] = rgb[detail_inside] * (1-blend[:, None]) + detail * blend[:, None]
                    coverage[detail_inside] = np.maximum(coverage[detail_inside], weight)
                except (OSError, ValueError):
                    pass  # Native WAC imagery still covers the polar cap.
            rgba[inside, :3] = np.rint(rgb).clip(0, 255).astype(np.uint8)
            rgba[inside, 3] = np.rint(coverage * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba)


if __name__ == "__main__":
    level, x, y = map(int, sys.argv[1:4])
    folder = Path(sys.argv[5]); folder.mkdir(parents=True, exist_ok=True)
    polar_image(level, x, y, folder).save(sys.argv[4], "PNG", optimize=True)
