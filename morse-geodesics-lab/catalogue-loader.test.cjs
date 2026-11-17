'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Catalogue=require('./catalogue-loader.js');
const entry=()=>({schemaVersion:1,endpoints:{p:[0,0,0],q:[1,0,0]},curves:[]});
test('starter catalogue requests share pending work and cache the parsed result by configuration',async()=>{
  const calls=[];let finish;
  const loader=Catalogue.create({fetch:url=>{calls.push(url);return new Promise(resolve=>{finish=resolve;});}});
  const first=loader.load('double','default'),second=loader.load('double','default');
  assert.equal(first,second);await Promise.resolve();assert.equal(calls.length,1);
  assert.equal(calls[0],'./catalogues/double-default.json?v=compact-collar-3');
  const data=entry();finish({ok:true,json:async()=>data});assert.equal(await first,data);
  assert.equal(loader.load('double','default'),first);
  const other=loader.load('triple','alternate');await Promise.resolve();
  finish({ok:true,json:async()=>entry()});assert.notEqual(await other,data);assert.equal(calls.length,2);
});
test('missing, malformed, rejected, and unparsable responses can be retried without an unhandled rejection',async()=>{
  for(const failure of [()=>Promise.reject(Error('offline')),()=>({ok:false}),()=>({ok:true,json:()=>Promise.reject(Error('JSON'))}),
    ()=>({ok:true,json:async()=>({schemaVersion:9,curves:[]})})]){
    let calls=0;
    const loader=Catalogue.create({fetch:()=>++calls===1?failure():{ok:true,json:async()=>entry()}});
    assert.equal(await loader.load('torus'),null);assert.equal(calls,1);
    assert.equal((await loader.load('torus')).schemaVersion,1);assert.equal(calls,2);
  }
});
test('unknown configurations never request arbitrary paths',async()=>{
  let requests=0;const loader=Catalogue.create({fetch:()=>{requests++;throw Error('Unexpected request');}});
  for(const [surface,preset]of [['../torus','default'],['double','../default'],['double','presentation'],['other','default']])
    assert.equal(await loader.load(surface,preset),null);
  assert.equal(requests,0);
});
test('a stalled request times out, aborts, and permits a fresh request for the same configuration',async()=>{
  let timeout,cleared=0,requests=0,signal;
  const loader=Catalogue.create({timeoutMs:25,setTimer:(fn,delay)=>{assert.equal(delay,25);timeout=fn;return 1;},
    clearTimer:()=>{cleared++;},fetch:(_,options)=>{
      requests++;signal=options.signal;
      return requests===1?new Promise(()=>{}):{ok:true,json:async()=>entry()};
    }});
  const first=loader.load('torus');await Promise.resolve();timeout();
  assert.equal(await first,null);assert.equal(signal.aborted,true);assert.equal(cleared,1);
  assert.equal((await loader.load('torus')).schemaVersion,1);assert.equal(requests,2);assert.equal(cleared,2);
});
test('the startup deadline also covers a stalled JSON body without requiring AbortController',async()=>{
  let timeout,cleared=0,finishBody;
  const loader=Catalogue.create({AbortController:null,setTimer:fn=>{timeout=fn;return 2;},clearTimer:()=>{cleared++;},
    fetch:async()=>({ok:true,json:()=>new Promise(resolve=>{finishBody=resolve;})})});
  const pending=loader.load('double','alternate');
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal(typeof finishBody,'function');timeout();assert.equal(await pending,null);assert.equal(cleared,1);
  // A late response is already observed by the race; it cannot replace the
  // timed-out result or produce an unhandled rejection.
  finishBody(entry());await Promise.resolve();assert.equal(await pending,null);
});
test('successful starter loading clears its deadline instead of later aborting the response',async()=>{
  let timer,cleared=0,signal;
  const loader=Catalogue.create({setTimer:fn=>{timer=fn;return 3;},clearTimer:id=>{assert.equal(id,3);cleared++;},
    fetch:async(_,options)=>{signal=options.signal;return {ok:true,json:async()=>entry()};}});
  assert.equal((await loader.load('triple')).schemaVersion,1);assert.equal(cleared,1);
  assert.equal(signal.aborted,false);assert.equal(typeof timer,'function');
});
test('lazy connected-sum files preserve every original full-precision sample and verification record',()=>{
  const legacy=require('./catalogue-data.js');
  for(const [key,original]of Object.entries(legacy.catalogues)){
    const file=key.replace(':','-')+'.json',data=JSON.parse(fs.readFileSync(path.join(__dirname,'catalogues',file),'utf8'));
    assert.equal(data.schemaVersion,1);assert.deepEqual(data.curves,original.curves);
    assert.deepEqual(data.endpoints,original.endpoints);assert.deepEqual(data.searchOptions,original.searchOptions);
    assert.equal(data.coverage.stopReason,'complete');assert.equal(data.coverage.nextSeed,data.coverage.total);
  }
});
test('torus starter files retain the live solver verification requirements and accurate search coverage',()=>{
  const {validate,seedTotal}=require('./prepare-catalogues.cjs');
  for(const preset of ['default','alternate']){
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,'catalogues','torus-'+preset+'.json'),'utf8'));
    validate(data,'torus',preset);assert.equal(data.curves.length,36);
    assert.equal(data.coverage.total,seedTotal(data.searchOptions,data.endpoints));
    assert.ok(data.coverage.nextSeed>0&&data.coverage.nextSeed<=data.coverage.total);
  }
});

test('local-file launches bypass fetch and share one full-catalogue script request',async()=>{
  const calls=[],registry={};let finish;
  const loader=Catalogue.create({protocol:'file:',registry,fetch(){throw Error('file fetch must not run');},
    loadScript(url,key,entries){calls.push({url,key});assert.equal(entries,registry);return new Promise(resolve=>{finish=resolve;});}});
  const first=loader.load('torus'),second=loader.load('torus');assert.equal(first,second);
  await Promise.resolve();assert.deepEqual(calls,[{url:'./catalogues/torus-default.js?v=compact-collar-3',key:'torus:default'}]);
  const data=entry();finish(data);assert.equal(await first,data);assert.equal(loader.load('torus'),first);
});

function documentFixture(){
  const scripts=[];
  return {scripts,document:{createElement(name){assert.equal(name,'script');return {removed:false,remove(){this.removed=true;}};},
    head:{appendChild(script){scripts.push(script);}}}};
}
test('native script loading registers the complete catalogue and cleans up on success or error',async()=>{
  const fixture=documentFixture(),registry={};
  const loader=Catalogue.create({protocol:'file:',document:fixture.document,registry});
  const first=loader.load('double');assert.equal(fixture.scripts.length,1);
  const script=fixture.scripts[0];assert.equal(script.async,true);assert.equal(script.src,'./catalogues/double-default.js?v=compact-collar-3');
  const data=entry();registry['double:default']=data;script.onload();assert.equal(await first,data);
  assert.equal(script.removed,true);assert.equal(script.onload,null);assert.equal(script.onerror,null);
  const failing=loader.load('triple');fixture.scripts[1].onerror();assert.equal(await failing,null);
  assert.equal(fixture.scripts[1].removed,true);
  const retry=loader.load('triple');registry['triple:default']=entry();fixture.scripts[2].onload();
  assert.equal((await retry).schemaVersion,1);
});
test('timed-out script requests clean up and late callbacks cannot settle a retry',async()=>{
  const fixture=documentFixture(),registry={};let timeout;
  const loader=Catalogue.create({protocol:'file:',document:fixture.document,registry,
    setTimer:fn=>{timeout=fn;return 7;},clearTimer:id=>assert.equal(id,7)});
  const first=loader.load('torus'),late=fixture.scripts[0].onload;timeout();assert.equal(await first,null);
  assert.equal(fixture.scripts[0].removed,true);
  const second=loader.load('torus');const data=entry();registry['torus:default']=data;late();
  assert.equal(fixture.scripts[1].removed,false,'A stale callback cannot clean up the current request.');
  fixture.scripts[1].onload();assert.equal(await second,data);
});
test('HTTP catalogue failures can fall back to classic scripts without losing a valid result',async()=>{
  let scripts=0;
  const loader=Catalogue.create({protocol:'https:',registry:{},fetch:async()=>{throw Error('unavailable JSON');},
    loadScript:async(url,key)=>{scripts++;assert.equal(key,'double:alternate');return entry();}});
  assert.equal((await loader.load('double','alternate')).schemaVersion,1);assert.equal(scripts,1);
});
test('malformed local-file scripts do not poison later retries and unknown keys never insert scripts',async()=>{
  let scripts=0;
  const loader=Catalogue.create({protocol:'file:',registry:{},loadScript:async()=>++scripts===1?{}:entry()});
  assert.equal(await loader.load('torus'),null);assert.equal((await loader.load('torus')).schemaVersion,1);
  for(const [surface,preset]of [['../torus','default'],['torus','presentation'],['other','default']])
    assert.equal(await loader.load(surface,preset),null);
  assert.equal(scripts,2);
});
test('each local-file catalogue registers all unchanged full-precision JSON samples without fetch',()=>{
  const context={};
  for(const surface of ['torus','double','triple'])for(const preset of ['default','alternate']){
    const stem=path.join(__dirname,'catalogues',surface+'-'+preset);
    vm.runInNewContext(fs.readFileSync(stem+'.js','utf8'),context);
    const original=JSON.parse(fs.readFileSync(stem+'.json','utf8'));
    assert.deepEqual(JSON.parse(JSON.stringify(context.GeodesicCatalogueEntries[surface+':'+preset])),original);
  }
  assert.equal(Object.keys(context.GeodesicCatalogueEntries).length,6);
});
