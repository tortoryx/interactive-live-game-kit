import {FACTIONS} from './battle-theme.mjs';
let clans=new Map();
export function registerFactions(rows=[]){clans=new Map(rows.map(c=>[c.id,c]));}
export const factionName=side=>side==='human'?'人族':side==='demon'?'魔族':clans.get(side)?.name||'中立';
export const factionColor=side=>FACTIONS[side]?.ink||clans.get(side)?.color||'#d1bb89';
