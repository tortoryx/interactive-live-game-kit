export const LUNA_MODEL='gpt-5.6-luna';
export const INSTANT_MODEL='chatgpt-web/light';
import {DEEPSEEK_MODEL} from './deepseek.mjs';
export {DEEPSEEK_MODEL};
export const isCommanderModel=model=>[LUNA_MODEL,INSTANT_MODEL,DEEPSEEK_MODEL].includes(model)||typeof model==='string'&&/^configured-api\/[a-zA-Z0-9._:/-]{1,120}$/.test(model);
