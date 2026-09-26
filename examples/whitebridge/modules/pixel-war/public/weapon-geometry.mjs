export const AIMED_WEAPONS=new Set(['musket','repeater','blunderbuss','crossbow','shortbow','grenade']);
export function weaponAim(u,angle=u.face||0){return AIMED_WEAPONS.has(u.equipment?.weapon)?Math.round(angle/(Math.PI/8))*Math.PI/8:angle;}
export function weaponMuzzle(u,angle=u.face||0,shot=0,at=u.action?.contactAt||0){const scale=u.kind==='hero'?1.25:u.scale||1;
 if(u.machine){const big=u.kind==='dreadnought',dt=at-(u.action?.contactAt??at),recoil=dt>=0&&dt<200?-3*(1-dt/200):0,r=(45+recoil)*scale,offset=big?(shot%2?10:-10)*scale:0;return {x:u.x+Math.cos(angle)*r-Math.sin(angle)*offset,y:u.y+Math.sin(angle)*r+Math.cos(angle)*offset,z:(big?56:40)*scale};}
 const aim=weaponAim(u,angle),dx=Math.cos(angle),dy=Math.sin(angle),row=Math.abs(dx)>Math.abs(dy)?dx>0?3:1:dy>0?2:0,handX=row===1?-9:row===3?9:4,len=({musket:43,repeater:35,blunderbuss:33,crossbow:29,shortbow:15,grenade:10})[u.equipment?.weapon]||25;
 return {x:u.x+((AIMED_WEAPONS.has(u.equipment?.weapon)?handX:0)+Math.cos(aim)*len)*scale,y:u.y+Math.sin(aim)*len*scale,z:25*scale};
}
