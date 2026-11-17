'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./presentation.js');
const path=(id,group)=>({id,presentation:{group}});

test('adding a summand preserves inherited paths and reveals only the new group in supplied order',()=>{
  const curves=[path('a',1),path('new-b',2),path('old-c',1),path('new-d',2)];
  const before=JSON.stringify(curves),p=P.create({curves,stage:2,intervalMs:160});
  assert.deepEqual(p.snapshot().visibleIds,['a','old-c']);
  assert.equal(p.fraction('a'),1);assert.equal(p.fraction('new-b'),0);
  p.play();let s=p.advance(80);
  assert.equal(s.activeId,'new-b');assert.equal(s.activeProgress,.5);
  assert.deepEqual(s.visibleIds,['a','old-c','new-b']);assert.equal(p.fraction('new-b'),.5);assert.equal(p.fraction('new-d'),0);
  s=p.advance(80);assert.deepEqual(s.completeIds,['a','old-c','new-b']);assert.equal(s.activeId,'new-d');
  assert.equal(p.fraction('new-b'),1);assert.equal(JSON.stringify(curves),before);
});
test('one summand begins without inherited paths and completion stops playback',()=>{
  const p=P.create({curves:[path('a',1),path('b',1)],stage:1,intervalMs:80});
  assert.equal(p.snapshot().shown,0);assert.equal(p.snapshot().playing,false);
  p.play();p.advance(80);const s=p.advance(80);
  assert.equal(s.done,true);assert.equal(s.playing,false);assert.equal(s.activeId,null);
  assert.equal(s.shown,2);assert.equal(s.progress,1);assert.equal(p.play().playing,false);
});
test('paused, hidden, and unready frames do not advance and delayed frames cannot skip a batch',()=>{
  const p=P.create({curves:[path('a',1),path('b',1)],stage:1,intervalMs:1000});
  assert.equal(p.advance(30000).progress,0);p.play();
  assert.equal(p.advance(30000,{active:false}).progress,0);
  assert.equal(p.advance(30000,{ready:false}).progress,0);
  assert.equal(p.advance(30000).activeProgress,.08);
  p.pause();assert.equal(p.advance(30000).activeProgress,.08);
  p.play();assert.equal(p.advance(0).activeProgress,.08);
});
test('manual next, show all, and replay preserve older groups and expose consistent selection ids',()=>{
  const p=P.create({curves:[path('old',1),path('a',3),path('b',3)],stage:3,intervalMs:160});
  p.play();p.advance(80);let s=p.next();
  assert.equal(s.playing,false);assert.deepEqual(s.visibleIds,['old','a']);assert.equal(s.activeId,'b');
  s=p.showAll();assert.deepEqual(s.completeIds,['old','a','b']);assert.equal(s.done,true);
  s=p.replay();assert.deepEqual(s.visibleIds,['old']);assert.equal(s.playing,true);
  s=p.replay({playing:false});assert.equal(s.playing,false);assert.equal(p.fraction('missing'),0);
  s.visibleIds.push('untrusted');assert.deepEqual(p.snapshot().visibleIds,['old']);
});
test('empty and all-inherited stages are complete without playback and invalid inputs are rejected',()=>{
  for(const curves of [[],[path('old',1)]]){
    const p=P.create({curves,stage:2});assert.equal(p.snapshot().done,true);assert.equal(p.play().playing,false);
    assert.equal(p.snapshot().progress,1);
  }
  for(const args of [{stage:1},{curves:[],stage:4},{curves:[],stage:1,intervalMs:0},
    {curves:[path('x',1),path('x',1)],stage:1},{curves:[path('x',3)],stage:2}])assert.throws(()=>P.create(args));
  const p=P.create({curves:[],stage:1});for(const dt of [-1,NaN,Infinity])assert.throws(()=>p.advance(dt));
});
test('UMD browser entry has no DOM, timer, solver, or external dependency',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),context={};
  vm.runInNewContext(fs.readFileSync(require.resolve('./presentation.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicPresentation.create,'function');
});
