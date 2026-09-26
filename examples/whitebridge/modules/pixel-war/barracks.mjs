import {factionLeader,factionFields,allied} from './public/allegiance.mjs';
import {UNITS} from './public/catalog.mjs';
import {WIDTH,HEIGHT} from './public/terrain.mjs';
import {leaderDeaths,serviceExpired} from './service-life.mjs';
import {onPlayerArrival} from './war-drama.mjs';
import {announceFieldEvent} from './announcements.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),dir=s=>s==='demon'?1:-1;
export function buildBarracks(w,g){
 if(!g.supporter?.id||!['test','bilibili','xiaohongshu'].includes(g.source))return false;
 w.barracks??=[];if(w.barracks.filter(b=>b.hp>0&&!serviceExpired(w,b)).length>=64)return false;
 const h=factionLeader(w,g);if(!h||h.hp<=0)return false;let p;
 for(let i=0;i<40;i++){const q=w.ground({x:Math.max(180,Math.min(WIDTH-180,h.x-dir(g.side)*(540+i%5*72))),y:Math.max(260,Math.min(HEIGHT-180,h.y+(i%2?-1:1)*(110+Math.floor(i/5)*75)))});if(q&&!w.allAlive().some(u=>dist(u,q)<u.radius+90)&&!w.hazards.some(v=>v.until>w.time&&dist(v,q)<v.radius+80)){p=q;break;}}
 if(!p)return false;const tier=g.quality?.tier||6,era=Math.max(...Object.values(w.heroes).map(h=>h.rank||0)),hp=Math.round(16000*(1+Math.min(4,era*.025)));
 const b={id:'barracks-'+(++w.serial),kind:'barracks',name:'军团兵营',...p,side:g.side,...factionFields(g),source:g.source,supporter:structuredClone(g.supporter),receipt:g.receipt,hp,maxHP:hp,armor:100,shield:0,equipment:{},radius:62,deadAt:null,hitAt:0,action:null,life:1,service:{joinedAtDeath:leaderDeaths(w),expiresAtDeath:null},builtAt:w.time,readyAt:w.time+2400,nextProduceAt:w.time+2600,produced:0,reserve:36,quality:g.quality||{tier,hpFloor:1000,attackFloor:120,armorFloor:64},status:'building',production:0};w.barracks.push(b);
 const a=announceFieldEvent(w,'barracks',b,w.time+14000);Object.assign(a,{actorSide:g.side,owner:g.supporter,title:'玩家兵营落成',detail:g.supporter.name+'的兵营开始生产'});w.emit('barracks_build',{...p,side:g.side,owner:g.supporter.name});return true;
}
export function barracksSpawnPoint(w,b,kind){const spec=UNITS[kind],r=spec.machine?25:16;
 for(let i=0;i<30;i++){const p={x:b.x+dir(b.side)*(98+i%5*22),y:b.y+38+(Math.floor(i/5)-2)*28};if(w.open(p.x,p.y)&&!w.allAlive().some(u=>dist(u,p)<u.radius+r+6)&&!w.hazards.some(v=>v.until>w.time&&dist(v,p)<v.radius+10))return p;}return null;
}
export function updateBarracks(w){
 w.barracks??=[];w.barracks=w.barracks.filter(b=>!serviceExpired(w,b)&&(b.hp>0||w.time-(b.deadAt||0)<8000));let deployed=0;
 for(const b of w.barracks){if(b.hp<=0){b.status='destroyed';continue;}if(b.faction&&w.clans?.[b.faction]?.status!=='active'){b.status='closed';continue;}if(w.time<b.readyAt)continue;if(b.reserve<=0){b.status='exhausted';continue;}const alive=w.units.filter(u=>u.barracksId===b.id&&u.hp>0);if(alive.length>=12){b.status='capacity';b.nextProduceAt=Math.max(b.nextProduceAt,w.time+1000);continue;}b.status='producing';b.production=Math.max(0,Math.min(1,1-(b.nextProduceAt-w.time)/6500));if(w.time<b.nextProduceAt||deployed>=4)continue;
 const kind=['shield','militia','musketeer','pike','ranger','grenadier'][Math.floor(b.produced/2)%6],g={side:b.side,...factionFields(b),source:b.source,supporter:b.supporter,receipt:b.receipt+':production',quality:b.quality,service:b.service,barracksId:b.id,suppressHighlight:b.produced>=2};
 if(w.spawn(b.side,kind,1,false,g)){b.produced++;b.reserve--;deployed++;b.nextProduceAt=w.time+(b.produced%2?450:6500);const u=w.units.at(-1),orders=w.units.filter(v=>v.id!==u.id&&v.supporter?.id===b.supporter.id&&allied(v,b)&&v.viewerOrder?.until>w.time).sort((a,b)=>(b.viewerOrder.issuedAt||0)-(a.viewerOrder.issuedAt||0));if(orders[0])u.viewerOrder=structuredClone(orders[0].viewerOrder);onPlayerArrival(w,g);}else{b.status='waiting';b.nextProduceAt=w.time+1000;}
 }
}
