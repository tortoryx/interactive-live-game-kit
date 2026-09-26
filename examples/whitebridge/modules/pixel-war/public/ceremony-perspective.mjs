import {battleScene} from './cinematic.mjs';
export function ceremonyPerspective(state,side){
 const s=battleScene(state);if(!s)return null;
 const lost=s.dead.includes(side),arriving=['arrival','demonstration','resume'].includes(s.phase),ownArrival=arriving&&lost;
 return {lost,won:s.winner===side,ownArrival,showAwards:s.winner===side&&!lost,tone:ownArrival?'hope':lost?'defeat':arriving||s.winner!==side?'threat':'victory',focus:lost&&!arriving?(s.fallen.find(u=>u.side===side)||state.heroes[side]):arriving?state.heroes[s.dead.includes(side)?side:s.dead[0]]:s.victor||state.heroes[side]};
}
export function perspectiveHonors(scene,side){
 if(scene?.winner!==side||scene.dead.includes(side))return [];
 if(scene.honors?.boards?.[side])return scene.honors.boards[side].slice(0,50);
 return (scene.honors?.board||scene.honors?.leaders||[]).filter(a=>a.side===side||a.sides?.[side]>0).map(a=>({...a,side,score:a.sides?.[side]??a.score})).sort((a,b)=>b.score-a.score).slice(0,50);
}
