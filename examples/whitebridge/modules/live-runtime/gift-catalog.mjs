import {biliGiftRole} from '../pixel-war/public/bili-gift-roster.mjs';
import catalog from '../pixel-war/public/platform-gifts.json' with {type:'json'};
import {giftEntitlement,GIFT_TIERS} from '../pixel-war/public/gift-tiers.mjs';
export const PLATFORM_GIFTS=catalog;
const byId=new Map([...catalog.bilibili,...catalog.xiaohongshu].map(g=>[g.id,g]));
export function catalogGift(platform,id){return byId.get(platform+':'+id);}
export function resolveGiftMapping(game,e){
 const gift=catalogGift(e.platform,e.giftId),configured=game.meta.mappings?.[e.platform+':'+e.giftId];
 // An old XHS room catalogue is not evidence of today's room or price.
 if(e.platform==='xiaohongshu')return configured?{...configured,quality:testRewardQuality(configured.reward,e.quantity)}:null;
 if(!gift)return configured||null;
 const verifiedPrice=e.paid===true&&Number.isSafeInteger(e.amountMilli)&&e.amountMilli>0&&Number.isInteger(e.quantity)&&e.quantity>0?e.amountMilli/e.quantity:null;
 const entitlement=giftEntitlement(verifiedPrice!==null?{...gift,price:verifiedPrice}:gift,e.quantity);
 // A verified free/bag gift must never inherit the paid value of its icon.
 if(e.paid===false&&gift.coinType==='gold')return biliGiftRole(gift)?giftEntitlement({...gift,coinType:'silver'},e.quantity):configured?{...configured,quality:null}:giftEntitlement({...gift,coinType:'silver'},e.quantity);
 // The published twelve-gift roster supersedes old tier-only owner mappings.
 return biliGiftRole(gift)?entitlement:configured?{...entitlement,...configured}:entitlement;
}
export function testRewardQuality(key,quantity){const tier=GIFT_TIERS.find(t=>t.reward===key);return tier?giftEntitlement({name:'test',price:tier.from,coinType:tier.tier?'gold':'silver'},quantity).quality:null;}
