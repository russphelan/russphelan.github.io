'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('./surface-mode-comparison.js');
function fixture(settings={}){
 const nodes={},tasks=new Map(),calls=[],emissions=[],seeks=[],charts=[];let serial=0,pauses=0,component;
 const element=()=>({style:{},attributes:{},handlers:{},value:'0',textContent:'',innerHTML:'',disabled:false,
  addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];},setAttribute(k,v){this.attributes[k]=String(v);}});
 const doc={hidden:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];}};
 doc.defaultView={setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);},
  GeodesicEnergyLandscape:{create(){return {setContext(value){charts.push(value);},destroy(){}};}},
  GeodesicDownhill:{prepare(options){
   calls.push(options);const {mode,T}=options,lambda=settings.eigenvalue?settings.eigenvalue(options):mode*mode-T;
   const status=Math.abs(lambda)<1e-8?'neutral':lambda<0?'downhill':'uphill';
   const length=a=>({length:T+lambda*a*a,baseline:T,delta:lambda*a*a,relativeChange:lambda*a*a/T,error:0,verified:true});
   return {T,type:'surface',mode,eigenvalue:lambda,status,maxAmplitude:settings.cap?settings.cap(options):mode===1?.12:.08,coefficient:s=>s*(T-s)*(mode===1?1:T/2-s),length,
    sample(a){return {points:[{s:0,point:[0,0,0]},{s:T/2,point:[T/2,a*mode,0]},{s:T,point:[T,0,0]}],samples:[],length:length(a)};}}}
 }};
 const root={...element(),dataset:{},id:'comparison-test',ownerDocument:doc,classList:{add(){}},querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];return nodes[key]||(nodes[key]=element());}};
 component=C.create(root,{preparation:settings.preparation,onUpdate(value){emissions.push(value);},onSeek(T){seeks.push(T);component.setContext({position:T});},onPause(){pauses++;}});
 const data={length:12,events:[{s:3,surface:true},{s:5,hidden:true},{s:7,surface:true},{s:8,hidden:true}]},model={};
 const set=(next={})=>component.setContext({active:true,data,model,position:9,...next});
 const next=()=>{const item=tasks.entries().next().value;if(!item)return false;tasks.delete(item[0]);item[1]();return true;};
 const flush=()=>{let n=0;while(next())assert.ok(++n<100);};
 const click=name=>nodes[name].handlers.click();
 const push=value=>{nodes.push.value=String(value);nodes.push.handlers.input();};
 return {component,root,nodes,doc,tasks,calls,emissions,seeks,charts,data,model,set,next,flush,click,push,pauses:()=>pauses};
}
test('surface endpoint preset passes the second surface focus without crossing the next event or endpoint',()=>{
 const data={length:12,events:[{s:3,surface:true},{s:5,hidden:true},{s:7,surface:true},{s:7.1,hidden:true}]};
 assert.ok(C.secondSurfaceEnd(data)>7);assert.ok(C.secondSurfaceEnd(data)<7.1);
 assert.equal(C.secondSurfaceEnd({length:2,events:[{s:1,surface:true}]}),null);
});
test('surface focus shortcuts reuse the focus-study bookmarks and count only interior surface events',()=>{
 const D=require('./downhill-controls.js'),data={length:10,events:[
  {s:7.005,hidden:true},{s:0,surface:true},{s:3,surface:true,hidden:true},{s:7,surface:true},
  {s:6.99,hidden:true},{s:1,hidden:true},{s:8,surface:true,endpoint:true},{s:10,surface:true},
  {s:NaN,surface:true},{s:-1,surface:true}]};
 assert.equal(C.surfaceFocus(data,1).s,3);assert.equal(C.surfaceFocus(data,2).s,7);assert.equal(C.surfaceFocus(data,3),null);
 for(const mode of [1,2])for(const where of ['before','at','after']){
  const choice=D.eventChoices(data).find(row=>row.type==='surface'&&row.mode===mode);
  assert.equal(C.focusBookmark(data,mode,where),D.bookmark(choice,where,data.length));
 }
 assert.ok(C.focusBookmark(data,2,'before')>6.99);assert.ok(C.focusBookmark(data,2,'after')<7.005);
 assert.equal(C.focusBookmark(data,2,'at'),7);assert.equal(C.focusBookmark(data,3,'at'),null);
 assert.equal(C.focusBookmark(null,1,'at'),null);assert.equal(C.focusBookmark(data,1,'invalid'),null);
 const prepared={...data,interiorEvents:data.events.filter(e=>Number.isFinite(e.s)&&e.s>0&&e.s<data.length&&!e.endpoint)};
 assert.deepEqual(C.surfaceFocus(prepared,2),C.surfaceFocus(data,2));
});
test('before, at and after follow the selected surface mode, keep signed push, and recompute both modes on one segment',()=>{
 const v=fixture({eigenvalue:({mode,T})=>(mode===1?3:7)-T});v.set();v.flush();v.push(-75);
 assert.equal(v.nodes['focus-label'].textContent,'Mode 1 · +1 focus at 3.000');
 for(const [where,T,status]of [['before',2.8,'uphill'],['at',3,'neutral'],['after',3.2,'downhill']]){
  v.click(where);assert.equal(v.component.snapshot().T,T);assert.equal(v.component.snapshot().mode,1);
  assert.equal(v.component.snapshot().amplitude,-.06);assert.equal(v.nodes[where].attributes['aria-pressed'],'true');
  assert.equal(v.emissions.at(-1).result,null,'A new interval cannot show a stale finite length.');v.flush();
  assert.equal(v.component.snapshot().statuses[0],status);assert.equal(v.component.snapshot().amplitude,-.06);
  assert.ok(v.calls.slice(-2).every(call=>call.T===T));assert.deepEqual(v.emissions.at(-1).displayProfiles.map(profile=>profile.T),[T,T]);
 }
 const seeks=v.seeks.slice();v.click('two');assert.deepEqual(v.seeks,seeks,'Mode selection itself keeps both segment endpoints fixed.');
 assert.equal(v.nodes['focus-label'].textContent,'Mode 2 · +1 focus at 7.000');
 for(const [where,T,status]of [['before',6.8,'uphill'],['at',7,'neutral'],['after',7.2,'downhill']]){
  v.click(where);v.flush();assert.equal(v.component.snapshot().mode,2);assert.equal(v.component.snapshot().T,T);
  assert.equal(v.component.snapshot().statuses[1],status);assert.equal(v.component.snapshot().statuses[0],'downhill');
  assert.equal(v.component.snapshot().amplitude,-.06);assert.equal(v.nodes.push.value,-75);
  assert.equal(v.nodes[where].attributes['aria-pressed'],'true');assert.ok(v.calls.slice(-2).every(call=>call.T===T));
 }
 assert.deepEqual(v.seeks,[2.8,3,3.2,6.8,7,7.2]);assert.ok(v.pauses()>=6);v.component.destroy();
});
test('focus shortcuts retain signed maximum intent across changes in the verified common range',()=>{
 for(const sign of [-1,1]){
  const v=fixture({cap:({T})=>T<3?.02:T===3?.04:.08});v.set();v.flush();v.push(sign*100);
  for(const [where,expected]of [['before',.02],['at',.04],['after',.08]]){
   v.click(where);assert.equal(v.nodes.push.value,sign*100);v.flush();
   assert.equal(v.component.snapshot().amplitude,sign*expected);assert.equal(v.nodes.push.value,sign*100);
   assert.equal(v.component.snapshot().maxAmplitude,expected);assert.deepEqual(v.emissions.at(-1).result,v.emissions.at(-1).profile.sample(sign*expected));
  }
  v.click('two');v.click('at');v.flush();assert.equal(v.component.snapshot().mode,2);assert.equal(v.nodes.push.value,sign*100);
  v.component.destroy();
 }
});
test('a mode without an interior focus remains selectable while its endpoint shortcuts are disabled',()=>{
 const v=fixture(),data={length:9,events:[{s:3,surface:true},{s:5,hidden:true},{s:7,surface:true,endpoint:true}]};
 v.set({data,position:6});v.flush();v.click('two');
 assert.equal(v.nodes.two.disabled,false);assert.equal(v.component.snapshot().mode,2);
 assert.equal(v.nodes['focus-label'].textContent,'Mode 2 · no interior +1 focus on this path');
 const emissions=v.emissions.length,pauses=v.pauses();
 for(const where of ['before','at','after']){
  assert.equal(v.nodes[where].disabled,true);assert.equal(v.nodes[where].attributes['aria-pressed'],'false');v.click(where);
 }
 assert.equal(v.pauses(),pauses);assert.deepEqual(v.seeks,[]);assert.equal(v.emissions.length,emissions);
 v.click('one');assert.equal(v.nodes.at.disabled,false);v.click('at');v.flush();assert.equal(v.component.snapshot().T,3);
 v.set({surgery:true});for(const where of ['before','at','after'])assert.equal(v.nodes[where].disabled,true);
 v.component.destroy();
});
test('closely neighboring conjugate points keep safe endpoints and an unambiguous active shortcut',()=>{
 const v=fixture(),data={length:10,events:[{s:3,surface:true},{s:6.9999999,hidden:true},{s:7,surface:true},{s:7.0000001,hidden:true}]};
 v.set({data});v.flush();v.click('two');
 for(const where of ['before','after','at']){
  v.click(where);v.flush();const T=v.component.snapshot().T;
  if(where==='before')assert.ok(T>6.9999999&&T<7);else if(where==='after')assert.ok(T>7&&T<7.0000001);else assert.equal(T,7);
  assert.equal(v.nodes[where].attributes['aria-pressed'],'true');
  assert.equal(['before','at','after'].filter(name=>v.nodes[name].attributes['aria-pressed']==='true').length,1);
 }
 v.component.destroy();
});
test('two actual coefficient patterns share a fixed interval and common physical push, while switching only changes mode',()=>{
 const v=fixture();v.set();assert.equal(v.calls.length,0);assert.equal(v.tasks.size,1);v.flush();
 assert.deepEqual(v.calls.map(({T,mode,type})=>[T,mode,type]),[[9,1,'surface'],[9,2,'surface']]);
 assert.ok(v.calls.every(call=>!('eventS'in call)),'No event is used to change the fixed segment.');
 assert.equal(v.component.snapshot().maxAmplitude,.08);
 v.push(50);const first=v.emissions.at(-1);assert.equal(first.amplitude[0],.04);assert.equal(first.mode,1);
 const shapes=v.nodes.shapes.innerHTML;assert.match(shapes,/Computed surface Hessian modes/);assert.match(shapes,/T=9.000/);
 v.click('two');const second=v.emissions.at(-1);
 assert.equal(second.mode,2);assert.equal(second.T,first.T);assert.equal(second.data,first.data);assert.deepEqual(second.amplitude,first.amplitude);
 assert.equal(first.displayMagnification,3);assert.equal(second.displayMagnification,3);
 assert.equal(first.displayMaxAmplitude,.08);assert.equal(second.displayMaxAmplitude,.08);
 assert.equal(first.displayProfiles,second.displayProfiles,'Both modes share one display-scale reference.');
 assert.deepEqual(first.displayProfiles.map(p=>p.mode),[1,2]);
 assert.equal(v.seeks.length,0);assert.equal(v.calls.length,2);assert.equal(second.comparison,true);
 assert.notEqual(first.result.length.length,second.result.length.length,'Different finite curves have separately measured lengths.');
 const chart=v.charts.at(-1);assert.equal(chart.comparisonKind,'modes');assert.equal(chart.curves.length,2);
 assert.equal(chart.curves[1].color,'#8c6c1d');assert.equal(v.nodes['result-two'].style.color,chart.curves[1].color);
 assert.match(v.nodes.shapes.innerHTML,/gold: mode 2/);assert.match(v.nodes.shapes.innerHTML,/stroke="#8c6c1d"/);
 assert.doesNotMatch(v.nodes.shapes.innerHTML,/purple: mode 2|#8a6ab0/);
 assert.equal(chart.maxAmplitude,.08);assert.equal(chart.activeKey,'mode-2');assert.equal(chart.axisMode,'signed');
 assert.ok(chart.curves.every(curve=>curve.samples[0].amplitude===-.08&&curve.samples.at(-1).amplitude===.08));
 assert.equal(chart.curves[0].sampleAt(.081),null);
 assert.equal(chart.curves[0].sampleAt(.02).relativeChange,first.profile.length(.02).relativeChange);
 assert.match(v.nodes['result-one'].textContent,/λ =/);assert.match(v.nodes['result-two'].textContent,/length change/);
 assert.match(v.root.innerHTML,/Jacobi fields only when their eigenvalue is zero/);v.component.destroy();
});
test('the pattern drawing samples the computed coefficient itself, without substituting sines',()=>{
 const p={T:4,coefficient:s=>s*(4-s)};assert.deepEqual(C.shapeSamples(p,4),[{s:0,f:0},{s:1,f:3},{s:2,f:4},{s:3,f:3},{s:4,f:0}]);
});
test('traversal and the explicit endpoint preset retain the signed physical push on the new segment',()=>{
 const v=fixture();v.set();v.flush();v.push(-75);v.click('two');
 v.set({position:10});assert.equal(v.component.snapshot().amplitude,-.06);assert.equal(v.nodes.push.value,-75);
 assert.equal(v.component.snapshot().pending,true);assert.equal(v.emissions.at(-1).result,null,'A retained push must not display the old segment’s result.');
 v.flush();assert.equal(v.component.snapshot().amplitude,-.06);assert.deepEqual(v.seeks,[]);
 assert.equal(v.emissions.at(-1).result.length.delta,v.emissions.at(-1).profile.length(-.06).delta);
 v.click('past-second');v.flush();
 assert.deepEqual(v.seeks,[7.2]);assert.equal(v.component.snapshot().T,7.2);assert.equal(v.component.snapshot().amplitude,-.06);
 assert.equal(v.component.snapshot().mode,2);assert.ok(v.emissions.filter(Boolean).slice(-1).every(s=>s.T===7.2));
 assert.ok(v.calls.slice(-2).every(call=>call.T===7.2));v.component.destroy();
});
test('explicit signed maximum settings follow the verified common cap and survive zero-cap segments',()=>{
 for(const sign of [-1,1]){
  const v=fixture({cap:({T})=>T===11?0:T>=10?.04:.08});v.set();v.flush();v.push(sign*100);v.click('two');
  v.set({position:10});assert.equal(v.nodes.push.value,sign*100);assert.equal(v.component.snapshot().amplitude,sign*.08);v.flush();
  assert.equal(v.component.snapshot().amplitude,sign*.04);assert.equal(v.nodes.push.value,sign*100);assert.equal(v.component.snapshot().mode,2);
  v.set({position:11});v.flush();assert.equal(Math.abs(v.component.snapshot().amplitude),0);assert.equal(v.nodes.push.value,sign*100);assert.equal(v.nodes.push.disabled,true);
  v.set({position:0});assert.equal(v.nodes.push.value,sign*100);assert.equal(v.nodes.push.disabled,true);
  v.set({position:9});v.flush();assert.equal(v.component.snapshot().amplitude,sign*.08);assert.equal(v.nodes.push.value,sign*100);
  v.click('past-second');v.flush();assert.equal(v.component.snapshot().amplitude,sign*.08);assert.equal(v.component.snapshot().mode,2);
  v.set({model:{}});v.flush();assert.equal(v.component.snapshot().amplitude,0,'A different metric starts a new study.');assert.equal(v.nodes.push.value,0);
  v.push(sign*100);v.set({active:false});assert.equal(v.component.snapshot().amplitude,0);v.set();v.flush();assert.equal(v.component.snapshot().amplitude,0);assert.equal(v.nodes.push.value,0);
  v.component.destroy();
 }
});
test('interior settings retain physical amplitude and a programmatic endpoint clamp never selects maximum intent',()=>{
 const v=fixture({cap:({T})=>T>=10?.04:.08});v.set();v.flush();v.push(-75);
 v.set({position:10});v.flush();assert.equal(v.component.snapshot().amplitude,-.04);assert.equal(v.nodes.push.value,-100);
 v.set({position:9});v.flush();assert.equal(v.component.snapshot().amplitude,-.04);assert.equal(v.nodes.push.value,-50);
 v.push(100);v.push(50);v.set({position:10});v.flush();v.set({position:9});v.flush();
 assert.equal(v.component.snapshot().amplitude,.04);assert.equal(v.nodes.push.value,50,'Explicit interior input clears the previous maximum selection.');
 v.push(100);v.push(0);v.set({position:10});v.flush();v.set({position:9});v.flush();assert.equal(v.component.snapshot().amplitude,0);assert.equal(v.nodes.push.value,0);v.component.destroy();
});
test('one-ulp traversal roundtrips cannot abandon preparation or make mode selection stick',()=>{
 const v=fixture(),position=9.1,roundtrip=position+8*Number.EPSILON;
 assert.notEqual(position,roundtrip);assert.ok(Math.abs(position-roundtrip)<1e-10);
 v.set({position});v.set({position:roundtrip});v.flush();
 assert.equal(v.component.snapshot().pending,false);assert.equal(v.tasks.size,0);
 assert.equal(v.nodes.push.disabled,false);assert.equal(v.component.snapshot().T,position);
 assert.ok(v.calls.every(call=>call.T===position),'Profiles and displayed interval use the same canonical endpoint.');
 v.push(50);
 const points=new Map();
 for(const mode of [1,2,1,2,2,1,2,1]){
  v.click(mode===1?'one':'two');
  const packet=v.emissions.at(-1);
  assert.equal(packet.mode,mode);assert.equal(packet.profile.mode,mode);assert.equal(packet.T,position);
  assert.deepEqual(packet.amplitude,[.04,0]);assert.ok(packet.result);
  const shape=JSON.stringify(packet.result.points.map(p=>p.point));
  if(points.has(mode))assert.equal(shape,points.get(mode),'Returning to a mode restores its own deformation.');
  points.set(mode,shape);
 }
 assert.notEqual(points.get(1),points.get(2),'The 3D consumer receives different geometry for the two modes.');
 assert.equal(v.calls.length,2,'Repeated selection reuses the two correct profiles.');v.component.destroy();
});
test('the second showcase endpoint shortcut survives traversal roundtrips and neighboring floats',()=>{
 const S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
 const data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),S.getModel('double'));
 const endpoint=C.secondSurfaceEnd(data),roundtrip=endpoint/data.length*data.length;
 // The current preset may round-trip exactly. Explicit adjacent binary64
 // values keep the tolerance regression exercised for either numerical case.
 const floats=new Float64Array([endpoint]),bits=new BigUint64Array(floats.buffer);
 bits[0]+=1n;const above=floats[0];bits[0]-=2n;const below=floats[0];
 assert.ok(below<endpoint&&above>endpoint);
 const v=fixture();v.set({data,position:endpoint});
 for(const position of [roundtrip,above,below]){
  assert.ok(Math.abs(position-endpoint)<1e-10);v.set({data,position});
 }
 v.flush();
 assert.equal(v.component.snapshot().pending,false);assert.equal(v.component.snapshot().T,endpoint);
 assert.equal(v.emissions.at(-1).T,endpoint);assert.equal(v.nodes.push.disabled,false);
 assert.equal(v.calls.length,2);assert.ok(v.calls.every(call=>call.T===endpoint));v.component.destroy();
});
test('a real showcase first-tick cap reduction cannot ratchet the maximum push down',()=>{
 const H=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js'),model=S.getModel('double');
 const data=J.prepare(D.curves.find(curve=>curve.id==='showcase-neck-return'),model),v=fixture();
 v.doc.defaultView.GeodesicDownhill.prepare=H.prepare;v.set({data,model,position:9});v.flush();const largeCap=v.component.snapshot().maxAmplitude;
 v.push(100);v.click('two');v.set({data,model,position:data.length*.00001});v.flush();const shortCap=v.component.snapshot().maxAmplitude;
 assert.ok(shortCap>0&&shortCap<largeCap,'The first legal nonzero traversal tick has a smaller checked common range.');
 assert.equal(v.component.snapshot().amplitude,shortCap);assert.equal(v.nodes.push.value,100);
 v.set({data,model,position:9});v.flush();assert.equal(v.component.snapshot().amplitude,largeCap);assert.equal(v.nodes.push.value,100);
 const packet=v.emissions.at(-1);assert.deepEqual(packet.result.length,packet.profile.length(largeCap));v.component.destroy();
});
test('closed comparison performs no work, stale work cannot render after a segment change, and model identity owns caches',()=>{
 const v=fixture();v.set({active:false});assert.equal(v.tasks.size,0);assert.equal(v.calls.length,0);
 v.set();const stale=Array.from(v.tasks.values())[0];v.set({position:10});const n=v.charts.length;stale();assert.equal(v.charts.length,n);v.flush();
 assert.ok(v.calls.every(call=>call.T===10));v.set({position:10,model:{}});v.flush();assert.equal(v.calls.length,4);
 v.set({active:false});assert.equal(v.tasks.size,0);assert.equal(v.emissions.at(-1),null);v.component.destroy();
});
test('hiding or destroying cancels queued profiles and never emits an active comparison',()=>{
 for(const action of ['hidden','destroy']){
  const v=fixture();v.set();const stale=Array.from(v.tasks.values())[0];
  if(action==='hidden'){v.doc.hidden=true;v.doc.handlers.visibilitychange();}else v.component.destroy();
  assert.equal(v.tasks.size,0);assert.equal(v.emissions.at(-1),null);const n=v.charts.length;stale();assert.equal(v.charts.length,n);
  if(action==='hidden')v.component.destroy();
 }
});

function preparedProfiles(T=9){
 const v=fixture();v.set({position:T});v.flush();const profiles=v.emissions.at(-1).displayProfiles;v.component.destroy();return profiles;
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
function exactCurrentProfiles(T,A,referenceAmplitude){
 return preparedProfiles(T).map(profile=>({...profile,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:A,displayReferenceAmplitude:referenceAmplitude,
  length(a){assert.equal(a,A,'A current-only profile may not be scanned over an unverified range.');return profile.length(a);},
  sample(a){assert.equal(a,A,'The displayed push must be the exact verified current amplitude.');return profile.sample(a);}}));
}

test('current-only pairs display the retained exact push before their slider ranges finish',async()=>{
 const nine=preparedProfiles(9),ten=preparedProfiles(10),current=[],ranges=[];ten[1]={...ten[1],maxAmplitude:.04};
 const service={peek:request=>request.T===9?nine[request.mode-1]:null,
  requestCurrent(options,A,settings){return new Promise((resolve,reject)=>current.push({options,A,settings,resolve,reject}));},
  request(options,settings){return new Promise((resolve,reject)=>ranges.push({options,settings,resolve,reject}));}};
 const v=fixture({preparation:service});v.set();v.push(100);v.click('two');v.set({position:10});
 assert.equal(v.nodes.push.value,100);assert.equal(current.length,2);assert.equal(ranges.length,2);
 assert.ok(current.every(job=>job.A===.08&&job.settings.referenceAmplitude===.08));assert.ok(ranges.every(job=>job.settings.priority==='reference'));
 const live=exactCurrentProfiles(10,.08,.08);current[0].resolve(live[0]);current[1].resolve(live[1]);await settle();
 assert.equal(v.component.snapshot().pending,false);assert.equal(v.component.snapshot().rangePending,true);assert.equal(v.component.snapshot().maxAmplitude,0);
 assert.equal(v.nodes.push.disabled,true);assert.equal(v.nodes.push.value,100);assert.equal(v.component.snapshot().amplitude,.08);
 assert.match(v.nodes.status.textContent,/Current push verified; checking slider range/);
 const packet=v.emissions.at(-1);assert.equal(packet.profile,live[1]);assert.deepEqual(packet.result,live[1].sample(.08));assert.equal(packet.displayMaxAmplitude,.08);
 assert.equal(packet.rangePending,true);assert.equal(v.charts.at(-1).curves.length,0,'Unverified graph ranges must not be sampled.');
 ranges[0].resolve(ten[0]);ranges[1].resolve(ten[1]);await settle();
 assert.equal(v.component.snapshot().rangePending,false);assert.equal(v.component.snapshot().amplitude,.04);assert.equal(v.component.snapshot().maxAmplitude,.04);
 assert.equal(v.nodes.push.disabled,false);assert.equal(v.nodes.push.value,100);assert.deepEqual(v.emissions.at(-1).result,ten[1].sample(.04));v.component.destroy();
});

test('maximum intent retries a nonzero exact current push after a zero cap and expands only after full verification',async()=>{
 for(const sign of [-1,1]){
  const nine=preparedProfiles(9),ten=preparedProfiles(10).map(profile=>({...profile,maxAmplitude:0})),eleven=preparedProfiles(11).map(profile=>({...profile,maxAmplitude:.12})),current=[],ranges=[];
  const service={peek:request=>request.T===9?nine[request.mode-1]:null,
   requestCurrent(options,A,settings){return new Promise(resolve=>current.push({options,A,settings,resolve}));},
   request(options){return new Promise(resolve=>ranges.push({options,resolve}));}};
  const v=fixture({preparation:service});v.set();v.push(sign*100);v.set({position:10});
  ranges[0].resolve(ten[0]);ranges[1].resolve(ten[1]);await settle();
  assert.equal(Math.abs(v.component.snapshot().amplitude),0);assert.equal(v.nodes.push.value,sign*100);assert.equal(v.nodes.push.disabled,true);
  v.set({position:11});assert.equal(current.length,4);assert.ok(current.slice(2).every(job=>job.A===sign*.08&&job.settings.referenceAmplitude===.08),'The zero cap must not erase the last verified nonzero candidate.');
  const count=v.emissions.length,stale=exactCurrentProfiles(10,sign*.08,.08);current[0].resolve(stale[0]);current[1].resolve(stale[1]);await settle();assert.equal(v.emissions.length,count);
  const live=exactCurrentProfiles(11,sign*.08,.08);current[2].resolve(live[0]);current[3].resolve(live[1]);await settle();
  assert.equal(v.component.snapshot().amplitude,sign*.08);assert.equal(v.nodes.push.value,sign*100);assert.equal(v.nodes.push.disabled,true);assert.equal(v.component.snapshot().rangePending,true);
  ranges[2].resolve(eleven[0]);ranges[3].resolve(eleven[1]);await settle();
  assert.equal(v.component.snapshot().amplitude,sign*.12);assert.equal(v.nodes.push.value,sign*100);assert.equal(v.nodes.push.disabled,false);assert.deepEqual(v.emissions.at(-1).result,eleven[0].sample(sign*.12));v.component.destroy();
 }
});

test('a known smaller cap narrows a latched current candidate without erasing maximum intent',async()=>{
 const nine=preparedProfiles(9),ten=preparedProfiles(10),eleven=preparedProfiles(11),current=[],ranges=[];ten[0]={...ten[0],maxAmplitude:.03};
 const service={peek:request=>request.T===9?nine[request.mode-1]:request.T===10&&request.mode===1?ten[0]:null,
  requestCurrent(options,A,settings){return new Promise(resolve=>current.push({options,A,settings,resolve}));},request(options){return new Promise(resolve=>ranges.push({options,resolve}));}};
 const v=fixture({preparation:service});v.set();v.push(-100);v.set({position:10});assert.equal(current.length,1);assert.equal(current[0].A,-.03);assert.equal(current[0].settings.referenceAmplitude,.03);
 const narrowed=exactCurrentProfiles(10,-.03,.03);current[0].resolve(narrowed[1]);await settle();assert.equal(v.component.snapshot().amplitude,-.03);assert.equal(v.nodes.push.value,-100);
 ranges[0].resolve(ten[1]);await settle();assert.equal(v.component.snapshot().maxAmplitude,.03);
 v.set({position:11});ranges[1].resolve(eleven[0]);ranges[2].resolve(eleven[1]);await settle();assert.equal(v.component.snapshot().amplitude,-.08);assert.equal(v.nodes.push.value,-100);v.component.destroy();
});

test('current verification failure waits for a full-range fallback and stale staged pairs cannot replace a new segment',async()=>{
 const nine=preparedProfiles(9),ten=preparedProfiles(10),eleven=preparedProfiles(11),current=[],ranges=[];eleven[1]={...eleven[1],maxAmplitude:.04};
 const service={peek:request=>request.T===9?nine[request.mode-1]:null,
  requestCurrent(options,A,settings){return new Promise((resolve,reject)=>current.push({options,A,settings,resolve,reject}));},
  request(options){return new Promise(resolve=>ranges.push({options,resolve}));}};
 const v=fixture({preparation:service});v.set();v.push(-100);v.set({position:10});v.set({position:11});const count=v.emissions.length;
 const old=exactCurrentProfiles(10,-.08,.08);current[0].resolve(old[0]);current[1].resolve(old[1]);ranges[0].resolve(ten[0]);ranges[1].resolve(ten[1]);await settle();
 assert.equal(v.emissions.length,count);assert.equal(v.component.snapshot().T,11);assert.equal(v.component.snapshot().pending,true);
 current[2].reject(Error('The requested push needs a smaller permitted range.'));current[3].resolve(exactCurrentProfiles(11,-.08,.08)[1]);await settle();
 assert.equal(v.component.snapshot().pending,true);assert.equal(v.component.snapshot().error,'');assert.equal(v.emissions.at(-1).result,null);
 ranges[2].resolve(eleven[0]);ranges[3].resolve(eleven[1]);await settle();
 assert.equal(v.component.snapshot().pending,false);assert.equal(v.component.snapshot().rangePending,false);assert.equal(v.component.snapshot().amplitude,-.04);
 assert.deepEqual(v.emissions.at(-1).result,eleven[0].sample(-.04));v.component.destroy();
});
test('the endpoint shortcut establishes the new shared interval before demanding its modes',async()=>{
 let position=9;const pending=[],requests=[];
 const service={peek:()=>null,setContext(next){
  if(next.position!==position){for(const job of pending.splice(0))job.reject(Error('Previous interval cancelled.'));position=next.position;}
 },request(options){
  assert.equal(options.T,position,'The pool must own the new interval before a mode is requested.');
  return new Promise((resolve,reject)=>{const job={options,resolve,reject};pending.push(job);requests.push(job);});
 }};
 const v=fixture({preparation:service});v.set();assert.equal(requests.length,2);
 v.click('past-second');const target=C.secondSurfaceEnd(v.data);assert.equal(position,target);assert.equal(requests.length,4);
 service.setContext({position:target}); // The next app frame must not cancel the shortcut's jobs.
 const profiles=preparedProfiles(target);for(const job of pending.splice(0))job.resolve(profiles[job.options.mode-1]);
 await settle();assert.equal(v.component.snapshot().pending,false);assert.equal(v.component.snapshot().error,'');
 assert.equal(v.component.snapshot().T,target);assert.deepEqual(v.emissions.at(-1).displayProfiles,profiles);v.component.destroy();
});
test('shared prewarmed modes open immediately with the exact profiles, common cap, and signed pushes',()=>{
 const profiles=preparedProfiles(),requested=[];
 const v=fixture({preparation:{peek:request=>profiles[request.mode-1],request(request){requested.push(request);throw Error('Warm profiles must not be requested again.');}}});
 v.set();assert.equal(v.component.snapshot().pending,false);assert.equal(v.tasks.size,0);assert.equal(v.calls.length,0);assert.equal(requested.length,0);
 assert.equal(v.component.snapshot().maxAmplitude,.08);assert.equal(v.emissions.at(-1).profile,profiles[0]);assert.equal(v.emissions.some(e=>e?.status==='preparing'),false);
 v.push(-100);const first=v.emissions.at(-1);v.click('two');const second=v.emissions.at(-1);
 assert.equal(second.profile,profiles[1]);assert.deepEqual(second.amplitude,[-.08,0]);assert.equal(second.T,first.T);
 assert.deepEqual(second.result,profiles[1].sample(-.08));assert.deepEqual(second.displayProfiles,profiles);assert.equal(second.displayMaxAmplitude,.08);
 assert.equal(v.charts.at(-1).curves[1].sampleAt(.03).relativeChange,profiles[1].length(.03).relativeChange);v.component.destroy();
});
test('a comparison promotes only the missing shared mode and never publishes a half-prepared pair',async()=>{
 const profiles=preparedProfiles(),requests=[];let resolve;
 const v=fixture({preparation:{peek:request=>request.mode===1?profiles[0]:null,
  request(request,settings){requests.push({request,settings});return new Promise(done=>{resolve=done;});}}});
 v.set();assert.equal(v.component.snapshot().pending,true);assert.equal(v.calls.length,0);assert.equal(v.tasks.size,0);
 assert.equal(requests.length,1);assert.equal(requests[0].request.mode,2);assert.equal(requests[0].request.T,9);assert.equal(requests[0].settings.priority,'demand');
 assert.equal(v.nodes.push.disabled,true);assert.ok(v.emissions.every(e=>!e?.result));v.click('two');
 resolve(profiles[1]);await settle();assert.equal(v.component.snapshot().pending,false);assert.equal(v.component.snapshot().mode,2);
 assert.equal(v.emissions.at(-1).profile,profiles[1]);v.push(75);assert.deepEqual(v.emissions.at(-1).amplitude,[.06,0]);
 v.click('one');assert.equal(requests.length,1);assert.equal(v.calls.length,0);v.component.destroy();
});
test('shared preparations retain the push during rapid traversal and clamp only when the current pair is verified',async()=>{
 const nine=preparedProfiles(9),ten=preparedProfiles(10),eleven=preparedProfiles(11),requests=[];
 eleven[1]={...eleven[1],maxAmplitude:.04};
 const v=fixture({preparation:{peek:request=>request.T===9?nine[request.mode-1]:null,
  request:options=>new Promise(resolve=>requests.push({options,resolve}))}});
 v.set();v.push(100);v.click('two');v.set({position:10});
 assert.equal(v.component.snapshot().amplitude,.08);assert.equal(v.nodes.push.value,100);assert.equal(v.nodes.push.disabled,true);
 assert.equal(v.emissions.at(-1).result,null);assert.equal(v.emissions.at(-1).profile,undefined);
 v.set({position:11});requests[0].resolve(ten[0]);requests[1].resolve(ten[1]);await settle();
 assert.equal(v.component.snapshot().pending,true);assert.equal(v.component.snapshot().amplitude,.08);assert.equal(v.nodes.push.value,100);
 requests[2].resolve(eleven[0]);await settle();assert.equal(v.component.snapshot().amplitude,.08,'One completed profile cannot change the still-pending common range.');
 requests[3].resolve(eleven[1]);await settle();assert.equal(v.component.snapshot().pending,false);
 assert.equal(v.component.snapshot().amplitude,.04);assert.equal(v.component.snapshot().mode,2);assert.equal(v.nodes.push.value,100);
 assert.equal(v.emissions.at(-1).T,11);assert.deepEqual(v.emissions.at(-1).amplitude,[.04,0]);
 assert.deepEqual(v.emissions.at(-1).result,eleven[1].sample(.04));v.component.destroy();
});
test('stale shared preparations and lifecycle completions cannot replace the current segment',async()=>{
 const nine=preparedProfiles(9),ten=preparedProfiles(10),requests=[];
 const service={peek:()=>null,request(options){return new Promise((resolve,reject)=>requests.push({options,resolve,reject}));}};
 const v=fixture({preparation:service});v.set();v.set({position:10});const emissions=v.emissions.length;
 requests[0].reject(Error('Previous segment cancelled.'));requests[1].resolve(nine[1]);await settle();
 assert.equal(v.emissions.length,emissions);assert.equal(v.component.snapshot().pending,true);assert.equal(v.component.snapshot().T,10);
 requests[2].resolve(ten[0]);await settle();assert.equal(v.nodes.push.disabled,true,'One completed mode cannot enable a partial pair.');
 requests[3].resolve(ten[1]);await settle();assert.equal(v.component.snapshot().pending,false);assert.equal(v.emissions.at(-1).T,10);assert.deepEqual(v.emissions.at(-1).displayProfiles,ten);
 v.component.destroy();
 for(const action of ['closed','hidden','destroy']){
  const pending=[],view=fixture({preparation:{peek:()=>null,request:()=>new Promise(resolve=>pending.push(resolve))}});view.set();
  if(action==='closed')view.set({active:false});else if(action==='hidden'){view.doc.hidden=true;view.doc.handlers.visibilitychange();}else view.component.destroy();
  const count=view.emissions.length;pending[0](nine[0]);pending[1](nine[1]);await settle();
  assert.equal(view.emissions.length,count);assert.equal(view.emissions.at(-1),null);if(action!=='destroy')view.component.destroy();
 }
});

test('rapid focus shortcuts supersede asynchronous work without changing the selected mode or maximum push',async()=>{
 const initial=preparedProfiles(9),old=preparedProfiles(2.8),latest=preparedProfiles(7.2),jobs=[];
 const service={peek:request=>request.T===9?initial[request.mode-1]:null,
  request(request){return new Promise(resolve=>jobs.push({request,resolve}));}};
 const v=fixture({preparation:service});v.set();v.push(-100);v.click('before');
 assert.equal(v.nodes.before.disabled,false,'Shortcuts remain usable while the segment is prepared.');
 assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.request.T===2.8));
 v.click('two');v.click('after');assert.equal(jobs.length,4);assert.ok(jobs.slice(2).every(job=>job.request.T===7.2));
 const emissions=v.emissions.length;jobs[0].resolve(old[0]);jobs[1].resolve(old[1]);await settle();
 assert.equal(v.emissions.length,emissions,'Superseded profiles cannot repaint either curve.');
 jobs[2].resolve(latest[0]);jobs[3].resolve(latest[1]);await settle();
 const snapshot=v.component.snapshot();assert.equal(snapshot.pending,false);assert.equal(snapshot.mode,2);assert.equal(snapshot.T,7.2);
 assert.equal(snapshot.amplitude,-.08);assert.equal(v.nodes.push.value,-100);assert.equal(v.nodes.after.attributes['aria-pressed'],'true');
 assert.equal(v.emissions.at(-1).profile.mode,2);assert.ok(v.emissions.at(-1).displayProfiles.every(profile=>profile.T===7.2));
 assert.deepEqual(v.seeks,[2.8,7.2]);v.component.destroy();
});
