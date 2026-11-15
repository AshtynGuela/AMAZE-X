SPACECRAFT RIG AND BOOSTER ANIMATIONS
====================================

Main output: spacecraft_rigged_animated.glb
Viewer: spacecraft_animation_viewer.html
Source-building script: rig_spacecraft.py

1. Load the .glb in a GLB/glTF 2.0 animation-capable viewer or engine.
2. Select one of these embedded animation clips:
    Hover_Loop     - 4 s, gentle idle hover, short pulsing exhaust, looping
    Flight_Travel  - 8 s, accelerating along -Z with bank, strong exhaust
    Hover_Travel   - 8 s, slower flight along -Z, bobbing, medium exhaust
3. In the supplied HTML viewer, choose the GLB using the file picker.
   The viewer pulls the Three.js libraries from a public CDN, so first use
   requires an Internet connection. Your GLB file is loaded locally.

RIG DETAILS
- Root: Flight_Rig_ROOT_Yup_NoseMinusZ
- Original untouched mesh: Hull_Original_Textured (rigid child of root)
- Engine anchors: Thruster_Port_Anchor, Thruster_Starboard_Anchor,
  Thruster_Ventral_Anchor
- Each engine has a separate animated Flame_Length_Control node.
- Booster effect: translucent, unlit cyan/blue/white geometry and glow disks.
- Source mesh, UVs, texture images and original materials are preserved.
- The root faces forward -Z and up +Y, with a manageable overall model size.

NOTE
Animations are embedded as standard glTF 2.0 node transform channels.
Bloom/bright glow is renderer-dependent; the supplied HTML viewer enables
postprocessing bloom. In Blender, import via File > Import > glTF 2.0.

This is a simple rigid-spacecraft hierarchy, not a deforming bone skin rig.
