import {frontX} from './campaign.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),sign=s=>s==='demon'?1:-1;
// A retreat commits to one nearby position. It never moves its destination every tick.
export function withdrawalPlan(w,u,enemies=[],issue='danger'){
 const now=w.time;let r=u.withdrawal;
 if(r?.done&&issue==='danger'&&now>=(u.withdrawalCooldown||0)){r=null;u.withdrawal=null;}
 if(r&&r.issue!==issue){r=null;u.withdrawal=null;}
 if(!r){if(now<(u.withdrawalCooldown||0))return null;const rear=sign(u.side),homeLimit=frontX(w)-rear*850;if(rear*(u.x-homeLimit)<-20)return null;
 const options=[];for(const length of [180,240,120])for(const dy of [0,-70,70]){const p=w.ground({x:u.x-rear*length,y:u.y+dy});if(!p||distance(p,u)>270||rear*(p.x-homeLimit)<0)continue;const danger=enemies.reduce((n,e)=>n+Math.max(0,260-distance(p,e)),0);options.push({...p,score:danger+Math.abs(dy)*.2});}
 const p=options.sort((a,b)=>a.score-b.score)[0];if(!p)return null;u.withdrawal=r={issue,x:p.x,y:p.y,started:now,until:now+4500,done:false};u.mission=null;u.duelUntil=0;u.path=null;
 }
 if(!r.done&&(distance(u,r)<28||now>=r.until))finishWithdrawal(w,u);
 return r.done?null:{order:'retreat',label:'短撤整队，掩护反击',goal:{x:r.x,y:r.y}};
}
export function clearWithdrawal(u){u.withdrawal=null;u.withdrawalCooldown=0;}

function finishWithdrawal(w,u){u.withdrawal.done=true;u.withdrawalCooldown=w.time+10000;u.nextPlan=0;if(u.order==='retreat'){u.order='regroup';u.orderLabel='短撤结束，重新部署';}}
export function expireWithdrawal(w,u){if(u.withdrawal&&!u.withdrawal.done&&w.time>=u.withdrawal.until)finishWithdrawal(w,u);}
