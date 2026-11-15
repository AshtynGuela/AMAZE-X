#!/usr/bin/env python3
"""Add a non-destructive rigid transform rig, three animated engine plumes,
and hover / travel flight animation clips to the supplied glTF 2.0 GLB.

No 3D software dependencies are required; this uses numpy and SciPy only.
"""
import os, json, struct, math
import numpy as np
from scipy.spatial.transform import Rotation

SOURCE = '/mnt/data/26_11_14_01_00_35_438.glb'
DEST = '/mnt/data/spacecraft_rigged_animated.glb'

with open(SOURCE, 'rb') as fh:
    magic, version, declared = struct.unpack('<III', fh.read(12))
    if magic != 0x46546C67 or version != 2:
        raise ValueError('Expected glTF 2.0 GLB')
    jlen, jtype = struct.unpack('<I4s', fh.read(8))
    if jtype != b'JSON':
        raise ValueError('Expected JSON chunk first')
    data = json.loads(fh.read(jlen))
    blen, btype = struct.unpack('<I4s', fh.read(8))
    if btype != b'BIN\0':
        raise ValueError('Expected BIN chunk second')
    blob = bytearray(fh.read(blen))
    if fh.read(1):
        raise ValueError('Unexpected extra GLB content')

# Add binary-backed accessors while preserving all original image/mesh data.
def append_accessor(arr, component_type, gltf_type, name, *, target=None, bounds=False):
    arr = np.ascontiguousarray(arr)
    if len(blob) % 4:
        blob.extend(b'\0' * (4 - len(blob) % 4))
    off = len(blob)
    blob.extend(arr.tobytes())
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': int(arr.nbytes), 'name': name}
    if target is not None:
        v['target'] = target
    view_idx = len(data['bufferViews'])
    data['bufferViews'].append(v)
    a = {'bufferView': view_idx, 'componentType': component_type,
         'count': len(arr), 'type': gltf_type, 'name': name}
    if bounds:
        a['min'] = np.min(arr, axis=0).tolist() if arr.ndim > 1 else [float(np.min(arr))]
        a['max'] = np.max(arr, axis=0).tolist() if arr.ndim > 1 else [float(np.max(arr))]
    idx = len(data['accessors'])
    data['accessors'].append(a)
    return idx


def add_mesh(name, pos, col, idx, material_id):
    posidx = append_accessor(np.asarray(pos, dtype=np.float32), 5126, 'VEC3', name + '_position', target=34962, bounds=True)
    colidx = append_accessor(np.asarray(col, dtype=np.float32), 5126, 'VEC4', name + '_colors', target=34962)
    ixidx = append_accessor(np.asarray(idx, dtype=np.uint16).ravel(), 5123, 'SCALAR', name + '_indices', target=34963)
    mesh = {'name': name, 'primitives': [{
        'attributes': {'POSITION': posidx, 'COLOR_0': colidx},
        'indices': ixidx, 'material': material_id, 'mode': 4
    }]}
    i = len(data['meshes'])
    data['meshes'].append(mesh)
    return i


def plume_profile(name, radii, distances, color_profile, segments, mat):
    """Curved, tapering translucent volumetric-looking jet shell."""
    vs=[]; rgba=[]; faces=[]
    for r_idx, (z, r, color) in enumerate(zip(distances, radii, color_profile)):
        for step in range(segments):
            a = 2*math.pi*step/segments
            ripple = 1 + 0.038*math.sin(5*a + z*2.5) + 0.020*math.sin(9*a - z)
            vs.append([r * ripple * math.cos(a), r * ripple * math.sin(a), z])
            rgba.append(color)
            if r_idx:
                prev=(r_idx-1)*segments+step
                prv_next=(r_idx-1)*segments+(step+1)%segments
                now=r_idx*segments+step
                now_next=r_idx*segments+(step+1)%segments
                faces.extend([prev, now, prv_next, now, now_next, prv_next])
    return add_mesh(name,vs,rgba,faces,mat)


def glow_disk(name, mat, segments=48):
    # Soft radial exhaust glow, purely geometric so it works without external textures.
    rings=[(0.0,0.88),(0.25,0.85),(0.55,0.48),(0.95,0.17),(1.19,0.00)]
    v=[];colors=[];indices=[]
    for ri,(radius,a) in enumerate(rings):
        for i in range(segments):
            th=2*math.pi*i/segments
            v.append([radius*math.cos(th), radius*math.sin(th), 0.0])
            colors.append([0.48+0.38*(1-ri/(len(rings)-1)), 0.88, 1.0, a])
            if ri>0:
                a0=(ri-1)*segments+i
                a1=(ri-1)*segments+(i+1)%segments
                b0=ri*segments+i
                b1=ri*segments+(i+1)%segments
                indices.extend([a0,a1,b0,b0,a1,b1])
    return add_mesh(name,v,colors,indices,mat)

# Unlit materials make the flame self-illuminated even with no scene lighting.
if 'KHR_materials_unlit' not in data.setdefault('extensionsUsed', []):
    data['extensionsUsed'].append('KHR_materials_unlit')

def material(name, factor, emissive):
    i=len(data['materials'])
    data['materials'].append({
        'name': name,
        'pbrMetallicRoughness': {'baseColorFactor': list(factor), 'metallicFactor':0.0, 'roughnessFactor':1.0},
        'emissiveFactor': list(emissive),
        'alphaMode':'BLEND', 'doubleSided':True, 'extensions': {'KHR_materials_unlit': {}}
    })
    return i

halo_mat=material('Booster_Aqua_Glow', [1,1,1,1], [.15,.68,1.0])
outer_mat=material('Booster_Blue_Outer_Jet',[1,1,1,1],[.06,.40,1.0])
inner_mat=material('Booster_Cyan_Inner_Jet',[1,1,1,1],[.30,.84,1.0])
core_mat=material('Booster_White_Hot_Core',[1,1,1,1],[.86,.98,1.0])

outer=plume_profile(
 'Booster_Outer_Jet',
 [.80,.95,1.04,.94,.79,.57,.39,.16,.006],
 [0.0,.22,.56,1.10,1.72,2.36,3.10,3.90,4.65],
 [[.12,.52,1.00,.18],[.16,.58,1.0,.34],[.23,.66,1.0,.36],
  [.15,.55,1.0,.31],[.13,.48,1.0,.25],[.21,.44,1.0,.22],
  [.28,.38,1.0,.18],[.32,.28,1.0,.10],[.45,.25,1.0,0.0]],
 32,outer_mat
)
inner=plume_profile(
 'Booster_Inner_Jet',
 [.42,.50,.57,.49,.40,.27,.13,.004],
 [0.015,.25,.58,1.00,1.51,2.14,2.71,3.18],
 [[.72,.95,1.0,.66],[.58,.93,1.0,.82],[.43,.88,1.0,.77],
  [.33,.83,1.0,.68],[.30,.75,1.0,.55],[.25,.69,1.0,.40],
  [.23,.63,1.0,.25],[.35,.58,1.0,0.0]],
 28, inner_mat
)
core=plume_profile(
 'Booster_White_Core',
 [.22,.26,.24,.20,.13,.055,.003],
 [.03,.16,.36,.65,1.03,1.50,2.08],
 [[1,1,1,.91],[.92,1,1,.97],[.88,.99,1,.89],
  [.79,.98,1,.79],[.66,.94,1,.61],[.62,.91,1,.35],[.58,.87,1,0.0]],
 24, core_mat
)
glow=glow_disk('Booster_Nozzle_Glow',halo_mat)

nodes=data['nodes']
# Original spacecraft meshes remain unchanged; centering and rotation are non-destructive.
bounds=np.array([data['accessors'][0]['min'],data['accessors'][0]['max']],dtype=float)
center=bounds.mean(axis=0)
# Original is Z-down and nose points towards +Y. New local space is Y-up / -Z-forward.
R=np.array([[-1,0,0],[0,0,-1],[0,-1,0]],dtype=float)
assert round(np.linalg.det(R))==1
hull_quat=Rotation.from_matrix(R).as_quat().tolist()
scale=.01
hull_translation=(-scale*R@center).tolist()
hull=nodes[0]
hull.update({'name':'Hull_Original_Textured', 'rotation':hull_quat,
             'translation':hull_translation,'scale':[scale,scale,scale]})

def add_node(name,*,mesh=None,translation=None,scale=None,children=None,extras=None):
    n={'name':name}
    if mesh is not None: n['mesh']=mesh
    if translation is not None: n['translation']=list(translation)
    if scale is not None: n['scale']=list(scale)
    if children is not None: n['children']=list(children)
    if extras: n['extras']=extras
    i=len(nodes);nodes.append(n)
    return i

exhaust_ctrls=[]
engine_ids=[]
for name, xyz in [
    ('Port',(-201.0,693.0,390.0)),
    ('Starboard',(48.0,693.0,390.0)),
    ('Ventral',(-75.0,693.0,148.0)),
]:
    # Locate three physical nozzle openings detected from the aft mesh.
    xyz=np.asarray(xyz,dtype=float)
    local=(scale*R@(xyz-center)).tolist()
    disk=add_node(f'{name}_Engine_Nozzle_Glow',mesh=glow,translation=[0,0,0.04])
    layer1=add_node(f'{name}_Outer_Blue_Flame',mesh=outer)
    layer2=add_node(f'{name}_Inner_Cyan_Flame',mesh=inner)
    layer3=add_node(f'{name}_White_Core',mesh=core)
    flame_controller=add_node(f'{name}_Flame_Length_Control',translation=[0,0,0.15],children=[layer1,layer2,layer3])
    anchor=add_node(f'Thruster_{name}_Anchor',translation=local,children=[disk,flame_controller],
                    extras={'role':'rear_rocket_engine','original_mesh_coordinate':list(xyz)})
    exhaust_ctrls.append(flame_controller)
    engine_ids.append(anchor)

root=add_node('Flight_Rig_ROOT_Yup_NoseMinusZ',children=[0]+engine_ids,
              extras={'rig_type':'rigid_transform_hierarchy','forward_axis':'-Z','up_axis':'+Y',
                      'controls':['Root translation','Root rotation','Three booster flame scales']})
data['scenes'][data.get('scene',0)]['nodes']=[root]

# All clips share a root transform, plus independent pulsing controls for each jet.
def make_clip(name, times, pathfn, scale_fn, loop):
    t=np.asarray(times,dtype=np.float32)
    t_acc=append_accessor(t,5126,'SCALAR',name+'_frame_times',bounds=True)
    positions=[]; rots=[]
    for ti in t:
        p,euler_deg=pathfn(float(ti))
        positions.append(p)
        rots.append(Rotation.from_euler('xyz',euler_deg,degrees=True).as_quat().tolist())
    pos_acc=append_accessor(np.asarray(positions,dtype=np.float32),5126,'VEC3',name+'_root_positions')
    rot_acc=append_accessor(np.asarray(rots,dtype=np.float32),5126,'VEC4',name+'_root_quaternions')
    samplers=[];channels=[]
    def animate(node,path,accessor):
        sid=len(samplers)
        samplers.append({'input':t_acc,'output':accessor,'interpolation':'LINEAR'})
        channels.append({'sampler':sid,'target':{'node':node,'path':path}})
    animate(root,'translation',pos_acc)
    animate(root,'rotation',rot_acc)
    for engine_i,ctrl in enumerate(exhaust_ctrls):
        s=np.asarray([scale_fn(float(tt),engine_i) for tt in t],dtype=np.float32)
        scale_acc=append_accessor(s,5126,'VEC3',name+'_flame_scale_'+str(engine_i))
        animate(ctrl,'scale',scale_acc)
    data.setdefault('animations',[]).append({
        'name':name,'samplers':samplers,'channels':channels,
        'extras':{'loop_suggested':loop,'seconds':float(t[-1]),
                  'description': {'Hover_Loop':'Idle position, gentle bob and roll, short pulsing thrusters',
                                  'Flight_Travel':'Accelerating forward flight, slight bank, long thrust plumes',
                                  'Hover_Travel':'Slow forward hover travel, buoyant bob, medium thrust plumes'}[name]}
    })

pi=math.pi
hover_duration=4.0
def hover_pos(t):
    p=[.05*math.sin(2*pi*t/4), .21*math.sin(2*pi*t/2)+.045*math.sin(2*pi*t/4), .05*math.sin(2*pi*t/4)]
    a=[.75*math.sin(2*pi*t/2), .65*math.sin(2*pi*t/4), 1.0*math.sin(2*pi*t/4)]
    return p,a

def hover_flame(t,i):
    u=2*pi*t/4
    z=.75+.11*math.sin(2*u+i*.47)+.05*math.sin(4*u+i*.8)
    width=.97+.035*math.sin(2*u+i*.6)
    return [width,width,z]
make_clip('Hover_Loop',np.linspace(0,4,33),hover_pos,hover_flame,True)

def flight_pos(t):
    u=t/8
    p=[.45*math.sin(pi*u)**2, .17*math.sin(6*pi*u)+.09*math.sin(2*pi*u), -32*(u**1.42)]
    a=[-2.2*math.sin(pi*u)**2, 2.2*math.sin(pi*u), 3.5*math.sin(2*pi*u)]
    return p,a

def flight_flame(t,i):
    growth=1-math.exp(-t/1.15)
    z=.72+1.47*growth+.10*math.sin(2*pi*t*2+i*.68)
    width=.95+.12*growth+.04*math.sin(2*pi*t*2+i*.52)
    return [width,width,z]
make_clip('Flight_Travel',np.linspace(0,8,65),flight_pos,flight_flame,False)

def hover_travel_pos(t):
    u=t/8
    p=[.22*math.sin(2*pi*u), .20*math.sin(8*pi*u)+.04*math.sin(2*pi*u), -10*u]
    a=[1.15*math.sin(8*pi*u), .95*math.sin(2*pi*u), 1.65*math.sin(4*pi*u)]
    return p,a

def hover_travel_flame(t,i):
    s=1.00 + .10*math.sin(2*pi*t*1.5+i*.52)
    return [1.00,1.00,s]
make_clip('Hover_Travel',np.linspace(0,8,65),hover_travel_pos,hover_travel_flame,False)

asset=data.setdefault('asset',{})
asset['generator']='Procedural glTF rigid-spacecraft rig and booster animation'
data['buffers'][0]['byteLength']=len(blob)

# GLB requires JSON chunk padded with spaces and BIN to 4-byte boundary.
js=json.dumps(data,separators=(',',':'),ensure_ascii=False).encode('utf8')
js+=b' ' * (-len(js)%4)
blob.extend(b'\0'*(-len(blob)%4))
header_len=12+8+len(js)+8+len(blob)
with open(DEST,'wb') as fh:
    fh.write(struct.pack('<III',0x46546C67,2,header_len))
    fh.write(struct.pack('<I4s',len(js),b'JSON'))
    fh.write(js)
    fh.write(struct.pack('<I4s',len(blob),b'BIN\0'))
    fh.write(blob)
print('Wrote:',DEST, 'bytes:',os.path.getsize(DEST))
print('Rig root:',root, 'clips:',[a['name'] for a in data['animations']],
      'engine anchor local locations:',[nodes[i]['translation'] for i in engine_ids])
