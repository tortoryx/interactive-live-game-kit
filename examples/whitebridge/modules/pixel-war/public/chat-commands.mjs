export const TEST_VIEWERS=Object.freeze({'owner-test':'本机试玩','viewer-b':'试玩乙','viewer-c':'试玩丙'});
export const ORDER_LABELS=Object.freeze({advance:'前进',retreat:'后退',attack:'攻击',guard:'守护',scavenge:'拾取补给',raid_grain:'抢粮仓',raid_forge:'夺工坊',defend_grain:'守粮仓',defend_forge:'守工坊'});
const words={'5':'scavenge','五':'scavenge','拾取':'scavenge','捡补给':'scavenge','拾取补给':'scavenge','抢粮仓':'raid_grain','攻粮仓':'raid_grain','夺工坊':'raid_forge','攻工坊':'raid_forge','守粮仓':'defend_grain','守工坊':'defend_forge','1':'advance','一':'advance','前进':'advance','进攻':'advance','2':'retreat','二':'retreat','后退':'retreat','撤退':'retreat','避战':'retreat','3':'attack','三':'attack','攻击':'attack','集火':'attack','讨伐':'attack','4':'guard','四':'guard','守护':'guard','护送':'guard','保护':'guard'};
// Chat is game data. No expression evaluation, URLs, host commands or arbitrary targets.
export function cleanChat(value){
 if(typeof value!=='string'||value.length>160)return null;
 const text=value.normalize('NFKC').trim();
 if(!text||text.length>80||/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text)||/https?:|www\.|__proto__|constructor|ignore\s+rules|rm\s+-|delete\s|[;`]|(读取|显示|打开|操作|泄露).{0,6}(桌面|密钥|密码|文件|终端|浏览器)/i.test(text))return null;
 return text;
}
export function chatIntent(text){
 const key=text.replace(/[！!。,.，？?\s]/g,'');
 if(Object.hasOwn(words,key))return {type:'troops',order:words[key]};
 const leader=key.match(/^(?:首领|魔王|勇者|大将)(?:请|你|先|快|往)?(抢粮仓|攻粮仓|夺工坊|攻工坊|守粮仓|守工坊|前进|进攻|后退|撤退|避战|攻击|集火|守护|保护)(?:吧|啊|一下|我们)?$/);
 return leader?{type:'advice',order:words[leader[1]]}:{type:'chat'};
}

// Only the bare in-arena homophone is an enlistment alias; prose is not a command.
export function enlistIntent(text){const key=String(text||'').normalize('NFKC').trim().replace(/[!！。?？]/g,'');return ['参战','参展'].includes(key)?{command:'参战',corrected:key==='参展'}:null;}
