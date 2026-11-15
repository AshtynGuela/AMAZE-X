const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
export const entryProgress=(previous,delta,distance)=>clamp(previous+delta/distance);
export function cutsceneProgress(previous,deltaMs,assetsReady,mapReady,reduced=false){
  const next=clamp(previous+Math.max(0,deltaMs)/(reduced?220:4800));
  return Math.min(next,!assetsReady ? .08 : !mapReady ? .96 : 1);
}
// Deterministic staging poses, driven by the short entry cutscene's progress.
export function entryFlightPose(progress){
  const p=clamp(progress),arrival=smooth(.04,.28,p),boost=smooth(.3,.56,p),release=smooth(.56,.82,p),depart=smooth(.72,1,p);
  return {progress:p,opacity:smooth(.03,.14,p)*(1-smooth(.88,1,p)),
    boosterSplit:boost,spacecraftSplit:release,
    x:-.7+arrival*.2+depart*.3,y:-6.5+arrival*5.4+depart*6,
    scale:1-depart*.55,bank:-.08+arrival*.06+depart*.12,
    coreDrop:smooth(.58,.92,p),exhaust:1-smooth(.5,.76,p),shipExhaust:smooth(.55,.7,p),
    phase:p<.3?'ascent':p<.56?'booster-separation':p<.82?'spacecraft-separation':'departure'};
}
