import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import SceneLabel from './SceneLabel';
import { BufferGeometry, Float32BufferAttribute, Vector3, Sphere } from 'three';
import { EarthGlobe, useEarthOrientation } from './EarthGlobe';
import { planetOrientation } from '../engine/planetOrientation.mjs';
import { lunarSceneVector } from '../engine/celestial-context.mjs';
import type { CelestialContext } from './celestial-context';

function Path({ points, color }: { points: number[][]; color: string }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(points.slice(1).flatMap((point, i) => [...points[i], ...point]), 3));
    return result;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color={color} transparent opacity={.55} depthWrite={false} /></lineSegments>;
}

export default function CelestialOrbits({ data, time, physical, command }: {
  data: CelestialContext; time: number; physical: boolean;
  command: {mode: string; version: number} | null;
}) {
  const { camera, controls, invalidate } = useThree();
  const table = useEarthOrientation();
  const earth = lunarSceneVector(data.earthM, physical), sun = lunarSceneVector(data.sunM, physical);
  const lunarPath = useMemo(() => data.earthLunarOrbitM.map(p => lunarSceneVector(p, physical)), [data, physical]);
  const solarPath = useMemo(() => data.earthSolarOrbitM.map(p => lunarSceneVector(p, physical)), [data, physical]);
  const orientation = planetOrientation('moon', time).invert().multiply(planetOrientation('earth', time, table));
  useEffect(() => {
    if (!command || !['earth_moon_orbit', 'solar_orbit', 'earth', 'sun'].includes(command.mode)) return;
    const ctl = controls as any;
    const centre = new Vector3(), up = new Vector3(0, 1, 0);
    let radius: number;
    if (command.mode === 'earth' || command.mode === 'sun') {
      centre.fromArray(command.mode === 'earth' ? earth : sun);
      radius = command.mode === 'earth' ? (physical ? .6371 : 4.6) * 4 : (physical ? 69.634 : 6.5) * 4;
    } else {
      const points = command.mode === 'solar_orbit' ? solarPath : lunarPath;
      const bounds = new Sphere().setFromPoints([new Vector3(), ...points.map(p => new Vector3().fromArray(p)),
        new Vector3().fromArray(command.mode === 'solar_orbit' ? sun : earth)]);
      centre.copy(bounds.center);
      radius = Math.max(12, bounds.radius * 4.8);
    }
    camera.position.copy(centre).addScaledVector(up, radius).add(new Vector3(0, 0, radius * .45));
    if (ctl?.target) { ctl.target.copy(centre); ctl.update(); } else camera.lookAt(centre);
    invalidate();
  }, [command?.version, physical, controls, !!data]);
  useEffect(() => { invalidate(); }, [data, time, physical, table, invalidate]);
  return <group name="lunar-celestial-context">
    <Path points={lunarPath} color="#8db7e4" /><Path points={solarPath} color="#d4bd7c" />
    <group position={earth as [number,number,number]}>
      <group quaternion={orientation}><EarthGlobe radius={physical ? .6371008 : 4.6} /></group>
      <SceneLabel text="EARTH" position={[0, physical ? .95 : 5.4, 0]} />
    </group>
    <group position={sun as [number,number,number]}>
      <mesh><sphereGeometry args={[physical ? 69.634 : 6.5,32,24]}/><meshBasicMaterial color="#ffcf6b" toneMapped={false}/></mesh>
      <SceneLabel text="SUN" color="#ffdc8b" position={[0, physical ? 75 : 8, 0]} />
    </group>
  </group>;
}
