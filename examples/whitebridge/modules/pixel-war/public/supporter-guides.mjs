const tau=Math.PI*2;
export function supporterGuides(units,camera,side){const groups=new Map();
 for(const u of units){if(u.hp<=0||u.side!==side||!u.supporter||u.supporter.platform==='system')continue;const p=camera.project(u);if(p.x>=12&&p.x<=camera.screenW-12&&p.y>=55&&p.y<=camera.screenH-12)continue;
  const angle=Math.atan2(u.y-camera.y,u.x-camera.x),sector=Math.floor(((angle+tau+Math.PI/8)%tau)/(Math.PI/4)),owner=u.supporter,key=(owner.id||owner.avatarKey||owner.platform+':'+owner.name)+':'+sector;
  let g=groups.get(key);if(!g)groups.set(key,g={key,owner,x:0,y:0,count:0,ids:[],firing:false});g.x+=u.x;g.y+=u.y;g.count++;g.ids.push(u.id);g.firing||=!!u.action;
 }
 return [...groups.values()].map(g=>{g.x/=g.count;g.y/=g.count;g.angle=Math.atan2(g.y-camera.y,g.x-camera.x);g.metres=Math.round(Math.hypot(g.x-camera.x,g.y-camera.y)/16);return g;});
}
export function guideSlots(groups,w,h,blocked=[]){const out=[],slots=[],size=26,gap=30,hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 // Several perimeter rows retain every donor even at the unit cap; no rotating or hidden donors.
 for(let ring=0;ring<6;ring++){const inset=8+ring*gap;for(let x=inset;x<w-inset-size;x+=gap)for(const y of [36+ring*gap,h-48-ring*gap])slots.push({x,y,w:size,h:size});for(let y=128+ring*gap;y<h-80-ring*gap;y+=gap)for(const x of [inset,w-inset-size])slots.push({x,y,w:size,h:size});}
 const seen=new Set(),free=slots.filter(s=>{const key=s.x+':'+s.y;if(seen.has(key)||blocked.some(b=>hit(s,b)))return false;seen.add(key);return true;});
 for(const g of groups){const dx=Math.cos(g.angle),dy=Math.sin(g.angle),t=Math.min((w/2-25)/Math.max(.001,Math.abs(dx)),(h/2-60)/Math.max(.001,Math.abs(dy))),anchor={x:w/2+dx*t,y:h/2+dy*t};let index=-1,score=Infinity;for(let i=0;i<free.length;i++){if(!free[i])continue;const s=free[i],v=(s.x+13-anchor.x)**2+(s.y+13-anchor.y)**2;if(v<score){score=v;index=i;}}if(index<0)break;const s=free[index];out.push({...g,...s});for(let i=0;i<free.length;i++)if(free[i]&&hit({...s,x:s.x-2,y:s.y-2,w:30,h:30},free[i]))free[i]=null;}
 return out;
}
export function viewerSquads(units){const groups=[];const crowded=true;for(const u of units){const owner=u.supporter,key=(owner.id||owner.avatarKey||owner.platform+':'+owner.name)+':'+(u.faction||u.side);let g=crowded?groups.find(g=>g.key===key&&Math.hypot(u.x-g.x,u.y-g.y)<270):null;if(!g){g={key,owner,x:u.x,y:u.y,units:[],side:u.side,factionColor:u.factionColor};groups.push(g);}g.units.push(u);g.x=g.units.reduce((n,v)=>n+v.x,0)/g.units.length;g.y=g.units.reduce((n,v)=>n+v.y,0)/g.units.length;}return groups;}
