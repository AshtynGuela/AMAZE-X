import {useEffect,useRef,type MutableRefObject} from 'react';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {entryFlightPose} from '../engine/entry-flight.mjs';

export type FlightDriver={progress:number;paint:((progress:number)=>void)|null};
let assets:Promise<[GLTF,GLTF]>|undefined;
export function prepareFlightAssets(){
  if(!assets){
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    assets=Promise.all([loader.loadAsync('/assets/entry/rocket.glb'),loader.loadAsync('/assets/entry/spacecraft.glb')]).catch(error=>{assets=undefined;throw error});
  }
  return assets;
}
function normalized(gltf:GLTF,height:number,ship=false){
  const content=gltf.scene.clone(true),model=new THREE.Group();
  if(ship)content.rotation.x=Math.PI/2;
  content.updateMatrixWorld(true);
  const hull=ship?content.getObjectByName('Hull_Original_Textured'):content.getObjectByName('Rocket_Original_Textured_Assembly');
  const bounds=new THREE.Box3().setFromObject(hull??content),center=bounds.getCenter(new THREE.Vector3());
  const scale=height/Math.max(.01,bounds.getSize(new THREE.Vector3()).y);
  content.scale.multiplyScalar(scale);content.position.sub(center.multiplyScalar(scale));model.add(content);
  const materials:THREE.Material[]=[];
  content.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
    const array=Array.isArray(object.material);
    const ownMaterials=(array?object.material as THREE.Material[]:[object.material as THREE.Material]).map(material=>{
      const own=material.clone();materials.push(own);return own;
    });
    object.material=array?ownMaterials:ownMaterials[0];
  });
  model.updateMatrixWorld(true);
  // Only exhaust tracks are sampled; root translation/attitude comes from scroll.
  const source=gltf.animations.find(c=>c.name==='Flight_InPlace')??gltf.animations.find(c=>c.name==='Flight_Travel');
  const mixer=new THREE.AnimationMixer(content);
  if(source)mixer.clipAction(new THREE.AnimationClip('Scroll exhaust',source.duration,source.tracks.filter(t=>/Flame_Length_Control/.test(t.name)))).play();
  return {model,content,materials,mixer};
}
export default function EntryFlight({driver,onReady}:{driver:MutableRefObject<FlightDriver>;onReady:()=>void}){
  const host=useRef<HTMLDivElement>(null),ready=useRef(onReady);ready.current=onReady;
  useEffect(()=>{
    const node=host.current!;let alive=true,renderer:THREE.WebGLRenderer|undefined,resize:ResizeObserver|undefined;
    const disposers:(()=>void)[]=[];
    const fallback=(error?:unknown)=>{if(alive){node.dataset.state='unavailable';node.dataset.reason=error instanceof Error?error.message:'Flight preparation timed out';ready.current()}};
    const timeout=window.setTimeout(fallback,12000);
    const lost=(event:Event)=>{event.preventDefault();fallback()};
    void prepareFlightAssets().then(([rocketGLTF,shipGLTF])=>{
      if(!alive)return;
      node.dataset.stage='renderer';
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
      node.appendChild(renderer.domElement);renderer.domElement.addEventListener('webglcontextlost',lost);
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,100);
      camera.position.set(8,3.5,15);camera.lookAt(0,.1,0);
      scene.add(new THREE.HemisphereLight('#deedff','#24283b',2.6));
      const key=new THREE.DirectionalLight('#fff3df',4);key.position.set(4,7,9);scene.add(key);
      const rim=new THREE.DirectionalLight('#9acbff',3);rim.position.set(-5,3,-4);scene.add(rim);
      node.dataset.stage='normalizing';
      const rocket=normalized(rocketGLTF,4.9),ship=normalized(shipGLTF,1.55,true);
      disposers.push(()=>{for(const item of [rocket,ship]){item.mixer.stopAllAction();item.mixer.uncacheRoot(item.content);item.materials.forEach(m=>m.dispose())}});
      const flight=new THREE.Group(),core=new THREE.Group();scene.add(flight);flight.add(core,ship.model);core.add(rocket.model);
      node.dataset.stage='staging';
      const boosters=['Left','Right'].map(side=>{
        const mesh=rocket.content.getObjectByName(side+'_Solid_Booster_Textured');
        if(!mesh)throw Error('Missing detachable '+side+' booster');
        const pivot=new THREE.Group();pivot.position.copy(new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()));
        rocket.model.add(pivot);pivot.attach(mesh);
        const exhaust=rocket.content.getObjectByName('Thruster_'+side+'_Anchor');if(exhaust)pivot.attach(exhaust);
        return {pivot,rest:pivot.position.clone(),sign:pivot.position.x>=0?1:-1};
      });
      const central=rocket.content.getObjectByName('Thruster_Central_Anchor');
      // The spacecraft is attached along the upper core, nose aligned +Y.
      const shipRest=new THREE.Vector3(0,1.9,.68);
      let last=-1;
      const render=(progress:number)=>{
        if(!alive||!renderer||document.hidden)return;
        const pose=entryFlightPose(progress);node.style.opacity=String(pose.opacity);node.dataset.phase=pose.phase;node.dataset.progress=progress.toFixed(4);
        if(pose.opacity<=0){last=progress;return}
        const phone=node.clientWidth<700;
        flight.position.set(pose.x*(phone ? .42 : 1),pose.y,0);flight.scale.setScalar(pose.scale*(phone ? .83 : 1));flight.rotation.z=pose.bank;
        core.position.set(-pose.coreDrop*.5,-pose.coreDrop*4,pose.coreDrop*.6);core.rotation.z=pose.coreDrop*.16;
        for(const item of boosters){item.pivot.position.copy(item.rest).add(new THREE.Vector3(item.sign*pose.boosterSplit*2.7,-pose.boosterSplit*1.8,pose.boosterSplit*.4));item.pivot.rotation.z=-item.sign*pose.boosterSplit*.6;}
        ship.model.position.copy(shipRest).add(new THREE.Vector3(pose.spacecraftSplit*.7,pose.spacecraftSplit*1.8,-pose.spacecraftSplit*3.5));
        ship.model.rotation.set(-pose.spacecraftSplit*.22,pose.spacecraftSplit*.18,-pose.spacecraftSplit*.1);
        rocket.mixer.setTime(progress*8);ship.mixer.setTime(progress*8);
        if(central)central.visible=pose.exhaust>.05;
        for(const side of ['Port','Starboard','Ventral']){const anchor=ship.content.getObjectByName('Thruster_'+side+'_Anchor');if(anchor)anchor.visible=pose.shipExhaust>.05;}
        renderer.render(scene,camera);node.dataset.drawCalls=String(renderer.info.render.calls);last=progress;
      };
      node.dataset.stage='rendering';
      driver.current.paint=render;
      const measure=()=>{if(!renderer)return;const width=node.clientWidth,height=node.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();render(driver.current.progress)};
      resize=new ResizeObserver(measure);resize.observe(node);measure();
      const visibility=()=>{if(!document.hidden)render(last<0?driver.current.progress:last)};
      document.addEventListener('visibilitychange',visibility);disposers.push(()=>document.removeEventListener('visibilitychange',visibility));
      node.dataset.state='ready';clearTimeout(timeout);ready.current();render(driver.current.progress);
    }).catch(fallback);
    return()=>{alive=false;clearTimeout(timeout);driver.current.paint=null;resize?.disconnect();disposers.forEach(dispose=>dispose());if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}};
  },[driver]);
  return <div ref={host} className="welcome-flight" data-state="loading" aria-hidden="true"/>;
}
