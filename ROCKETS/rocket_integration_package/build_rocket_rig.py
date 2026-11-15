#!/usr/bin/env python3
"""Turn the uploaded four-mesh rocket into a portable, material-corrected animated GLB.

Usage: python build_rocket_rig.py <original.glb> <output.glb>
Rigid transform rig only: original model vertices, normals, UVs, texture images preserved.
New exhaust = transparent colored triangle meshes, no emission, no bloom.
"""
import sys, json, math, struct
from pathlib import Path
import numpy as np

source = Path(sys.argv[1] if len(sys.argv)>1 else '/mnt/data/26_11_14_01_12_11_237.glb')
target = Path(sys.argv[2] if len(sys.argv)>2 else '/mnt/data/rocket_integration_ready.glb')
raw=source.read_bytes()
magic,ver,file_len=struct.unpack_from('<4sII',raw,0)
assert (magic,ver,file_len)==(b'glTF',2,len(raw))
j_len,j_type=struct.unpack_from('<I4s',raw,12)
assert j_type==b'JSON'
gltf=json.loads(raw[20:20+j_len])
bin_len,bin_type=struct.unpack_from('<I4s',raw,20+j_len)
assert bin_type==b'BIN\x00'
buffer=bytearray(raw[28+j_len:28+j_len+bin_len])
assert len(buffer)==bin_len
original_node_count=len(gltf['nodes']); assert original_node_count==4
original_mesh_count=len(gltf['meshes']); assert original_mesh_count==4
assert len(gltf.get('animations',[]))==0

# Preserve the original base-color and metallic/roughness images and all mesh bytes.
# Transmission factor=1.0 made this asset look like washed-out glass.
for i, mat in enumerate(gltf['materials']):
    mat.pop('extensions',None)
    mat.pop('emissiveTexture',None)
    mat.pop('emissiveFactor',None)
    mat['name']=['Central_Core_Matte_Painted','Left_Booster_Matte_Painted','Upper_Equipment_Matte_Painted','Right_Booster_Matte_Painted'][i]
    mat['alphaMode']='OPAQUE'
    mat['doubleSided']=True
    mat.pop('alphaCutoff',None)
    pbr=mat.setdefault('pbrMetallicRoughness',{})
    pbr['baseColorFactor']=[1.0,1.0,1.0,1.0]
    pbr['metallicFactor']=0.18
    pbr['roughnessFactor']=1.0

# Convert texture/image/bufferView references for transmission maps into dead data? Keep original
# image objects intact to ensure exact original visual texture data, and remove transmission extension.
gltf['extensionsUsed']=[e for e in gltf.get('extensionsUsed',[]) if e!='KHR_materials_transmission']
gltf['extensionsRequired']=[e for e in gltf.get('extensionsRequired',[]) if e!='KHR_materials_transmission']
if not gltf['extensionsRequired']: gltf.pop('extensionsRequired',None)
if 'KHR_materials_unlit' not in gltf['extensionsUsed']:
    gltf['extensionsUsed'].append('KHR_materials_unlit')

# Add binary mesh and animation accessors, 4-byte aligned (same original BIN chunk retained).
def add_view(blob, target_type=None):
    pad=(-len(buffer))%4
    if pad: buffer.extend(b'\x00'*pad)
    offset=len(buffer)
    buffer.extend(blob)
    desc={'buffer':0,'byteOffset':offset,'byteLength':len(blob)}
    if target_type: desc['target']=target_type
    gltf.setdefault('bufferViews',[]).append(desc)
    return len(gltf['bufferViews'])-1

def add_accessor(arr,component,typ,normalized=False,target_type=None):
    arr=np.ascontiguousarray(arr)
    view=add_view(arr.tobytes(),target_type)
    ac={'bufferView':view,'byteOffset':0,'componentType':component,'count':int(len(arr)),'type':typ}
    if normalized: ac['normalized']=True
    if typ in ('SCALAR','VEC3') and component==5126 and len(arr):
        ac['min']=np.min(arr,axis=0).reshape(-1).astype(float).tolist()
        ac['max']=np.max(arr,axis=0).reshape(-1).astype(float).tolist()
    if typ=='VEC3' and component==5126:
        # ensure plain three-component arrays in .min/.max
        pass
    gltf.setdefault('accessors',[]).append(ac)
    return len(gltf['accessors'])-1

def ring_jet(name, radius, length, ring_profile, rgb_base, material_rgb, opacity):
    n=24
    positions=[]; colors=[]; faces=[]
    # Profile rings: 0-1 downstream, local negative Y direction.
    for i,(t,rs,a) in enumerate(ring_profile):
        for k in range(n):
            ang=2*math.pi*k/n
            taper_noise=1 + 0.045*math.sin(ang*5+i*1.3) + 0.025*math.cos(ang*9-i*1.9)
            rad=radius*rs*taper_noise
            positions.append([rad*math.cos(ang), -length*t, rad*math.sin(ang)])
            # richer colors at origin, softer at tip; no HDR values at any point
            shade=0.86+0.14*(1-t)
            r=min(1,rgb_base[0]*shade); g=min(1,rgb_base[1]*shade); b=min(1,rgb_base[2]*shade)
            colors.append([int(r*255),int(g*255),int(b*255),int(max(0,min(1,a))*255)])
    for ri in range(len(ring_profile)-1):
        for k in range(n):
            a=ri*n+k; b=ri*n+(k+1)%n; c=(ri+1)*n+k; d=(ri+1)*n+(k+1)%n
            faces.extend([a,c,b,b,c,d])
    p=np.array(positions,dtype=np.float32)
    c=np.array(colors,dtype=np.uint8)
    ind=np.array(faces,dtype=np.uint16)
    p_id=add_accessor(p,5126,'VEC3',target_type=34962)
    c_id=add_accessor(c,5121,'VEC4',normalized=True,target_type=34962)
    i_id=add_accessor(ind,5123,'SCALAR',target_type=34963)
    mat_id=len(gltf['materials'])
    gltf['materials'].append({
        'name':name+'_No_Emission',
        'doubleSided':True,
        'alphaMode':'BLEND',
        'emissiveFactor':[0,0,0],
        'extensions':{'KHR_materials_unlit':{}},
        'pbrMetallicRoughness':{'baseColorFactor':[material_rgb[0],material_rgb[1],material_rgb[2],opacity], 'metallicFactor':0, 'roughnessFactor':1}
    })
    m_id=len(gltf['meshes'])
    gltf['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':p_id,'COLOR_0':c_id},'indices':i_id,'material':mat_id,'mode':4}]})
    return m_id

# Separate overlapping shells; clipped alpha near their tips prevents harsh ends.
outer_mesh=ring_jet('Rocket_Exhaust_Outer_Amber',.82,5.6,
  [(0,.86,.36),(.09,1,.55),(.18,.96,.60),(.30,.85,.48),(.44,.70,.37),(.58,.55,.27),(.72,.37,.18),(.88,.18,.07),(1,.005,0)],
  [1,.72,.34],[.99,.63,.32],.58)
inner_mesh=ring_jet('Rocket_Exhaust_Inner_Gold',.44,3.9,
  [(0,.92,.46),(.08,1,.66),(.22,.94,.63),(.36,.80,.53),(.50,.60,.40),(.70,.36,.19),(.86,.17,.07),(1,.005,0)],
  [1,.95,.80],[1,.86,.58],.60)
core_mesh=ring_jet('Rocket_Exhaust_Core_Pale',.21,2.2,
  [(0,.95,.40),(.14,1,.65),(.31,.84,.52),(.51,.61,.36),(.70,.39,.19),(.87,.19,.08),(1,.005,0)],
  [1,1,.95],[.95,.92,.83],.48)

# Rocket's preexisting geometry is in unusually large absolute units.
# Preserve the untouched imported vertex bytes; normalize using just one parent transform.
center=(-93.76268005371094,1819.4175415039062,1525.6392822265625)
scale=.01
nodes=gltf['nodes']
for i,label in enumerate(['Central_Core_Textured','Left_Solid_Booster_Textured','Upper_Core_Equipment_Textured','Right_Solid_Booster_Textured']):
    nodes[i]['name']=label
visual_id=len(nodes)
nodes.append({'name':'Rocket_Original_Textured_Assembly','children':[0,1,2,3],
              'scale':[scale,scale,scale],
              'translation':[-center[0]*scale,-center[1]*scale,-center[2]*scale]})

thruster_roots=[]; length_nodes=[]
for name,world_point,diam in [
    ('Left', (179.5,424.72,1555.7),1.0),
    ('Right',(-367.5,424.72,1555.3),1.0),
    ('Central',(-82.9,746.19,1525.3),1.35),
]:
    jet_ids=[]
    for typ, mesh in [('Outer',outer_mesh),('Inner',inner_mesh),('Core',core_mesh)]:
        idx=len(nodes); nodes.append({'name':f'{name}_Engine_Exhaust_{typ}','mesh':mesh})
        jet_ids.append(idx)
    length_id=len(nodes)
    nodes.append({'name':f'{name}_Flame_Length_Control','children':jet_ids,
                  'scale':[diam,.38,diam]})
    length_nodes.append(length_id)
    anchor_id=len(nodes)
    nodes.append({'name':f'Thruster_{name}_Anchor',
                  'translation':[(world_point[0]-center[0])*scale,
                                 (world_point[1]-center[1])*scale-.06,
                                 (world_point[2]-center[2])*scale],
                  'children':[length_id]})
    thruster_roots.append(anchor_id)

root_id=len(nodes)
nodes.append({'name':'Rocket_Flight_Rig_ROOT_Yup_NosePlusY',
              'children':[visual_id]+thruster_roots})
gltf['scenes']=[{'nodes':[root_id]}];gltf['scene']=0

# Clip animation channels: raw root position and rotation, plus independent nozzle scale.
def quaternion(rx_deg,ry_deg,rz_deg):
    x,y,z=[math.radians(q)/2 for q in (rx_deg,ry_deg,rz_deg)]
    cx,sx=math.cos(x),math.sin(x)
    cy,sy=math.cos(y),math.sin(y)
    cz,sz=math.cos(z),math.sin(z)
    return [sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz]

def make_clip(name,length,kind):
    t=np.linspace(0,length,33,dtype=np.float32)
    pos=[]; rot=[]; scales=[[],[],[]]
    for u in t:
        u=float(u); phase=u*math.pi*2/4.0
        if kind=='hover':
            height=.17*math.sin(phase-.18)
            pitch=.45*math.sin(phase*.65)
            yaw=.36*math.sin(phase*.46)
            roll=.63*math.sin(phase+.85)
            flm=.38+ .045*math.sin(phase*2+.2)
        elif kind=='flight':
            alpha=u/length
            height=54*alpha**1.75
            pitch=3*math.sin(math.pi*alpha)**2+.45*math.sin(phase*.65)
            yaw=1.0*math.sin(math.pi*alpha)
            roll=1.2*math.sin(phase*.53)*math.sin(math.pi*alpha)
            flm=1.14+.10*math.sin(phase*2.7)+.21*math.sin(math.pi*alpha)
        elif kind=='hovertravel':
            alpha=u/length
            height=14*alpha+.12*math.sin(phase)
            pitch=.95*math.sin(phase*.56)
            yaw=.46*math.sin(phase*.45)
            roll=1.1*math.sin(phase+.45)
            flm=.63+.05*math.sin(phase*2)
        elif kind=='flight_inplace':
            height=0
            pitch=1.2+.50*math.sin(phase*.8)
            yaw=.4*math.sin(phase*.5)
            roll=.72*math.sin(phase+.8)
            flm=1.17+.12*math.sin(phase*2.2)
        elif kind=='hover_inplace':
            height=0
            pitch=.35*math.sin(phase*.8)
            yaw=.2*math.sin(phase*.5)
            roll=.40*math.sin(phase+.7)
            flm=.40+.04*math.sin(phase*2.2)
        pos.append([0,height,0]);rot.append(quaternion(pitch,yaw,roll))
        for index,mul in enumerate([1,1.03,.92]):
            dims=[1.0 if index<2 else 1.35, max(.05,flm*mul), 1.0 if index<2 else 1.35]
            scales[index].append(dims)
    clip={'name':name,'samplers':[],'channels':[]}
    t_acc=add_accessor(t,5126,'SCALAR')
    def track(values,node,path,typ):
        acc=add_accessor(np.array(values,dtype=np.float32),5126,typ)
        sampl_id=len(clip['samplers'])
        clip['samplers'].append({'input':t_acc,'output':acc,'interpolation':'LINEAR'})
        clip['channels'].append({'sampler':sampl_id,'target':{'node':node,'path':path}})
    # No translation track on explicitly in-place clips, so gameplay position remains controllable.
    if kind not in ('flight_inplace','hover_inplace'):
        track(pos,root_id,'translation','VEC3')
    track(rot,root_id,'rotation','VEC4')
    for i,id_ in enumerate(length_nodes):track(scales[i],id_,'scale','VEC3')
    return clip

clips=[
    ('Hover_Loop',4.0,'hover'),
    ('Flight_Travel',8.0,'flight'),
    ('Hover_Travel',8.0,'hovertravel'),
    ('Flight_InPlace',4.0,'flight_inplace'),
    ('Hover_InPlace',4.0,'hover_inplace'),
]
gltf['animations']=[make_clip(*c) for c in clips]
gltf['buffers'][0]['byteLength']=len(buffer)
gltf['asset']['generator']='Rocket rigid transform rig with original textures and subtle non-emissive amber exhaust'
gltf['asset']['extras']={
 'up_axis':'+Y','nose_axis':'+Y','boost_direction':'-Y','unit_normalization':0.01,
 'hull_materials_opaque':True,'boosters_nonemissive':True,'requires_bloom':False,
 'animation_clips':[s[0] for s in clips],
 'engine_mounts':['Thruster_Left_Anchor','Thruster_Right_Anchor','Thruster_Central_Anchor'],
 'controls':'Animation channels target the rocket root and flame length nodes, no skinning',
}
blob=json.dumps(gltf,separators=(',',':'),ensure_ascii=False).encode('utf8')
blob+=b' '*((-len(blob))%4)
buffer.extend(b'\x00'*((-len(buffer))%4))
gltf['buffers'][0]['byteLength']=len(buffer)
# byte length now same 4-aligned; recreate json only if changed
blob=json.dumps(gltf,separators=(',',':'),ensure_ascii=False).encode('utf8');blob+=b' '*((-len(blob))%4)
length=12+8+len(blob)+8+len(buffer)
with target.open('wb') as f:
    f.write(struct.pack('<4sII',b'glTF',2,length))
    f.write(struct.pack('<I4s',len(blob),b'JSON'))
    f.write(blob)
    f.write(struct.pack('<I4s',len(buffer),b'BIN\x00'))
    f.write(buffer)
print('Wrote',target, 'bytes',length,'nodes',len(nodes),'meshes',len(gltf['meshes']),'animations',[(c['name'],len(c['channels'])) for c in gltf['animations']])
