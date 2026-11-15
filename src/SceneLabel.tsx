import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, PerspectiveCamera, Sprite } from 'three';

// A canvas label belongs to the 3D renderer throughout its lifetime. It avoids
// a second React DOM root racing renderer teardown when Moon navigation switches.
export default function SceneLabel({ text, detail, position, color = '#dce8f0', onClick }: {
  text: string; detail?: string; position: [number, number, number]; color?: string; onClick?: () => void;
}) {
  const sprite = useRef<Sprite>(null);
  const { invalidate, size, camera } = useThree();
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = detail ? 112 : 72;
    const map = new CanvasTexture(canvas);
    map.minFilter = map.magFilter = LinearFilter;
    map.generateMipmaps = false;
    return map;
  }, [detail]);
  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active) return;
      const canvas = texture.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0d151cdd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = '36px D-DIN, sans-serif';
      ctx.fillText(text, 256, 46);
      if (detail) { ctx.font = '26px D-DIN, sans-serif'; ctx.fillText(detail, 256, 88); }
      texture.needsUpdate = true; invalidate();
    };
    draw();
    void document.fonts.load('36px D-DIN').then(draw);
    return () => { active = false; };
  }, [texture, text, detail, color, invalidate]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (!sprite.current) return;
    const factor = camera instanceof PerspectiveCamera ? 2 * Math.tan(camera.fov * Math.PI / 360) / size.height : 1 / size.height;
    sprite.current.scale.set(150 * factor, (detail ? 33 : 21) * factor, 1);
  });
  return <sprite ref={sprite} position={position} renderOrder={20} onClick={onClick ? event => { event.stopPropagation(); onClick(); } : undefined}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} sizeAttenuation={false} toneMapped={false} />
  </sprite>;
}
