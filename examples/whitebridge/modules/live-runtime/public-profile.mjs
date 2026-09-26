import {createHash} from 'node:crypto';
export function displayName(value,fallback='观众'){
 if(typeof value!=='string')return fallback;const s=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/g,'').trim();return s?Array.from(s).slice(0,16).join(''):fallback;
}
export function avatarSource(value,platform='bilibili'){
 if(platform!=='bilibili'||typeof value!=='string'||value.length>512)return null;
 try{const url=new URL(value.startsWith('//')?'https:'+value:value);if(!['http:','https:'].includes(url.protocol)||!/^i[012]\.hdslb\.com$/.test(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!/^\/bfs\/face\/[a-fA-F0-9]{20,80}\.(?:jpg|jpeg|png)$/.test(url.pathname))return null;url.protocol='https:';return url.href;}catch{return null;}
}
export const avatarKey=url=>createHash('sha256').update(url).digest('hex').slice(0,40);
// Only public fields from an authenticated event are eligible for the overlay.
export function publicProfile(d,platform='bilibili'){return {name:displayName(d?.uname),platform,avatarSource:avatarSource(d?.uface,platform)};}
