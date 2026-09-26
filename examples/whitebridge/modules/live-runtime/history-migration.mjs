// Import only exchanges with surviving leader identity and receipt timestamps.
// Old receipts alone cannot establish which deceased leader heard a message.
export function migrateViewerHistory(game){
 if(game.db.prepare("SELECT 1 FROM kv WHERE key='viewer-history-migration-v1'").get())return;
 for(const [side,state] of Object.entries(game.meta.relationships||{})){
  if(state.persona!==game.world.heroes[side]?.id)continue;
  const records=state.memory?[...Object.values(state.memory.active||{}),...Object.values(state.memory.archived||{})].map(e=>e.record):Object.values(state.viewers||{});
  for(const r of records)for(const e of r.exchanges||[]){
   if(!e.turnId)continue;
   const receipt=game.db.prepare('SELECT at,payload FROM receipts WHERE id=?').get(e.turnId);if(!receipt)continue;
   const event=JSON.parse(receipt.payload),p=event.supporter;
   if(event.kind!=='chat'||event.side!==side||p?.id!==r.supporter?.id||p.platform!==r.supporter.platform)continue;
   game.viewerHistory.arrived({platform:p.platform,viewerId:p.id,name:p.name,side,persona:state.persona,eventId:e.turnId,messageId:e.messageId||null,text:e.text,at:receipt.at});
   // Older reply timestamps were battle time, not wall time. Never manufacture
   // wall-clock reply dates or claim an unconfirmed draft was delivered.
  }
 }
 game.db.prepare("INSERT INTO kv(key,value) VALUES('viewer-history-migration-v1','1')").run();
}
