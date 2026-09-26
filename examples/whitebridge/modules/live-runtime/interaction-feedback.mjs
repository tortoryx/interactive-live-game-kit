// Engine acknowledgements are UI receipts, never invented character dialogue.
import {GIFTS} from '../pixel-war/public/gifts.mjs';
export function interactionFeedback(game,e,kind,{readyAt=null,count=0,message=null}={}){
 const now=game.now(),rows=game.meta.interactionFeedback??=[];
 const key=e.supporter.id+':'+(kind.startsWith('recruit')?'recruit':kind.startsWith('reply')?'reply':'faction');
 game.meta.interactionFeedback=rows.filter(r=>r.key!==key&&r.until>now).slice(-63);
 const row={id:e.id,key,side:e.side,faction:e.faction,factionName:e.factionName,factionColor:e.factionColor,supporter:e.supporter,kind,count,message,at:now,readyAt,until:readyAt?Math.max(now+7000,readyAt+5000):now+8000};
 game.meta.interactionFeedback.push(row);return row;
}
export function recruit(game,e,corrected=false){
 // receive() deduplicates platform event IDs; distinct chat messages each earn a soldier.
 game.reward(e,'enlist',1);
 const count=GIFTS.enlist.count;
 interactionFeedback(game,e,'recruited',{count});
 return {status:'recruited',count,corrected,side:e.side,remainingMs:0};
}
export function feedbackSnapshot(game){const now=game.now();return {clock:now,items:(game.meta.interactionFeedback||[]).filter(r=>r.until>now).slice(-32)};}
