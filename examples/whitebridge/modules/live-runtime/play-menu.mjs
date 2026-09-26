import {biliGiftRole,WAR_INCANTATIONS,withinBiliGiftBudget,BILI_GIFT_PRICE_LIMIT} from '../pixel-war/public/bili-gift-roster.mjs';
import {broadcastMode} from './broadcast-mode.mjs';
import {currentRoomGifts} from './room-gifts.mjs';
import {giftEntitlement} from '../pixel-war/public/gift-tiers.mjs';
import {legacyAvailability} from '../pixel-war/public/legacy-catalog.mjs';
import {GIFTS} from '../pixel-war/public/gifts.mjs';
import {UNITS} from '../pixel-war/public/catalog.mjs';
import {catalogGift} from './gift-catalog.mjs';
function rows(game,side,gifts){const platform=side==='human'&&broadcastMode(game)!=='bilibili-first'?'xiaohongshu':'bilibili',legacy=legacyAvailability(game.world,side),out=new Map();
 const label=(m)=>{const g=GIFTS[m.reward];return ['barracks','war_event'].includes(g.effect)?g.name+' · '+g.description.split(' · ')[0]:g.effect==='revive'?'补充救援点 · 60秒内阵亡':g.dynamic?(legacy?legacy.count*m.multiplier+' × '+legacy.name:'本代援军'):g.unit?(m.quality?.tier?m.quality.name+' · ':'')+g.count*m.multiplier+' × '+UNITS[g.unit].name+(m.multiplier>1?' · 分批':''):'首领护盾';};
 for(const g of gifts){const m=biliGiftRole(g)?giftEntitlement(g):{...giftEntitlement(g),...game.meta.mappings[g.id]};out.set(g.id,{...g,...m,label:label(m)});}
 return [...out.values()].map(g=>{const known=catalogGift(platform,g.giftId),base=known?{...giftEntitlement(known),...game.meta.mappings[g.id]}:null;return {...g,eventEligible:!!GIFTS[g.reward]?.unit&&(g.quality?.tier??99)<=1&&!!GIFTS[base?.reward]?.unit&&(base?.quality?.tier??99)<=1};});
}
export function playMenu(game,side,connections={}){
 const platform=side==='human'&&broadcastMode(game)!=='bilibili-first'?'xiaohongshu':'bilibili',connected=platform==='bilibili'&&connections.bilibili?.state==='authenticated',panel=currentRoomGifts(connections,platform,game.now()),all=panel?rows(game,side,platform==='bilibili'?panel.gifts.filter(withinBiliGiftBudget):panel.gifts):[],liveEnabled=connected&&game.meta.liveEnabled;
 return {clans:Object.values(game.world.clans||{}).filter(c=>c.status==='active').map(c=>({name:c.name,color:c.color,number:c.number,founder:c.founder.name})),mode:broadcastMode(game),platform,name:side==='human'?(broadcastMode(game)==='bilibili-first'?'B站 · 人族':'小红书 · 勇者'):'B站 · 魔族',connected,liveEnabled,legacy:legacyAvailability(game.world,side),catalogCount:all.length,giftPriceLimitMilli:platform==='bilibili'?BILI_GIFT_PRICE_LIMIT:null,catalogScope:panel?'current_room_panel':'room_unverified',roomId:panel?.roomId||null,verifiedAt:panel?.verifiedAt||null,previewGifts:all,gifts:liveEnabled?all:[],
 commands:['发送弹幕，操控你自己的部队','1 前进 · 2 后退 · 3 攻击 · 4 守护 · 5 捡补给'],
 eventCommands:panel?WAR_INCANTATIONS:[],
 pinned:platform==='bilibili'?'醒目留言：按平台时间置顶':'付费置顶尚未接通',
 status:panel?'当前房间礼物面板已核验，特殊权益以平台面板为准':platform==='bilibili'?'当前房间礼物尚未核验':'小红书当前房间礼物尚未核验'};
}
