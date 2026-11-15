"""Independent GDAL/PROJ and Cartesian skyline check against NASA PDS heights.

No production projection, sampler, geodesic or skyline helper is imported.
Rasterio/GDAL is a local validation dependency, not a web-service dependency.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform
from rasterio.windows import Window

ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('LUNAR_TERRAIN_DATA_DIR',ROOT.parent/'lunar-scout/data/raw'))
URL='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_20m.lbl'
label=DATA/'ldem_80s_20m.lbl'
dataset=str(label) if label.is_file() else '/vsicurl/'+URL
product=next(p for p in json.loads((ROOT/'public/data/manifest.json').read_text())['products'] if p['product']=='ldem_80s_20m')
source_hash=None
if label.is_file():
    with (DATA/'ldem_80s_20m.img').open('rb') as stream:source_hash=hashlib.file_digest(stream,'sha256').hexdigest()
    if source_hash!=product['sha256']:raise ValueError('Independent PDS source checksum differs from the NASA manifest')
R=1737400.; MAST=2
BEARINGS=np.arange(720)*.5
# Independently denser radial sampling than the app: ten/fifty/250 metres.
DIST=np.r_[np.arange(10,2000,10),np.arange(2000,20000,50),np.arange(20000,150001,250)]

def samples(src,lat,lon):
    shape=lat.shape
    geographic=CRS.from_proj4('+proj=longlat +a=1737400 +b=1737400 +no_defs')
    x,y=transform(geographic,src.crs,lon.ravel().tolist(),lat.ravel().tolist())
    col,row=(~src.transform)*(np.asarray(x),np.asarray(y))
    col-=.5;row-=.5
    if np.any(col<0) or np.any(row<0) or np.any(col>=src.width-1) or np.any(row>=src.height-1):
        raise ValueError('Reference rays leave the PDS polar raster')
    c0,r0=col.astype(int),row.astype(int);u,v=col-c0,row-r0
    cc=np.stack([c0,c0+1,c0,c0+1]);rr=np.stack([r0,r0,r0+1,r0+1])
    columns=cc.ravel();rows=rr.ravel();block=256;stride=math.ceil(src.width/block)
    keys=(rows//block)*stride+columns//block;order=np.argsort(keys);sorted_keys=keys[order]
    unique,starts=np.unique(sorted_keys,return_index=True);ends=np.r_[starts[1:],len(order)]
    raw=np.empty(len(rows),dtype=float)
    for key,a,b in zip(unique,starts,ends):
        by,bx=divmod(int(key),stride);left,top=bx*block,by*block
        pixels=src.read(1,window=Window(left,top,min(block,src.width-left),min(block,src.height-top)))
        locations=order[a:b];raw[locations]=pixels[rows[locations]-top,columns[locations]-left]
    corners=raw.reshape(4,-1)
    value=(1-v)*((1-u)*corners[0]+u*corners[1])+v*((1-u)*corners[2]+u*corners[3])
    # GDAL exposes the PDS scaling as radius, not height above the lunar sphere.
    return (value*src.scales[0]+src.offsets[0]-R).reshape(shape)

def reference(src,lat,lon,observer_height):
    phi,lam=np.radians([lat,lon]);up=np.array([np.cos(phi)*np.cos(lam),np.cos(phi)*np.sin(lam),np.sin(phi)])
    east=np.array([-np.sin(lam),np.cos(lam),0.]);north=np.cross(up,east)
    az=np.radians(BEARINGS)[:,None];arc=DIST[None,:]/R
    tangent=np.cos(az)[...,None]*north+np.sin(az)[...,None]*east
    radial=np.cos(arc)[...,None]*up+np.sin(arc)[...,None]*tangent
    latitudes=np.degrees(np.arctan2(radial[...,2],np.hypot(radial[...,0],radial[...,1])))
    longitudes=np.degrees(np.arctan2(radial[...,1],radial[...,0]))
    heights=samples(src,latitudes,longitudes)
    if not np.isfinite(heights).all() or np.any(heights < -12000):raise ValueError('Missing reference elevation')
    delta=radial*(R+heights)[...,None]-up*(R+observer_height+MAST)
    vertical=delta@up;horizontal=np.hypot(delta@north,delta@east)
    angles=np.degrees(np.arctan2(vertical,horizontal))
    peaks=np.ones_like(angles,dtype=bool)
    peaks[:,1:] &= angles[:,1:]>=angles[:,:-1]
    peaks[:,:-1] &= angles[:,:-1]>=angles[:,1:]
    scores=np.where(peaks,angles,-np.inf)
    candidates=np.argpartition(scores,-8,axis=1)[:,-8:]
    candidates=np.where(np.isfinite(np.take_along_axis(scores,candidates,axis=1)),candidates,angles.argmax(axis=1)[:,None])
    a=DIST[np.maximum(0,candidates-1)];b=DIST[np.minimum(len(DIST)-1,candidates+1)]
    distances=(a[...,None]+(b-a)[...,None]*np.linspace(0,1,17)).reshape(len(BEARINGS),-1)
    arc=distances/R
    radial=np.cos(arc)[...,None]*up+np.sin(arc)[...,None]*tangent
    latitudes=np.degrees(np.arctan2(radial[...,2],np.hypot(radial[...,0],radial[...,1])))
    longitudes=np.degrees(np.arctan2(radial[...,1],radial[...,0]))
    heights=samples(src,latitudes,longitudes)
    delta=radial*(R+heights)[...,None]-up*(R+observer_height+MAST)
    extra=np.degrees(np.arctan2(delta@up,np.hypot(delta@north,delta@east)))
    return np.maximum(angles.max(axis=1),extra.max(axis=1))

started=time.monotonic();cases=[]
shackleton=json.loads((ROOT/'public/data/shackleton.json').read_text());shackleton['id']='shackleton';cases.append(shackleton)
for name,lat,lon in [('custom-polar-east',-89.,120.),('custom-polar-west',-88.8,-30.)]:
    env={**os.environ,'LUNAR_TERRAIN_DATA_DIR':str(DATA)}
    result=subprocess.run([sys.executable,str(ROOT/'scripts/lunar_terrain.py'),str(lat),str(lon),'full'],cwd=ROOT,env=env,capture_output=True,text=True,timeout=180,check=True)
    item=json.loads(result.stdout);item['id']=name;cases.append(item)
results=[]
with rasterio.Env(GDAL_CACHEMAX=128*1024*1024,GDAL_HTTP_TIMEOUT='30'):
    with rasterio.open(dataset) as src:
        if src.shape!=(30400,30400) or src.transform.a!=20 or src.transform.e!=-20:raise ValueError('Unexpected PDS geometry')
        for item in cases:
            ref=reference(src,item['lat'],item['lon'],item['elevationM']);app=np.array(item['masks']['2']);residual=app-ref
            observer_check=float(samples(src,np.array([item['lat']]),np.array([item['lon']]))[0])
            worst=np.argsort(np.abs(residual))[-12:][::-1]
            result={'id':item['id'],'lat':item['lat'],'lon':item['lon'],'mastM':MAST,'appElevationM':item['elevationM'],'referenceElevationM':observer_check,'observerHeightDifferenceM':item['elevationM']-observer_check,'appResolutionM':item['resolutionM'],'referenceResolutionM':20,'directions':720,'meanBiasDeg':float(residual.mean()),'rmseDeg':float(np.sqrt(np.mean(residual**2))),'p95AbsErrorDeg':float(np.percentile(abs(residual),95)),'maxAbsErrorDeg':float(max(abs(residual))),'withinReviewThreshold':bool(max(abs(residual))<=.1),'worstBearings':[{'azimuthDeg':float(BEARINGS[i]),'appDeg':float(app[i]),'referenceDeg':float(ref[i]),'residualDeg':float(residual[i])} for i in worst],'appProfileDeg':app.tolist(),'referenceProfileDeg':ref.tolist()}
            results.append(result);print(json.dumps({k:v for k,v in result.items() if k not in ['appProfileDeg','referenceProfileDeg','worstBearings']}),flush=True)
report={'validatedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'seconds':time.monotonic()-started,'method':'Independent GDAL PDS reader and label georeferencing, PROJ coordinate transformation, bilinear heights and Cartesian local-frame ray angles; no production helpers imported. Denser radial samples to 150 km.','referenceSampling':{'baseStepsM':[10,50,250],'localMaximaRefined':8,'subdivisions':16,'bearings':720,'radiusM':150000},'frame':'Mean Earth / Polar Axis, planetocentric latitude, east-positive longitude','verticalDatum':'Height above the 1,737,400 m sphere; PDS scale/offset applied as radius then reference radius subtracted. Identical app observer elevation and 2 m mast used for both skyline calculations.','source':URL,'sourceSha256':source_hash,'labelSha256':hashlib.sha256(label.read_bytes()).hexdigest() if label.is_file() else None,'gdalVersion':rasterio.__gdal_version__,'reviewThresholdDeg':.1,'independentDataset':False,'limitations':'Independent implementation of the same NASA 20 m PDS source, not an independent mission dataset or direct QuickMap skyline certification. The app may include regional 5 m data absent from this reference. The 0.1 degree threshold is a review trigger, not an error guarantee.','passed':all(r['withinReviewThreshold'] for r in results),'results':results}
(ROOT/'data/validation/terrain-horizon-independent.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
print(json.dumps({'passed':report['passed'],'cases':len(results),'seconds':report['seconds']}))
