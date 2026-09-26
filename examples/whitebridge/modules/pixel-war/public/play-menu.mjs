import {priceStrength} from './gift-strength.mjs';
import {WAR_INCANTATIONS,WAR_INCANTATION_COOLDOWN_MS,giftPriceText} from './bili-gift-roster.mjs';
import {giftLegend,quickGiftLegend} from './gift-legend.mjs';
// The guide is visible in standby; only the server's live switch enables redemption.
export function menuContent(data){return {gifts:data.liveEnabled?(data.gifts||[]):(data.previewGifts||[]),spells:data.eventCommands?.length?data.eventCommands:data.liveEnabled?WAR_INCANTATIONS:[]};}
export function renderPlayMenu(el,data,{operator=false}={}){
 el.replaceChildren();
 const free=document.createElement('p');free.className='menuTitle freeRecruit';free.textContent='发「参战」· 免费';const freeDetail=document.createElement('span');freeDetail.className='menuAside';freeDetail.textContent='每条 1 名剑士 · 无冷却';free.append(freeDetail);el.append(free);
 if(data.mode==='bilibili-first'){
  const faction=document.createElement('div');faction.className='menuSection factionHelp';
  const title=document.createElement('p');title.className='menuTitle';title.textContent='选阵营';const optional=document.createElement('span');optional.className='menuAside';optional.textContent='可选';title.append(optional);
  const words=document.createElement('p');words.className='menuDetail';words.textContent='发「加入人族」/「加入魔族」';const create=document.createElement('p');create.className='menuDetail';create.textContent='发「自立门户」· 头像将军只有一命';const join=document.createElement('p');join.className='menuDetail';join.textContent='加入门户：发「加入×族」';faction.append(title,words,create,join);
  const clans=data.clans||[];if(clans.length){const roster=document.createElement('p');roster.className='menuDetail clanRoster';const page=Math.floor(Date.now()/7000)%Math.ceil(clans.length/2);for(const clan of clans.slice(page*2,page*2+2)){const item=document.createElement('span');item.style.color=clan.color;item.textContent='加入'+clan.name+(clans.filter(c=>c.name===clan.name).length>1||['人族','魔族'].includes(clan.name)?'#'+clan.number:'')+' · '+Array.from(clan.founder).slice(0,5).join('')+'  ';roster.append(item);}faction.append(roster);}el.append(faction);
 }
 const orders=document.createElement('div');orders.className='menuSection';
 const prompt=document.createElement('p');prompt.className='menuTitle commandPrompt';prompt.textContent='弹幕指挥你的部队';
 const commands=document.createElement('p');commands.className='commandLegend menuDetail';commands.textContent='1 前进 · 2 后退 · 3 攻击 · 4 守护 · 5 补给';const rescue=document.createElement('p');rescue.className='menuDetail rescueHelp';rescue.textContent='发「复活」查救援进度';orders.append(prompt,commands,rescue);el.append(orders);
 const content=menuContent(data),rows=operator&&!data.liveEnabled?(data.previewGifts||[]):content.gifts;
 const gifts=document.createElement('div');gifts.className='giftHelp'+(data.platform==='bilibili'?' sixGifts':'');
 for(const group of (data.platform==='bilibili'?quickGiftLegend(rows):giftLegend(rows))){
  const row=document.createElement('p');row.className='giftRow';
  const strip=document.createElement('span');strip.className='giftStrip';for(const g of group.gifts){if(/^\/gift-icons\/[a-z0-9-]+\.(?:png|webp|gif)$/.test(g.icon||'')){const icon=document.createElement('img');icon.src=g.icon;icon.alt=g.name;icon.title=g.name+' · '+giftPriceText(g);strip.append(icon);}else{const name=document.createElement('span');name.textContent=g.name;strip.append(name);}}
  const arrow=document.createElement('span');arrow.className='giftArrow';arrow.textContent='→';const label=document.createElement('span');label.textContent=group.label+(group.bonus==='revive'?' · 救援':'');row.title=group.gifts.map(g=>g.name+' · '+giftPriceText(g)).join('、');const power=group.gifts[0]?.quality?.power;if(power)row.title+=' · 整队参考数值 ×'+(priceStrength(power.priceMilli)*(group.gifts[0].multiplier||1)).toFixed(2);row.dataset.tier=group.tier;row.append(strip,arrow,label);gifts.append(row);
 }
 el.append(gifts);
 if(content.spells.length){const spells=document.createElement('div');spells.className='spellHelp';
  const intro=document.createElement('p');intro.className='menuTitle';intro.textContent='发咒语，召唤事件';const cool=document.createElement('span');cool.className='menuAside';cool.textContent='免费 · 每人'+WAR_INCANTATION_COOLDOWN_MS/1000+'秒一次';intro.append(cool);spells.append(intro);
  for(const spell of content.spells){const line=document.createElement('p');line.className='spellRow';const words=document.createElement('span');words.textContent=spell.text;line.append(words);
   spells.append(line);
  }el.append(spells);
 }

 for(const title of el.querySelectorAll('.menuTitle')){const first=title.firstChild;if(first?.nodeType===3){const ink=document.createElement('span');ink.className='titleInk';ink.textContent=first.textContent;first.replaceWith(ink);}}
}
export function renderPinned(el,state,side){const list=(state.audience?.pinned||[]).filter(m=>m.side===side),item=list[0];el.hidden=!item;if(!item)return;el.replaceChildren();const title=document.createElement('strong');title.textContent='B站醒目留言 · '+Math.ceil(item.remainingMs/1000)+'秒'+(list.length>1?' · 共'+list.length+'条':'');const text=document.createElement('p');text.textContent=item.supporter.name+'：'+item.text;el.append(title,text);}
