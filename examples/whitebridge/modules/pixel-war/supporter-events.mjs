// Internal combat evidence. Never accept viewer-supplied claims as these events.
export function supporterEvent(w,side,supporter,kind,details={}){
 if(!['demon','human'].includes(side)||!supporter?.id||!['test','bilibili','xiaohongshu'].includes(supporter.platform))return;
 const log=w.supporterEvents??={serial:0,items:[]};
 log.items.push({id:++log.serial,at:w.time,side,persona:w.heroes[side].id,fieldEpoch:w.fieldEpoch,supporter:{id:supporter.id,name:String(supporter.name).slice(0,24),platform:supporter.platform,avatarKey:supporter.avatarKey||null},kind,...details});
 log.items=log.items.slice(-2048);
}
