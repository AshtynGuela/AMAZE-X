"""Build the small, numerical first-paint grid from verified NASA LOLA samples."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = next(p for p in json.loads((ROOT/'public/data/manifest.json').read_text())['products'] if p['product']=='ldem_128')
raw = Path(os.environ.get('LUNAR_TERRAIN_DATA_DIR', ROOT.parent/'lunar-scout/data/raw'))/'ldem_128.img'
with raw.open('rb') as stream:
    if hashlib.file_digest(stream,'sha256').hexdigest() != source['sha256']:
        raise ValueError('NASA source checksum differs from the verified manifest')
grid = np.memmap(raw,dtype='<i2',mode='r',shape=(source['rows'],source['cols']))
# A preview cell is centred on the same longitude/latitude as the corresponding
# four original pixels. Keep numeric heights, not an image brightness encoding.
coarse = np.rint((grid[7::16,7::16].astype(float)+grid[8::16,7::16]+grid[7::16,8::16]+grid[8::16,8::16])/4).astype('<i2')
payload=coarse.tobytes();folder=ROOT/'data/terrain';folder.mkdir(exist_ok=True)
with (folder/'ldem_8_preview.i16.gz').open('wb') as stream:
    with gzip.GzipFile(fileobj=stream,mode='wb',mtime=0) as zipped:zipped.write(payload)
metadata={**source,'product':'ldem_8_preview','rows':coarse.shape[0],'cols':coarse.shape[1],'byteLength':len(payload),'mapScaleM':source['mapScaleM']*16,'sha256':hashlib.sha256(payload).hexdigest(),'sourceProduct':'ldem_128','sourceSha256':source['sha256'],'nativeSourceResolutionM':source['mapScaleM'],'access':'Bundled NASA-derived numerical preview','derivation':'8 pixels/degree; four central source pixels averaged and rounded to one source unit (0.5 m); maximum rounding 0.25 m. Coarse cells are for preview only.'}
(folder/'preview.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'shape':coarse.shape,'compressedBytes':(folder/'ldem_8_preview.i16.gz').stat().st_size,'resolutionM':metadata['mapScaleM'],'sha256':metadata['sha256']}))
