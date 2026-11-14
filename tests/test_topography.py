"""Projection/geometry regressions independent of remote availability."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import terrain_patch
import lunar_terrain
from surface_imagery import map_pixels
import polar_imagery_tile


class TopographyTest(unittest.TestCase):
    def test_root_imagery_tile_contains_both_poles_and_no_equatorial_overlay(self):
        def sample(projection, latitude, longitude, *args):
            return np.full((len(latitude), 3), 40 if projection == "NP" else 200), np.ones(len(latitude))
        with patch.object(polar_imagery_tile, "sample", sample):
            image = np.asarray(polar_imagery_tile.polar_image(0, 0, 0, Path(".")))
        self.assertEqual(int(image[0, 100, 0]), 40)
        self.assertEqual(int(image[-1, 100, 0]), 200)
        self.assertEqual(int(image[128, 100, 3]), 0)

    def test_named_relief_and_north_nac_use_their_advertised_projections(self):
        # Equatorial origin lies at the centre of the worldwide matrix.
        x, y = map_pixels("RELIEF", np.array([0.]), np.array([0.]), 4, 32, 16)
        np.testing.assert_allclose([x[0], y[0]], [4095.5, 2047.5])
        # At +90 every longitude projects to the top-left-offset origin.
        x, y = map_pixels("NNAC", np.array([90.,90.]), np.array([0.,120.]), 4, 32, 16)
        np.testing.assert_allclose(x, y)
        self.assertAlmostEqual(x[0], x[1])

    def sampler(self, *_args, **_kwargs):
        return (lambda lat, lon: np.asarray(lat) + np.asarray(lon) / 100), {"test"}, {"test": {"mapScaleM": 20}}

    def test_all_longitudes_share_one_height_at_both_exact_poles(self):
        with patch.object(terrain_patch, "elevation_sampler", self.sampler):
            for y, row, expected in [(0, 0, 90), (4095, -1, -90)]:
                a = np.array(terrain_patch.map_patch(12, 0, y)["heightsM"]).reshape(65, 65)
                b = np.array(terrain_patch.map_patch(12, 4096, y)["heightsM"]).reshape(65, 65)
                np.testing.assert_array_equal(a[row], np.full(65, expected))
                np.testing.assert_array_equal(a[row], b[row])

    def test_adjacent_geographic_tiles_share_edges_and_north_is_first_row(self):
        with patch.object(terrain_patch, "elevation_sampler", self.sampler):
            a = np.array(terrain_patch.map_patch(10, 1000, 2)["heightsM"]).reshape(65, 65)
            b = np.array(terrain_patch.map_patch(10, 1001, 2)["heightsM"]).reshape(65, 65)
            np.testing.assert_array_equal(a[:, -1], b[:, 0])
            self.assertGreater(a[0, 0], a[-1, 0])

    def test_local_patch_preserves_centre_and_rejects_invalid_source_heights(self):
        with patch.object(terrain_patch, "elevation_sampler", self.sampler):
            a = terrain_patch.local_patch(89.9, 40, 1280)
            self.assertAlmostEqual(a["heightsM"][len(a["heightsM"]) // 2], 90.3, places=3)
        with self.assertRaises(ValueError):
            terrain_patch.checked_patch(np.array([np.nan]), {"test"}, {"test": {"mapScaleM": 20}})

    def test_quick_obstruction_distances_reproduce_reported_angles(self):
        def sampler(*args, **kwargs):
            return (lambda lat, lon: np.zeros(np.broadcast_arrays(lat, lon)[0].shape)), {"test"}, {"test": {"mapScaleM": 20}}
        with patch.object(lunar_terrain, "elevation_sampler", sampler):
            result = lunar_terrain.terrain_at(-90, 40, quality="quick")
        self.assertEqual(result["azStepDeg"], 2)
        self.assertEqual(len(result["masks"]["2"]), 180)
        distances = np.array(result["obstructions"]["2"]["distanceM"])
        expected = lunar_terrain.skyline(np.zeros(180), distances, 0, 2)
        np.testing.assert_allclose(result["masks"]["2"], expected, atol=.000005)


if __name__ == "__main__": unittest.main()
