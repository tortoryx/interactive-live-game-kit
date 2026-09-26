// Screen-space body bounds, independent of name card sizes and sprite-sheet padding.
import {crownCount,crownStack} from './crowns.mjs';
export const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function bodyBox(u,camera){const p=camera.project(u),s=(u.kind==='hero'?1.25:u.scale||1)*camera.zoom;if(u.machine)return {x:p.x-48*s-2,y:p.y-(u.kind==='dreadnought'?105:62)*s-3,w:96*s+4,h:(u.kind==='dreadnought'?105:62)*s+12};const top=(60+(u.kind==='hero'?crownStack(crownCount(u)).height+12:0))*s;return {x:p.x-21*s-2,y:p.y-top-3,w:42*s+4,h:top+9};}
export function labelSlot(target,w,h,occupied,screenW,screenH,maxDistance=105){
 for(const [dx,dy] of [[0,0],[0,-25],[-w*.65,0],[w*.65,0],[0,-50],[-w,-25],[w,-25],[0,-75],[-w*.65,-50],[w*.65,-50],[-w,25],[w,25]]){
  const b={x:Math.round(target.x-w/2+dx),y:Math.round(target.y-h+dy),w,h};
  if(b.x<8||b.x+w>screenW-8||b.y<94||b.y+h>screenH-30||Math.hypot(dx,dy)>maxDistance)continue;
  if(!occupied.some(a=>overlaps(a,b)))return b;
 }
 // Search the empty ground below/alongside a crowded formation as well as above it.
 for(let radius=65;radius<=maxDistance;radius+=35)for(let i=0;i<12;i++){
  const a=i*Math.PI/6,b={x:Math.round(target.x+Math.cos(a)*radius-w/2),y:Math.round(target.y+Math.sin(a)*radius-h/2),w,h};
  if(b.x<8||b.x+w>screenW-8||b.y<94||b.y+h>screenH-30)continue;
  if(!occupied.some(o=>overlaps(o,b)))return b;
 }
 return null;
}
export function adjacentSlot(u,w,h,occupied,camera,above=false){const b=bodyBox(u,camera),p=camera.project(u),candidates=above?[{x:p.x-w/2,y:b.y-h-6},{x:b.x+b.w+5,y:b.y+5},{x:b.x-w-5,y:b.y+5},{x:p.x-w/2,y:b.y+b.h+6}]:[{x:b.x+b.w+5,y:b.y+6},{x:b.x-w-5,y:b.y+6},{x:p.x-w/2,y:b.y-h-6},{x:p.x-w/2,y:b.y+b.h+6}];
 for(const q of candidates){const box={...q,w,h};if(box.x<5||box.x+w>camera.screenW-5||box.y<72||box.y+h>camera.screenH-22)continue;if(!occupied.some(o=>overlaps(o,box)))return box;}return null;
}
export function battlefieldLabels(units,camera,extra=[]){const bodies=units.filter(u=>u.hp>0).map(u=>bodyBox(u,camera)),occupied=[...bodies,...extra,{x:0,y:0,w:camera.screenW*.28,h:65},{x:camera.screenW-170,y:camera.screenH-170,w:170,h:170}],commanders=new Map();
 for(const u of units.filter(u=>(u.kind==='hero'||u.commander)&&u.hp>0)){const slot=adjacentSlot(u,u.commander?148:112,u.commander?41:37,occupied,camera);if(slot){commanders.set(u.id,slot);occupied.push(slot);}}
 return {bodies,occupied,commanders};
}
