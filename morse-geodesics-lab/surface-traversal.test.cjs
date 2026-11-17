'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Traversal=require('./surface-traversal.js');
function fixture(){
 const frames=new Map(),starts=[],commits=[],data={length:12},model={};let id=0;
 const flow=Traversal.create({window:{requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(n){frames.delete(n);}},onStart:t=>starts.push(t),onCommit:s=>commits.push(s)});
 const request=position=>flow.request({data,model,position});
 const study=T=>({type:'surface',data,T,profile:{rangePending:true,currentVerified:true},result:{points:[{},{}]}});
 const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
 return {flow,frames,starts,commits,data,model,request,study,tick};
}
test('continuous input completes exact frames and coalesces only the next requested endpoint',()=>{
 const v=fixture();for(const T of [4,5,6,7,8])v.request(T);
 assert.deepEqual(v.starts.map(t=>t.position),[4]);assert.equal(v.flow.snapshot().latest.position,8);
 assert.equal(v.flow.accept(v.study(4),v.model),true);assert.equal(v.commits[0].T,4);
 assert.equal(v.starts.length,1,'The completed endpoint gets a paint before the next solve.');
 v.request(9);v.tick();assert.deepEqual(v.starts.map(t=>t.position),[4,9]);
 assert.equal(v.flow.accept(v.study(8),v.model),false,'An obsolete intermediate position cannot be labelled current.');
 v.flow.accept(v.study(9),v.model);assert.deepEqual(v.commits.map(s=>s.T),[4,9]);assert.equal(v.flow.snapshot().pending,false);
});
test('no partial, foreign, hidden, or mismatched profile can commit a surface traversal frame',()=>{
 const v=fixture();v.request(5);
 for(const change of [{result:null},{data:{}},{T:6},{type:'hidden'},{profile:{rangePending:true,currentVerified:false}}])assert.equal(v.flow.accept({...v.study(5),...change},v.model),false);
 assert.equal(v.flow.accept(v.study(5),{}),false);assert.equal(v.commits.length,0);
 assert.equal(v.flow.accept(v.study(5+Number.EPSILON),v.model),true);
});
test('leaving the study or changing owner cancels queued work without committing stale endpoints',()=>{
 const v=fixture();v.request(4);v.request(7);v.flow.accept(v.study(4),v.model);
 const next=v.flow.cancel();assert.equal(next.position,7);assert.equal(v.frames.size,0);v.tick();assert.equal(v.starts.length,1);
 assert.equal(v.flow.accept(v.study(7),v.model),false);
 v.request(3);const other={length:12};v.flow.request({data:other,model:v.model,position:8});assert.equal(v.flow.snapshot().running.data,other);
 assert.equal(v.flow.accept(v.study(3),v.model),false);v.flow.destroy();assert.equal(v.flow.snapshot().pending,false);
});
test('hidden traversal commits only the requested mode type and cancels work on type changes',()=>{
 const v=fixture();v.flow.request({data:v.data,model:v.model,position:4,type:'hidden'});
 assert.equal(v.flow.accept(v.study(4),v.model),false);
 assert.equal(v.flow.accept({...v.study(4),type:'hidden'},v.model),true);
 v.flow.request({data:v.data,model:v.model,position:7,type:'hidden'});
 v.flow.request({data:v.data,model:v.model,position:7,type:'surface'});
 assert.equal(v.flow.snapshot().running.type,'surface');
 assert.equal(v.flow.accept({...v.study(7),type:'hidden'},v.model),false);
 assert.equal(v.flow.accept(v.study(7),v.model),true);
});
