import {CAPTURE_MS,SITE_KINDS} from '../pixel-war/campaign.mjs';
const sides=['demon','human'],other=s=>s==='human'?'demon':'human';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const visible=(v,p)=>Math.abs(p.x-v.x)<v.w/2&&Math.abs(p.y-v.y)<v.h/2;
// Bounded, factual analysis input. The model adds interpretation, not outcomes.
export function battleReading(w,v,sector){
 const army=[...w.units,...Object.values(w.heroes)].filter(u=>u.hp>0&&sides.includes(u.side)&&visible(v,u)),near=(p,r)=>army.filter(u=>distance(p,u)<r),readings=[];
 for(const s of w.campaign?.sites||[]){if(!visible(v,s))continue;
  const p=s.presence||{},challenger=other(s.controller),advantage=(p[challenger]||0)-(p[s.controller]||0);
  if(!p.human&&!p.demon&&!s.progress)continue;
  readings.push({id:s.id,kind:'objective',priority:s.progress>CAPTURE_MS*.5?9:s.contested?8:4,sector:sector(v,s),name:SITE_KINDS[s.kind]?.name||s.kind,controller:s.controller,attacker:challenger,presence:p,capturePercent:Math.round((s.progress||0)/CAPTURE_MS*100),advantage,
   trend:advantage>0?'占领进度增加':advantage<0?'占领进度被压回':'人数相同则进度停住',
   stakes:s.kind==='grain'?'控制粮仓会改变双方后续援军数量':'被夺工坊会给夺取方攻击加成，夺回后可取消这份加成',
   watch:'后续增援能否改变据点内人数优势；人数优势不是已占领'});
 }
 for(const h of Object.values(w.heroes)){if(!visible(v,h)||h.hp<=0)continue;const around=near(h,240),enemies=around.filter(u=>u.side!==h.side),guards=around.filter(u=>u.side===h.side&&u.id!==h.id);
  if(h.hp/h.maxHP<.45&&enemies.length)readings.push({id:h.id,kind:'leader_risk',priority:10,side:h.side,sector:sector(v,h),hpPercent:Math.round(h.hp/h.maxHP*100),shield:h.shield||0,enemiesNear:enemies.length,guardsNear:guards.length,stakes:'首领倒下会结束这一代；只判断眼下风险，不预报死亡',watch:'能否脱离近身敌人，或等到保护与治疗'});
 }
 for(const u of army){if(u.kind==='hero'||!(u.range>=200))continue;const around=near(u,145),enemies=around.filter(x=>x.side!==u.side),guards=around.filter(x=>x.side===u.side&&x.id!==u.id&&x.range<100);
  if(enemies.length&&guards.length<2)readings.push({id:u.id,kind:'exposed_ranged',priority:7,side:u.side,unit:u.name||u.kind,owner:u.supporter?.platform!=='system'?u.supporter?.name:null,sector:sector(v,u),enemiesNear:enemies.length,guardsNear:guards.length,range:u.range,stakes:'远程单位近处护卫少，有被贴身消耗的风险；不等于不能近射',watch:'近战能否接住对手，让远程继续输出'});
 }
 const arrivals=(w.reinforcementShots||[]).filter(s=>w.time-s.at>=0&&w.time-s.at<16000&&visible(v,s)).slice(-3).map(s=>{
  const ids=new Set(s.units.map(u=>u.id)),members=army.filter(u=>ids.has(u.id));return {receipt:s.receipt,side:s.side,owner:s.supporter?.name,source:s.supporter?.platform,sector:sector(v,s),deployed:s.units.length,living:members.length,kinds:[...new Set(members.map(u=>u.name||u.kind))],ranged:members.filter(u=>u.range>=200).length,nearSite:(w.campaign?.sites||[]).filter(p=>visible(v,p)&&distance(s,p)<350).map(p=>SITE_KINDS[p.kind]?.name||p.kind)};
 });
 return {readings:readings.sort((a,b)=>b.priority-a.priority).slice(0,4),arrivals,rules:['判断必须注明是风险、机会或条件，不能把推测写成已发生。','这里都是镜头内的局部战况，不代表全场兵力或全局胜率。']};
}
