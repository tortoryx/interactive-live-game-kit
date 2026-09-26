// Embed in the future, verified source adapter. Does not log in, scrape, or
// understand any vendor's raw messages; pass the whitebridge schema explicitly.
export async function sendXhsEvent(event,{key,endpoint='http://127.0.0.1:4391/integrations/xiaohongshu/events',fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const url=new URL(endpoint);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/integrations/xiaohongshu/events')throw Error('local_receiver_required');
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('relay_key_required');
 const body=JSON.stringify(event);if(Buffer.byteLength(body)>18000)throw Error('body_limit');
 for(let attempt=0;attempt<3;attempt++){
  let response;try{response=await fetcher(url.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Relay-Key':key},body,signal:AbortSignal.timeout(5000)});}catch{if(attempt===2)throw Error('receiver_unavailable');await wait(250*(attempt+1));continue;}
  if(response.status===503){if(attempt===2)throw Error('receiver_backpressure');await wait(250*(attempt+1));continue;}
  if(!response.ok)throw Error('receiver_rejected_'+response.status);
  const result=await response.json();if(!result.ok||!['accepted','duplicate'].includes(result.status))throw Error('invalid_receiver_response');return result;
 }
}
