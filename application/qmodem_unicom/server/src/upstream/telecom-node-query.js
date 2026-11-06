// Query-only port of the pinned hlhk client. Login/DeviceId authorization are
// deliberately outside this module. Never log credentials or upstream bodies.
import https from 'node:https';
import {gunzipSync} from 'node:zlib';

const CLIENT='#12.2.0#channel50#iPhone 14 Pro#';
export const encodeAccount=value=>Array.from(value,c=>String.fromCharCode((c.charCodeAt(0)+2)&65535)).join('');
export function queryBody(credentials,kind,date=new Date()){
  const pad=n=>String(n).padStart(2,'0');
  const timestamp=date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate())+pad(date.getHours())+pad(date.getMinutes())+'00';
  const account=encodeAccount(credentials.phonenum);
  const content=kind==='packages' ? {fieldData:{queryFlag:'0',accessAuth:'1',account},attach:'test'} : {fieldData:{provinceCode:credentials.provinceCode || '600101',cityCode:credentials.cityCode || '8441900',shopId:'20002',isChinatelecom:'0',account}};
  return {content,headerInfos:{code:kind==='packages' ? 'userFluxPackage' : 'qryImportantData',clientType:CLIENT,timestamp,shopId:'20002',source:'110003',sourcePassword:'Sid98s',userLoginName:account,token:credentials.token}};
}
const ENDPOINTS={usage:['appfuwu.189.cn',9021,'/query/qryImportantData'],packages:['appfuwu.189.cn',9021,'/query/userFluxPackage'],password:['appgologin.189.cn',9031,'/login/client/userLoginNormal'],getLoginRandomCode:['appgologinsz.189.cn',443,'/login/client/getLoginRandomCode'],getSliderVerificationPicture:['appgologinsz.189.cn',443,'/login/client/getSliderVerificationPicture'],verificationSliderPicture:['appgologinsz.189.cn',443,'/login/client/verificationSliderPicture'],userLoginNormal:['appgologinsz.189.cn',443,'/login/client/userLoginNormal']};
export function postTelecom(kind,body,{userAgent='python-requests/2.32.5',auth=false,timeoutMs=18000}={}){
  if(!Object.hasOwn(ENDPOINTS,kind))return Promise.resolve({ok:false,code:'INVALID_ENDPOINT'});
  const [hostname,port,path]=ENDPOINTS[kind];
  return new Promise(resolve=>{
    let completed=false;
    const done=result=>{if(completed)return;completed=true;clearTimeout(timer);resolve(result);};
    const payload=Buffer.from(JSON.stringify(body));
    const req=https.request({hostname,port,path,method:'POST',rejectUnauthorized:true,minVersion:'TLSv1.2',headers:{Accept:'application/json','Content-Type':'application/json; charset=UTF-8',Connection:'Keep-Alive','Accept-Encoding':'gzip','User-Agent':userAgent,'Content-Length':payload.length}},response=>{
      const chunks=[];let length=0;
      response.on('data',chunk=>{length+=chunk.length;if(length>2097152){req.destroy();done({ok:false,code:'RESPONSE_TOO_LARGE'});}else chunks.push(chunk);});
      response.on('error',()=>done({ok:false,code:'NETWORK_ERROR'}));
      response.on('end',()=>{
        if(completed)return;
        if(response.statusCode!==200)return done({ok:false,code:'HTTP_'+response.statusCode});
        try{
          let buffer=Buffer.concat(chunks);
          if(response.headers['content-encoding']==='gzip')buffer=gunzipSync(buffer,{maxOutputLength:2097152});
          const raw=JSON.parse(buffer.toString('utf8')),data=raw?.responseData;
          if(data?.resultCode!=='0000'){
            const code=String(data?.resultCode || 'INVALID_RESPONSE');
            const result={ok:false,code:/^[A-Za-z0-9_]{1,32}$/.test(code) ? code : 'INVALID_RESPONSE'};
            // Authentication sometimes returns a key/challenge with a nonzero
            // code. These fields stay internal; never forward raw messages.
            if(auth){result.data=data?.data || {};result.smsHint=/成功|60s|重复获取/.test(String(data?.resultDesc || ''));}
            return done(result);
          }
          done({ok:true,data:data.data || {}});
        }catch{done({ok:false,code:'INVALID_RESPONSE'});}
      });
    });
    const timer=setTimeout(()=>{req.destroy();done({ok:false,code:'TIMEOUT'});},Math.min(18000,Math.max(1,timeoutMs)));
    req.on('error',()=>done({ok:false,code:'NETWORK_ERROR'}));
    req.end(payload);
  });
}
export const postQuery=(kind,body)=>postTelecom(kind,body);
function number(value){return (typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;}
export function flowMb(value){
  const m=String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|B)\s*$/i);
  if(!m)return null;
  const result=Number(m[1])*({B:1/1048576,KB:1/1024,MB:1,GB:1024,TB:1048576}[m[2].toUpperCase()]);
  return Number.isFinite(result) ? result : null;
}
export function packageSummary(data){
  const details=[];
  for(const group of (data?.productOFFRatable?.ratableResourcePackages || []).slice(0,30)){
    if(!String(group?.title || '').includes('流量'))continue;
    for(const item of (group.productInfos || []).slice(0,100)){
      if(!item || String(item.isInvalid ?? '0')!=='0')continue;
      const unlimited=String(item.isInfiniteAmount ?? '0')==='1';
      const used=item.leftTitle==='已用' ? flowMb(item.leftHighlight) : null;
      const remaining=item.rightTitle==='剩余' ? flowMb(item.rightHighlight) : null;
      const match=String(item.rightCommon || '').match(/共\s*(\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB|B))/i);
      const total=match ? flowMb(match[1]) : used!=null && remaining!=null ? used+remaining : null;
      if(remaining==null && total==null && !unlimited)continue;
      details.push({name:String(item.title || group.title).slice(0,160),used_mb:used,remaining_mb:unlimited ? null : remaining,total_mb:unlimited ? null : total,unlimited});
    }
  }
  return {details,package_name:String(data?.mainProductOFFInfo?.productOFFName || '').slice(0,120)};
}
export function basicSummary(data){
  const value=data?.flowInfo?.totalAmount;
  const used=number(value?.used),remaining=number(value?.balance);
  const explicit=number(value?.total),total=explicit ?? (used!=null && remaining!=null ? used+remaining : null);
  if(used==null || remaining==null || total==null)return {ok:false,code:'UNKNOWN_FLOW_FORMAT'};
  return {ok:true,used_mb:used/1024,remaining_mb:remaining/1024,total_mb:total/1024,signed_rate:null,updated_at:Math.floor(Date.now()/1000)};
}
export function createTelecomNodeQuery({post=postQuery}={}){
  return {usage:async credentials=>{
    if(!/^1\d{10}$/.test(credentials?.phonenum || '') || typeof credentials?.token!=='string' || !credentials.token)return {ok:false,code:'INVALID_SESSION'};
    try{
      const [base,extra]=await Promise.all([post('usage',queryBody(credentials,'usage')),post('packages',queryBody(credentials,'packages'))]);
      if(!base.ok)return base;
      const summary=basicSummary(base.data);
      if(!summary.ok)return summary;
      const packages=extra.ok ? packageSummary(extra.data) : {details:[],package_name:''};
      return {...summary,...packages,breakdown_available:packages.details.length>0};
    }catch{return {ok:false,code:'INVALID_RESPONSE'};}
  }};
}
