import {setAudienceScale} from '../pixel-war/audience-battle.mjs';
const ACTIVE_MS=300000,MAX_RECORDS=10000;
export function recordParticipation(game,e){
 if(e.platform==='test'||!e.supporter?.id)return;
 if(e.kind==='leave'){delete (game.meta.participation?.viewers||{})[e.platform+':'+e.supporter.id];updateParticipation(game);return;}
 if(!['chat','gift','like','tactic','lane','unit'].includes(e.kind))return;
 const p=game.meta.participation??={viewers:{}};p.viewers[e.platform+':'+e.supporter.id]=game.now();
 updateParticipation(game);
}
export function updateParticipation(game){
 const p=game.meta.participation??={viewers:{}},now=game.now();
 const active=Object.entries(p.viewers).filter(([,at])=>Number.isFinite(at)&&now-at<ACTIVE_MS).sort((a,b)=>b[1]-a[1]).slice(0,MAX_RECORDS);
 p.viewers=Object.fromEntries(active);setAudienceScale(game.world,active.length);return active.length;
}
