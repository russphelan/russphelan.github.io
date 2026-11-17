'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./solver-worker.js'),'utf8');
function worker(search){
 const messages=[],imports=[];
 const self={GeodesicSolver:{search},postMessage(value){messages.push(value);}};
 vm.runInNewContext(source,{self,importScripts(...files){imports.push(...files);}});
 return {messages,imports,send:data=>self.onmessage({data})};
}
test('search worker delivers each geometry once and completes without cloning the catalogue again',async()=>{
 const curves=[{id:'a',points:[[1,2,3],[4,5,6]]},{id:'b',points:[[7,8,9],[10,11,12]]}];
 const progress={percent:42,nextSeed:156,total:356,stopReason:'curve-limit'};
 Object.defineProperty(curves,'searchProgress',{value:progress});
 const w=worker(async(options,onCurve,onProgress)=>{assert.equal(options.round,2);for(const curve of curves)onCurve(curve);onProgress(progress);return curves;});
 await w.send({type:'search',options:{round:2}});
 assert.deepEqual(w.imports,['./compact-collar.js?v=compact-collar-3','./surface.js?v=compact-collar-3','./solver.js?v=compact-collar-3']);
 assert.deepEqual(w.messages.filter(m=>m.type==='curve').map(m=>m.curve),curves);
 assert.equal(w.messages.filter(m=>m.type==='done').length,1);
 const done=w.messages.at(-1);assert.equal(done.type,'done');assert.deepEqual(Object.keys(done),['type','progress'],
  'Completion sends only the small coverage record, not the already-delivered geometry.');
 assert.deepEqual(done.progress,progress);assert.equal(done.progress.percent,42,
  'A trajectory cap must not be presented as exhaustive seed coverage.');
});
test('chunk options pass through and accepted curves arrive before their completed cursor',async()=>{
 const final={nextSeed:7,total:172,stopReason:'attempt-limit'};
 const w=worker(async(options,onCurve,onProgress)=>{
  assert.equal(options.startSeed,5);assert.equal(options.maxAttempts,2);
  onProgress({nextSeed:5,total:172});onCurve({id:'sixth'});onProgress({nextSeed:6,total:172});
  onProgress(final);return Object.defineProperty([],'searchProgress',{value:final});
 });
 await w.send({type:'search',options:{startSeed:5,maxAttempts:2}});
 assert.deepEqual(w.messages.map(m=>m.type),['progress','curve','progress','progress','done']);
 assert.equal(w.messages[2].progress.nextSeed,6);assert.deepEqual(w.messages.at(-1).progress,final);
});
test('cancellation and replacement prevent old worker curves, progress, or completion from leaking',async()=>{
 const pending=[];
 const w=worker((options,onCurve,onProgress,shouldCancel)=>new Promise(resolve=>pending.push({options,onCurve,onProgress,shouldCancel,resolve})));
 const first=w.send({type:'search',options:{round:1}});await w.send({type:'cancel'});
 assert.equal(pending[0].shouldCancel(),true);pending[0].onCurve({id:'stale'});pending[0].onProgress({percent:50});pending[0].resolve([]);await first;
 assert.equal(w.messages.length,0);
 const second=w.send({type:'search',options:{round:2}}),third=w.send({type:'search',options:{round:3}});
 assert.equal(pending[1].shouldCancel(),true);assert.equal(pending[2].shouldCancel(),false);
 pending[1].onCurve({id:'superseded'});pending[1].resolve([]);await second;
 pending[2].onCurve({id:'current'});pending[2].onProgress({percent:100});pending[2].resolve([]);await third;
 assert.deepEqual(w.messages.map(m=>m.type),['curve','progress','done']);assert.equal(w.messages[0].curve.id,'current');
});
test('worker reports active errors but suppresses errors from cancelled work',async()=>{
 const w=worker(async()=>{throw Error('failed solve');});await w.send({type:'search'});
 assert.equal(w.messages[0].type,'error');assert.equal(w.messages[0].message,'failed solve');
 let reject;
 const cancelled=worker(()=>new Promise((resolve,fail)=>{reject=fail;}));const run=cancelled.send({type:'search'});
 await cancelled.send({type:'cancel'});reject(Error('stale failure'));await run;assert.equal(cancelled.messages.length,0);
});
