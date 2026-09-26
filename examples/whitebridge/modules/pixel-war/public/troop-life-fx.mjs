// Reusable canvas effects, deterministic from the event ID. No gameplay RNG,
// damage, external assets, screen-wide flashes, or permanent terrain changes.
export const LIFE_FX_MS={death:1650,revive:2100};
export const LIFE_DETAIL_LIMIT=12;
const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const isTroopLifeEvent=e=>Object.hasOwn(LIFE_FX_MS,e.type)&&!!e.kind&&!['hero','barracks'].includes(e.kind)&&e.side!=='neutral';
const seed=e=>[...String(e.id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);
function ring(c,x,y,r,color,width=2,flat=.48){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*flat),0,0,TAU);c.stroke();}
function star(c,x,y,r,color,rotation=0){c.fillStyle=color;c.beginPath();for(let i=0;i<16;i++){const a=rotation+i*TAU/16,d=i%2?r*.36:r;c.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);}c.closePath();c.fill();}
function cloud(c,x,y,r,dark,light){x=Math.round(x);y=Math.round(y);r=Math.round(r);c.fillStyle=dark;c.fillRect(x-r,y-r*.5,r*2,r);c.fillRect(x-r*.65,y-r*.85,r*1.3,r*1.65);c.fillStyle=light;c.fillRect(x-r*.6,y-r*.65,r*.85,r*.45);}
function shard(c,x,y,angle,k,metal){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=metal?'#343b46':'#483229';c.fillRect(-k,-k*.55,k*2,k);c.fillStyle=metal?'#c5d4db':'#d9a671';c.fillRect(-k,-k*.55,k*2,k*.3);c.restore();}
function shape(e,zoom){const z=Math.max(.2,zoom||1),body=clamp((e.scale||1)*z,.55,3.5);return {s:1/z,r:clamp((e.machine?39:29)+body*(e.machine?24:15),36,120),z:clamp((e.machine?52:26)*body,19,e.machine?170:88)};}

function death(c,e,age,zoom,detail){const {s,r,z}=shape(e,zoom),t=age/LIFE_FX_MS.death,owned=!!e.focus,tint=e.focus?.color||(e.side==='human'?'#9dd8db':'#de9b88'),k=seed(e),expand=1-Math.exp(-age/140),power=owned?1:.35;
 c.save();c.translate(e.x,e.y);c.scale(s,s);
 // Always keep a short owner-coloured ring, including lower-detail crowd deaths.
 c.globalAlpha=Math.max(0,1-age/720)*power;ring(c,0,0,r*expand,tint,detail?3.5:2);
 if(age<260){c.globalAlpha=(1-age/260)*power;if(detail){star(c,0,-z,r*.7*expand+4,'#ffe8ae',k);star(c,0,-z,r*.4*(1-age/300),'#fffbee',k+.3);}else{c.fillStyle='#ffe8ae';c.fillRect(-12,-z-3,24,6);c.fillStyle='#fffbee';c.fillRect(-3,-z-10,6,20);}}
 if(detail){
  c.globalAlpha=Math.max(0,1-age/850)*.7;ring(c,0,1,r*1.35*expand,'#dc9459',2);
  // A brief ground bruise sits under the debris, then fades with the corpse.
  c.globalAlpha=(1-t)*.16;c.fillStyle='#392c29';c.beginPath();c.ellipse(0,2,r*.68,r*.25,0,0,TAU);c.fill();
  for(let i=0;i<5;i++){const a=i*2.399+k,q=Math.max(0,(age-i*24)/900),d=r*.42*Math.min(1,q*3),x=Math.cos(a)*d,y=-z+Math.sin(a)*d*.35-q*22;
   if(q>1.35)continue;c.globalAlpha=Math.min(1,q*5)*Math.max(0,1-q/1.35)*.64;
   const hot=q<.36;cloud(c,x,y,(13+i%3*5)*(e.machine?1.6:1)*(1+q*.6),hot?'#e97938':'#4a4449',hot?'#ffcb70':'#82736d');
  }
  if(e.machine)for(let i=0;i<2;i++){const p=(age-160-i*150)/430;if(p<0||p>1)continue;c.globalAlpha=(1-p)*.9;const x=(i?1:-1)*r*.35,y=-z*(i?.55:1.25);star(c,x,y,(18+p*25),'#ffc874',i);cloud(c,x,y,12+p*16,'#e66e32','#fff0b4');}
  const p=age/1050;
  if(p<1.15)for(let i=0;i<(e.machine?12:8);i++){const a=k+i*2.399,dist=(22+i%4*11)*p,x=Math.cos(a)*dist,y=Math.sin(a)*dist*.5-z-70*p+80*p*p;c.globalAlpha=Math.max(0,1-p/1.15);shard(c,x,y,a+p*5,2+i%3,e.machine||e.armor!=='robe'&&i%3!==0);}
  if(age<850)for(let i=0;i<8;i++){const p=age/850,a=k+i*2.399,d=r*p*(.5+i%3*.25);c.globalAlpha=1-p;c.fillStyle=i%2?tint:'#ffe4a2';c.fillRect(Math.cos(a)*d,Math.sin(a)*d*.5-z-p*25,3,2);}
 }
 c.restore();
}

function revive(c,e,age,zoom,detail){const {s,r,z}=shape(e,zoom),tint=e.focus?.color||'#b8f4d1',charge=clamp(age/320,0,1),out=clamp((age-300)/900,0,1),fade=clamp((2100-age)/700,0,1),k=seed(e);
 c.save();c.translate(e.x,e.y);c.scale(s,s);
 // Gathering light and a floor seal precede the release. The troop itself is
 // already authoritative and can move; this presentation follows that life.
 c.globalAlpha=fade*.85;ring(c,0,0,r*.6,tint,detail?3:2);ring(c,0,0,r*.43,'#ffedb7',1.5);
 if(detail){
  c.globalAlpha=fade*.2;c.fillStyle=tint;c.fillRect(-r*.24,-z-37,r*.48,z+37);
  c.globalAlpha=fade*.85;for(let i=0;i<4;i++){const a=k+i*TAU/4+age/1300,x=Math.cos(a)*r*.57,y=Math.sin(a)*r*.28;c.save();c.translate(x,y);c.rotate(a);c.fillStyle='#fff1c7';c.fillRect(-4,-2,8,4);c.restore();}
  for(let i=0;i<10;i++){const a=k+i*2.399,p=age<320?1-charge:((age-320)/1200+i/10)%1,d=age<320?r*(.35+p*.75):r*.35,x=Math.cos(a)*d,y=Math.sin(a)*d*.45-(age<320?(1-p)*z:p*(z+55));c.globalAlpha=fade*(age<320?.85:Math.sin(p*Math.PI)*.85);c.fillStyle=i%3?tint:'#fffde4';c.fillRect(x-2,y-3,3,6);}
 }
 if(age>=300&&age<900){const p=(age-300)/600;c.globalAlpha=(1-p)*.9;ring(c,0,0,r*(.5+p),tint,detail?4:2);if(p<.35){star(c,0,-z,(1-p/.35)*(detail?29:17),'#fffbe0',Math.PI/4);}}
 if(age>420){c.globalAlpha=fade*(1-out*.25);const y=-z-16-out*20;c.strokeStyle=tint;c.lineWidth=detail?3:2;c.beginPath();c.moveTo(-7,y+5);c.lineTo(0,y-2);c.lineTo(7,y+5);c.stroke();}
 c.restore();
}

export class TroopLifeEffects{
 constructor(){this.events=[];this.stats={};}
 reset(){this.events=[];this.stats={};}
 add(e){if(isTroopLifeEvent(e))this.events.push(e);}
 prune(time){this.events=this.events.filter(e=>time-e.at<LIFE_FX_MS[e.type]);const ambient=this.events.filter(e=>!e.focus).slice(-24),player=this.events.filter(e=>e.focus).slice(-1024);this.events=[...ambient,...player];}
 draw(c,units,time,camera){
  const live=new Map(units.map(u=>[u.id+':'+(u.life||1),u]));
  const candidates=[];for(const event of this.events){const age=time-event.at;if(age<0||age>=LIFE_FX_MS[event.type])continue;const u=event.type==='revive'?live.get(event.target+':'+event.life):null,e=u&&u.hp>0?{...event,x:u.x,y:u.y}:event;if(camera.visible(e,180/(camera.zoom||1)))candidates.push({e,age});}
  // A large army must not spend all detail on a single viewer. Everyone still
  // gets their ring/flash; richer smoke and fragments are spatially budgeted.
  candidates.sort((a,b)=>Number(!!b.e.focus)-Number(!!a.e.focus)||Number(b.e.type==='revive')-Number(a.e.type==='revive')||a.age-b.age);
  const detailed=new Set(),owners=new Set(),cells=new Set(),cell=e=>Math.floor(e.x*camera.zoom/64)+':'+Math.floor(e.y*camera.zoom/64);
  for(const {e}of candidates)if(e.focus&&!owners.has(e.focus.ownerId)&&!cells.has(cell(e))&&detailed.size<LIFE_DETAIL_LIMIT){detailed.add(e.id);owners.add(e.focus.ownerId);cells.add(cell(e));}
  for(const {e}of candidates)if(!cells.has(cell(e))&&detailed.size<LIFE_DETAIL_LIMIT){detailed.add(e.id);cells.add(cell(e));}
  const stats={deaths:0,revives:0,detailed:detailed.size,visible:candidates.length,owners:[],retained:this.events.length},visibleOwners=new Set();
  for(const {e,age}of candidates.toReversed()){(e.type==='death'?death:revive)(c,e,age,camera.zoom,detailed.has(e.id));stats[e.type==='death'?'deaths':'revives']++;if(e.focus)visibleOwners.add(e.focus.ownerId);}
  stats.owners=[...visibleOwners];this.stats=stats;
 }
}
