import {UNITS,ACTIONS,rawDamage} from './catalog.mjs';
import {GIFTS} from './gifts.mjs';
// Versioned reference budget for the twelve mapped Bilibili troop gifts.
// Bonuses/spells remain separate mechanics; this measures newly dispatched squads.
export function giftBudget(reward,priceMilli){const g=GIFTS[reward];if(!g?.unit||!Number.isSafeInteger(priceMilli)||priceMilli<0)throw Error('invalid_gift_budget');return {version:1,priceMilli,unit:g.unit,count:g.count};}
export function priceStrength(priceMilli){if(!Number.isSafeInteger(priceMilli)||priceMilli<0)throw Error('invalid_gift_price');return 1+7*priceMilli/(priceMilli+10000);}
// Paid roster gifts add complete copies of the same formation. Each copy keeps
// its own per-unit budget; adding troops never dilutes the original formation.
// Cap copies rather than battlefield population: unplaced troops stay queued.
export function reinforcementCopies(priceMilli){
 if(!Number.isSafeInteger(priceMilli)||priceMilli<0)throw Error('invalid_gift_price');
 return 1+Math.floor(Math.sqrt(Math.min(priceMilli,200000)/4000));
}
export function referenceProfile(kind,armor=UNITS[kind].armor+12){
 const u=UNITS[kind],projectile=!!ACTIONS[u.action].projectile,source={...u,kind,attack:1,x:1,y:0,projectile};
 // Six equally weighted defensive targets. Dense and isolated formations split 50/50.
 const targets=[{armor:0},{armor:60},{armor:120},{armor:60,shield:true,face:0},{armor:60,shield:true,face:Math.PI},{armor:30,kind:'rider'}];
 let damage=0;
 for(const t of targets)for(const dense of [false,true])for(const x of [0,...(dense?[45,90].filter(d=>u.splash>=d):[])]){
  damage+=rawDamage(source,{x,y:0,face:0,kind:'militia',...t,equipment:{offhand:t.shield?'shield':null}},false)*(x===0?1:.5);
 }
 const cycle=Math.max(u.interval,ACTIONS[u.action].duration/1000),crit=1+.75*u.crit;
 const offense=damage/12*crit*(u.shots||1)/cycle+(kind==='healer'?60/16/1.8:0);
 const target={...u,kind,armor,x:0,y:0,face:0};
 const incoming=.5*rawDamage({attack:1,kind:'militia',x:1,y:0},target)+.25*rawDamage({attack:1,kind:'bow',x:1,y:0,projectile:true},target)+.25*rawDamage({attack:1,kind:'musketeer',x:-1,y:0,projectile:true,armorPen:.5},target);
 return {offense,incoming,cycle};
}
export function allocateGift(plan,rank=0,level=1){
 if(plan?.version!==1||!UNITS[plan.unit]||!Number.isSafeInteger(plan.count)||plan.count<1)throw Error('invalid_gift_plan');
 const r=Math.max(0,Math.min(10000,rank)),l=Math.max(0,Math.min(4,level-1)),scale=priceStrength(plan.priceMilli),armor=UNITS[plan.unit].armor+12+2*l,profile=referenceProfile(plan.unit,armor);
 const offense=240*scale*(1+.01*r)*(1+.1*l),durability=8000*scale*(1+.025*r)*(1+.08*l);
 return {hp:durability*profile.incoming/plan.count,attack:offense/(plan.count*profile.offense),armor,offense,durability,scale};
}
