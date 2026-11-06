'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/qmodem/traffic-query.js'),'utf8');
const sims=[],responses=[],requests=[];let calls=0,telecomOpens=0;
const E=(tag,attrs,children)=>({tag,attrs,children,style:{}});
const query=new Function('L','E','_','dom','uci','qmodem','window','fetch','carrierLogin','telecomTest',source)(
  {Class:{extend:value=>value},url:value=>'/cgi-bin/luci/'+value},E,value=>value,
  {content:(node,children)=>{node.children=children;}},{get:()=>undefined},
  {getSimInfo:()=>{calls++;return sims.shift()();}},
  {location:{href:'http://192.168.88.1/cgi-bin/luci/admin/modem/qmodem/traffic'}},
  async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return{ok:true,json:async()=>responses.shift()};}, {open:()=>({close:()=>{}})}, {open:()=>{telecomOpens++;return {close:()=>{}};}}
);
const sim=(isp,imsi,status='ready')=>({modem_info:[{key:'ISP',value:isp},{key:'IMSI',value:imsi},{key:'SIM Status',value:status}]});
const unicom=()=>Promise.resolve(sim('China Unicom','460011234567890'));
const usage={ok:true,mobile:'138****0000',package_name:'测试套餐',updated_at:1,total_mb:2048,remaining_mb:1024,details:[{name:'测试流量包',total_mb:2048,remaining_mb:1024}]};
const text=node=>JSON.stringify(node);
for(const name of ['CHN-UNICOM','中国联通','46001'])assert.equal(query.identify(sim(name,'')).carrier,'unicom');
assert.equal(query.identify(sim('UNICOM','460031234567890')).carrier,'telecom');
assert.equal(query.identify(sim('CMCC','460011234567890')).carrier,'unicom');
assert.equal(query.identify(sim('UNICOM','','pin')).carrier,'');
for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.com'])assert.equal(query.queryUrl(url),null);
assert.equal(query.flow(null),'—');assert.equal(query.flow(1024),'1.00 GB');assert.equal(query.flow(10),'10.00 MB');
(async()=>{
  const selector={value:'first'},panel=query.create(selector);
  await panel.update();assert.equal(calls,0);
  let resolve;
  sims.push(()=>new Promise(done=>{resolve=done;}));const initial=panel.activate(true);
  selector.value='second';panel.change();
  sims.push(()=>Promise.resolve(sim('CMCC','460001234567890')));
  resolve(sim('UNICOM','460011234567890'));await initial;await new Promise(done=>setImmediate(done));
  assert.match(text(panel.node),/China Mobile/);assert.equal(requests.length,0);
  sims.push(unicom);responses.push({ok:false,code:'TOKEN_EXPIRED'});await panel.update();
  assert.match(text(panel.node),/尚未登录/);assert.match(text(panel.node),/当前SIM卡运营商/);assert.match(text(panel.node),/中国联通/);
  assert(!text(panel.node).includes('iframe'),'no embedded full website');
  sims.push(unicom);responses.push(usage);await panel.update();
  assert.match(text(panel.node),/1.00 GB/);assert.match(text(panel.node),/2.00 GB/);assert.match(text(panel.node),/测试流量包/);
  assert.match(text(panel.node),/在新窗口打开/);
  assert.equal(requests.at(-1).config_section,'second');assert.equal(requests.at(-1).action,'usage');
  assert(!JSON.stringify(requests).includes('ecs_token'),'compact view queries without carrier credentials');
  sims.push(()=>Promise.reject(new Error('temporary RPC failure')));await panel.update();assert.match(text(panel.node),/1.00 GB/);
  const descendants=node=>!node || typeof node!=='object' ? [] : Array.isArray(node) ? node.flatMap(descendants) : [node,...descendants(node.children)];
  responses.push({ok:true});descendants(panel.node).find(node=>node.tag==='button' && node.children==='登出').attrs.click();
  for(let i=0;i<5;i++)await new Promise(done=>setImmediate(done));
  assert.equal(requests.at(-1).action,'logout');assert(!text(panel.node).includes('1.00 GB'));assert.match(text(panel.node),/尚未登录/);
  selector.value='third';sims.push(()=>Promise.resolve(sim('UNICOM','','pin')));await panel.change();assert(!text(panel.node).includes('1.00 GB'));
  selector.value='telecom';sims.push(()=>Promise.resolve(sim('China Telecom','460031234567890')));responses.push({ok:false,code:'TOKEN_EXPIRED'});await panel.change();
  assert.match(text(panel.node),/中国电信/);assert.match(text(panel.node),/尚未登录/);
  assert.equal(requests.at(-1).action,'shared_usage');assert.match(requests.at(-1).url,/telecom_test/);
  descendants(panel.node).find(n=>n.tag==='button' && n.children==='登录').attrs.click();assert.equal(telecomOpens,1);
  sims.push(()=>Promise.resolve(sim('China Telecom','460031234567890')));responses.push({...usage,carrier:'telecom'});await panel.update();
  assert.match(text(panel.node),/测试流量包/);assert.match(text(panel.node),/中国电信/);
  responses.push({ok:true});descendants(panel.node).find(n=>n.tag==='button' && n.children==='登出').attrs.click();
  for(let i=0;i<5;i++)await new Promise(done=>setImmediate(done));
  assert.equal(requests.at(-1).action,'shared_logout');
  panel.activate(false);const count=calls;await panel.update();assert.equal(calls,count);
  console.log('PASS: native compact table, credential-free requests, operator detection, SIM switch races, login and details links');
})().catch(error=>{console.error(error);process.exitCode=1;});
