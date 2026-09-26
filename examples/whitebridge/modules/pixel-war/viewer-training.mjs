import {ensureProgress,refreshProgress} from './progression.mjs';
export function isViewerTroop(u){return !['hero','barracks'].includes(u.kind)&&u.side!=='neutral'&&!!u.supporter?.id&&['test','bilibili','xiaohongshu'].includes(u.supporter.platform)&&['test','bilibili','xiaohongshu'].includes(u.source);}
// Both factions use the same era. A viewer's reinforcements should survive a
// current commander hit while keeping their unit's strengths and weaknesses.
export function trainViewerTroop(w,u){
 if(!isViewerTroop(u)||!ensureProgress(u))return false;
 const rank=Math.max(0,...Object.values(w.heroes).map(h=>h.rank||0));
 const previousHP=u.viewerTraining?u.hp:null;
 const old=u.viewerTraining||{hp:1,attack:1,armor:0,rank:-1};
 const q=u.giftQuality||{},qualityKey=JSON.stringify(q);
 if(q.power?.version===1){
  if(old.revision===3&&old.rank>=rank&&old.qualityKey===qualityKey)return false;
  const fraction=Math.max(0,Math.min(1,u.hp/u.maxHP));u.viewerTraining={revision:3,rank,qualityKey,hp:1,attack:1,armor:0};refreshProgress(u,w.time);u.hp=previousHP===null?u.maxHP*fraction:Math.min(previousHP,u.maxHP);return true;
 }
 if(old.revision===2&&old.rank>=rank&&old.qualityKey===qualityKey)return false;
 const base=u.progressBase,hpBase=base.hp/old.hp,attackBase=base.attack/old.attack;
 const next={revision:2,qualityKey,rank,hp:2*(1+.025*rank)*Math.max(1,(q.hpFloor||0)/hpBase),attack:1.4*(1+.01*rank)*Math.max(1,(q.attackFloor||0)/attackBase),armor:Math.max(12+(q.armor||0),(q.armorFloor||0)-(base.armor-old.armor))};
 const fraction=Math.max(0,Math.min(1,u.hp/u.maxHP)),b=u.progressBase;
 b.hp=b.hp/old.hp*next.hp;b.attack=b.attack/old.attack*next.attack;b.armor=b.armor-old.armor+next.armor;
 u.viewerTraining=next;refreshProgress(u,w.time);u.hp=previousHP===null?Math.round(u.maxHP*fraction):Math.min(previousHP,u.maxHP);return true;
}
