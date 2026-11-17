'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('./view-modes.js'),curves=[{id:'a'},{id:'b'}];
test('overview clears selection and renders every path at full index color and opacity',()=>{
 const view=V.layout('all',curves,'a');
 assert.equal(view.selected,null);assert.deepEqual(view.paths,curves);
 for(const c of curves)assert.deepEqual(V.style('all',c,view.selected),{emphasized:false,opacity:1});
});
test('inspection highlights one path but retains the collection as context',()=>{
 const view=V.layout('focus',curves,'b');assert.equal(view.selected,curves[1]);assert.deepEqual(view.paths,curves);
 assert.deepEqual(V.style('focus',curves[0],view.selected),{emphasized:false,opacity:.3});
 assert.deepEqual(V.style('focus',curves[1],view.selected),{emphasized:true,opacity:1});
});
test('solo keeps the chosen path and recovers gracefully when a cutoff hides it',()=>{
 assert.deepEqual(V.layout('solo',curves,'b').paths,[curves[1]]);
 assert.equal(V.layout('solo',[curves[0]],'b').selected,curves[0]);
 for(const mode of ['all','focus','solo'])assert.deepEqual(V.layout(mode,[],null),{selected:null,paths:[]});
 assert.throws(()=>V.layout('invalid',curves,null),RangeError);
});
