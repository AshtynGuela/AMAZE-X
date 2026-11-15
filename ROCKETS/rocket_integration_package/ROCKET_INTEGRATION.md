# Rocket — Integration-ready rig and restrained exhaust

**Main file:** `rocket_integration_ready.glb`

This GLB includes the four original textured rocket sections, a non-deforming parent-node rig, three independent animated exhaust anchors, and **five embedded glTF animation clips**. The asset uses standard glTF 2.0 geometry, embedded textures, standard node animations, and the broadly supported `KHR_materials_unlit` extension for its transparent exhaust.

## Material corrections

- Preserved **all original hull texture images**, vertex coordinates, normals, and UVs, including the core and both side boosters.
- Removed the original materials' `KHR_materials_transmission` setting (transmission factor 1), which made parts of the rocket render like glass and look overly bright.
- Made the hull opaque, with original color maps at neutral 1.0× tint, low metallic response (0.18), and the original metallic/roughness maps.
- Added restrained **amber/gold** rocket-exhaust meshes made of alpha-blended vertex-colored geometry, without emissive lighting or bloom. This produces portable exhaust geometry, not a GPU particle system or HDR light source.
- For a different atmosphere or style, recolor only the three `Rocket_Exhaust_*_No_Emission` materials. The original hull colors are independent.

## Hierarchy and axes

- Root: `Rocket_Flight_Rig_ROOT_Yup_NosePlusY`
- Up/nose/flight direction: **+Y** (this rocket is vertical; no -Z forward convention)
- Exhaust points along: **−Y**
- Body assembly: `Rocket_Original_Textured_Assembly` (normalized to 0.01× inside its transform, model centered near origin)
- Original geometry children: `Central_Core_Textured`, `Left_Solid_Booster_Textured`, `Upper_Core_Equipment_Textured`, `Right_Solid_Booster_Textured`
- Nozzles: `Thruster_Left_Anchor`, `Thruster_Right_Anchor`, `Thruster_Central_Anchor`
- Each nozzle has a named `*_Flame_Length_Control` child whose Y scale is animated. These three anchors may be hidden to disable exhaust, or repositioned if you change the rocket geometry.

At rest, the original rocket spans approximately 27.9 scene units vertically (without extended flames). To place the asset in a scene, transform a **new parent object** around the imported glTF root. Avoid modifying the internally animated root's position/rotation from gameplay code.

## Animation clips

| Clip | Duration | Loop | Result |
| --- | ---: | --- | --- |
| `Hover_Loop` | 4 s | Yes | Small vertical bob, slight sway, subtle pulsing exhaust |
| `Flight_Travel` | 8 s | No | Accelerating upward launch, gentle tilt, longer exhaust; **baked upward movement** |
| `Hover_Travel` | 8 s | No | Slower upward travel, small bob/sway and mild exhaust; **baked upward movement** |
| `Flight_InPlace` | 4 s | Yes | Flight attitude and strong pulsing boosters **without root translation** |
| `Hover_InPlace` | 4 s | Yes | Floating/swaying attitude and restrained boosters **without root translation** |

**Integration recommendation:** If your flight controller already changes the rocket's position, use **`Flight_InPlace`** or **`Hover_InPlace`**. The `Flight_Travel` and `Hover_Travel` clips translate the animation root along +Y; combining them with your own translation controller can move the rocket twice or cause snaps when clips change.

## Three.js quick start

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const rocketWorld = new THREE.Group(); // game-controlled world transform
scene.add(rocketWorld);
let mixer;

loader.load('/assets/rocket_integration_ready.glb', (gltf) => {
  rocketWorld.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = THREE.AnimationClip.findByName(gltf.animations, 'Flight_InPlace');
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat).play();

  // Optional: hide all exhaust; don't hide the body or animation root.
  // gltf.scene.traverse(obj => {
  //   if (/^Thruster_(Left|Right|Central)_Anchor$/.test(obj.name)) obj.visible = false;
  // });
});

// Per frame, pass the elapsed seconds from your game loop:
// mixer?.update(deltaSeconds);
// rocketWorld.position.y += upwardSpeed * deltaSeconds;
```

For other axes (e.g. a scene that considers **−Z** forward), rotate `rocketWorld` once to orient the rocket's +Y nose along your travel direction. Leave internal engine anchors unchanged.

## Blender, Godot, Unity

- **Blender**: File → Import → glTF 2.0. The original model meshes remain rigid nodes; animation actions target the root and the three flame length controls. There is no deformable armature or bone skinning.
- **Godot 4**: Import .glb, instance the imported scene, and use its imported animation player. For gameplay, move a parent Node3D and use an in-place clip.
- **Unity**: Import using a glTF animation-capable importer such as glTFast and verify animation clip mapping; do not expect the native FBX animation pipeline to understand glTF tracks without an importer.

## Viewer

Open `rocket_animation_viewer.html` in a modern browser, then choose or drag the GLB onto the viewer. It loads Three.js from a CDN, so the browser needs internet for the viewer scripts, **but the model itself is never uploaded**. If serving the ZIP's contents on an HTTP/HTTPS server, the viewer will try to load the local `rocket_integration_ready.glb` automatically.

The viewer has no bloom, and keeps exposure relatively low so hull colors are easier to judge. Different engines may sort transparent meshes or map textures slightly differently.

## Package

- `rocket_integration_ready.glb`: rigged, material-corrected, animated rocket with embedded textures
- `rocket_animation_viewer.html`: neutral-lit browser preview and clip switcher
- `rocket_fixed_preview.png`: reference render
- `build_rocket_rig.py`: editable Python build script for reproducibility
- `ROCKET_INTEGRATION.md`: this guide

**Limitations:** This is a rigid node rig, not a skinning/skeletal deformation rig. The flames are animated transparent geometry rather than smoke, sparks or particles. The imported original rocket parts do not detach or stage automatically; individual boosters are preserved for custom staging systems.
