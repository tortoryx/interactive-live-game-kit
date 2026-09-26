// side selects the existing human/demon art. faction is authoritative allegiance.
export const teamOf=u=>typeof u==='string'?u:u?.faction||u?.side;
export const allied=(a,b)=>!!teamOf(a)&&teamOf(a)===teamOf(b);
export const hostile=(a,b)=>!!a&&!!b&&(!(a.id&&b.id)||a.id!==b.id)&&!allied(a,b);
export const isBoss=u=>u?.kind==='hero'||u?.commander===true;
export function factionLeader(w,u){const team=teamOf(u);return team?.startsWith('clan-')?w.units.find(v=>v.commander&&v.faction===team&&v.hp>0)||null:w.heroes[team];}
export function nearestOpponent(w,u,{boss=false,alive=w.allAlive()}={}){let best=null,nearest=Infinity;for(const v of alive){if(!hostile(u,v)||boss&&!isBoss(v))continue;const d=(v.x-u.x)**2+(v.y-u.y)**2;if(d<nearest){best=v;nearest=d;}}return best;}
export const factionFields=g=>g?.faction?{faction:g.faction,factionName:g.factionName,factionColor:g.factionColor}:{};
