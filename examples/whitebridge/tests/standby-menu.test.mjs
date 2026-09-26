import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
import {menuContent} from '../modules/pixel-war/public/play-menu.mjs';
import {PLATFORM_GIFTS} from '../modules/live-runtime/gift-catalog.mjs';
import {BILI_GIFT_ROSTER,WAR_INCANTATIONS} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {quickGiftRows} from '../modules/pixel-war/public/gift-legend.mjs';

test('the public standby guide keeps the verified twelve gifts and spells without enabling play',()=>{
 const g=new LiveGame();try{
  g.configureBroadcast('bilibili-first');g.world.paused=true;
  const gifts=BILI_GIFT_ROSTER.map(r=>PLATFORM_GIFTS.bilibili.find(g=>g.name===r.name&&g.coinType==='gold'));
  const connections={bilibili:{state:'authenticated',roomId:42},giftPanels:{bilibili:{state:'ready',roomId:42,expiresAt:g.now()+60000,gifts}}};
  for(const side of ['human','demon']){
   const menu=playMenu(g,side,connections),content=menuContent(menu);
   assert.equal(menu.liveEnabled,false);assert.equal(menu.gifts.length,0);
   assert.equal(quickGiftRows(content.gifts).length,12);assert.deepEqual(content.spells,WAR_INCANTATIONS);
   g.meta.liveEnabled=true;assert.deepEqual(menuContent(playMenu(g,side,connections)),content);g.meta.liveEnabled=false;
  }
  assert.equal(g.world.paused,true);assert.equal(g.world.time,0);assert.equal(g.world.units.length,0);assert.equal(g.meta.liveEnabled,false);
  assert.deepEqual(menuContent(playMenu(g,'demon')),{gifts:[],spells:[]});
  assert.deepEqual(menuContent(playMenu(g,'demon',{...connections,bilibili:{roomId:99}})),{gifts:[],spells:[]});
 }finally{g.close();}
});
