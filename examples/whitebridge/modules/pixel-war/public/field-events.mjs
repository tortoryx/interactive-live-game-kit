import {factionName,factionColor} from './faction-labels.mjs';
import {drawStampedeRoute} from './stampede-view.mjs';
import {supportGlyph} from './commander-support-view.mjs';
import {eventTone,eventCaption,TONES,tacticalIcon} from './tactical-style.mjs';
import {FIELD_EVENTS,EVENT_NOTICE} from './event-catalog.mjs';
export function visibleEventAnnouncements(state){
 const events=[...(state.announcements||[])];
 for(const e of state.warEvents||[])if(e.until>state.time&&!events.some(n=>n.giftEvent===e.id))events.push({id:'active-'+e.id,kind:e.kind,at:e.at,displayAt:e.at,until:e.until,effectUntil:e.until,actorSide:e.actorSide,targetSide:e.targetSide,owner:e.owner,title:FIELD_EVENTS[e.kind]?.name,detail:e.owner?.name||'',giftEvent:e.id});
 return events.sort((a,b)=>(a.displayAt??a.at)-(b.displayAt??b.at));
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Notices are presentation: pausing/slowing combat must not pin them over the battlefield.
export class EventNoticeClock{
 constructor(){this.starts=new Map();}
 reset(){this.starts.clear();}
 update(events,time,now){const keep=new Set(),out=[];for(const e of events){const displayAt=e.displayAt??e.at;if(time<displayAt||time>=e.until)continue;const key=e.id+':'+displayAt;keep.add(key);if(!this.starts.has(key))this.starts.set(key,now-Math.min(EVENT_NOTICE.hold+EVENT_NOTICE.travel,Math.max(0,time-displayAt)));out.push({...e,noticeAge:Math.max(0,now-this.starts.get(key))});}for(const key of this.starts.keys())if(!keep.has(key))this.starts.delete(key);return out;}
}
export function eventNoticeLayout(events,time,w,h,map={x:w-156,y:h-102,w:144,h:84},viewerCount=0){
 const active=events.filter(e=>FIELD_EVENTS[e.kind]&&e.until>time&&time>=(e.displayAt??e.at));
 return active.slice(-3).map((e,i,list)=>{const age=e.noticeAge??(time-(e.displayAt??e.at)),flight=i<list.length-1?1:smooth((age-EVENT_NOTICE.hold)/EVENT_NOTICE.travel),docked=flight===1,width=Math.min(176,map.w)+(Math.min(144,map.w)-Math.min(176,map.w))*flight,height=44+(32-44)*flight;
 return {...e,phase:docked?'docked':age<EVENT_NOTICE.hold?'centre':'flying',x:w/2+(w-12-Math.min(144,map.w)/2-w/2)*flight,y:h*.29+(91+viewerCount*46+(list.length-1-i)*36-h*.29)*flight,w:width,h:height,scale:width/400,alpha:Math.min(1,age/90,(e.until-time)/450),seconds:Math.max(0,Math.ceil((e.effectUntil-time)/1000))};});
}
export function eventIcon(c,kind,x,y,size,color){if(kind.startsWith('royal_')){supportGlyph(c,kind,x,y,size,color);return;}if(['assault','march','barracks','muster','clan'].includes(kind)){tacticalIcon(c,kind==='clan'?'king':kind==='barracks'?'camp':kind==='assault'?'clash':'march',x,y,color,size);return;}const k=FIELD_EVENTS[kind],s=size/32;c.save();c.translate(x,y);c.scale(s,s);c.strokeStyle=color||k?.color||'#e6cd95';c.fillStyle=color||k?.color||'#e6cd95';c.lineWidth=2.5;
 if(kind==='frontline'){c.beginPath();c.moveTo(-14,-5);c.lineTo(3,-5);c.lineTo(3,-13);c.lineTo(15,0);c.lineTo(3,13);c.lineTo(3,5);c.lineTo(-14,5);c.closePath();c.fill();}
 else if(kind==='supply'||kind==='capture'){c.fillRect(-10,-4,20,17);c.strokeStyle='#3e6048';c.strokeRect(-7,-1,14,11);c.beginPath();c.moveTo(-11,-5);c.quadraticCurveTo(0,-25,11,-5);c.lineTo(7,0);c.moveTo(-11,-5);c.lineTo(-7,0);c.stroke();}
 else if(kind==='bloodmoon'){c.beginPath();c.arc(0,0,12,0,7);c.fill();c.fillStyle='#542d3c';c.beginPath();c.arc(5,-4,9,0,7);c.fill();}
 else if(kind==='storm'){c.beginPath();c.moveTo(3,-15);c.lineTo(-10,3);c.lineTo(-1,2);c.lineTo(-4,15);c.lineTo(11,-5);c.lineTo(2,-3);c.closePath();c.fill();}
 else if(kind==='quake'){c.beginPath();c.moveTo(4,-15);c.lineTo(-5,-4);c.lineTo(5,0);c.lineTo(-3,14);c.moveTo(-14,7);c.lineTo(-5,2);c.moveTo(7,6);c.lineTo(15,10);c.stroke();}
 else if(kind==='wildlife'){c.beginPath();c.moveTo(-13,-12);c.lineTo(-6,-5);c.lineTo(6,-5);c.lineTo(13,-12);c.lineTo(10,7);c.lineTo(0,14);c.lineTo(-10,7);c.closePath();c.fill();c.fillStyle='#2c3025';c.fillRect(-7,0,4,4);c.fillRect(3,0,4,4);}
 else{c.beginPath();c.arc(-3,4,9,0,7);c.fill();for(let i=0;i<3;i++){c.beginPath();c.moveTo(i*5-2,-4);c.lineTo(i*5+7,-17);c.stroke();}}
 c.restore();
}
function wrap(text,max=26){return [text.slice(0,max),text.slice(max)];}
export function drawEventNotices(c,state,camera,map){const layout=eventNoticeLayout(state.announcements||[],state.time,camera.screenW,camera.screenH,map,state.viewerEventCount||0);if(state.mode==='settlement')return [];
 for(const e of layout){e.tone=eventTone(e,camera.side,state);const info={...FIELD_EVENTS[e.kind],color:e.factionColor|| (e.actorSide&&e.tone!=='danger'?factionColor(e.actorSide):TONES[e.tone].color),name:eventCaption(e,camera.side)||FIELD_EVENTS[e.kind].name,detail:e.kind==='assault'?(factionName(e.actorSide)+'已抵达据点，控制权争夺中。'):(e.detail||FIELD_EVENTS[e.kind].detail)};c.save();c.globalAlpha=e.alpha;c.translate(e.x,e.y);const w=e.w,h=e.h;c.fillStyle=TONES[e.tone].dark+'ed';c.fillRect(-w/2,-h/2,w,h);c.fillStyle=info.color;c.fillRect(-w/2,-h/2,3,h);eventIcon(c,e.kind,-w/2+13,-1,17,info.color);c.textAlign='left';c.fillStyle=info.color;c.font='bold 10px sans-serif';c.fillText(info.name.slice(0,10),-w/2+27,-2,w-53);c.textAlign='right';c.font='10px monospace';c.fillStyle=info.color;c.fillText(e.seconds?e.seconds+'s':'',w/2-5,-2);c.textAlign='left';c.font='9px sans-serif';c.fillStyle='#ccdcca';const text=info.detail.split('，')[0];c.fillText(text.slice(0,Math.floor((w-34)/9)),-w/2+27,10,w-33);c.restore();}return layout;
}
export function drawSurprises(c,state,time){for(const e of state.warEvents||[])if(e.kind==='wildlife'&&e.until>time)drawStampedeRoute(c,e,time);for(const e of [...(state.surprises||[]),...(state.warEvents||[]).filter(e=>e.until>time)]){c.save();c.translate(e.x,e.y);const info=FIELD_EVENTS[e.kind];
 if(e.kind==='bloodmoon'){c.strokeStyle='#e77d8766';c.lineWidth=4;for(let i=0;i<3;i++){c.beginPath();c.ellipse(0,0,160+i*25+Math.sin(time/500)*8,65+i*11,0,0,7);c.stroke();}c.globalAlpha=.7;eventIcon(c,e.kind,0,-135,90);}
 if(e.kind==='supply'&&time<e.impact){const t=Math.max(0,(e.impact-time)/3200);c.strokeStyle='#b5efb580';c.setLineDash([8,8]);c.beginPath();c.ellipse(0,0,135,80,0,0,7);c.stroke();c.setLineDash([]);for(let i=0;i<(e.owner?12:3);i++){const x=e.owner?Math.cos(i*Math.PI/6)*(120+i%2*90):(i-1)*78,y=(e.owner?Math.sin(i*Math.PI/6)*170:-40+i*9)-t*245;c.fillStyle='#e2e7c6';c.beginPath();c.ellipse(x,y-47,38,20,0,Math.PI,Math.PI*2);c.fill();c.strokeStyle='#dccfa8';c.beginPath();c.moveTo(x-38,y-47);c.lineTo(x-10,y);c.moveTo(x+38,y-47);c.lineTo(x+10,y);c.stroke();c.fillStyle='#826046';c.fillRect(x-17,y-15,34,26);c.fillStyle='#bce8aa';c.fillRect(x-3,y-11,6,18);c.fillRect(x-10,y-5,20,5);}}
 c.restore();}}
