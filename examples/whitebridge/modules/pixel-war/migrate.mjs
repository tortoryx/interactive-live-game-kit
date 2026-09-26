import {trainViewerTroop} from './viewer-training.mjs';
import {enrollTroop,leaderDeaths,unlimitedService} from './service-life.mjs';
import {HERO_WEAPONS} from './public/catalog.mjs';
import {COLS,MAP_SHIFT_X,MAP_REVISION} from './public/terrain.mjs';
function relocate(saved,dx,dy,oldCols,newCols){
 const tile=key=>(Math.floor(Number(key)/oldCols)+dy/32)*newCols+Number(key)%oldCols+dx/32;
 const seen=new WeakSet(),walk=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(Number.isFinite(value.x)&&Number.isFinite(value.y)){value.x+=dx;value.y+=dy;}if(Number.isInteger(value.sceneryKey))value.sceneryKey=tile(value.sceneryKey);for(const child of Object.values(value))walk(child);};walk(saved);
 saved.terrainChanges=Object.fromEntries(Object.entries(saved.terrainChanges||{}).map(([key,v])=>[tile(key),v]));saved.objectDamage=Object.fromEntries(Object.entries(saved.objectDamage||{}).map(([key,v])=>{v.key=tile(key);return [v.key,v];}));
 for(const u of [...Object.values(saved.heroes||{}),...(saved.units||[]),...(saved.wildlife||[])]){u.path=null;u.repathAt=0;}
 saved.terrainRevision=(saved.terrainRevision||0)+1;saved.fieldEpoch=(saved.fieldEpoch||0)+1;
}
export function migrateWorld(saved){
 if(saved.heroStatsRevision!==2){for(const h of Object.values(saved.heroes||{})){const weapon=h.equipment?.weapon;if(['bow','staff'].includes(weapon)){h.range=HERO_WEAPONS[weapon].range;h.nextPlan=0;}}saved.heroStatsRevision=2;}
 if(!saved.mapRevision||saved.mapRevision<2){relocate(saved,512,256,96,128);saved.mapRevision=2;}
 if(saved.mapRevision<MAP_REVISION){relocate(saved,MAP_SHIFT_X,0,128,COLS);saved.mapRevision=MAP_REVISION;for(const h of Object.values(saved.heroes||{})){h.mission=null;h.nextPlan=0;h.duelUntil=0;}saved.campaign=null;}
 const flooded=(saved.hazards||[]).some(h=>h.kind==='flood');saved.hazards=(saved.hazards||[]).filter(h=>h.kind!=='flood');saved.announcements=(saved.announcements||[]).filter(e=>e.kind!=='flood');saved.events=(saved.events||[]).filter(e=>e.kind!=='flood'&&e.type!=='flood');saved.speech=(saved.speech||[]).filter(e=>!/(?:Flood|洪水)/.test((e.audio||'')+(e.text||'')));if(flooded)for(const u of [...Object.values(saved.heroes||{}),...(saved.units||[])])u.slowUntil=0;
 for(const u of saved.units||[])if(u.kind==='colossus')u.scale=3.1;
 saved.leaderDeaths=leaderDeaths(saved);
 for(const u of saved.units||[]){if(![2,3].includes(u.viewerTraining?.revision)){const hp=u.hp;trainViewerTroop(saved,u);u.hp=Math.min(hp,u.maxHP);}enrollTroop(saved,u);}
 for(const u of [...(saved.fallenTroops||[]),...(saved.barracks||[])])unlimitedService(saved,u);
 return saved;
}
