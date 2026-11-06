const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/view/qmodem/overview.js'),'utf8');
const load=installed=>new Function('view','poll','ui','dom','uci','qmodem','L','E','document','_',source)(
 {extend:x=>x},{},{},{},{load:async()=>true},{},
 {resource:x=>x,env:{},require:()=>installed?Promise.resolve({}):Promise.reject(new Error('not installed'))},
 ()=>({}),{head:{appendChild(){}},styleSheets:[]},x=>x
).load();
(async()=>{await load(false);await load(true);assert(!source.includes("'require qmodem.traffic as traffic'"));console.log('PASS: QModem Next overview loads with and without optional traffic addon');})().catch(e=>{console.error(e);process.exitCode=1;});
