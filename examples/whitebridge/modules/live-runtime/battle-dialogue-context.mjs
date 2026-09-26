const sides=['demon','human'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Facts are sampled from the engine. Dialogue never creates an action or a receipt.
export function battleDialogueContext(w){
 const leaders=Object.fromEntries(sides.map(side=>{const h=w.heroes[side],r=w.heroes[side==='demon'?'human':'demon'];return [side,{name:h.name,healthPercent:Math.round(h.hp/h.maxHP*100),moving:!!h.moving,order:h.order,mission:h.mission?{type:h.mission.type,label:h.mission.label,id:h.mission.id}:null,distanceToRival:Math.round(distance(h,r)),nearbyAllies:w.units.filter(u=>u.hp>0&&u.side===side&&distance(u,h)<420).length,nearbyEnemies:w.units.filter(u=>u.hp>0&&u.side!==side&&distance(u,h)<420).length}];}));
 const sites=(w.campaign?.sites||[]).map(s=>({id:s.id,kind:s.kind,name:s.name,owner:s.owner,controller:s.controller,contested:!!s.contested,progress:s.progress}));
 const objectives=(w.objectives||[]).filter(o=>!o.claimedBy&&o.until>w.time).map(o=>({id:o.id,kind:o.kind,contested:!!o.contested,remainingSeconds:Math.ceil((o.until-w.time)/1000)}));
 const reinforcements=(w.reinforcementShots||[]).filter(r=>w.time-r.at>=0&&w.time-r.at<18000).slice(-2).map(r=>({side:r.side,kind:r.kind,count:r.count}));
 const events=(w.warEvents||[]).filter(e=>e.until>w.time).slice(-2).map(e=>({kind:e.kind,actorSide:e.actorSide,targetSide:e.targetSide}));
 const maneuver=w.duelManeuver||null;
 return {leaders,sites,objectives,reinforcements,events,maneuver:maneuver?{phase:maneuver.phase,reason:maneuver.reason,retreating:maneuver.retreating,pursuer:maneuver.pursuer}:null,
  stakes:{grain:'粮仓控制补给，工坊让这一方更能打；丢掉两处据点会失去这一段家乡',demon:'索恩要拿回被人类军吏扣走的冬粮；他的村民却仍受魔族强制血籍约束',human:'阿岚要把村民带离血籍；他自己的救援军也向村民加征粮食'},
  certainty:'这是生成时的快照。只对已确认事实作反应，不把意图说成已经完成，不预告命中、击杀或观众赠礼。'};
}
