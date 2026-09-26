// Presentation context: facts stay quantitative in the simulation. The host
// gets qualitative stakes so ordinary chatter does not turn into HUD reading.
const health=n=>n<=10?'危急':n<=30?'重伤':n<=60?'受伤':'状态尚好';
function reading(r){
 if(!r)return r;const out={...r};
 if(Number.isFinite(r.hpPercent)){out.health=health(r.hpPercent);delete out.hpPercent;}
 if(Number.isFinite(r.guardsNear)){out.nearbyProtection=r.guardsNear>0?'附近还有护卫':'镜头附近没有护卫';delete out.guardsNear;}
 if(Number.isFinite(r.enemiesNear)){out.nearbyAttackers=r.enemiesNear>0?'附近有对手':'附近没有对手';delete out.enemiesNear;}
 if(Number.isFinite(r.capturePercent)){out.capture=r.capturePercent>=75?'接近占住':r.capturePercent>0?'仍在争夺':'尚未推进';delete out.capturePercent;}
 if(Number.isFinite(r.advantage)){out.localAdvantage=Math.sign(r.advantage);delete out.advantage;}
 return out;
}
export function spokenObserverContext(r){
 const c=structuredClone(r),s=c.scene;delete s.counts;
 s.leaders=s.leaders?.map(reading);
 s.clusters=s.clusters?.map(g=>({side:g.side,sector:g.sector,fighting:g.fighting>0,wounded:g.wounded>0,moving:g.moving>0,types:g.types?.map(t=>t[0])}));
 s.analysis.readings=s.analysis.readings.map(reading);c.topic.reading=reading(c.topic.reading);c.topic.previousReading=reading(c.topic.previousReading);
 return c;
}
export function conversationalViewerContext(data,selected){
 if(/多少|几滴|几个人|几名|百分|数值|血量|价格|多少钱/.test(selected?.text||''))return data;
 const out={...data};delete out.ownPopulation;delete out.enemyPopulation;
 if(Number.isFinite(out.hp)&&out.maxHP>0)out.leaderHealth=health(out.hp/out.maxHP*100);delete out.hp;delete out.maxHP;
 if(out.enemy){out.enemy={name:out.enemy.name,...(Number.isFinite(out.enemy.hp)&&out.enemy.maxHP>0?{health:health(out.enemy.hp/out.enemy.maxHP*100)}:{})};}
 return out;
}
