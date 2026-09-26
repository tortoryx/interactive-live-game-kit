export const MEMORY_LIMITS=Object.freeze({active:128,archived:2048,idleMs:300000,archiveMs:86400000});
export const createViewerMemory=()=>({version:1,active:{},archived:{}});
const own=(map,key)=>Object.hasOwn(map,key)?map[key]:null;
const set=(map,key,value)=>Object.defineProperty(map,key,{value,enumerable:true,writable:true,configurable:true});
const clock=now=>{if(!Number.isFinite(now)||now<0)throw Error('invalid_memory_clock');};
const identity=key=>{if(typeof key!=='string'||!key.length||key.length>200)throw Error('invalid_memory_key');};
const oldest=map=>Object.keys(map).sort((a,b)=>map[a].lastInteractionAt-map[b].lastInteractionAt||(a<b?-1:a>b?1:0));
function archive(cache,key,now){const entry=own(cache.active,key);if(!entry)return;entry.archivedAt=now;set(cache.archived,key,entry);delete cache.active[key];}
function cap(cache,now){
 const active=Object.keys(cache.active);if(active.length>MEMORY_LIMITS.active)for(const key of oldest(cache.active).slice(0,active.length-MEMORY_LIMITS.active))archive(cache,key,now);
 const archived=Object.keys(cache.archived);if(archived.length>MEMORY_LIMITS.archived)for(const key of oldest(cache.archived).slice(0,archived.length-MEMORY_LIMITS.archived))delete cache.archived[key];
}
export function sweepViewerMemory(cache,now){
 clock(now);
 for(const [key,entry] of Object.entries(cache.active))if(now-entry.lastInteractionAt>=MEMORY_LIMITS.idleMs)archive(cache,key,now);
 for(const [key,entry] of Object.entries(cache.archived))if(now-entry.lastInteractionAt>=MEMORY_LIMITS.archiveMs)delete cache.archived[key];
 cap(cache,now);
}
export function accessViewerMemory(cache,key,{now,activate=false,create}={}){
 identity(key);sweepViewerMemory(cache,now);
 let entry=own(cache.active,key)||own(cache.archived,key);
 if(!entry){if(!create)return null;const record=create();entry={record,lastInteractionAt:now,archivedAt:activate?null:now};set(activate?cache.active:cache.archived,key,entry);}
 if(activate){entry.lastInteractionAt=Math.max(now,entry.lastInteractionAt);entry.archivedAt=null;delete cache.archived[key];set(cache.active,key,entry);}
 cap(cache,now);return entry.record;
}
export function departViewerMemory(cache,key,now){identity(key);clock(now);const wasActive=!!own(cache.active,key);archive(cache,key,now);sweepViewerMemory(cache,now);return wasActive;}
export function activeViewerMemory(cache,key,now){identity(key);sweepViewerMemory(cache,now);return own(cache.active,key)?.record??null;}
export const allViewerMemoryRecords=cache=>[...Object.values(cache.active),...Object.values(cache.archived)].map(e=>e.record);
