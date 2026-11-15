const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
export const entryProgress=(previous,delta,distance)=>clamp(previous+delta/distance);
// A pose is a pure function of scroll position: no accumulated simulation or
// clock-driven stages, so reversing input reassembles the same attachment.
export function entryFlightPose(progress){
  const p=clamp(progress),arrival=smooth(.04,.28,p),boost=smooth(.3,.56,p),release=smooth(.56,.82,p),depart=smooth(.72,1,p);
  return {progress:p,opacity:smooth(.03,.14,p)*(1-smooth(.88,1,p)),
    boosterSplit:boost,spacecraftSplit:release,
    x:-1.9+arrival*1.4+depart*1.5,y:-5.2+arrival*4.1+depart*1.3,
    scale:1-depart*.85,bank:-.14+arrival*.1+depart*.25,
    coreDrop:smooth(.58,.92,p),exhaust:1-smooth(.5,.76,p),shipExhaust:smooth(.55,.7,p),
    phase:p<.3?'ascent':p<.56?'booster-separation':p<.82?'spacecraft-separation':'departure'};
}
