import {factionName,factionColor} from './faction-labels.mjs';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function battlefieldThreats(state,side){
 const enemy=side==='human'?'demon':'human',units=state.units.filter(u=>u.side===enemy&&u.hp>0),out=[],seen=new Set();
 for(const u of units.filter(u=>u.kind==='colossus'||u.machine))out.push({id:u.id,kind:'giant',x:u.x,y:u.y,count:1,power:u.machine?u.kind==='dreadnought'?32:16:12,severity:3,label:u.machine?u.kind==='dreadnought'?'堡垒攻城机':'野战重炮':'战锤巨人',hp:u.hp,maxHP:u.maxHP});
 for(const e of state.warEvents||[])if(e.stampede&&!e.stampede.finished&&e.until>state.time)out.push({id:e.id,kind:'beast',x:e.x,y:e.y,count:1,power:25,severity:4,label:'兽潮 ↓ · 伤及双方'});
 for(const u of state.wildlife||[])if(u.hp>0&&!u.stampede)out.push({id:u.id,kind:'beast',x:u.x,y:u.y,count:1,power:u.kind==='ogre'?15:5,severity:u.kind==='ogre'?3:2,label:'野兽 · 无差别攻击',hp:u.hp,maxHP:u.maxHP});
 const army=units.filter(u=>u.kind!=='colossus'&&!u.machine);
 for(const seed of army){if(seen.has(seed.id))continue;const group=[seed];seen.add(seed.id);for(let i=0;i<group.length;i++)for(const u of army)if(!seen.has(u.id)&&d(u,group[i])<180&&d(u,seed)<380){seen.add(u.id);group.push(u);}
  const power=group.reduce((n,u)=>n+Math.max(.25,u.hp/u.maxHP)*(u.attack/Math.max(1,u.interval)/35+u.armor/40+u.range/400),0);if(group.length<5||power<7)continue;
  const heavy=group.filter(u=>['shield','siege','rider','sentinel','berserker'].includes(u.kind)).length,ranged=group.filter(u=>['bow','mage','ranger','musketeer','repeater','crossbow','grenadier'].includes(u.kind)).length;
  out.push({id:'group-'+group.map(u=>u.id).sort()[0],kind:'army',x:group.reduce((n,u)=>n+u.x,0)/group.length,y:group.reduce((n,u)=>n+u.y,0)/group.length,count:group.length,power,severity:power>=18||group.length>=10?3:2,label:heavy>=3?'重装集群':ranged>=3?'远程集群':factionName(enemy)+'集结'});
 }
 return out.sort((a,b)=>b.severity-a.severity||b.power-a.power||d(a,state.heroes[side])-d(b,state.heroes[side])).slice(0,6);
}
export function threatLane(y){return y<916?'北渡口':y>1386?'南渡口':'中渡口';}
