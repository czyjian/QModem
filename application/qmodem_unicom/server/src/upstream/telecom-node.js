import {createHash,createCipheriv,publicEncrypt,constants} from 'node:crypto';
import {createTelecomNodeQuery,queryBody,encodeAccount,postTelecom,postQuery} from './telecom-node-query.js';

const PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB\n-----END PUBLIC KEY-----';
export const encryptLogin=text=>publicEncrypt({key:PUBLIC_KEY,padding:constants.RSA_PKCS1_PADDING},Buffer.from(text)).toString('base64');
export function timestamp(date=new Date(),minute=false){
  const pad=n=>String(n).padStart(2,'0');
  return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate())+pad(date.getHours())+pad(date.getMinutes())+(minute ? '00' : pad(date.getSeconds()));
}
export function passwordBody(phone,password,device='',date=new Date(),encrypt=encryptLogin){
  const ts=timestamp(date,true),trusted=device ? device.slice(0,12) : phone;
  return {content:{fieldData:{accountType:'',authentication:encodeAccount(password),deviceUid:'3'+phone,isChinatelecom:'0',loginAuthCipherAsymmertric:encrypt('iPhone 14 15.4.0'+trusted+phone+ts+password+'0$$$0.'),loginType:'4',phoneNum:encodeAccount(phone),systemVersion:'15.4.0',androidId:device ? encodeAccount(device) : ''},attach:'iPhone'},headerInfos:{code:'userLoginNormal',clientType:'#12.2.0#channel50#iPhone 14 Pro#',timestamp:ts,shopId:'20002',source:'110003',sourcePassword:'Sid98s',userLoginName:encodeAccount(phone)}};
}
export function smsBody(state,code,date=new Date(),encrypt=encryptLogin){
  const ts=timestamp(date),pad=(value,length)=>value.slice(0,length).padEnd(length,'$');
  const plain='iPhone 11 '.slice(0,10)+'16.1.'+state._uid.slice(0,12)+state.phone.slice(0,11)+ts+pad(code,6)+pad('0',4)+pad('0.000000',2);
  return {accountType:'',authentication:Buffer.from(encodeAccount(code)).toString('base64'),clientType:'1',deviceUid:state._uid,isChinatelecom:state._isct || '1',loginAuthCipherAsymmertric:encrypt(plain),loginType:'2',phoneNum:encodeAccount(state.phone),signSignatureString:'',systemVersion:'16.1.1'};
}
export function encryptSlider(text,extra){
  if(typeof extra!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(extra))throw new Error('INVALID_CHALLENGE');
  const key=Buffer.from(extra,'base64');
  if(![16,24,32].includes(key.length) || key.toString('base64').replace(/=+$/,'')!==extra.replace(/=+$/,''))throw new Error('INVALID_CHALLENGE');
  const cipher=createCipheriv('aes-'+key.length*8+'-ecb',key,null);
  return Buffer.concat([cipher.update(String(text),'utf8'),cipher.final()]).toString('base64');
}
export function createTelecomUpstream({post=postTelecom,now=()=>new Date(),encrypt=encryptLogin,query=createTelecomNodeQuery()}={}){
  function stateFor(phone){return {phone,_uid:createHash('md5').update('CT_IOS_11_'+phone).digest('hex'),_key:'',_isct:'0',_slider:null,_candidate_device_id:null};}
  function update(state,data){if(data.key)state._key=data.key;if(data.isChinatelecom!=null)state._isct=String(data.isChinatelecom);}
  function randomFields(state,signature=''){return {deviceUid:state._uid,imsi:'',key:state._key,payType:'',phoneNum:encodeAccount(state.phone),salesProdId:'',scene:'55',signSignatureString:signature,validationCode:''};}
  function v2(code,fields,extra={},deadline=Infinity){
    return post(code,{headerInfos:{broadAccount:'',broadToken:'',fixedLineAccount:'',fixedLineToken:'',provinceCode:'',code,source:'120002',sourcePassword:'TiqmIZ',userLoginName:'',clientType:'#13.4.0#channel50#iPhone 11 Pro Max#',token:'',timestamp:timestamp(now()),shopId:'20004',...extra},content:{attach:'iPhone',fieldData:fields}},{userAgent:'P216010901',auth:true,timeoutMs:Math.min(18000,Math.max(1,deadline-Date.now()))});
  }
  return {
    usage:query.usage,
    login:async(phone,password,device='')=>{
      try{
        const result=await post('password',passwordBody(phone,password,device,now(),encrypt));
        if(!result.ok)return {ok:false,code:result.code};
        const info=result.data?.loginSuccessResult;
        if(typeof info?.token!=='string' || !info.token)return {ok:false,code:'MISSING_TOKEN'};
        return {ok:true,credentials:{token:info.token,phonenum:phone,provinceCode:info.provinceCode || '',cityCode:info.cityCode || ''}};
      }catch{return {ok:false,code:'LOGIN_FAILED'};}
    },
    authorize:async body=>{
      try{
        const deadline=Date.now()+22000;
        const callV2=(code,fields,extra={})=>v2(code,fields,extra,deadline);
        const state=body.action==='challenge' ? stateFor(body.phone) : structuredClone(body.state);
        if(!state || !/^1\d{10}$/.test(state.phone || ''))return {ok:false,code:'INVALID_STATE'};
        if(body.action==='challenge'){
          const random=await callV2('getLoginRandomCode',randomFields(state));update(state,random.data || {});
          // The unsigned preflight can return 12001/122001 (verification required),
          // without a key. Upstream deliberately continues to fetch the slider.
          if(!random.ok && !/^\d+$/.test(random.code || ''))return {ok:false,code:random.code};
          const slider=await callV2('getSliderVerificationPicture',{account:encodeAccount(state.phone),clientType:'1',deviceUid:encodeAccount(state._uid),scene:'1'});
          const data=slider.data || {},background=data.backgroundImg || data.bigImg,piece=data.sliderImg || data.smallImg;
          if(!background || !piece || !data.key || !data.extra)return {ok:false,code:slider.code || 'INCOMPLETE_CHALLENGE'};
          state._slider={key:data.key,extra:data.extra};
          return {ok:true,state,challenge:{background_img:background,slider_img:piece,background_width:data.backgroundWidth,background_height:data.backgroundHeight,slider_width:data.sliderWidth,slider_height:data.sliderHeight}};
        }
        if(body.action==='send_sms'){
          if(!state._slider)return {ok:false,code:'MISSING_CHALLENGE'};
          const enc=value=>encryptSlider(value,state._slider.extra);
          const verification=await callV2('verificationSliderPicture',{account:encodeAccount(state.phone),clientType:'1',deviceUid:encodeAccount(state._uid),distance:enc(body.distance.toFixed(4)),endTime:enc(body.end_time),startTime:enc(body.start_time),key:state._slider.key,scene:'1',shopId:'20002',slidingTrack:enc(body.track)});
          const signature=verification.data?.signSignatureString;
          if(!signature)return {ok:false,code:verification.code || 'SLIDER_REJECTED'};
          const result=await callV2('getLoginRandomCode',randomFields(state,signature));update(state,result.data || {});
          if(!result.ok && result.code!=='0' && !result.smsHint)return {ok:false,code:result.code || 'SMS_FAILED'};
          return {ok:true,state};
        }
        if(body.action==='authorize'){
          const date=now();
          const result=await callV2('userLoginNormal',smsBody(state,body.code,date,encrypt),{userLoginName:encodeAccount(state.phone),timestamp:timestamp(date)});
          if(!result.data?.loginSuccessResult?.token)return {ok:false,code:result.code || 'SMS_LOGIN_FAILED'};
          return {ok:true,device_id:state._uid};
        }
        return {ok:false,code:'INVALID_ACTION'};
      }catch{return {ok:false,code:'AUTH_FAILED'};}
    },
    inspect:async(credentials,kind)=>{
      const result=await postQuery(kind==='packages' ? 'packages' : 'usage',queryBody(credentials,kind));
      if(!result.ok)return result;
      const fields=[];
      function walk(value,path='',depth=0){if(depth>7 || fields.length>=250)return;if(Array.isArray(value)){if(value.length)walk(value[0],path+'[]',depth+1);}else if(value && typeof value==='object'){for(const [key,child] of Object.entries(value).slice(0,80))if(key.length<64 && !/\d/.test(key))walk(child,path+'.'+key,depth+1);}else fields.push(path+':'+typeof value);}
      walk(result.data);return {ok:true,fields};
    }
  };
}
