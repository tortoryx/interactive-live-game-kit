// Optional provider adapter. No browser session, OS tools, or model name is bundled.
export function customProfile(env=process.env){
 const requestModel=env.AI_MODEL||'',raw=env.AI_CHAT_URL||'';
 let url='';
 if(raw){
  const u=new URL(raw);
  if(u.username||u.password||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('invalid_ai_endpoint');
  url=u.href;
 }
 if(requestModel&&!/^[a-zA-Z0-9._:/-]{1,120}$/.test(requestModel))throw Error('invalid_ai_model');
 const rate=k=>env[k]?.trim()?Number(env[k]):NaN;
 return {model:'configured-api/'+requestModel,requestModel,url,input:rate('AI_INPUT_USD_PER_MILLION'),output:rate('AI_OUTPUT_USD_PER_MILLION')};
}
export function toCustomRequest(original,profile){
 if(!profile.url||!profile.requestModel)throw Error('custom_provider_not_configured');
 return {model:profile.requestModel,max_tokens:2048,
  messages:original.input.map(({role,content})=>({role,content})),
  response_format:{type:'json_schema',json_schema:{name:original.text.format.name,strict:true,schema:original.text.format.schema}}};
}
