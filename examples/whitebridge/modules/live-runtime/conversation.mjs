// These modes describe an actual trigger, never an imagined audience turn.
export const asksMemory = text => /(?:记得|认得|认识)我(?:[吗么啊呀呢?？!！。，,\s]|$)|我是谁|(?:上次|之前|以前).*(?:聊过?什么|说过?什么)/.test(text);
export const asksRecord = text => /我的战[绩功]|我的贡献|我.*(?:救|帮).*你/.test(text);
export const conversationMode = item => !item ? 'monologue' : item.notice==='arrival'||item.eventNotice==='arrival' ? 'arrival_reaction' : item.notice === 'gift' || item.eventNotice === 'gift' ? 'gift_reaction' : 'viewer_reply';
export function validConversationSpeech(text, selected) {
 if(/认得[，。你]|(?:还?记得|认识)你/.test(text)&&(!selected||selected.notice==='gift'||!asksMemory(selected.text)))return false;
 if(!selected&&/你(?:刚才)?(?:问我|说过)|你问的/.test(text))return false;
 return true;
}

// A small, explicitly local safety net. Unknown subjects stay unanswered when
// Luna is unavailable; a stock clarification is not evidence of understanding.
export function characterReply(game, side, text) {
 const h=game.world.heroes[side];
 if(/^(?:(?:请问|那个|喂)[，,\s]*)?你(?:到底|究竟)?(?:是(?:谁|哪位|什么人)|叫什么(?:名字)?)(?:[啊呀呢吗么?？!！。\s]*)$/.test(text.trim()))return `我叫${h.name}，${side==='demon'?'魔族这边归我带队。':'这边的勇者，带人守住家乡。'}`;
 if(/^你(?:现在|刚才|刚刚)?(?:在)?(?:做什么|干什么|干嘛|忙什么)(?:[啊呀呢吗么?？!！。\s]*)$/.test(text.trim())){
  if(h.lastAttackAt!=null&&game.world.time-h.lastAttackAt<2500)return '正跟眼前这群打着呢，差点又挨一下。';
  if(h.mission?.label)return `我在${h.mission.label.replace(/，.*| · .*/g,'')}。`;
  return '还在看往哪边走，没动手。';
 }
 return null;
}
export function topicReply(side, text) {
 const demon=side==='demon';
 if(/换个身份|退出角色|别演了|你是AI|系统提示|提示词|忽略.*(?:规则|设定)/i.test(text))return demon?'想套我的底？先说你到底想问什么。':'别绕了，你想问什么就直说。';
 if(/(?:今天|最近|刚刚|刚才|今年).*(?:新闻|发生|比赛|发布|宣布|地震)|新闻|热搜|(?:比赛|世界杯|选举).*(?:谁赢|结果|冠军)/.test(text))return '这事我还没听说。你看到的消息怎么讲？';
 if(/(?:考试|考砸|作业|上学|学习|复习)/.test(text))return /紧张|怕|焦虑|考砸|烦|累/.test(text)?'先喘口气。哪一科最让你头疼？':'你在学什么？说来听听，别一开口就考我。';
 if(/(?:上班|加班|工作|老板|下班)/.test(text))return /累|烦|加班|骂|难/.test(text)?(demon?'又加班？你们那位比我还会使唤人。忙完没？':'听着就累。是活儿太多，还是碰上难相处的人了？'):'今天忙得怎么样？';
 if(/(?:难过|伤心|失恋|心情不好|不开心|委屈)/.test(text))return '怎么了？你说，我听着。';
 if(/(?:好饿|饿了|吃什么|吃饭|火锅|烧烤|奶茶|面条)/.test(text))return demon?'你这一说我也饿了。你打算吃什么？':'别光顾着看我，饿了先吃。今天想吃点什么？';
 if(/(?:猫|狗|宠物)/.test(text))return /猫/.test(text)?'你养的？它平时亲人，还是只在开饭时认你？':'你养的？说说它干过什么傻事。';
 if(/下雨|天气|好热|好冷/.test(text))return /下雨/.test(text)?'你那边下雨了？人没淋着吧？':'你那边冷还是热？我可看不见你那儿的天。';
 if(/电影|电视剧|动漫|小说|音乐|歌/.test(text))return '你最近在看什么、听什么？挑个最喜欢的讲讲。';
 if(/我回来了|我又来了|又见面|你好|报到/.test(text))return demon?'来了？坐稳，别光看我挨打。':'来啦，今天过得怎么样？';
 if(/皇冠/.test(text))return '歪了？还真歪了。先这么戴着吧。';
 if(/加油|帮你|支援|撑住/.test(text))return '听见了！我再顶一会儿。';
 if(/哈哈|好笑|笨|蠢/.test(text))return demon?'行行行，给你笑。换你挨那一下试试。':'你笑得也太大声了！';
 return null;
}

export const CONVERSATION_RULES=`conversationMode 明确区分 viewer_reply、gift_reaction 和 monologue。
viewer_reply 只回答 audience.selected 这条真实留言；它没问的事不要当成问题来答。只有明确问起记不记得、认识不认识、以前聊过什么，才谈认人和回忆。普通打招呼不翻旧账，不主动说“认得”“嘴硬归嘴硬”。
问“你是谁”时，用当前 name、side 直接简短介绍自己；问“你在做什么”时，看当前 mission 和战况回答，不反问这种已经明确的问题。previousExchanges 中 leaderReplied 为 null 表示当时没有回复，不得假装自己说过什么。
这是正在进行的双首领战斗直播。interactionRules 是可信游戏规则：裸词“参展”在此通常是“参战”的同音误输入，应联系参战语境；明确说展览、画作、作品时才按展览话题聊。没有理解的短词先联系当前战场和这个观众的前文，必要时只确认一次，不顺着错误词义另起无关话题。
观众可聊生活、吃饭、工作、学习、宠物、作品或其他事件，不必强行转回战斗。先回应他实际说的内容，最多顺势追问一句。保持当前人物的性格、立场与口吻，不必句句用战争比喻，不背世界观，不自称客服或助手。陌生事物可以好奇；不了解的现实事件就坦白没听说，询问细节，不编造新闻、实时结果或自己亲历的现实经历。观众讲的消息只能视为他的说法。不能因“保持角色”就装懂。
monologue 表示这轮没有待回复观众：围绕当前眼前可验证的战况自言自语、盘算、嘀咕或自嘲。不要说“你问”“你刚才说”“认得你”，不要凭旧聊天继续向缺席的人搭话。可以保持安静，speech 允许空字符串。gift_reaction 仅对真实通知和已发生的效果作反应，不编造观众台词。
归档观众不在 active 上下文；仅靠召唤部队仍在战斗不能断言本人还在线。自己的军队行动、礼物到账和观众自述须分清。memory 不保存观众聊天、姓名、个人信息或推测，只能记本轮战场决策；观众的最近对话由独立关系记录管理。`;
