import {GIFTS} from '../pixel-war/public/gifts.mjs';
// Public receipts only. No chat body, billing amount or unverified outcome.
export function recordViewerNotice(game,e,status,interaction={}){
 if(!e.supporter||!['chat','gift'].includes(e.kind))return;
 const now=game.now(),grant=game.meta.queue.find(g=>g.receipt===e.id),reward=grant?.key||e.reward||interaction?.key;
 let kind,title,detail,spotlight=false;
 if(e.kind==='gift'){kind='gift';title=(e.giftName||GIFTS[reward]?.name||'礼物')+' ×'+e.quantity;detail=status==='unmapped'?'已收到 · 等待绑定奖励':status==='no_fallen_troops'?'已收到 · 暂无可救援部队':status==='rescue_progress'?'已计入救援进度':(GIFTS[reward]?.name||'增援')+' · 等待入场';spotlight=!!grant;}
 else if(status.startsWith('clan_')){kind='faction';title=status==='clan_created'?'自立门户':status==='clan_joined'?'加入门户':'门户消息';detail=interaction?.message||'';spotlight=status==='clan_created';}
 else if(status==='recruited'){kind='recruit';title='免费参战';detail=(interaction.count||GIFTS.enlist.count)+' 名剑士 · 正在入场';spotlight=true;}
 else if(status==='faction_selected'){kind='faction';title='选择阵营';detail=e.side==='human'?'加入人族':'加入魔族';}
 else if(status==='event_queued'){kind='spell';title='释放咒语';detail=GIFTS[reward]?.name||'事件已排队';spotlight=true;}
 else if(status==='recruit_cooldown'||status==='event_cooldown'){kind='cooldown';title=status==='recruit_cooldown'?'参战冷却':'咒语冷却';detail=interaction?.remainingMs?'还剩 '+Math.ceil(interaction.remainingMs/1000)+' 秒':interaction?.message||'稍等，前一批正在入场';}
 else if(status==='message_queued'){kind='chat';title='发来留言';detail='魔女已收到';}
 else if(interaction?.count>0){kind='order';title='指挥部队';detail=interaction.count+' 名部队已接令';}
 else return;
 const row={id:e.id,kind,title,detail,side:e.side,faction:e.faction,factionName:e.factionName,factionColor:e.factionColor,supporter:e.supporter,reward,spotlight,readyAt:interaction?.remainingMs?now+interaction.remainingMs:null,at:now,until:now+20000,field:game.world.fieldEpoch};
 game.meta.viewerNotices=(game.meta.viewerNotices||[]).filter(r=>r.until>now&&r.id!==e.id).slice(-63);game.meta.viewerNotices.push(row);return row;
}
export function viewerNoticesSnapshot(game){const now=game.now();return {clock:now,items:(game.meta.viewerNotices||[]).filter(r=>r.until>now&&r.field===game.world.fieldEpoch)};}
