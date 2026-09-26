export const ACTIONS={
  slash:{duration:760,contact:310,clip:'slash',frames:6,projectile:null},
  thrust:{duration:840,contact:350,clip:'thrust',frames:8,projectile:null},
  shoot:{duration:1040,contact:470,clip:'shoot',frames:13,projectile:'bolt'},
  cast:{duration:1100,contact:500,clip:'thrust',frames:8,projectile:'orb'},
  crush:{duration:1400,contact:730,clip:'slash',frames:6,projectile:null},
};
export const UNITS={
  levy:{name:'杂兵',hp:70,armor:0,attack:5,interval:1.25,speed:95,range:35,pop:1,cost:1,scale:.7,action:'slash',crit:0,equipment:{weapon:'sword',armor:'leather',head:'hair',offhand:null}},
  scout:{name:'疾风斥候',hp:155,armor:4,attack:26,interval:.62,speed:180,range:38,pop:1,cost:2,action:'slash',crit:.28,scale:.72,equipment:{weapon:'dagger',armor:'leather',head:'hood',offhand:null}},
  shortbow:{name:'轻装短弓',hp:185,armor:4,attack:36,interval:1.05,speed:126,range:220,minRange:65,pop:1,cost:2,action:'shoot',crit:.16,scale:.82,equipment:{weapon:'shortbow',armor:'leather',head:'hair',offhand:null}},
  crossbow:{name:'重弩手',hp:340,armor:28,attack:145,interval:3.1,speed:70,range:330,minRange:90,armorPen:.5,pop:3,cost:6,action:'shoot',crit:.14,equipment:{weapon:'crossbow',armor:'mail',head:'helmet',offhand:null}},
  musketeer:{name:'燧发火枪手',hp:240,armor:10,attack:155,interval:2.9,speed:83,range:365,minRange:100,armorPen:.4,projectileKind:'bullet',projectileSpeed:820,pop:3,cost:6,action:'shoot',crit:.25,equipment:{weapon:'musket',armor:'mail',head:'helmet',offhand:null}},
  repeater:{name:'连发枪手',hp:205,armor:8,attack:27,interval:1.8,speed:99,range:285,minRange:75,shots:3,projectileKind:'bullet',projectileSpeed:750,pop:3,cost:6,action:'shoot',crit:.12,scale:.9,equipment:{weapon:'repeater',armor:'leather',head:'hood',offhand:null}},
  blunderbuss:{name:'散弹突击手',hp:360,armor:18,attack:25,interval:2.5,speed:110,range:170,shots:5,scatter:90,projectileKind:'pellet',projectileSpeed:670,pop:3,cost:6,action:'shoot',crit:.1,equipment:{weapon:'blunderbuss',armor:'leather',head:'helmet',offhand:null}},
  grenadier:{name:'掷弹兵',hp:320,armor:15,attack:170,interval:3.5,speed:87,range:250,minRange:120,splash:115,explosive:true,projectileKind:'grenade',projectileSpeed:310,pop:4,cost:8,action:'cast',crit:.12,equipment:{weapon:'grenade',armor:'mail',head:'hood',offhand:null}},
  cannon:{name:'野战重炮',hp:1550,armor:42,attack:265,interval:4.6,speed:38,range:510,minRange:160,splash:155,explosive:true,projectileKind:'shell',projectileSpeed:370,machine:true,scale:1.55,pop:10,cost:20,action:'cast',crit:.1,equipment:{weapon:'cannon',armor:'plate',head:'helmet',offhand:null}},
  dreadnought:{name:'堡垒攻城机',hp:5400,armor:58,attack:235,interval:5.1,speed:29,range:450,minRange:130,splash:180,shots:2,explosive:true,projectileKind:'shell',projectileSpeed:330,machine:true,scale:3.2,pop:18,cost:36,action:'cast',crit:.08,equipment:{weapon:'siegebattery',armor:'plate',head:'helmet',offhand:null}},
  berserker:{name:'狂战士',hp:420,armor:8,attack:85,interval:1.2,speed:112,range:62,pop:3,cost:6,action:'crush',crit:.3,splash:55,scale:1.1,equipment:{weapon:'mace',armor:'leather',head:'hair',offhand:null}},
  sentinel:{name:'禁卫枪盾',hp:960,armor:55,attack:38,interval:1.6,speed:65,range:98,pop:3,cost:6,action:'thrust',crit:.05,equipment:{weapon:'spear',armor:'plate',head:'helmet',offhand:'shield'}},
  ranger:{name:'破甲长弓',hp:260,armor:16,attack:125,interval:2.8,speed:82,range:390,minRange:145,pop:3,cost:6,action:'shoot',crit:.25,equipment:{weapon:'bow',armor:'mail',head:'helmet',offhand:null}},
  colossus:{name:'战锤巨人',hp:2600,armor:32,attack:200,interval:3.4,speed:55,range:120,pop:8,cost:16,action:'crush',crit:.08,splash:140,scale:3.1,equipment:{weapon:'mace',armor:'plate',head:'helmet',offhand:null}},
  militia:{name:'剑士',hp:210,armor:12,attack:30,interval:1.05,speed:98,range:43,pop:1,cost:2,action:'slash',crit:.12,equipment:{weapon:'sword',armor:'leather',head:'hair',offhand:null}},
  shield:{name:'重盾卫',hp:720,armor:52,attack:25,interval:1.4,speed:69,range:44,pop:2,cost:4,action:'slash',crit:.06,equipment:{weapon:'sword',armor:'plate',head:'helmet',offhand:'shield'}},
  pike:{name:'长枪兵',hp:390,armor:22,attack:48,interval:1.28,speed:87,range:88,pop:2,cost:4,action:'thrust',crit:.1,equipment:{weapon:'spear',armor:'mail',head:'helmet',offhand:null}},
  bow:{name:'游弓手',hp:235,armor:8,attack:60,interval:1.65,speed:91,range:290,minRange:105,pop:2,cost:4,action:'shoot',crit:.17,equipment:{weapon:'bow',armor:'leather',head:'hood',offhand:null}},
  rider:{name:'游击剑士',hp:470,armor:24,attack:53,interval:1.15,speed:141,range:49,pop:3,cost:6,action:'slash',crit:.22,equipment:{weapon:'sword',armor:'mail',head:'hair',offhand:null}},
  mage:{name:'战法师',hp:280,armor:5,attack:90,interval:1.9,speed:85,range:245,minRange:90,pop:3,cost:6,action:'cast',crit:.12,splash:65,equipment:{weapon:'staff',armor:'robe',head:'hood',offhand:null}},
  healer:{name:'祈愿师',hp:300,armor:10,attack:16,interval:1.8,speed:87,range:195,minRange:115,pop:2,cost:4,action:'cast',crit:0,equipment:{weapon:'staff',armor:'robe',head:'hood',offhand:null}},
  siege:{name:'重装破阵兵',hp:850,armor:40,attack:150,interval:2.9,speed:62,range:80,pop:5,cost:10,action:'crush',crit:.1,splash:82,equipment:{weapon:'mace',armor:'plate',head:'helmet',offhand:null}},
};
export const POP_CAP=160,BUDGET=80,CRIT_MULTIPLIER=1.75;
export const HERO_WEAPONS={sword:{actionType:'slash',range:70,attack:165,interval:1.2},spear:{actionType:'thrust',range:110,attack:145,interval:1.45},bow:{actionType:'shoot',range:275,attack:115,interval:1.7},staff:{actionType:'cast',range:275,attack:110,interval:1.65},mace:{actionType:'crush',range:80,attack:230,interval:2.6}};
export const DEFAULT_HERO={hp:9000,armor:28,attack:110,interval:1.65,speed:114,range:275,crit:.18,action:'cast',actionType:'cast',equipment:{weapon:'staff',armor:'plate',head:'hair',offhand:null}};
export function rawDamage(source,target,critical=false){let value=source.attack*(source.supportAttack||1)*(source.empowered?1.25:1)*(source.ammoUntil>source.battleTime?1.2:1)*(critical?CRIT_MULTIPLIER:1)*100/(100+target.armor*(1-(source.armorPen??(source.kind==='ranger'?.35:0))));if(source.kind==='pike'&&target.kind==='rider')value*=1.5;if(target.equipment.offhand==='shield'&&source.projectile){const incoming=Math.atan2(source.y-target.y,source.x-target.x),delta=Math.atan2(Math.sin(incoming-target.face),Math.cos(incoming-target.face));if(Math.abs(delta)<Math.PI*.4)value*=.55;}return value;}
