const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/view/qmodem/overview.js'),'utf8');
async function load(options={}) {
 let requested=0;
 const main=options.main||'/luci-static/bootstrap';
 const shane=options.shane||'/luci-static/shadcn-shane';
 const uci={load:async name=>{if(name==='luci'&&options.failConfig)throw new Error('unavailable');return true;},get:(config,section,key)=>section==='main'?main:key==='Shadcn_Shane'?shane:null};
 const view=new Function('view','poll','ui','dom','uci','qmodem','L','E','document','_',source)(
  {extend:x=>x},{},{},{},uci,{},
  {resource:x=>x,env:{media:options.media},require:()=>{requested++;return options.installed===false?Promise.reject(new Error('not installed')):Promise.resolve({});}},
  ()=>({}),{head:{appendChild(){}},styleSheets:[]},x=>x
 );
 await view.load();return requested;
}
(async()=>{
 assert.equal(await load({installed:false}),1);
 assert.equal(await load({media:'/luci-static/bootstrap'}),1);
 assert.equal(await load({media:'/luci-static/shadcn'}),1);
 assert.equal(await load({media:'/luci-static/shadcn-shane-other'}),1);
 assert.equal(await load({media:'/luci-static/shadcn-shane'}),0);
 assert.equal(await load({media:'/luci-static/shadcn-shane/'}),0);
 assert.equal(await load({main:'/luci-static/shadcn-shane'}),0);
 assert.equal(await load({media:'/luci-static/bootstrap',main:'/luci-static/shadcn-shane'}),1);
 assert.equal(await load({media:'/custom/theme',shane:'/custom/theme'}),0);
 assert.equal(await load({failConfig:true,media:'/luci-static/bootstrap'}),1);
 assert(!source.includes("'require qmodem.traffic as traffic'"));
 console.log('PASS: only Shadcn_Shane skips overview traffic loading; other themes, active media precedence, custom paths and absent optional addon work');
})().catch(e=>{console.error(e);process.exitCode=1;});
