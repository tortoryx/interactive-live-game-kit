import {giftBudget,reinforcementCopies} from './gift-strength.mjs';
import {biliGiftRole} from './bili-gift-roster.mjs';
// Game tuning, not a claim about platform prices. The adapter supplies verified
// denomination and catalog value; no audience text can assign a paid tier.
export const GIFT_TIERS=[
 {tier:0,name:'援军',from:0,reward:'rally',hpFloor:210,attackFloor:30},
 {tier:1,name:'精锐',from:100,reward:'pike',hpFloor:700,attackFloor:60},
 {tier:2,name:'老练',from:1000,reward:'muskets',hpFloor:1600,attackFloor:240},
 {tier:3,name:'重装',from:10000,reward:'grenades',hpFloor:3600,attackFloor:500},
 {tier:4,name:'统领',from:50000,reward:'titan',hpFloor:7500,attackFloor:850},
 {tier:5,name:'攻城',from:100000,reward:'cannons',hpFloor:14000,attackFloor:1800},
 {tier:6,name:'战争巨兽',from:500000,reward:'fortress',hpFloor:24000,attackFloor:2400},
 {tier:7,name:'传奇',from:2000000,reward:'fortress',hpFloor:40000,attackFloor:3800},
];
// These are two independent game tier tables, not a currency conversion.
export const XHS_TIER_THRESHOLDS=[0,1,9,99,299,999,3999,9999];
export function giftTier(price=0,coinType='silver',platform='bilibili'){const value=coinType==='gold'?Math.max(0,price):0;return platform==='xiaohongshu'?GIFT_TIERS.findLast(t=>value>=XHS_TIER_THRESHOLDS[t.tier])||GIFT_TIERS[0]:GIFT_TIERS.findLast(t=>value>=t.from)||GIFT_TIERS[0];}
export function giftEntitlement(g,quantity=1){
 const role=biliGiftRole(g);
 if(!role&&['小花花','送你小花'].includes(g.name)&&g.coinType==='gold')return {reward:'revive',multiplier:1,quality:null};
 const t=giftTier(g.price,g.coinType,g.platform),value=g.coinType==='gold'?g.price:0,from=g.platform==='xiaohongshu'?XHS_TIER_THRESHOLDS[t.tier]:t.from;
 const within=t.tier?1+Math.min(.45,Math.log2(Math.max(1,value/from))*.08):1;
 const combo=role?1:1+Math.min(1,Math.log2(Math.max(1,quantity))*.12);
 const eventGift=g.coinType==='gold'&&t.tier>=5?({'bilibili世界':'barracks','次元之城':'barracks','梦幻游乐园':'barracks'})[g.name]:null;
 return {reward:role?.reward||eventGift||t.reward,multiplier:role?reinforcementCopies(value):1,...(role?.bonus&&g.coinType==='gold'?{bonus:role.bonus}:{}),quality:{...(role?{power:giftBudget(role.reward,value)}:{}),tier:t.tier,name:t.name,hpFloor:t.hpFloor*within*combo,attackFloor:t.attackFloor*within*combo,armor:t.tier*8,armorFloor:24+t.tier*20,quantity}};
}
