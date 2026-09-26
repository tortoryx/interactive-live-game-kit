import {teamOf} from './public/allegiance.mjs';
import {isViewerTroop} from './viewer-training.mjs';
// null is serializable and means no round limit, including pre-update saves.
export const TROOP_BATTLES=null,REVIVE_WINDOW=60000;
export function leaderDeaths(w){return w.leaderDeaths??Object.values(w.ranks||{}).reduce((n,r)=>n+r,0);}
export function unlimitedService(w,u){u.service={joinedAtDeath:u.service?.joinedAtDeath??leaderDeaths(w),expiresAtDeath:null};return u.service;}
export function enrollTroop(w,u){if(isViewerTroop(u))unlimitedService(w,u);}
// Kept for old callers and saved grants. Commander deaths never expire troops.
export function serviceExpired(){return false;}
export function eligibleFallen(w,ownerId,side,faction=null){return (w.fallenTroops||[]).filter(u=>u.ownerId===ownerId&&teamOf(u)===(faction||side)&&(!u.faction||w.clans?.[u.faction]?.status==='active')&&!u.reservedBy&&w.time-u.at>=0&&w.time-u.at<=REVIVE_WINDOW);}
export function retireTroops(w){
 for(const u of w.units)enrollTroop(w,u);
 w.fallenTroops=(w.fallenTroops||[]).filter(u=>u.reservedBy||w.time-u.at<=REVIVE_WINDOW);
 return 0;
}
