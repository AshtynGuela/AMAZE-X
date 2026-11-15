import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const cache='.cache/entry-assets',output='public/assets/entry';
await fs.mkdir(cache,{recursive:true});await fs.mkdir(output,{recursive:true});
const records=[];
for(const [id,source] of [['rocket','ROCKETS/rocket_integration_package/rocket_integration_ready.glb'],['spacecraft','ROCKETS/spacecraft_animation_bundle/spacecraft_rigged_animated.glb']]){
  if(!process.argv.includes('--manifest-only')){
  execFileSync(process.env.LUNAR_TERRAIN_PYTHON??'python',['scripts/resize_glb_textures.py',source,cache+'/'+id+'.glb','1024'],{stdio:'inherit',windowsHide:true});
  execFileSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','@gltf-transform/cli@4.4.0','meshopt',cache+'/'+id+'.glb',output+'/'+id+'.glb','--quantize-position','16','--quantize-texcoord','14','--quantize-normal','12'],{stdio:'inherit',shell:process.platform==='win32',windowsHide:true});
  }
  const raw=await fs.readFile(source),served=await fs.readFile(output+'/'+id+'.glb');
  records.push({id,source,sourceBytes:raw.length,sourceSha256:createHash('sha256').update(raw).digest('hex'),url:'/assets/entry/'+id+'.glb',bytes:served.length,sha256:createHash('sha256').update(served).digest('hex')});
}
await fs.writeFile(output+'/assets.json',JSON.stringify({preparation:'User-supplied ROCKETS assets. Source geometry, node rig and material maps retained; embedded PNGs capped at 1024 px, Meshopt with position 16 / UV 14 / normals 12 bits. No decimation or mesh joining.',records},null,2)+'\n');
