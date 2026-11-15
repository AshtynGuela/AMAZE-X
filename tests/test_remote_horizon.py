"""Independent geometric checks for the numeric polar terrain pipeline."""
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import lunar_terrain as terrain
import remote_dem


class PolarHorizonTest(unittest.TestCase):
    def test_numeric_preview_works_without_remote_reads_and_has_one_height_per_pole(self):
        with patch.object(terrain,'read_grid',side_effect=AssertionError('Preview contacted a remote raster')):
            result=terrain.terrain_at(89.1,41,quality='preview')
            sample,_,_=terrain.elevation_sampler(90,detailed=False)
            self.assertEqual(float(sample(90,0)),float(sample(90,173)))
            self.assertEqual(float(sample(-90,0)),float(sample(-90,-91)))
        self.assertEqual(len(result['masks']['2']),72)
        self.assertEqual(result['quality'],'preview')
        self.assertEqual(result['tile']['size'],17)
        self.assertGreater(result['resolutionM'],3000)

    def test_full_refinement_catches_a_ridge_peak_between_original_distance_steps(self):
        def sampler(_lat,_sources=None,detailed=True):
            def elevation(latitude,longitude):
                d=(90-np.asarray(latitude))*np.pi/180*terrain.RADIUS
                return 200*np.exp(-((d-12345)/30)**2)
            return elevation,{'fixture'},{'fixture':{'mapScaleM':20,'product':'fixture'}}
        with patch.object(terrain,'elevation_sampler',side_effect=sampler):
            full=terrain.terrain_at(90,0,quality='full')
            quick=terrain.terrain_at(90,0,quality='quick')
        self.assertGreater(min(full['masks']['2']),.65)
        self.assertLess(max(quick['masks']['2']),0)
        self.assertLess(max(abs(np.array(full['obstructions']['2']['distanceM'])-12345)),30)

    def test_polar_projection_cardinals_and_exact_poles(self):
        for north in [False, True]:
            sign = 1 if north else -1
            lon = np.array([0., 90., 180., 270.])
            x, y = terrain.polar_pixels(sign * 85, lon, (30400, 30400), north)
            radius = 2 * 1737400 * math.tan(math.radians(2.5)) / 20
            np.testing.assert_allclose(x - 15199.5, [0, radius, 0, -radius], atol=1e-9)
            np.testing.assert_allclose(y - 15199.5, np.array([radius, 0, -radius, 0])*sign, atol=1e-9)
            x, y = terrain.polar_pixels(sign * 90, lon, (30400, 30400), north)
            np.testing.assert_allclose(x, 15199.5)
            np.testing.assert_allclose(y, 15199.5)

    def test_obstruction_angles_against_independent_cartesian_dot_products(self):
        # Observer at +X, with a ridge 1 km away. Rotate actual radial vectors
        # then dot into up/east, independent of the production skyline helper.
        distances = np.array([20., 1000., 2000., 50000.])
        heights = np.array([[0., 100., 0., -1000.]])
        for mast in [0, 2, 5, 10]:
            expected = []
            for d, h in zip(distances, heights[0]):
                a = d / 1737400
                target = np.array([(1737400+h)*math.cos(a), (1737400+h)*math.sin(a), 0])
                delta = target - [1737400+mast, 0, 0]
                expected.append(math.degrees(math.atan2(delta[0], math.hypot(delta[1], delta[2]))))
            actual = terrain.skyline(heights, distances, 0, mast)[0]
            np.testing.assert_allclose(actual, expected, atol=1e-10)
            self.assertEqual(int(actual.argmax()), 1)

    def test_flat_sphere_reproduces_analytic_mast_horizon(self):
        d = np.linspace(1, 150000, 100000)
        actual = terrain.skyline(np.zeros((1, len(d))), d, 0, 2).max()
        expected = -math.degrees(math.acos(1737400 / 1737402))
        self.assertAlmostEqual(actual, expected, places=6)

    def test_remote_regional_not_loaded_when_rays_cannot_intersect(self):
        records = json.loads((terrain.ROOT/'public/data/manifest.json').read_text())['products']
        class FlatGrid:
            shape = (30400, 30400)
            def corners(self, a, b, x, y): return tuple(np.zeros_like(a, dtype=float) for _ in range(4))
        with patch.object(terrain, 'read_grid', return_value=FlatGrid()), \
             patch.object(remote_dem, 'regional_grid', side_effect=AssertionError('Unrelated region downloaded')):
            result = terrain.terrain_at(-84, 120, records)
        self.assertEqual(result['resolutionM'], 20)
        self.assertNotIn('site04', [s['product'] for s in result['sources']])

    def test_bundled_regional_extract_is_lossless_and_works_offline(self):
        source = json.loads((terrain.ROOT/'data/terrain-regional.json').read_text())[0]
        with tempfile.TemporaryDirectory() as folder, patch.object(remote_dem, 'CACHE', Path(folder)), \
             patch.object(remote_dem, 'fetch_ranges', side_effect=AssertionError('Unexpected download')):
            grid = remote_dem.regional_grid(source)
            self.assertEqual(hashlib.sha256(grid.tobytes()).hexdigest(), source['sha256'])
            grid._mmap.close()


if __name__ == '__main__': unittest.main()
