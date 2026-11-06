import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('../../python/hlhk_worker.py',import.meta.url));
export function createTelecomUpstream(){
  function call(body){return new Promise(resolve=>{
    const child=spawn('python3',[worker],{stdio:['pipe','pipe','ignore']});
    let output='',finished=false;
    const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,code:'TIMEOUT'});},22000);
    child.on('error',()=>finish({ok:false,code:'WORKER_UNAVAILABLE'}));
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2097152){child.kill();finish({ok:false,code:'INVALID_RESPONSE'});}});
    child.on('close',()=>{try{finish(JSON.parse(output));}catch{finish({ok:false,code:'INVALID_RESPONSE'});}});
    child.stdin.end(JSON.stringify(body));
  });}
  return {inspect:(credentials,kind)=>call({action:'inspect',credentials,kind}),authorize:body=>call(body),login:(phone,password,device_id)=>call({action:'login',phone,password,device_id}),usage:async credentials=>{
    const [base,extra]=await Promise.all([call({action:'usage',credentials}),call({action:'packages',credentials})]);
    if(!base.ok)return base;
    return {...base,details:extra.ok ? extra.details : [],package_name:extra.ok ? extra.package_name : '',breakdown_available:extra.ok && extra.details.length>0};
  }};
}
