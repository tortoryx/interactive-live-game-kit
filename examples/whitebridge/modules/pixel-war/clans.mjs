import {UNITS} from './public/catalog.mjs';
import {hostile,allied,factionLeader,nearestOpponent} from './public/allegiance.mjs';
import {recordReinforcement} from './reinforcements.mjs';
const colors=['#b66cff','#44d57c','#ef65ac','#e2d252','#52d1c5','#f17070','#c5a1ff','#9dcc54','#ed9bc8','#9cb8dc','#e4bc85','#62bca6','#dd779f','#aeb768','#b49bd2','#67afb8'];
export const CLAN_LIMIT=16,CLAN_POP_CAP=64,GLOBAL_ARMY_CAP=600;
export function clanName(name){const first=[...String(name||'')].find(c=>/[\p{L}\p{N}]/u.test(c))||'客';return [...first.toUpperCase()][0]+'族';}
export const clansSnapshot=w=>Object.values(w.clans||{}).map(c=>({id:c.id,name:c.name,color:c.color,number:c.number,founder:c.founder,leaderId:c.leaderId,side:c.side,status:c.status,join:'加入'+c.name+'#'+c.number}));
export function createClan(w,e){
 w.clans??={};const previous=Object.values(w.clans).find(c=>c.founder.id===e.supporter.id);
 if(previous)return {ok:previous.status==='active',clan:previous,reason:previous.status==='active'?'already_created':'one_life_spent'};
 if(w.paused||w.mode==='settlement'||w.campaign?.conquest)return {ok:false,reason:'battle_paused'};
 const existing=Object.values(w.clans),used=new Set(existing.filter(c=>c.status==='active'||w.units.some(u=>u.hp>0&&u.faction===c.id)).map(c=>c.color));
 if(used.size>=CLAN_LIMIT||w.units.filter(u=>u.hp>0).length>=GLOBAL_ARMY_CAP)return {ok:false,reason:'clan_capacity'};
 const color=colors.find(c=>!used.has(c)),number=(w.clanSerial||0)+1,side=e.side||'human';
 const center={x:(w.heroes.demon.x+w.heroes.human.x)/2,y:(w.heroes.demon.y+w.heroes.human.y)/2},alive=w.allAlive();let p;
 // Enter at the flank, away from contact. Walk in with normal navigation.
 for(let i=0;i<96;i++){const a=(number*2.399963+i*.42),q=w.ground({x:center.x+Math.cos(a)*(430+i%4*45),y:center.y+Math.sin(a)*(400+i%3*35)});if(q&&alive.every(u=>Math.hypot(q.x-u.x,q.y-u.y)>140)){p=q;break;}}
 if(!p)return {ok:false,reason:'no_safe_position'};
 const id='clan-'+number,name=clanName(e.supporter.name),c={id,name,color,number,founder:structuredClone(e.supporter),side,status:'active',createdAt:w.time};
 const hp=Math.round((w.heroes.human.maxHP+w.heroes.demon.maxHP)/2),spec={...UNITS.militia,hp,attack:105,armor:28,range:80,speed:94,interval:1.15,pop:4,scale:1.55,equipment:{weapon:'sword',armor:'plate',head:'hair',offhand:'shield'}};
 const general={...w.fighter(side,'militia',spec,p.x,p.y),name:e.supporter.name,commander:true,oneLife:true,faction:id,factionName:name,factionColor:color,source:e.platform,supporter:structuredClone(e.supporter),receipt:e.id,summonedAt:w.time,origin:{...p},lane:1};
 c.leaderId=general.id;w.clanSerial=number;w.clans[id]=c;w.units.push(general);recordReinforcement(w,general,{...e,source:e.platform,receipt:e.id});w.emit('summon',{side,faction:id,kind:'militia',source:e.platform,receipt:e.id,target:general.id,x:p.x,y:p.y});
 return {ok:true,clan:c,general};
}
export function updateClans(w){
 for(const c of Object.values(w.clans||{}))if(c.status==='active'){
  const h=w.units.find(u=>u.id===c.leaderId);if(h?.hp>0)continue;c.status='fallen';c.fallenAt=w.time;
  // Last-order survivors keep fighting. Neither a gift nor a new generation can
  // resurrect the founder; membership is resolved again on the next interaction.
  w.emit('clan_fallen',{side:c.side,faction:c.id,name:c.name,owner:c.founder.name,x:h?.x||0,y:h?.y||0});
  w.announcements??=[];w.announcements.push({id:++w.serial,kind:'clan',at:w.time,displayAt:w.time,until:w.time+9000,effectUntil:w.time+9000,title:c.name+'将军阵亡',detail:c.founder.name+' · 一命终结',actorSide:c.side,faction:c.id,factionColor:c.color,x:h?.x,y:h?.y});
 }
}
export function clanStep(w,u,enemy,dt){
 if(!u.faction)return false;
 const h=factionLeader(w,u),target=enemy||nearestOpponent(w,u);
 if(!target)return true;const d=Math.hypot(target.x-u.x,target.y-u.y);
 if(d<u.range+target.radius&&d>=(u.minRange||0)){if(w.time>=u.readyAt)w.attack(u,target,UNITS[u.kind].action);return true;}
 if(u.minRange&&d<u.minRange){const a=Math.atan2(target.y-u.y,target.x-u.x);w.move(u,{x:u.x-Math.cos(a)*85,y:u.y-Math.sin(a)*85},dt);return true;}
 const goal=!u.commander&&h&&d>600&&Math.hypot(h.x-u.x,h.y-u.y)>320?h:target;
 w.move(u,goal,dt);return true;
}
export function clanSpawnPoint(w,g){
 const c=w.clans?.[g.faction],h=factionLeader(w,g);if(c?.status!=='active'||!h)return null;
 const alive=w.allAlive(),enemies=alive.filter(u=>hostile(g,u)),near=enemies.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<250);
 const enemy=nearestOpponent(w,h,{alive}),back=enemy?Math.atan2(h.y-enemy.y,h.x-enemy.x):0;
 for(let i=0;i<96;i++){const a=near.length?back+Math.sin(i*2.399)*1.1:i*2.399,r=near.length?170+Math.floor(i/20)*30:80+Math.floor(i/20)*32,p={x:h.x+Math.cos(a)*r,y:h.y+Math.sin(a)*r};
  if(w.open(p.x,p.y)&&alive.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>u.radius+22)&&enemies.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>80))return {...p,zone:near.length?'rear':'safe'};
 }return null;
}
