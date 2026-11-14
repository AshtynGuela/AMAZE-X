import {
  AttributeCompression, BoundingSphere, Cartesian2, Cartesian3, Cartographic,
  EllipsoidalOccluder, OrientedBoundingBox, QuantizedMeshTerrainData,
} from 'cesium';

// The surrounding QuickMap provider advertises oct-encoded vertex normals.
// A HeightmapTerrainData tile cannot be mixed into that provider: Cesium selects
// its lighting shader for the provider, not for each individual mesh encoding.
export function polarMesh(patch, rectangle, ellipsoid, childTileMask = 15) {
  const size = patch.size, count = size * size, heights = patch.heightsM;
  if (size < 2 || count > 65535 || heights.length !== count ||
      !heights.every(h => Number.isFinite(h) && Math.abs(h) <= 12000))
    throw new Error('Invalid NASA polar terrain tile');
  const min = Math.min(...heights), max = Math.max(...heights);
  const positions = [], vertices = new Uint16Array(count * 3);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const i = row * size + col;
    const lat = rectangle.north - row / (size - 1) * rectangle.height;
    const lon = rectangle.west + col / (size - 1) * rectangle.width;
    const point = ellipsoid.cartographicToCartesian(new Cartographic(lon, lat, heights[i]));
    // Remove floating-point longitude-dependent offsets at the exact poles.
    if (Math.abs(Math.cos(lat)) < 1e-14) { point.x = 0; point.y = 0; }
    positions.push(point);
    vertices[i] = Math.round(col / (size - 1) * 32767);
    vertices[count + i] = Math.round((1 - row / (size - 1)) * 32767);
    vertices[count * 2 + i] = max === min ? 0 : Math.round((heights[i] - min) / (max - min) * 32767);
  }
  const indices = [], sums = positions.map(() => new Cartesian3());
  const ab = new Cartesian3(), ac = new Cartesian3(), cross = new Cartesian3();
  const triangle = (a, b, c) => {
    // Retain geographic UV coverage even where Cartesian pole vertices
    // coincide. sampleTerrain interpolates in UV, while the GPU discards the
    // zero-area triangle. Its face contributes nothing to surface normals.
    indices.push(a, b, c);
    Cartesian3.subtract(positions[b], positions[a], ab);
    Cartesian3.subtract(positions[c], positions[a], ac);
    Cartesian3.cross(ab, ac, cross);
    if (Cartesian3.magnitudeSquared(cross) < 1e-18) return; // collapsed pole edge
    for (const i of [a, b, c]) Cartesian3.add(sums[i], cross, sums[i]);
  };
  for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
    const nw = row * size + col, sw = nw + size;
    triangle(nw, sw, nw + 1);
    triangle(nw + 1, sw, sw + 1);
  }
  const encodedNormals = new Uint8Array(count * 2), oct = new Cartesian2();
  for (let i = 0; i < count; i++) {
    let normal = sums[i];
    const point = positions[i];
    if (point.x === 0 && point.y === 0 || Cartesian3.magnitudeSquared(normal) < 1e-18)
      normal = ellipsoid.geodeticSurfaceNormal(point, new Cartesian3());
    else Cartesian3.normalize(normal, normal);
    AttributeCompression.octEncode(normal, oct);
    encodedNormals[i * 2] = oct.x; encodedNormals[i * 2 + 1] = oct.y;
  }
  const bounds = BoundingSphere.fromPoints(positions);
  const occluder = new EllipsoidalOccluder(ellipsoid);
  const horizon = occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(bounds.center, positions, min);
  const edge = Array.from({length:size}, (_, i) => i);
  const skirt = Math.min(1000, rectangle.height * ellipsoid.maximumRadius / (size - 1) * 4);
  return new QuantizedMeshTerrainData({
    minimumHeight:min, maximumHeight:max, quantizedVertices:vertices,
    indices:new Uint16Array(indices), encodedNormals, boundingSphere:bounds,
    orientedBoundingBox:OrientedBoundingBox.fromRectangle(rectangle, min, max, ellipsoid),
    horizonOcclusionPoint:horizon ?? ellipsoid.transformPositionToScaledSpace(bounds.center),
    westIndices:edge.map(i => i * size), eastIndices:edge.map(i => i * size + size - 1),
    northIndices:edge, southIndices:edge.map(i => (size - 1) * size + i),
    westSkirtHeight:skirt, eastSkirtHeight:skirt, northSkirtHeight:skirt, southSkirtHeight:skirt,
    childTileMask,
  });
}
