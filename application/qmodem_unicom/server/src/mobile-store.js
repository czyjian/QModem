import {readFileSync,writeFileSync,mkdirSync,chmodSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {contextKey} from './sessions.js';
import {validMobileJar} from './upstream/mobile.js';
export function createMobileStore(path=''){
 let entries={};if(path){try{entries=JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('无法读取移动会话');}}
 if(!entries || typeof entries!=='object' || Array.isArray(entries))throw new Error('移动会话格式错误');
 function save(next){if(path){mkdirSync(dirname(path),{recursive:true,mode:0o700});chmodSync(dirname(path),0o700);writeFileSync(path+'.tmp',JSON.stringify(next),{mode:0o600});chmodSync(path+'.tmp',0o600);renameSync(path+'.tmp',path);}entries=next;}
 return {
  get:sim=>entries[contextKey(sim)] || null,
  put(sim,credentials){const key=contextKey(sim);if(!key || !/^1\d{10}$/.test(credentials?.phone || '') || !validMobileJar(credentials.jar))throw new Error('移动会话无效');const entry={credentials:{phone:credentials.phone,jar:structuredClone(credentials.jar)},mobile:credentials.phone.slice(0,3)+'****'+credentials.phone.slice(-4),updatedAt:Date.now()};const next={...entries,[key]:entry},keys=Object.keys(next).sort((a,b)=>next[b].updatedAt-next[a].updatedAt).slice(0,16);save(Object.fromEntries(keys.map(k=>[k,next[k]])));return entry;},
  remove(sim){const next={...entries};delete next[contextKey(sim)];save(next);}
 };
}
