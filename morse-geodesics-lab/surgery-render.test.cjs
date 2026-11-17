'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const renderer=source.slice(source.indexOf('  function drawOperationLayersGL(display) {'),source.indexOf('  function drawMeshLayersFallback'));
function render(surfaceVisible,display,ready=false){
 const current={depth:true,mask:true,func:'LESS',color:[true,true,true,true]},draws=[];
 const gl={DEPTH_TEST:'DEPTH_TEST',LESS:'LESS',EQUAL:'EQUAL',LINES:'LINES',TRIANGLES:'TRIANGLES',
  enable(){current.depth=true;},disable(){current.depth=false;},depthMask(v){current.mask=v;},depthFunc(v){current.func=v;},colorMask(...v){current.color=v;}};
 const mesh={positions:[],normals:[]},uploads=[],wireBuilds=[],removed=[],surgeryGPU=new Map();
 const context={
  display,gl,state:{surgery:{snapshot:{surfaceVisible}}},operationMesh:()=>mesh,surgeryGPU:new Map(),
  surfaceGPU:ready?{name:'ordinary-surface'}:null,wireGPU:ready?{name:'ordinary-wire'}:null,
  upload:(positions,normals)=>{const item={positions,normals};uploads.push(item);return item;},wireData:()=>{wireBuilds.push(mesh);return mesh;},removeGPU:item=>removed.push(item),
  renderGPU:(item,type,rgb,mode=0,offset=0,alpha=1)=>draws.push({type,mode,offset,alpha,...current,color:[...current.color]})
 };
 context.surgeryGPU=surgeryGPU;
 const clear=source.slice(source.indexOf('  function clearSurgeryGPU()'),source.indexOf('  function wireData(',source.indexOf('  function clearSurgeryGPU()')));
 vm.runInNewContext(renderer+'\n'+clear+'\ndrawOperationLayersGL(display);',context);
 return {draws,current,uploads,wireBuilds,removed,context,surgeryGPU,
  draw(next){context.display=next;vm.runInNewContext('drawOperationLayersGL(display);',context);},
  cancel(){vm.runInNewContext('clearSurgeryGPU();',context);}};
}
test('initial and restored grid-only passes use the ordinary grid depth settings and opacity',()=>{
 for(const phase of ['fade-in','fade-out']){
  const {draws,current}=render(false,{phase,fill:0,grid:.18});
  assert.equal(draws.length,1);
  assert.deepEqual(draws[0],{type:'LINES',mode:1,offset:.003,alpha:.18,depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
  assert.deepEqual(current,{depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
 }
});
test('a faint filled shell is composited after the grid instead of changing grid visibility first',()=>{
 const {draws,current}=render(false,{phase:'fade-in',fill:1e-8,grid:.179999});
 assert.equal(draws[0].type,'LINES');assert.equal(draws[0].depth,true);assert.equal(draws[0].mask,true);
 assert.equal(draws[1].type,'TRIANGLES');assert.deepEqual(draws[1].color,[false,false,false,false]);
 assert.equal(draws[2].func,'EQUAL');assert.equal(draws[2].alpha,1e-8);
 assert.deepEqual(current,{depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
});
test('an originally filled-and-gridded view keeps the ordinary fill-then-grid ordering',()=>{
 const {draws,current}=render(true,{phase:'fade-out',fill:.55,grid:.18});
 assert.deepEqual(draws.map(d=>d.type),['TRIANGLES','TRIANGLES','LINES']);
 assert.equal(draws[2].depth,true);assert.equal(draws[2].mask,true);assert.equal(draws[2].func,'LESS');
 assert.deepEqual(current,{depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
});

test('preparation and source fades reuse the ordinary mesh and grid without changing draw passes',()=>{
 for(const surfaceVisible of [false,true])for(const phase of ['preparing','fade-in'])for(const fill of [0,1e-8,.55]){
  const display={phase,fill,grid:.18},cached=render(surfaceVisible,display,true),fresh=render(surfaceVisible,display);
  assert.deepEqual(cached.draws,fresh.draws,'Cached source geometry has identical layer order, depth settings, color masks, and opacity.');
  assert.equal(cached.uploads.length,0);assert.equal(cached.wireBuilds.length,0);
  assert.equal(cached.surgeryGPU.size,0,'Ordinary buffers must never be owned by surgery cleanup.');
  cached.cancel();assert.equal(cached.removed.length,0);
  assert.equal(cached.context.surfaceGPU.name,'ordinary-surface');assert.equal(cached.context.wireGPU.name,'ordinary-wire');
  cached.draw({...display,phase:'fade-in'});assert.equal(cached.uploads.length,0);
 }
});

test('new source buffers remain ordinary-owned and target fade buffers remain surgery-owned',()=>{
 const result=render(false,{phase:'preparing',fill:0,grid:.18});
 assert.equal(result.uploads.length,2);assert.equal(result.wireBuilds.length,1);
 const surface=result.context.surfaceGPU,wire=result.context.wireGPU;
 assert.ok(surface&&wire);assert.equal(result.surgeryGPU.size,0);
 result.cancel();assert.equal(result.removed.length,0,'Cancelling preserves newly allocated ordinary buffers too.');
 result.draw({phase:'fade-out',fill:.55,grid:.18});
 assert.equal(result.uploads.length,4);assert.equal(result.wireBuilds.length,2);assert.equal(result.surgeryGPU.size,2);
 const target=[...result.surgeryGPU.values()];
 assert.ok(target.every(item=>item!==surface&&item!==wire));
 result.cancel();assert.deepEqual(result.removed,target);assert.equal(result.surgeryGPU.size,0);
 assert.equal(result.context.surfaceGPU,surface);assert.equal(result.context.wireGPU,wire);
});
