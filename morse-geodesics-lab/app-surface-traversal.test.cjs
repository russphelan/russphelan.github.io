'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Traversal=require('./surface-traversal.js'),source=fs.readFileSync(require.resolve('./app.js'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-12,`${actual} should equal ${expected}`);}
function positions(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((v,i)=>near(v,expected[i]));}
function fixture({comparison=false,type='surface',open=true,hiddenDirection=1}={}){
 const nodes={},frames=new Map(),contexts=[],preparations=[],commits=[],data={length:12},model={};let frameId=0,draws=0;
 const node=()=>({value:'0',textContent:'',dataset:{},attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;}});
 const context={state:{travel:.25,playing:false,surgery:null},focusData:data,downhillStudy:null,surfaceTraversal:null,
  $:id=>nodes[id]||(nodes[id]=node()),clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),model:()=>model,
  updateText(id,value){context.$(id).textContent=value;},pauseReveal(){},syncDownhillLayout(){},clearDownhillGPU(){},
  requestDraw(){draws++;},downhillPreparation:{setContext(value){preparations.push(value);},snapshot:()=>({})},
  downhillControls:{snapshot:()=>({open,comparison,type}),setContext(value){contexts.push(value);context.receiveStudy({active:true,data:value.data,type,T:value.position,status:'preparing',result:null});}}};
 const callbackLine=source.split('\n').find(line=>line.includes('onUpdate:study=>')),callback=callbackLine.slice(callbackLine.indexOf('onUpdate:')+'onUpdate:'.length).trim();
 vm.runInNewContext(between('  function updateSurfaceTraversalUI()','  function clearNeckOverlay()')+'\nvar receiveStudy='+callback+';'+
  between('  function seekFromCutaway(s)','  function toggleTraversal()')+between("  $('travel').addEventListener('input'","  $('speed').addEventListener"),context);
 context.surfaceTraversal=Traversal.create({window:{requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}},
  onStart:context.startSurfaceTraversal,onCommit(study){commits.push(study.T);context.commitSurfaceTraversal(study);}});
 const study=T=>({active:true,data,type,T,mode:1,amplitude:type==='hidden'&&hiddenDirection===2?[0,.12]:[.12,0],profile:{rangePending:true,currentVerified:true},result:{points:[{},{}],length:{baseline:T}}});
 context.downhillStudy=study(3);
 const input=value=>{context.$('travel').value=String(value);context.$('travel').handlers.input();};
 const tick=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
 return {context,nodes,data,model,frames,contexts,preparations,commits,input,tick,study,draws:()=>draws};
}

test('continuous surface and hidden traversal keep exact rendered facts while solving only the latest next endpoint',()=>{
 for(const options of [{},{comparison:true},{type:'hidden'},{type:'hidden',hiddenDirection:2}]){
  const v=fixture(options),original=v.context.downhillStudy,amplitude=original.amplitude;
  for(const value of [.4,.5,.6,.8])v.input(value);
  positions(v.contexts.map(c=>c.position),[4.8]);assert.equal(v.context.state.travel,.25);
  near(v.nodes.travel.value,.8);assert.equal(v.context.activeDownhill(),original,'The previously verified path remains coherent during preparation.');
  assert.match(v.nodes.travel.attributes['aria-valuetext'],/Requested 80%; showing 25%/);
  const first=v.study(4.8);v.context.receiveStudy(first);
  near(v.context.state.travel,.4);assert.equal(v.context.activeDownhill(),first);assert.equal(v.nodes['travel-output'].textContent,'40%');
  assert.deepEqual(v.context.activeDownhill().amplitude,amplitude,'The accepted study keeps the physical push and direction.');
  near(v.nodes.travel.value,.8);assert.equal(v.contexts.length,1);
  v.tick();positions(v.contexts.map(c=>c.position),[4.8,9.6]);near(v.context.state.travel,.4);
  v.input(.9);v.input(.95);v.context.receiveStudy(v.study(7.2));positions(v.commits,[4.8]);
  v.context.receiveStudy(v.study(9.6));v.tick();positions(v.contexts.map(c=>c.position),[4.8,9.6,11.4]);
  v.context.receiveStudy(v.study(11.4));near(v.context.state.travel,.95);
  assert.equal(v.context.surfaceTraversal.snapshot().pending,false);near(v.context.activeDownhill().T,11.4);
  assert.deepEqual(v.context.activeDownhill().amplitude,amplitude);
 }
});

test('draw context follows the running exact calculation while visible traversal remains committed',()=>{
 const v=fixture();v.input(.4);v.input(.8);v.context.$('workspace');
 vm.runInNewContext('{'+between('    const studyContext=','    syncDownhillLayout();')+'}',v.context);
 near(v.preparations.at(-1).position,4.8);near(v.contexts.at(-1).position,4.8);
 assert.equal(v.context.state.travel,.25);assert.equal(v.context.activeDownhill().T,3);
});

test('pause and direct commands cancel queued traversal and reject old exact frames',()=>{
 const v=fixture();v.input(.4);v.input(.8);v.context.pauseTraversal();
 assert.equal(v.context.surfaceTraversal.snapshot().pending,false);near(v.context.state.travel,.8);near(v.nodes.travel.value,.8);
 v.context.receiveStudy(v.study(4.8));near(v.context.state.travel,.8);assert.equal(v.context.activeDownhill(),null);
 const other=fixture();other.input(.4);other.input(.7);other.context.cancelSurfaceTraversal({seekLatest:false});
 other.context.focusData={length:14};other.context.state.travel=.2;other.context.receiveStudy(other.study(4.8));
 assert.equal(other.context.state.travel,.2);assert.equal(other.context.activeDownhill(),null);
});

test('mode errors end the running flow while closed studies and zero traversal remain immediate',()=>{
 const v=fixture();v.input(.4);v.input(.8);v.context.receiveStudy({...v.study(4.8),status:'error',result:null});
 assert.equal(v.context.surfaceTraversal.snapshot().pending,false);near(v.context.state.travel,.8);
 const zero=fixture();zero.input(.4);zero.input(0);assert.equal(zero.context.state.travel,0);assert.equal(zero.context.surfaceTraversal.snapshot().pending,false);
 const hidden=fixture({type:'hidden',open:false});hidden.context.state.playing=true;hidden.input(.7);assert.equal(hidden.context.state.travel,.7);assert.equal(hidden.contexts.length,0);
 assert.equal(hidden.context.state.playing,false);assert.equal(hidden.nodes.play.attributes['aria-pressed'],'false');
});

test('the linked cutaway traversal uses the same exact current-push queue',()=>{
 const v=fixture({type:'hidden',hiddenDirection:2});
 v.context.seekFromCutaway(4.8);v.context.seekFromCutaway(9.6);
 near(v.context.state.travel,.25);positions(v.contexts.map(c=>c.position),[4.8]);
 v.context.receiveStudy(v.study(4.8));v.tick();positions(v.contexts.map(c=>c.position),[4.8,9.6]);
 v.context.receiveStudy(v.study(9.6));near(v.context.state.travel,.8);
 assert.deepEqual(v.context.activeDownhill().amplitude,[0,.12]);
});
