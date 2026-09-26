export const BILI_FIELDS={roomId:'直播间长号',appId:'已获批的应用 App ID',accessKeyId:'Access Key ID',accessKeySecret:'Access Key Secret',anchorCode:'主播身份码'};
export function biliSetup(config,state={}){
 const fields=Object.fromEntries(Object.keys(BILI_FIELDS).map(k=>[k,!!config[k]]));
 const missing=Object.keys(fields).filter(k=>!fields[k]);
 return {adapterReady:true,method:'bilibili_open_live_v2',fields,missing,appId:config.appId||null,
  next:missing.length?'填写'+missing.map(k=>BILI_FIELDS[k]).join('、'):state.state==='authenticated'?'在直播间发一条弹幕，核对收据，再联调礼物':'连接并核验主播身份码',
  supported:['chat','gift','combo','super_chat','super_chat_delete','like','join'],
  pending:['blind_gift_live_sample','real_room_round_trip','broadcast_push']};
}
