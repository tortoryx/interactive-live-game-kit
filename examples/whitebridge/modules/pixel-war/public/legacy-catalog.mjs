// Authored mechanics, combinable retinues. Rank selects a new deployment, never an unbounded stat multiplier.
export const LEGACIES=[
 {key:'ember',name:'燃油掷弹队',unit:'grenadier',count:2,skill:'燃烧弹',effect:'爆炸后灼烧敌军，并点燃附近树木',counter:'分散站位；绕开燃烧区',color:'#ffb377',demo:'flame'},
 {key:'frost',name:'霜矢猎团',unit:'ranger',count:3,skill:'霜冻箭',effect:'命中使敌军减速，拖住冲锋部队',counter:'用远程火力压制，避免近战追击',color:'#a8e1e8',demo:'frost'},
 {key:'storm',name:'雷鸣术士',unit:'mage',count:2,skill:'连锁雷爆',effect:'击中一人，雷爆波及附近两名敌人',counter:'分散队形，避免聚团',color:'#c4c4ff',demo:'storm'},
 {key:'depot',name:'军械工兵',unit:'musketeer',count:3,skill:'修筑补给站',effect:'就近建立补给站，为守军恢复护盾；敌军可以拆毁',counter:'集中攻破补给站，切断补给',color:'#aee0b0',demo:'depot'},
 {key:'medic',name:'战地救护团',unit:'healer',count:2,skill:'群体急救',effect:'定时治疗附近受伤战友；首领治疗仍有总上限',counter:'优先压制救护团',color:'#c5e6b2',demo:'medic'},
 {key:'quake',name:'震地巨卫',unit:'colossus',count:1,skill:'震地重锤',effect:'重击震晕周围小兵，留下真实破坏地块',counter:'保持距离，攻击其缓慢转移的间隙',color:'#e5c094',demo:'quake'},
 {key:'battery',name:'三联攻城机',unit:'dreadnought',count:1,skill:'三联炮击',effect:'三发炮弹覆盖阵地；射速更慢，近身难以开火',counter:'快速部队绕后，进入火炮最小射程',color:'#e4ba80',demo:'battery'},
 {key:'dash',name:'影袭斥候',unit:'scout',count:5,skill:'疾行突袭',effect:'接敌前加速，穿透部分护甲；身板脆弱',counter:'枪盾前排拦截，范围攻击清场',color:'#d6b8e8',demo:'dash'},
];
export const DOCTRINES=[
 {key:'line',name:'阵线',detail:'标准编队，长辈亲自带队'},
 {key:'mobile',name:'机动',detail:'移速 +18%，生命 -12%，适合转场'},
 {key:'armored',name:'重装',detail:'护甲 +16，移速 -16%，适合守点'},
 {key:'veteran',name:'老兵',detail:'随行部队为 LV10，数量受控，不能无限升级'},
];
export function legacyPackage(side,rank){if(!Number.isSafeInteger(rank)||rank<1||!['demon','human'].includes(side))return null;const index=(rank-1)%LEGACIES.length,cycle=Math.floor((rank-1)/LEGACIES.length),base=LEGACIES[index],doctrine=DOCTRINES[cycle%DOCTRINES.length];return {...base,id:side+':legacy:'+rank,side,rank,doctrine:doctrine.key,doctrineName:doctrine.name,doctrineDetail:doctrine.detail,name:(doctrine.key==='line'?'':doctrine.name+'·')+base.name,level:doctrine.key==='veteran'?10:1,count:base.count,chapter:cycle+1};}
export function legacyAvailability(w,side){const rank=w.ranks?.[side]||0;return legacyPackage(side,rank);}
