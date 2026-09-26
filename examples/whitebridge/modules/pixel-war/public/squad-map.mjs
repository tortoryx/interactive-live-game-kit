import {viewerSquads} from './supporter-guides.mjs';
export function mapSquads(units,side){return viewerSquads(units.filter(u=>u.hp>0&&u.kind!=='hero'&&(u.side===side||u.faction)&&u.supporter?.id&&u.supporter.platform!=='system'&&u.source!=='system'));}
export function squadMapTags(groups,box,project){
 if(!groups.length)return [];const gap=2,cols=Math.max(1,Math.floor(box.w/70),Math.ceil(Math.sqrt(groups.length*box.w/box.h))),rows=Math.max(1,Math.floor(box.h/18),Math.ceil(groups.length/cols)),cw=box.w/cols,ch=box.h/rows,w=Math.min(83,cw-gap),h=Math.min(16,ch-gap),slots=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)slots.push({x:box.x+x*cw+(cw-w)/2,y:box.y+y*ch+(ch-h)/2,w,h});
 return [...groups].sort((a,b)=>a.key.localeCompare(b.key)||a.x-b.x||a.y-b.y).map(g=>{const p=project(g);let best=0,score=Infinity;for(let i=0;i<slots.length;i++){const s=slots[i],d=(s.x+s.w/2-p.x)**2+(s.y+s.h/2-p.y)**2;if(d<score){score=d;best=i;}}const slot=slots.splice(best,1)[0];return {...slot,group:g,anchor:p,font:Math.max(6,Math.min(10,h-3)),outside:p.x<box.x||p.x>box.x+box.w||p.y<box.y||p.y>box.y+box.h};});
}
