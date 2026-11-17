'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Showcase=require('./showcase.js');
const Data=require('./showcase-data.js');
const S=require('./surface.js');
const J=require('./jacobi.js');

test('bookmarks resolve the existing refined conjugate event rather than a rounded slider position',()=>{
  for(const item of Data.picks){
    const pick=Showcase.findPick(Data,item.id);
    assert.equal(pick,item);
    const curve=Data.curves.find(c=>c.id===pick.curveId),fields=J.prepare(curve,S.getModel('double'),.36);
    for(const type of ['surface','hidden']){
      const event=Showcase.resolveEvent(fields,pick,type);
      assert.ok(fields.interiorEvents.includes(event));
      assert.equal(event.multiplicity,type==='surface'?1:2);
      assert.equal(Showcase.beforePosition(fields,pick,type),Math.max(0,event.s-.4)/fields.length);
      assert.ok(Showcase.beforePosition(fields,pick,type)*fields.length<event.s);
    }
  }
});

test('small stored bookmark differences use the actual event and never create or merge a zero',()=>{
  const event={s:5.235987755982989,hidden:true,surface:false,multiplicity:2,endpoint:false};
  const fields={length:10,interiorEvents:[event]};
  const pick={hiddenEventS:event.s+1e-8,surfaceEventS:6};
  assert.equal(Showcase.resolveEvent(fields,pick,'hidden'),event);
  assert.equal(Showcase.beforePosition(fields,pick,'hidden'),(event.s-.4)/10);
  assert.equal(Showcase.resolveEvent(fields,pick,'surface'),null);
  assert.equal(Showcase.resolveEvent(fields,{...pick,hiddenEventS:event.s+.001},'hidden'),null);
  assert.equal(Showcase.resolveEvent({...fields,interiorEvents:[{...event,endpoint:true}]},pick,'hidden'),null);
});

test('unknown or malformed picks and missing field events fail gracefully',()=>{
  for(const id of ['absent','',null,undefined])assert.equal(Showcase.findPick(Data,id),null);
  assert.equal(Showcase.findPick(null,'clear-pinch'),null);
  assert.equal(Showcase.findPick({picks:Data.picks,curves:[]},'clear-pinch'),null);
  assert.equal(Showcase.resolveEvent(null,Data.picks[0],'surface'),null);
  assert.equal(Showcase.resolveEvent({interiorEvents:[]},Data.picks[0],'other'),null);
  assert.equal(Showcase.beforePosition({length:0,interiorEvents:[]},Data.picks[0],'surface'),null);
  assert.equal(Showcase.beforePosition({length:10,interiorEvents:[]},Data.picks[0],'surface'),null);
});
