import {factionLeader,nearestOpponent,factionFields,allied,teamOf} from './public/allegiance.mjs';
import {announceFieldEvent} from './announcements.mjs';
import {planStampede,updateStampede} from './stampede.mjs';
import {WIDTH,HEIGHT} from './public/terrain.mjs';
import {combatFocus} from './public/combat-focus.mjs';
const other=s=>s==='demon'?'human':'demon',dir=s=>s==='demon'?1:-1,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const OWNED_EVENTS={meteorstorm:'meteor',beastRaid:'wildlife',rift:'quake',tempest:'storm',supplyDrop:'supply',bloodrite:'bloodmoon'};
export function warEventPlan(w,g,key){
 const kind=OWNED_EVENTS[key];if(!kind||!g.supporter?.id)return null;
 const own=factionLeader(w,g),target=g.faction&&own?nearestOpponent(w,own,{boss:true})||nearestOpponent(w,own):w.heroes[other(g.side)];if(!own||!target)return null;const anchor=['supply','bloodmoon'].includes(kind)?own:target;
 const center={x:clamp(anchor.x,450,WIDTH-450),y:clamp(anchor.y,420,HEIGHT-420)},source={id:'gift-event-'+(++w.serial),kind:'war_event',side:g.side,...factionFields(g),source:g.source,supporter:structuredClone(g.supporter),giftQuality:g.quality,x:center.x,y:center.y,life:1};
 return {id:source.id,kind,key,actorSide:g.side,targetSide:teamOf(target),...factionFields(g),owner:source.supporter,receipt:g.receipt,source,focus:combatFocus(source),...center,at:w.time,impact:w.time+3200,until:w.time+19000,applied:false};
}
export function launchOwnedEvent(w,g,key){
 w.warEvents??=[];if(w.warEvents.filter(e=>e.until>w.time).length>=3)return false;if(key==='beastRaid'&&(w.warEvents.some(e=>e.kind==='wildlife'&&e.until>w.time)||(w.wildlife||[]).filter(u=>u.hp>0).length>=16))return false;
 const e=warEventPlan(w,g,key);if(!e)return false;const planned=[];
 if(['meteor','quake','storm'].includes(e.kind)){
  const count=e.kind==='quake'?5:9;for(let i=0;i<count;i++){const col=e.kind==='quake'?i-2:i%3-1,row=e.kind==='quake'?(i%2?.4:-.4):Math.floor(i/3)-1,p=w.ground({x:e.x+dir(g.side)*col*(e.kind==='quake'?160:230),y:e.y+row*235});if(!p)continue;const impact=w.time+3200+(e.kind==='quake'?i*850:Math.floor(i/3)*1900+i%3*260),kind=e.kind==='storm'?'volley':e.kind;
   planned.push({id:++w.serial,kind,...p,radius:e.kind==='meteor'?215:e.kind==='quake'?200:170,impact,until:impact+(kind==='quake'?3600:1700),nextPulse:impact,hit:false,sourceId:e.source.id,sourceSnapshot:e.source,focus:e.focus,eventId:e.id,actorSide:g.side,damageScale:1.8+Math.min(.4,(g.quality?.tier??0)*.2)});
  }
 }
 if(['meteor','quake','storm'].includes(e.kind)&&!planned.length)return false;
 w.hazards.push(...planned);
if(e.kind==='wildlife')planStampede(e);w.warEvents.push(e);const n=announceFieldEvent(w,e.kind,e,e.until),titles={meteor:'陨石雨 · 九重轰炸',wildlife:'兽潮突袭',quake:'裂地推进',storm:'雷暴轰击',supply:'战场空投',bloodmoon:'赤月狂潮'};
 Object.assign(n,{actorSide:g.side,targetSide:e.targetSide,owner:e.owner,title:titles[e.kind],...factionFields(g),detail:g.faction?e.owner.name+' · '+g.factionName:['supply','bloodmoon'].includes(e.kind)?'双方可获益 · '+e.owner.name:'伤及双方 · '+e.owner.name,giftEvent:e.id,radius:520});

 return true;
}
export function updateOwnedEvents(w){
 w.warEvents=(w.warEvents||[]).filter(e=>e.until>w.time);
 for(const e of w.warEvents){if(e.kind==='wildlife')updateStampede(w,e);if(e.kind==='bloodmoon'&&w.time>=e.impact){for(const u of w.allAlive())if(u.kind!=='barracks'&&u.side!=='neutral'&&(!e.faction||allied(e.source,u)))u.furyUntil=Math.max(u.furyUntil||0,e.until);e.applied=true;}
 if(e.kind==='supply'&&!e.applied&&w.time>=e.impact){e.applied=true;for(let i=0;i<12;i++){const a=i*Math.PI/6,p=w.ground({x:e.x+Math.cos(a)*(120+i%2*90),y:e.y+Math.sin(a)*170});if(p)w.pickups.push({id:++w.serial,...p,kind:['heal','shield','fury','haste'][i%4],until:w.time+26000,supplyId:e.id});}w.emit('pickup',{x:e.x,y:e.y,radius:260,kind:'supply',focus:e.focus});}}
}
