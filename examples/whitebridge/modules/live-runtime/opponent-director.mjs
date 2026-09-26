import {UNITS} from '../pixel-war/public/catalog.mjs';
const kinds=['militia','shield','bow','pike','ranger','berserker'];
export function planOpponent(state,input){
 const fresh={generation:null,nextAt:0,serial:0},s={...fresh,...state},out=(reason,target=0,deployments=[])=>({state:s,reason,target,deployments});
 if(!input||!['dual-platform','bilibili-first'].includes(input.mode)||!['now','participants','realPower','alliedHumanPower','botPower','availablePopulation'].every(k=>Number.isFinite(input[k])&&input[k]>=0)||typeof input.generation!=='string')return {...out('invalid_input'),state:state?{...state}:fresh};
 if(input.mode==='dual-platform')return {state:fresh,reason:'dual_platform',target:0,deployments:[]};
 if(!Number.isFinite(s.nextAt)||!Number.isSafeInteger(s.serial)||s.serial<0)Object.assign(s,fresh);
 const target=Math.min(80,Math.max(8,Math.floor(input.realPower*.55+Math.min(12,Math.sqrt(input.participants)*2))));
 if(input.paused||!input.engaged||!['live','test_live'].includes(input.phase)||!(input.participants||input.realPower))return out('inactive');
 if(s.generation!==input.generation){s.generation=input.generation;s.nextAt=input.now+5000;return out('arrival_grace',target);}
 if(input.now<s.nextAt)return out('cooldown',target);
 s.nextAt=input.now+10000;
 let deficit=target-input.alliedHumanPower-input.botPower,pop=Math.floor(input.availablePopulation);const deployments=[];
 for(let i=0;i<kinds.length&&deployments.length<3;i++){
  const kind=kinds[(s.serial+i)%kinds.length],u=UNITS[kind];
  if(u.cost>deficit||u.pop>pop)continue;
  deployments.push({kind,lane:(s.serial+deployments.length)%3});deficit-=u.cost;pop-=u.pop;
 }
 s.serial+=deployments.length;
 return out(deployments.length?'reinforcements':'filled',target,deployments);
}
