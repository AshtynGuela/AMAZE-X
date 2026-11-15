"""Refresh curated polar masks with the same peak refinement as custom sites."""
import json
from pathlib import Path
from lunar_terrain import terrain_at
ROOT=Path(__file__).resolve().parents[1]
for site in json.loads((ROOT/'data/sites.json').read_text()):
    if abs(site['lat'])<80:continue
    target=ROOT/'public/data'/f"{site['id']}.json"
    if not target.is_file():continue
    before=json.loads(target.read_text())
    after={**before,**terrain_at(site['lat'],site['lon']), 'siteId':site['id']}
    target.write_text(json.dumps(after,separators=(',',':'),allow_nan=False)+'\n',newline='\n')
    print(json.dumps({'siteId':site['id'],'peakRefinement':after['peakRefinement'],'seconds':after['calculationSeconds']}),flush=True)
