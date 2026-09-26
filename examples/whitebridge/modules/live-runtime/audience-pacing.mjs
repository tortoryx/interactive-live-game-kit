// Limits apply to narration only. Platform receipts, troop orders and gift
// fulfillment have their own authoritative path and must never be sampled here.
export const FREE_CHAT_TTL_MS=30000;
// Allow one in-flight ambient Instant turn, then one arrival reply. Still bounded.
export const ARRIVAL_TTL_MS=45000;
export const PAID_CHAT_TTL_MS=90000;
export const MAX_PREPARED_PER_SIDE=3;
export const MAX_PREPARED_TOTAL=6;
export const sameViewer=(a,b)=>a?.side===b?.side&&a?.supporter?.platform===b?.supporter?.platform&&a?.supporter?.id===b?.supporter?.id;
export const viewerTurnKey=item=>JSON.stringify([item.side,item.supporter.platform,item.supporter.id]);
export const narrationExpired=(game,item)=>item.expires<=game.world.time||Number.isFinite(item.deadline)&&item.deadline<=game.now();
export function replyPacing(game){
 const a=game.meta.audience||{},pending=(a.pending||[]).filter(m=>!narrationExpired(game,m));
 const age=pending.reduce((n,m)=>Math.max(n,game.now()-(m.receivedAt??game.now())),0);
 const load=pending.length+Object.keys(a.active||{}).length;
 const mode=load>=8||age>=12000?'busy':load>=3?'steady':'quiet';
 return {mode,waiting:pending.length,maxSegments:mode==='busy'?1:mode==='steady'?2:4,maxChars:mode==='busy'?24:mode==='steady'?48:96,freeGapMs:mode==='quiet'?9000:0};
}
export function narrationPriority(a,b){return Number(a.eventNotice==='arrival')-Number(b.eventNotice==='arrival')||b.amountMilli-a.amountMilli||(a.amountMilli?a.seq-b.seq:b.seq-a.seq);}
