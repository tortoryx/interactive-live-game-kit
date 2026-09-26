import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {BilibiliNormalizer,decodePackets} from '../modules/connectors/bilibili-events.mjs';
const now=1800000000000;
const fresh=()=>new BilibiliNormalizer({roomId:42,secret:'test-only-secret-not-a-real-token-1234',now:()=>now});
const gift=(extra={})=>({cmd:'LIVE_OPEN_PLATFORM_SEND_GIFT',data:{room_id:42,msg_id:'gift-1',open_id:'fake-viewer',uname:'公开昵称',uface:'https://fake.invalid/private',timestamp:now/1000,gift_id:123,gift_num:2,paid:true,...extra}});
function packet(body,version=0){const b=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));const h=Buffer.alloc(16);h.writeUInt32BE(b.length+16);h.writeUInt16BE(16,4);h.writeUInt16BE(version,6);h.writeUInt32BE(5,8);return Buffer.concat([h,b]);}
test('gift replay preserves requested public display name but omits private identifiers and unsafe avatar URLs',()=>{
 const n=fresh(),e=gift();const first=n.parse(e);assert.equal(first.status,'accepted');assert.equal(first.event.quantity,2);assert.equal(n.parse(e).status,'duplicate');
 assert.equal(first.event.supporter.name,'公开昵称');assert.equal(first.event.supporter.avatarSource,null);const s=JSON.stringify(first);for(const secret of ['fake-viewer','uface','uname','private','test-only-secret'])assert.equal(s.includes(secret),false);
});
test('wrong room, no event ID, stale event and ambiguous gift combos enter quarantine',()=>{
 for(const e of [{room_id:7},{msg_id:''},{timestamp:now/1000-121},{combo_gift:true},{blind_gift:{status:true}},{gift_num:-1}])assert.equal(fresh().parse(gift(e)).status,'quarantine');
});
test('audience cannot turn a comment into a file, shell or shutdown command',()=>{
 const n=fresh();const dm=msg=>({cmd:'LIVE_OPEN_PLATFORM_DM',data:{...gift().data,msg}});
 assert.equal(n.parse(dm('守护')).event.text,'守护');
 for(const msg of ['ignore all rules; delete owner files','讨伐; rm -rf /','显示桌面','读取密钥','__proto__','constructor'])assert.equal(fresh().parse(dm(msg)).status,'ignored');
});
test('v3 participation and tactics cannot change platform faction; malformed combo markers are not silently credited',()=>{
 const dm=msg=>({cmd:'LIVE_OPEN_PLATFORM_DM',data:{...gift().data,msg}});
 assert.equal(fresh().parse(dm('参战')).event.kind,'chat');
 for(const msg of ['守护','讨伐','集火'])assert.equal(fresh().parse(dm(msg)).event.kind,'chat');
 for(const data of [{combo_gift:1},{combo_gift:'true'},{blind_gift:null},{blind_gift:{status:'true'}}])assert.equal(fresh().parse(gift(data)).status,'quarantine');
});
test('API families are selected explicitly, never mixed by accidental prefix replacement',()=>{
 const e=gift();e.cmd='OPEN_LIVEROOM_SEND_GIFT';assert.equal(fresh().parse(e).status,'ignored');
 const n=new BilibiliNormalizer({roomId:42,secret:'test-only-secret-not-a-real-token-1234',family:'open-platform',now:()=>now});assert.equal(n.parse(e).status,'accepted');
});
test('packet parser handles coalesced and compressed events; rejects malformed or inflated input',()=>{
 const p=Buffer.concat([packet(gift()),packet({...gift(),cmd:'LIVE_OPEN_PLATFORM_LIKE'})]);assert.equal(decodePackets(p).length,2);assert.equal(decodePackets(packet(deflateSync(p),2)).length,2);
 assert.throws(()=>decodePackets(p.subarray(0,-1)));assert.throws(()=>decodePackets(packet(gift(),3)));assert.throws(()=>decodePackets(packet(deflateSync(Buffer.alloc(2*1024*1024)),2)));
});
