"""Sample QuickMap's own orthographic polar basemap, without cylindrical pinching."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from urllib.request import urlopen
from urllib.error import HTTPError
import numpy as np
from PIL import Image

TILE_SIZE = 512
BASE = 'https://lroc-tiles.quickmap.io/tiles/wac_nac_nacroi'


def map_pixels(north, latitude, longitude, level):
    span = TILE_SIZE * 2 ** level
    lon = np.radians(longitude)
    radius = np.cos(np.radians(latitude))
    east = radius * np.sin(lon)
    up = radius * np.cos(lon) * (-1 if north else 1)
    return (east + 1) * span / 2 - .5, (1 - up) * span / 2 - .5


def tile(north, level, row, col, folder):
    if not (0 <= row < 2 ** level and 0 <= col < 2 ** level):
        return None
    projection = 'lunar-orthonp' if north else 'lunar-orthosp'
    path = folder / f'quickmap-{projection}-{level}-{row}-{col}.jpg'
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        try:
            with urlopen(f'{BASE}/{projection}/{level}/{col}/{row}.jpg', timeout=15) as response:
                data = response.read(2 * 1024 * 1024 + 1)
        except HTTPError as error:
            if error.code == 404:
                return None
            raise
        if len(data) > 2 * 1024 * 1024:
            raise ValueError('Unexpected QuickMap tile size')
    with Image.open(BytesIO(data)) as image:
        if image.size != (512,512):
            raise ValueError('Unexpected QuickMap polar tile dimensions')
        rgb = np.asarray(image.convert('RGB'))
    if not path.exists():
        # Tile reprojection requests share this cache. An atomic replacement
        # with a unique temporary avoids concurrent writers losing their file.
        import tempfile
        with tempfile.NamedTemporaryFile(dir=folder, suffix='.part', delete=False) as temp:
            temp.write(data)
            temporary = temp.name
        from pathlib import Path
        temporary = Path(temporary)
        try:
            temporary.replace(path)
        except PermissionError:
            # Windows denies replacement while another request has the same
            # immutable tile open. A completed concurrent writer is sufficient.
            if not path.exists():
                raise
        finally:
            temporary.unlink(missing_ok=True)
    path.touch()
    return rgb


def sample(projection, latitude, longitude, folder, level):
    north = projection == 'NP'
    x,y = map_pixels(north, latitude, longitude, level)
    x0,y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    ux,uy = x-x0,y-y0
    corners = [(x0,y0,(1-ux)*(1-uy)),(x0+1,y0,ux*(1-uy)),
               (x0,y0+1,(1-ux)*uy),(x0+1,y0+1,ux*uy)]
    keys = sorted({(int(row),int(col)) for xx,yy,_ in corners
                   for row,col in np.unique(np.stack([yy.ravel()//512,xx.ravel()//512],axis=1),axis=0)})
    if len(keys) > 32:
        raise ValueError('QuickMap polar patch exceeds tile budget')
    with ThreadPoolExecutor(max_workers=4) as pool:
        rasters = dict(zip(keys,pool.map(lambda k:tile(north,level,*k,folder),keys)))
    rgb = np.zeros((*x.shape,3)); coverage = np.zeros(x.shape)
    for xx,yy,weight in corners:
        for (row,col),raster in rasters.items():
            if raster is None:
                continue
            inside = (yy//512 == row)&(xx//512 == col)
            rgb[inside] += raster[yy[inside]%512,xx[inside]%512]*weight[inside,None]
            coverage[inside] += weight[inside]
    return rgb/np.maximum(coverage[...,None],1e-8),coverage
