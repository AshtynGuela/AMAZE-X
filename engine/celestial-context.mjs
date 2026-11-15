import { Quaternion, Vector3 } from 'three';
import { planetOrientation } from './planetOrientation.mjs';
import { AU_KM, solarPosition } from './solar.mjs';

const modelToFixed = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

export function lunarCelestialState(packets, time) {
  const earth = solarPosition(packets?.earth?.samples, time);
  const moon = solarPosition(packets?.moon?.samples, time);
  if (!earth || !moon) return null;
  const toFixed = modelToFixed.clone().multiply(planetOrientation('moon', time).invert());
  const fixed = xyz => new Vector3(xyz[0], xyz[2], -xyz[1])
    .multiplyScalar(AU_KM * 1000).applyQuaternion(toFixed).toArray();
  const subtract = (a, b) => a.map((n, i) => n - b[i]);
  const earthLunarOrbitM = [];
  for (const row of packets.moon.samples) {
    const atEarth = solarPosition(packets.earth.samples, row[0]);
    if (atEarth) earthLunarOrbitM.push(fixed(subtract(atEarth, row.slice(1, 4))));
  }
  return {
    earthM: fixed(subtract(earth, moon)), sunM: fixed(moon.map(n => -n)),
    earthLunarOrbitM,
    earthSolarOrbitM: (packets.earth.orbit || []).map(row => fixed(subtract(row.slice(1, 4), moon))),
    sources: [packets.earth.source, packets.moon.source, packets.earth.orbitSource].filter(Boolean),
    start: Math.max(packets.earth.samples[0][0], packets.moon.samples[0][0]),
    end: Math.min(packets.earth.samples.at(-1)[0], packets.moon.samples.at(-1)[0]),
  };
}

// The shared Three.js overview uses lunar model Y-up and 1 unit = 10,000 km.
// Readable mode compresses distant space only; physical readouts use earthM/sunM.
export function lunarSceneVector(fixedM, physical = false) {
  const radius = Math.hypot(...fixedM);
  const linear = radius * 1e-7;
  const display = physical || linear <= 60 ? linear : 60 + 24 * Math.log(linear / 60);
  const scale = radius ? display / radius : 0;
  return [fixedM[0] * scale, fixedM[2] * scale, -fixedM[1] * scale];
}

export function lunarBodyOrientation(body, time, earthTable) {
  return modelToFixed.clone().multiply(planetOrientation('moon', time).invert())
    .multiply(planetOrientation(body, time, earthTable)).multiply(modelToFixed.clone().invert()).toArray();
}
