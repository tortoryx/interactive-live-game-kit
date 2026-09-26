import {MODEL_CLIENT_MS,INSTANT_BRIDGE_MS} from './model-timing.mjs';
import {readFileSync} from 'node:fs';
export class BrokerClient {
 constructor({token,port=4392}={}){this.token=token;this.port=port;this.statusRevision=0;this.status={models:{enabled:false,state:'unavailable'},bilibili:{state:'unavailable'},xiaohongshu:{state:'official_gift_transport_unverified'}};}
 async request(path,body){const r=await fetch(`http://127.0.0.1:${this.port}${path}`,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(path==='/decision'?(this.status.models?.transport==='electron'?INSTANT_BRIDGE_MS+2000:MODEL_CLIENT_MS):path==='/voice'?46000:12000),headers:{'X-Bridge-Token':this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('broker_request_rejected');return r.json();}
 setStatus(status){this.statusRevision++;this.status=status;}
 async poll(game){const revision=this.statusRevision,next={...await this.request('/status'),unavailable:false};if(revision===this.statusRevision)this.status=next;const events=await this.request('/events'),ids=game.receiveBatch(events);if(ids.length)await this.request('/ack',{ids});}
}
export function environmentBroker(){return process.env.DUEL_BRIDGE_TOKEN?new BrokerClient({token:readFileSync(process.env.DUEL_BRIDGE_TOKEN,'utf8').trim()}):null;}
