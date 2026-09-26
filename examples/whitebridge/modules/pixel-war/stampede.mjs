import {factionFields,allied,isBoss} from './public/allegiance.mjs';
import {BEASTS} from './wildlife.mjs';
import {HEIGHT} from './public/terrain.mjs';
// One north-to-south sweep. The herd shares a persisted hit ledger, so twelve
// animals cannot charge the same victim twelve times or repeat damage on restore.
export const STAMPEDE={count:12,width:420,speed:680,rowGap:120,startY:-80,endY:HEIGHT+100,lingerMs:18000};
export function planStampede(e){
 const p=STAMPEDE;e.stampede={version:1,width:p.width,startY:p.startY,endY:p.endY,frontY:p.startY,hitIds:[],started:false,finished:false};
 e.until=e.impact+(p.endY-p.startY+p.rowGap*3)/p.speed*1000+1200;
}
export function updateStampede(w,e){
 const s=e.stampede,p=STAMPEDE;if(!s||s.finished||w.time<e.impact)return;
 if(!s.started){s.started=true;for(let i=0;i<p.count;i++){
  const row=Math.floor(i/3),column=i%3,kind=i===10?'ogre':'boar',spec=BEASTS[kind],x=e.x+(column-1)*140,y=p.startY-row*p.rowGap,u=w.fighter('neutral',kind,{...spec,equipment:{}},x,y);
  Object.assign(u,{...factionFields(e.source),x,y,name:spec.name,radius:kind==='ogre'?40:24,source:e.source.source,supporter:structuredClone(e.owner),sponsorSide:e.actorSide,eventId:e.id,stampede:{row,column,linger:i>=10,stopY:Math.min(HEIGHT-150,e.y+170+(i-10)*90)},straggler:false,face:Math.PI/2,action:null,targetId:null,spawnedAt:w.time,expiresAt:e.until+5000,nextRoar:e.until+5000,home:{x:e.x,y:e.y}});w.wildlife.push(u);
 }w.emit('wildlife_arrival',{x:e.x,y:e.y,count:p.count,side:'neutral',focus:e.focus});}
 const front=p.startY+(w.time-e.impact)/1000*p.speed,previous=s.frontY,herd=w.wildlife.filter(u=>u.eventId===e.id&&u.stampede&&u.hp>0);
 for(const u of herd){const next=front-u.stampede.row*p.rowGap;u.x=e.x+(u.stampede.column-1)*140;const y=u.stampede.linger?Math.min(u.stampede.stopY,next):next;u.moving=y>u.y;u.walkPhase+=(y-u.y)*8;u.y=y;u.face=Math.PI/2;u.action=null;u.targetId=null;}
 const seen=new Set(s.hitIds),source={...e.source,side:'neutral',sponsorSide:e.actorSide};
 for(const u of w.allAlive()){
  if(u.side==='neutral'||e.faction&&allied(e.source,u)||Math.abs(u.x-e.x)>s.width/2+(u.radius||0)||u.y<previous-p.rowGap*3-50-(u.radius||0)||u.y>front+50+(u.radius||0))continue;
  // A killed charge animal cannot hit through its own lane.
  if(!herd.some(b=>Math.abs(b.x-u.x)<90+(u.radius||0)&&Math.abs(b.y-u.y)<p.speed*.1+85+(u.radius||0)&&!(b.stampede.linger&&b.y>=b.stampede.stopY)))continue;
  const key=u.id+':'+(u.life||1);if(seen.has(key))continue;seen.add(key);s.hitIds.push(key);
  const damage=isBoss(u)?Math.min(900,u.maxHP*.08+100):Math.min(650,u.maxHP*.30+60);w.resolveHit(source,u,damage,false,'stampede');
  w.emit('burst',{x:u.x,y:u.y,side:'neutral',focus:e.focus,style:'crush',radius:48});
 }
 s.frontY=front;
 if(front-p.rowGap*3>=p.endY){
  s.finished=true;for(const u of herd)if(u.stampede.linger){u.stampede=null;u.straggler=true;u.moving=false;u.action=null;u.readyAt=w.time+2000;u.nextRoar=w.time+6000;u.expiresAt=w.time+p.lingerMs;u.home={x:u.x,y:u.y};}
  w.wildlife=w.wildlife.filter(u=>u.eventId!==e.id||!u.stampede||u.hp<=0);
  const note=w.announcements?.find(n=>n.giftEvent===e.id);if(note){note.title='兽潮已过';note.detail=e.faction?e.factionName+' · 落单野兽继续进攻':'落单野兽 · 无差别攻击';}
 }
}
