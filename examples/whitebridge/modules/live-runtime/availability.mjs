// Runtime capability, separate from the owner's saved enable switch.
export function runtimeAvailability(status={}){
 const m=status.models||{},v=status.voice||{};
 let reason=!m.enabled?'disabled':null;
 if(status.unavailable)reason='broker_unavailable';
 else if(m.enabled){
  if(m.transport==='electron'&&(m.authenticated!==true||!['ready','requesting'].includes(m.state)))reason=m.state||'electron_unavailable';
  else if(m.transport==='electron'&&m.pages&&m.pages.ready===0&&!(m.pages.busy>0))reason=m.pages.preparing>0?'electron_page_warming':'electron_page_unavailable';
  else if(m.transport==='codex'&&m.authenticated!==true)reason='codex_login_unavailable';
  else if((m.hourLimitCalls>0&&m.hourCalls>=m.hourLimitCalls)||(m.dayLimitCalls>0&&m.dayCalls>=m.dayLimitCalls))reason='subscription_call_limit';
  else if((m.quota||[]).some(q=>q.remainingPercent<=(m.reservePercent??10)))reason='codex_quota_reserve';
  else if(m.transport==='api'&&!m.keys?.[m.profile])reason='api_key_required';
  else if(m.transport==='api'&&['upstream_400','upstream_401','upstream_402','upstream_403','upstream_404'].includes(m.state))reason=m.state;
  else if(m.transport==='api'&&((m.hourLimitUSD>0&&m.hourUSD>=m.hourLimitUSD)||(m.dayLimitUSD>0&&m.dayUSD>=m.dayLimitUSD)))reason='budget_limit';
  else if(['api_key_required','luna_max_unavailable','codex_quota_unavailable','muse_pricing_unconfirmed','budget_limit'].includes(m.state))reason=m.state;
 }
 const voiceEnabled=!status.unavailable&&!!v.enabled&&v.configured!==false&&v.local?.memoryReady!==false&&!(v.hourLimit>0&&v.hourCharacters>=v.hourLimit)&&!(v.dayLimit>0&&v.dayCharacters>=v.dayLimit);
 return {model:m.model,modelEnabled:reason===null,modelReason:reason,voiceEnabled};
}
