import {readFileSync,writeFileSync,mkdirSync,chmodSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {contextKey} from './sessions.js';
export function createTelecomStore(path=''){
 let entries={};
 if(path){try{entries=JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('无法读取电信会话');}}
 if(!entries || typeof entries!=='object' || Array.isArray(entries))throw new Error('电信会话格式错误');
 function save(next){
  if(path){mkdirSync(dirname(path),{recursive:true,mode:0o700});chmodSync(dirname(path),0o700);writeFileSync(path+'.tmp',JSON.stringify(next),{mode:0o600});chmodSync(path+'.tmp',0o600);renameSync(path+'.tmp',path);}
  entries=next;
 }
 return {
  get:context=>entries[contextKey(context)] || null,
  put(context,credentials){
   const key=contextKey(context);
   if(!key || typeof credentials.token!=='string' || !credentials.token || credentials.token.length>4096 || !/^1\d{10}$/.test(credentials.phonenum))throw new Error('电信会话无效');
   const info={};
   for(const field of ['token','phonenum','provinceCode','cityCode'])if(typeof credentials[field]==='string')info[field]=credentials[field];
   const entry={credentials:info,updatedAt:Date.now(),mobile:info.phonenum.slice(0,3)+'****'+info.phonenum.slice(-4)};
   const next={...entries,[key]:entry};
   const keys=Object.keys(next).sort((a,b)=>next[b].updatedAt-next[a].updatedAt).slice(0,16);
   save(Object.fromEntries(keys.map(k=>[k,next[k]])));return entry;
  },
  remove(context){const next={...entries};delete next[contextKey(context)];save(next);}
 };
}
