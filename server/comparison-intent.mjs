import { requestedDuration } from './app-tools.mjs';
const words=value=>String(value).toLowerCase().replace(/([a-z])(\d)/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim();
export function comparisonIntent(input,sites) {
  const question=String(input.question??'');
  if(!/\b(?:compare|comparison|versus|vs\.?|trade.?off)\b/i.test(question))return null;
  const text=' '+words(question)+' ';
  const mentions=sites.map(site=>({site,at:Math.min(...[site.id,site.name].map(name=>text.indexOf(' '+words(name)+' ')).filter(at=>at>=0))}));
  const mentioned=mentions.filter(item=>Number.isFinite(item.at)).sort((a,b)=>a.at-b.at).map(item=>item.site);
  if(mentioned.length<2||mentioned.length>4)return null;
  const explicit=question.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/);
  if(!explicit && /\b\d{4}-\d{2}-\d{2}\b/.test(question))return null;
  if(!explicit && /\b(?:tomorrow|yesterday|next\s+(?:day|week|month)|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(question))return null;
  const iso=explicit?.[0]??input.context?.timeUtc;
  if(!iso||!Number.isFinite(Date.parse(iso)))return null;
  let durationDays;try{durationDays=requestedDuration(input,mentioned[0].id)}catch{return null}
  const noChanges=/\b(?:do not|don['’]t|without)\s+(?:change|changing|modify|modifying)|\bsteps only\b/i.test(question);
  const changes=/\b(?:open|add|save|create|fly|navigate|change|set|export|download|plan)\b/i.test(question);
  return {siteIds:mentioned.map(site=>site.id),iso:new Date(iso).toISOString(),durationDays,readOnly:noChanges||!changes};
}
