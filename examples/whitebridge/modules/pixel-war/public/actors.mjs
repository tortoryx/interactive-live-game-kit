import {AIMED_WEAPONS,weaponAim} from './weapon-geometry.mjs';
import {crownCount,drawWornCrowns} from './crowns.mjs';
import {drawHandWeapon,drawMachine,PROCEDURAL_WEAPONS} from './procedural-weapons.mjs';
import {ACTIONS} from './catalog.mjs';
const rgb=h=>h.match(/\w\w/g).map(v=>parseInt(v,16));
const palettes={
 demon:['1b102d','42214f','763361','ac5073','d48b9a','ffe0bf'],human:['101e32','1d4660','327e8f','58b2b4','a2dcce','f2ecd0'],
 demonSkin:['251b29','523241','814550','ad6466','d08d7c','edb496'],silver:['20282c','424b50','65767a','8c9c9b','bcc5b7','e5e8d1'],
 dark:['211f28','37313c','534553','745967','9a7985','c29b9e'],gray:['262b2f','4b5455','737c77','a1a79a','c9cdba','ebe5ce'],
 leather:['242328','39332e','53483b','736149','9c8159','b99b69'],horn:['252631','47404b','736270','9b8889','c9b7a6','ede0bf']};
for(const k in palettes)palettes[k]=palettes[k].map(rgb);
export function directionRow(angle){const dx=Math.cos(angle),dy=Math.sin(angle);return Math.abs(dx)>Math.abs(dy)?dx>0?3:1:dy>0?2:0;}
export function sampleActor(u,time){
 if(u.crownPicking)return {clip:'thrust',frame:2,row:2};
 if(u.celebrating){const weapon=u.equipment.weapon;return{clip:weapon==='bow'?'shoot':['spear','staff'].includes(weapon)?'thrust':'slash',frame:weapon==='bow'?3:2,row:2};}
 if(u.deadAt!==null&&u.deadAt!==undefined)return{clip:'hurt',frame:Math.min(5,Math.floor((time-u.deadAt)/135)),row:0};
 if(u.action){const a=u.action,s=ACTIONS[a.type],contactFrame={slash:3,thrust:4,shoot:8,cast:4,crush:3}[a.type];const before=time<a.contactAt;const f=before?Math.floor(Math.max(0,time-a.started)/(a.contactAt-a.started)*contactFrame):contactFrame+Math.floor((time-a.contactAt)/(a.until-a.contactAt)*(s.frames-contactFrame));return{clip:s.clip,frame:Math.min(s.frames-1,f),row:directionRow(u.face)};}
 return{clip:'walk',frame:u.moving?1+Math.floor(u.walkPhase/100)%8:0,row:directionRow(u.face)};
}
export class Actors{
 constructor(){this.images=new Map();this.tints=new Map();this.headBounds=new Map();this.drawn=0;this.used=new Set();this.poses=new Map();this.cacheHits=0;this.cacheMisses=0;}
 async load(){this.manifest=await(await fetch('/lpc/manifest.json')).json();await Promise.all(Object.entries(this.manifest.parts).flatMap(([part,actions])=>Object.entries(actions).map(async([action,meta])=>{const im=new Image();im.src=meta.file;await im.decode();this.images.set(`${part}:${action}`,im);})));
 const tintGroups={body:['demonSkin'],pants:['dark'],boots:['leather'],plate:['demon','human'],mail:['demon','human'],leather:['demon','human'],robe:['demon','human'],head:['demonSkin'],elder:['demonSkin'],hair:['dark','gray'],beard:['dark','gray'],helmet:['silver'],hood:['demon','human'],horns:['horn'],shield:['demon','human']};let n=0;for(const [part,tints] of Object.entries(tintGroups))for(const clip of Object.keys(this.manifest.parts[part]||{}))for(const tint of tints){this.sheet(part,clip,tint);if(++n%4===0)await new Promise(requestAnimationFrame);}
 }

 sheet(part,clip,tint){const key=`${part}:${clip}`,im=this.images.get(key);if(!im)return null;if(!tint)return im;const cache=key+':'+tint;if(this.tints.has(cache))return this.tints.get(cache);const out=document.createElement('canvas');out.width=im.width;out.height=im.height;const c=out.getContext('2d',{willReadFrequently:true});c.drawImage(im,0,0);const pixels=c.getImageData(0,0,out.width,out.height),d=pixels.data,p=palettes[tint];for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const lum=d[i]*.25+d[i+1]*.58+d[i+2]*.17;const n=lum<42?0:lum<79?1:lum<118?2:lum<159?3:lum<205?4:5;[d[i],d[i+1],d[i+2]]=p[n];}c.putImageData(pixels,0,0);this.tints.set(cache,out);return out;}
 layer(c,part,clip,frame,row,tint){const im=this.sheet(part,clip,tint);if(!im)return;const cell=clip==='hurt'?im.height:im.height/4;const n=im.width/cell;frame=Math.min(n-1,frame);row=clip==='hurt'?0:row;const extra=(cell-64)/2;c.drawImage(im,frame*cell,row*cell,cell,cell,-32-extra,-60-extra,cell,cell);this.used.add(part+':'+clip);}
 headAnchor(clip,frame,row,elder){const key=`${elder}:${clip}:${frame}:${row}`;if(this.headBounds.has(key))return this.headBounds.get(key);const im=this.images.get(`${elder?'elder':'head'}:${clip}`),tmp=document.createElement('canvas');tmp.width=64;tmp.height=64;const c=tmp.getContext('2d',{willReadFrequently:true});c.drawImage(im,frame*64,(clip==='hurt'?0:row)*64,64,64,0,0,64,64);const d=c.getImageData(0,0,64,64).data;let minX=64,maxX=0,minY=64;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(d[(y*64+x)*4+3]>100){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);}const v={x:Math.round((minX+maxX)/2)-32,y:minY-60};this.headBounds.set(key,v);return v;}
 draw(c,u,time){if(u.musterArrivalAt!=null&&time<u.musterArrivalAt)return;
 if(u.musterArrivalAt!=null&&time<u.musterLandAt){const t=Math.max(0,Math.min(1,(time-u.musterArrivalAt)/(u.musterLandAt-u.musterArrivalAt))),height=440*(1-t*t*t);c.save();c.translate(u.x,u.y-height);c.globalAlpha=.55+.45*t;c.strokeStyle=u.side==='human'?'#cceeff':'#ffd394';c.lineWidth=3;c.beginPath();c.moveTo(0,-85);c.lineTo(0,-20);c.stroke();c.restore();u={...u,y:u.y-height,scale:(u.scale||1)*(1+.35*(1-t))};}
 if(u.machine){drawMachine(c,u,time);return;}const s=sampleActor(u,time),dead=u.hp<=0,e=u.equipment,hero=u.kind==='hero',scale=hero?1.25:u.scale||1;const age=dead?time-u.deadAt:0,recoil=time-u.hitAt<140?Math.sin((time-u.hitAt)/140*Math.PI)*3:0;
 c.save();c.translate(Math.round(u.x+Math.cos(u.hitAngle||0)*recoil),Math.round(u.y+Math.sin(u.hitAngle||0)*recoil-(u.celebrating?Math.max(0,Math.sin((time-u.celebrationAt)/220+Number(u.id.split('-').at(-1))))*(hero?5:9):0)));c.scale(scale,scale*(1-(u.crownBend||0)*.22));c.globalAlpha=(dead?Math.max(0,1-Math.max(0,age-3000)/1500):1)*(u.cinematicDim??1);
 c.fillStyle=dead?'#25342966':'#26372777';c.beginPath();c.ellipse(0,-1,hero?15:12,4,0,0,7);c.fill();
 if(hero&&!dead){c.strokeStyle=u.side==='demon'?'#d99487':'#b9d6bf';c.lineWidth=1;c.beginPath();c.ellipse(0,0,19,7,0,0,7);c.stroke();}
 const poseKey=[u.side,u.commander||false,u.factionColor||'',hero?Math.min(2,u.rank):0,e.weapon,e.armor,e.head,e.offhand,s.clip,s.frame,s.row,dead,AIMED_WEAPONS.has(e.weapon)?weaponAim(u):0].join(':');let pose=this.poses.get(poseKey);
 if(!pose){this.cacheMisses++;pose=document.createElement('canvas');pose.width=192;pose.height=192;const pc=pose.getContext('2d');pc.translate(96,124);this.compose(pc,u,s,hero,dead);this.poses.set(poseKey,pose);while(this.poses.size>384)this.poses.delete(this.poses.keys().next().value);}else this.cacheHits++;c.drawImage(pose,-96,-124);if(time>=u.hitAt&&time-u.hitAt<110){this.flashes??=new Map();let flash=this.flashes.get(poseKey);if(!flash){flash=document.createElement('canvas');flash.width=192;flash.height=192;const fc=flash.getContext('2d');fc.drawImage(pose,0,0);fc.globalCompositeOperation='source-in';fc.fillStyle='#fff5dc';fc.fillRect(0,0,192,192);this.flashes.set(poseKey,flash);while(this.flashes.size>32)this.flashes.delete(this.flashes.keys().next().value);}c.globalAlpha=.6*(1-(time-u.hitAt)/110);c.drawImage(flash,-96,-124);c.globalAlpha=1;}
 if(u.commander&&!dead&&this.avatarBadge){const a=this.headAnchor(s.clip,s.frame,s.row,false),r=13;c.save();c.beginPath();c.arc(a.x,a.y+10,r,0,7);c.clip();this.avatarBadge(c,u.supporter,a.x-r,a.y+10-r,r*2,u.factionColor);c.restore();c.strokeStyle=u.factionColor;c.lineWidth=2;c.beginPath();c.arc(a.x,a.y+10,r,0,7);c.stroke();}
 if(u.shield>0&&!dead){c.strokeStyle='#a4d9e6';c.globalAlpha=.65;c.lineWidth=1.5;c.beginPath();c.ellipse(0,-23,21,33,0,0,7);c.stroke();c.globalAlpha=1;}
 if(u.hasteUntil>time){c.strokeStyle='#a8f5af';c.beginPath();c.moveTo(-15,3);c.lineTo(-5,5);c.moveTo(2,5);c.lineTo(13,3);c.stroke();}
 if(hero&&(!dead||u.wornCrowns>0)){const a=this.headAnchor(s.clip,s.frame,s.row,u.rank>=2);drawWornCrowns(c,crownCount(u),a,u.crownSway??(u.moving?time/180:0));if(s.row!==0){const panic=u.hp/u.maxHP<.35||u.order==='retreat';if(u.action||panic){c.fillStyle=panic?'#eddab1':'#43302e';c.fillRect(a.x+(s.row===1?-4:s.row===3?3:-1),a.y+11,panic?2:3,panic?3:1);}}}
 c.restore();this.drawn++;
 }
 portrait(c,u,x,y,size=40){this.portraits??=new Map();const key=[u.side,u.rank,u.equipment.armor,u.equipment.head].join(':');let tile=this.portraits.get(key);if(!tile){tile=document.createElement('canvas');tile.width=64;tile.height=64;const pc=tile.getContext('2d');pc.imageSmoothingEnabled=false;pc.fillStyle=u.side==='demon'?'#513b40':'#304d5b';pc.fillRect(0,0,64,64);const a=this.headAnchor('walk',0,2,u.rank>=2);pc.scale(2,2);pc.translate(16,4-a.y);this.compose(pc,u,{clip:'walk',frame:0,row:2},true,false);this.portraits.set(key,tile);while(this.portraits.size>32)this.portraits.delete(this.portraits.keys().next().value);}c.drawImage(tile,Math.round(x),Math.round(y),size,size);}
 compose(c,u,s,hero,dead){const e=u.equipment;
 const uniform=u.factionColor||u.side;if(u.factionColor&&!palettes[uniform]){const base=rgb(u.factionColor.slice(1));palettes[uniform]=[.2,.38,.60,.82,1,1.25].map(k=>base.map(v=>Math.min(255,Math.round(v*k))));}
 const part=(p,tint)=>this.layer(c,p,s.clip,s.frame,s.row,tint),weapon=e.weapon;
 if(weapon==='staff')this.layer(c,'staffWoodBg',s.clip,s.frame,s.row);this.layer(c,weapon+'Bg',s.clip,s.frame,s.row);
 part('body',u.side==='demon'?'demonSkin':null);part('pants','dark');part('boots','leather');part(e.armor,uniform);if(!u.commander){part(hero&&u.rank>=2?'elder':'head',u.side==='demon'?'demonSkin':null);
 part(e.head||'hair',e.head==='helmet'?'silver':e.head==='hood'?u.side:hero&&u.rank>=1?'gray':'dark');
 if(u.side==='demon')part('horns','horn');if(hero&&u.rank>=1)part('beard',u.rank===1?'dark':'gray');}
 if(weapon==='staff')this.layer(c,'staffWoodFg',s.clip,s.frame,s.row);this.layer(c,weapon+'Fg',s.clip,s.frame,s.row);
 if(!dead)drawHandWeapon(c,u,s);
 if(e.offhand==='shield'){if(!dead)part('shield',uniform);else {c.save();c.translate(14,4);c.rotate(-Math.PI/2);this.layer(c,'shield','walk',0,3,u.side);c.restore();}}

 }
}
