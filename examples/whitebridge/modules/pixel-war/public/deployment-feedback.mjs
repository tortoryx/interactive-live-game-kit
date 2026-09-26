// Receipt facts drive operator feedback; a successful POST is only acceptance.
export function deploymentFeedback(state,request){
 if(!request)return null;
 const shot=(state.reinforcementShots||[]).find(s=>s.receipt===request.id);
 const count=shot?.units.length||0;
 if(count>=request.count)return {key:'deployed:'+count,text:request.label+' 已到场 '+count+'/'+request.count+' · 可发 1 / 2 / 3 / 4 指挥',done:true};
 const why=state.paused?'已暂停，恢复后出兵':state.mode==='settlement'?'长辈交接后出兵':count?'其余援军正在加入':'等待安全位置';
 return {key:why+':'+count,text:request.label+' '+count+'/'+request.count+' · '+why,done:false};
}
export function battleModeLabel(state){
 if(state.paused)return '战斗已暂停';
 if(state.mode==='sparring')return '切磋 · 派兵后解除保护';
 if(state.mode==='settlement')return '战败交接 · 暂停伤害';
 return {test_live:'试玩实战 · 正常伤害',live:'直播实战 · 正常伤害',showcase:'演示实战',inspection:'装备检查'}[state.mode]||'战斗中';
}
export const sparringProtected=(state,u)=>state.mode==='sparring'&&u.hp>0&&u.hp<=u.maxHP*.35+1;
