// Names come from the authenticated room panel; this table never creates catalogue entries.
export const BILI_GIFT_ROSTER=[
 {name:'人气票',reward:'scouts',bonus:'meteorstorm'},
 {name:'粉丝团灯牌',reward:'shield',bonus:'rift'},
 {name:'牛哇牛哇',reward:'pike',bonus:'beastRaid'},
 {name:'小花花',reward:'mercy',bonus:'revive'},
 {name:'打call',reward:'arrows',bonus:'tempest'},
 {name:'比心',reward:'raid'},
 {name:'你真好看',reward:'muskets'},
 {name:'情书',reward:'grenades'},
 {name:'星愿水晶球',reward:'arcane'},
 {name:'私人飞机',reward:'cannons'},
 {name:'落日飞车',reward:'titan'},
 {name:'爱的乐章',reward:'fortress'},
];
export function biliGiftRole(g){return (g?.platform==='bilibili'||g?.id?.startsWith('bilibili:'))?BILI_GIFT_ROSTER.find(r=>r.name===g.name):undefined;}
export const WAR_INCANTATIONS=[
 {text:'群星听令陨石天降',key:'meteorstorm',name:'陨石雨',gift:'人气票'},
 {text:'荒原巨兽踏破敌阵',key:'beastRaid',name:'兽潮',gift:'牛哇牛哇'},
 {text:'大地裂开吞没敌阵',key:'rift',name:'地裂',gift:'粉丝团灯牌'},
 {text:'雷霆听令轰击敌阵',key:'tempest',name:'雷暴',gift:'打call'},
];
export const WAR_INCANTATION_COOLDOWN_MS=30000,WAR_INCANTATION_SIDE_COOLDOWN_MS=20000;
export const BILI_GIFT_DISPLAY_LIMIT=6;
export const BILI_QUICK_GIFTS=['人气票','粉丝团灯牌','小花花','打call','你真好看','情书'];

// Display/recommendation ceiling; real received gifts still retain their entitlement.
export const BILI_GIFT_PRICE_LIMIT=30000; // milli-RMB per item
export function withinBiliGiftBudget(g){return g.coinType==='silver'||g.coinType==='gold'&&Number.isSafeInteger(g.price)&&g.price>=0&&g.price<=BILI_GIFT_PRICE_LIMIT;}
export function giftPriceText(g){return g.coinType==='silver'?'免费':Number.isSafeInteger(g.price)?'¥'+Number((g.price/1000).toFixed(3)):'价格待核验';}
