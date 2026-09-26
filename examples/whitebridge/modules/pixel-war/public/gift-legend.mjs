import {BILI_GIFT_ROSTER,BILI_QUICK_GIFTS,BILI_GIFT_DISPLAY_LIMIT,withinBiliGiftBudget} from './bili-gift-roster.mjs';
// Rotate the supplied current-room gifts without advertising archive-only entries.
export function giftLegend(rows,now=Date.now()){
 const byLabel=new Map();for(const g of rows){let a=byLabel.get(g.label);if(!a)byLabel.set(g.label,a=[]);if(!a.some(x=>x.icon===g.icon&&x.name===g.name))a.push(g);}
 const all=[...byLabel].map(([label,gifts])=>({label,gifts,tier:gifts[0].quality?.tier??(gifts[0].reward==='revive'?-1:0)}));
 const pinned=all.filter(g=>g.tier<=0),rest=all.filter(g=>g.tier>0).sort((a,b)=>a.tier-b.tier),page=Math.floor(now/10000)%Math.max(1,Math.ceil(rest.length/2)),selected=[...pinned,...rest.slice(page*2,page*2+2)];
 return selected.map(g=>({...g,gifts:Array.from({length:Math.min(3,g.gifts.length)},(_,i)=>g.gifts[((g.tier>0?Math.floor(Math.floor(now/10000)/Math.max(1,Math.ceil(rest.length/2))):Math.floor(now/10000))*3+i)%g.gifts.length])}));
}

// One visible gift, one distinct troop; no rotating pages or merged gift rows.
export {BILI_QUICK_GIFTS};
export function quickGiftRows(rows){const names=[...new Set([...BILI_QUICK_GIFTS,...BILI_GIFT_ROSTER.map(g=>g.name)])];return names.flatMap(name=>{const g=rows.find(g=>g.name===name&&withinBiliGiftBudget(g));return g?[g]:[];}).slice(0,BILI_GIFT_DISPLAY_LIMIT);}
export function quickGiftLegend(rows){return quickGiftRows(rows).map(g=>({label:g.quality?.name&&g.label.startsWith(g.quality.name+' · ')?g.label.slice(g.quality.name.length+3):g.label,gifts:[g],tier:g.quality?.tier||0,bonus:g.bonus}));}
