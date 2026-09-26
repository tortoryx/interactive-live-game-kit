import {createClan} from '../pixel-war/clans.mjs';
import {interactionFeedback} from './interaction-feedback.mjs';
export function resolveClanEvent(game,e){
 delete e.faction;delete e.factionName;delete e.factionColor;
 const members=game.meta.clanMembers??={},text=e.kind==='chat'?String(e.text||'').trim():'';
 const apply=c=>{e.faction=c.id;e.factionName=c.name;e.factionColor=c.color;e.side=c.side;members[e.supporter.id]=c.id;};
 const reply=(status,message,c)=>{if(c)apply(c);interactionFeedback(game,e,status,{message});return {status,message,faction:c?.id};};
 if(text==='加入人族'||text==='加入魔族'){delete members[e.supporter.id];return null;}
 if(text==='自立门户'){
  const result=createClan(game.world,e);
  if(result.ok){apply(result.clan);game.engage(e.platform);return reply('clan_created',result.reason==='already_created'?'你已经是'+result.clan.name+'的将军':result.clan.name+'成立 · 将军只有一条命',result.clan);}
  return reply('clan_rejected',({one_life_spent:'你的将军已阵亡，本场不能再次自立门户',battle_paused:'战场暂停中，开始后再发「自立门户」',clan_capacity:'独立门户已满，先加入现有阵营',no_safe_position:'附近没有安全入场点，稍后再试'})[result.reason]||'暂时不能创建');
 }
 const join=text.match(/^加入(.族)(?:#([1-9]\d{0,3}))?$/u);
 if(join&&(join[2]||!['人族','魔族'].includes(join[1]))){
  const found=Object.values(game.world.clans||{}).filter(c=>c.name===join[1]&&c.status==='active'&&(!join[2]||c.number===Number(join[2])));
  if(found.length!==1)return reply('clan_rejected',found.length?'有重名，请发 '+found.slice(0,3).map(c=>'加入'+c.name+'#'+c.number+'（'+c.founder.name+'）').join(' / '):'这个门户不存在或将军已阵亡');
  return reply('clan_joined','已加入'+found[0].name+' · 发「参战」派兵',found[0]);
 }
 const c=game.world.clans?.[members[e.supporter.id]];
 if(c?.status==='active')apply(c);
 else if(c){delete members[e.supporter.id];interactionFeedback(game,e,'clan_closed',{message:c.name+'将军已阵亡，当前回到'+(e.side==='human'?'人族':'魔族')});}
 return null;
}
// A paid entitlement queued before its general died is preserved. Deliver it to
// the member's current living faction (or original human/demon side), not a corpse.
export function refreshClanGrant(game,g){
 if(!g.faction||game.world.clans?.[g.faction]?.status==='active')return;
 const id=game.meta.clanMembers?.[g.supporter?.id],next=game.world.clans?.[id];
 delete g.faction;delete g.factionName;delete g.factionColor;
 if(next?.status==='active'){Object.assign(g,{faction:next.id,factionName:next.name,factionColor:next.color,side:next.side});}
 else g.side=game.meta.affiliations?.[g.supporter?.id]?.side||g.side;
}
