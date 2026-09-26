import {WAR_INCANTATIONS,WAR_INCANTATION_COOLDOWN_MS,WAR_INCANTATION_SIDE_COOLDOWN_MS} from '../pixel-war/public/bili-gift-roster.mjs';
export const EVENT_COMMANDS=Object.fromEntries(WAR_INCANTATIONS.map(x=>[x.text,x.key]));
export const EVENT_CHOICE_COOLDOWN=WAR_INCANTATION_COOLDOWN_MS,EVENT_SIDE_COOLDOWN=WAR_INCANTATION_SIDE_COOLDOWN_MS;
// Exact public incantations are game commands. Ordinary mentions remain conversations.
export function chooseWarEvent(game,e){
 const key=EVENT_COMMANDS[e.text?.trim()];if(!key)return null;
 const now=game.now(),id='incantation:'+e.supporter.id,side='incantation-side:'+(e.faction||e.side);
 game.meta.incantationClocks=Object.fromEntries(Object.entries(game.meta.incantationClocks||{}).filter(([,at])=>now-at<EVENT_CHOICE_COOLDOWN).slice(-2000));
 const clocks=game.meta.incantationClocks,remaining=Math.max(0,EVENT_CHOICE_COOLDOWN-now+(clocks[id]??-Infinity),EVENT_SIDE_COOLDOWN-now+(clocks[side]??-Infinity));
 if(remaining)return {status:'event_cooldown',key,remainingMs:remaining,message:'咒语冷却中 · '+Math.ceil(remaining/1000)+'秒'};
 if(game.meta.queue.filter(g=>g.freeIncantation&&g.remaining>0).length>=2)return {status:'event_cooldown',key,message:'咒语已排队，等待当前事件结束'};
 game.reward(e,key,1);game.meta.queue.at(-1).freeIncantation=true;game.meta.queue.at(-1).points=0;
 clocks[id]=now;clocks[side]=now;
 return {status:'event_queued',key,message:'咒语已生效，事件等待入场'};
}
