const faction=side=>side==='human'?'人族':'魔族';
export function feedbackText(row,now){
 const name=Array.from(row.supporter?.name||'观众').slice(0,12).join(''),side=row.factionName||faction(row.side),seconds=Math.max(0,Math.ceil(((row.readyAt||0)-now)/1000));
 const detail=row.message|| (row.kind==='faction_selected'?'已加入'+side+' · 发「参战」派兵':row.kind==='faction_assigned'?'自动加入'+side+' · 可发弹幕换阵营':row.kind==='recruited'?(row.count||1)+' 名剑士正在入场 · 可继续发「参战」':row.kind==='recruit_cooldown'?(seconds?'参战冷却中 · 还剩 '+seconds+' 秒':'冷却结束 · 可以参战'):row.kind==='reply_failed'?'回复暂时中断 · 派兵和指令仍可用':'已收到 · 等待首领回应');
 return {name,side,detail,seconds};
}
export function drawInteractionFeedback(c,feedback,elapsed=0,box={x:12,y:98,w:242}){
 if(!feedback)return [];const now=feedback.clock+Math.max(0,elapsed),rows=feedback.items.filter(r=>r.until>now).slice(-3).reverse();
 c.save();const shown=[];for(let i=0;i<rows.length;i++){const row=rows[i],t=feedbackText(row,now),x=box.x,y=box.y+i*45,w=box.w;
 c.globalAlpha=Math.min(1,(now-row.at+120)/180,(row.until-now)/350);c.fillStyle='#14261de8';c.beginPath();c.roundRect(x,y,w,40,5);c.fill();c.fillStyle=row.factionColor||(row.side==='human'?'#84dfce':'#deb0ed');c.fillRect(x,y+5,3,30);c.font='bold 12px sans-serif';c.textAlign='left';c.fillText(t.name+' · '+t.side,x+10,y+15,w-18);c.font='11px sans-serif';c.fillStyle=t.seconds?'#ffe2a0':'#e7f5e8';c.fillText(t.detail,x+10,y+31,w-18);shown.push({...t,id:row.id,kind:row.kind,x,y,w,h:40});}
 c.restore();return shown;
}
