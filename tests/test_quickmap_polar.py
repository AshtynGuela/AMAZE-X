from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np
from io import BytesIO
import tempfile
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import polar_imagery_tile

class QuickMapPolarTest(unittest.TestCase):
    def test_concurrent_windows_cache_writer_keeps_a_valid_tile(self):
        import quickmap_polar
        stream=BytesIO(); Image.new('RGB',(512,512),(90,90,90)).save(stream,'JPEG')
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(Path,'read_bytes',side_effect=FileNotFoundError), \
                 patch.object(Path,'exists',side_effect=[False,True]), \
                 patch.object(Path,'replace',side_effect=PermissionError('another reader holds the cached tile')), \
                 patch.object(Path,'touch'), \
                 patch.object(quickmap_polar,'urlopen',return_value=BytesIO(stream.getvalue())):
                rgb=quickmap_polar.tile(True,1,0,0,Path(folder))
            self.assertEqual(rgb.shape,(512,512,3))
            self.assertEqual(list(Path(folder).glob('*.part')),[])

    def test_polar_caps_use_quickmap_orthographic_coordinates(self):
        # QuickMap's orthographic cap is a square [-R,R] in both axes.
        # A polar stereographic source has a different radial scale.
        import quickmap_polar
        for north in (True,False):
            lat=np.full(4,80 if north else -80)
            x,y=quickmap_polar.map_pixels(north,lat,np.array([0,90,180,270]),3)
            mid=4096/2-.5
            radius=4096/2*np.cos(np.radians(80))
            np.testing.assert_allclose(x-mid,[0,radius,0,-radius],atol=1e-9)
            np.testing.assert_allclose(y-mid,np.array([radius,0,-radius,0])*(1 if north else -1),atol=1e-9)
            x,y=quickmap_polar.map_pixels(north,np.full(4,90 if north else -90),np.arange(4)*90,3)
            np.testing.assert_allclose(x,mid,atol=1e-9)
            np.testing.assert_allclose(y,mid,atol=1e-9)

    def test_geographic_polar_overlay_uses_quickmap_not_a_different_mosaic(self):
        calls=[]
        def sample(projection,lat,lon,*args):
            calls.append(projection)
            return np.full((len(lat),3),99),np.ones(len(lat))
        with patch('quickmap_polar.sample',side_effect=sample):
            image=np.asarray(polar_imagery_tile.polar_image(0,0,0,Path('.')))
        self.assertEqual(set(calls),{'NP','SP'})
        self.assertEqual(image[0,100,0],99)
        self.assertEqual(image[-1,100,0],99)
        self.assertEqual(image[image.shape[0]//2,100,3],0)
        self.assertEqual(image[56,100,3],255,'Keep the whole visible polar region on one basemap, rather than a hard circular cut at 80 degrees')
        self.assertGreater(image[78,100,3],0)
        self.assertLess(image[78,100,3],255,'Blend at the outer edge of the cap')
