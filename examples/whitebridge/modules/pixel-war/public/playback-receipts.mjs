// The key is scoped to playback receipts, never owner controls. Only an OBS
// broadcast URL receives it; ordinary viewing tabs stay read-only.
export function broadcastReceipts({fetcher=fetch,token=document.querySelector('meta[name="playback-token"]')?.content}={}){
 if(!token||token==='__PLAYBACK_TOKEN__')return {emit:()=>{},view:()=>{},close:()=>{}};
 const client=crypto.randomUUID();let admitted=false,closed=false;
 async function send(body){try{return await(await fetcher('/playback',{method:'POST',headers:{'Content-Type':'application/json','X-Playback-Token':token},body:JSON.stringify({client,...body})})).json();}catch{return {ok:false};}}
 async function claim(){if(!closed)admitted=(await send({event:'claim'})).ok===true;}
 void claim();const timer=setInterval(claim,5000);
 return {view:b=>{if(admitted&&!closed)void send({event:'view',...b});},emit:(line,event)=>{if(admitted&&!closed&&(line.audienceId||line.debate))void send({event,id:line.id,field:line.field,persona:line.persona});},close:()=>{closed=true;clearInterval(timer);}};
}
