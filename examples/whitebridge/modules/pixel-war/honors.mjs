import {hostile,allied,isBoss,teamOf} from './public/allegiance.mjs';
import {UNITS} from './public/catalog.mjs';
import {supporterEvent} from './supporter-events.mjs';
// Combat receipts, not gift prices. Count effective damage/healing at resolution.
export function combatIdentity(u,style='environment'){
 if(!u)return {id:'environment',side:'neutral',name:({meteor:'陨石',quake:'地震',fire:'林火',flood:'洪水'})[style]||'战场天灾',kind:'environment'};
 const p=u.supporter,viewer=p&&['test','bilibili','xiaohongshu'].includes(p.platform)&&typeof p.id==='string'&&p.id.length>0;
 return {id:viewer?teamOf(u)+':'+p.platform+':'+p.id:u.id,contributorId:viewer?p.platform+':'+p.id:null,unitId:u.id,faction:u.faction,factionName:u.factionName,factionColor:u.factionColor,side:u.side,name:viewer?String(p.name).slice(0,24):u.name||UNITS[u.kind]?.name||'亲卫',kind:u.kind,viewer:!!viewer,source:u.source||'system',platform:p?.platform||'system',avatarKey:viewer?p.avatarKey:null};
}
export function recordContribution(w,source,target,damage=0,healing=0,style){
 if(w.mode==='settlement'||!Number.isFinite(damage)||!Number.isFinite(healing))return;
 w.honors??={entries:{},finishers:{}};
 const identity=combatIdentity(source,style),enemy=source&&hostile(source,target);
 if(damage>0&&target.hp<=0&&target.deadAt===null&&target.kind!=='hero')supporterEvent(w,target.side,target.supporter,'troop_lost');
 if(healing>0&&source&&allied(source,target)&&isBoss(target))supporterEvent(w,target.side,source.supporter,'heal_hero',{amount:Math.round(healing),critical:target.hp-healing<target.maxHP*.35});
 if(enemy&&damage>0&&target.hp<=0&&target.deadAt===null)supporterEvent(w,source.side,source.supporter,'kill',{hero:isBoss(target)});
 if(damage>0&&target.hp<=0&&isBoss(target))w.honors.finishers[target.id]??={...identity,at:w.time};
 if(!identity.viewer||(!enemy&&!healing)||damage+healing<=0)return;
 if(w.campaign)w.campaign.merit??=structuredClone(w.honors);
 for(const ledger of [w.honors,...(w.campaign?[w.campaign.merit]:[])]){
 let e=ledger.entries[identity.id];
 if(!e){e=ledger.entries[identity.id]={...identity,damage:0,leaderDamage:0,healing:0,kills:0,firstAt:w.time};}
 e.damage+=damage;e.healing+=healing;if(isBoss(target))e.leaderDamage+=damage;if(enemy&&damage>0&&target.hp<=0)e.kills++;
 }
}
export function recordCampaignCapture(w,side,supporter){
 if(!w.campaign)return;const identity=combatIdentity({id:'capture',kind:'capture',side,supporter});if(!identity.viewer)return;
 const ledger=w.campaign.merit??=structuredClone(w.honors||{entries:{},finishers:{}});const e=ledger.entries[identity.id]??={...identity,damage:0,leaderDamage:0,healing:0,kills:0,firstAt:w.time};e.capturePoints=(e.capturePoints||0)+600;
}
export function battleHonors(w,winner,fallen){
 const all=Object.values(w.honors?.entries||{}).filter(e=>e.viewer&&['demon','human'].includes(e.side)&&(e.contributorId||/^[a-f0-9]{24}$/.test(e.id.slice(e.side.length+1)))),entries=all.filter(e=>teamOf(e)===winner),score=e=>e.damage+e.leaderDamage+e.healing+(e.capturePoints||0);
 const grouped=new Map();for(const e of all){const id=e.contributorId||(e.platform+':'+e.id.slice(e.side.length+1));let g=grouped.get(id);if(!g){g={...e,id,damage:0,leaderDamage:0,healing:0,kills:0,capturePoints:0,firstAt:e.firstAt,sides:{}};grouped.set(id,g);}for(const k of ['damage','leaderDamage','healing','kills','capturePoints'])g[k]+=e[k]||0;g.firstAt=Math.min(g.firstAt,e.firstAt);g.sides[teamOf(e)]=(g.sides[teamOf(e)]||0)+score(e);}
 const board=[...grouped.values()].toSorted((a,b)=>score(b)-score(a)||a.firstAt-b.firstAt||a.id.localeCompare(b.id)).slice(0,50).map((e,i)=>({...e,side:Object.entries(e.sides).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0],rank:i+1,score:Math.round(score(e))}));
 const leaders=entries.toSorted((a,b)=>score(b)-score(a)||a.firstAt-b.firstAt||a.id.localeCompare(b.id)).slice(0,3).map((e,i)=>({...e,award:i===0?'首功':i===1?'战功第二':'战功第三',score:Math.round(score(e))}));
 const playerFinisher=h=>{const f=w.honors?.finishers?.[h.id];return f?.viewer?structuredClone(f):null;};
 const boards=Object.fromEntries([...new Set(['demon','human',...all.map(teamOf)])].map(side=>[side,all.filter(e=>teamOf(e)===side).toSorted((a,b)=>score(b)-score(a)||a.firstAt-b.firstAt||a.id.localeCompare(b.id)).slice(0,50).map((e,i)=>({...e,rank:i+1,score:Math.round(score(e))}))]));
 return {leaders,board,boards,finishers:fallen.map(h=>({targetId:h.id,targetName:h.name,side:h.side,finisher:playerFinisher(h)})),totalParticipants:grouped.size,participants:entries.length,finisher:fallen[0]?playerFinisher(fallen[0]):null};
}
