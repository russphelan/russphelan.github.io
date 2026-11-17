'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./downhill-controls.js');

test('length study separates simultaneous fields and counts their own mode ordinals',()=>{
  const data={length:12,events:[{s:2,surface:true},{s:5,hidden:true},{s:8,surface:true,hidden:true},{s:12,hidden:true,endpoint:true}]};
  assert.deepEqual(C.eventChoices(data).map(({key,s})=>[key,s]),[['surface:1',2],['hidden:1',5],['hidden:2',8],['surface:2',8]]);
  assert.equal(C.eventChoices(null).length,0);
});
test('before and after bookmarks preserve a finite fixed-endpoint segment',()=>{
  const choice={s:5.235987755982989};
  assert.equal(C.bookmark(choice,'at',12),choice.s);
  assert.equal(C.bookmark(choice,'before',12),choice.s-.2);
  assert.equal(C.bookmark(choice,'after',12),choice.s+.2);
  assert.ok(C.bookmark({s:.01},'before',10)>0);
  assert.ok(C.bookmark({s:9.99},'after',10)<10);
  assert.ok(C.bookmark({s:5,nextS:5.05},'after',10)<5.05);
  assert.ok(C.bookmark({s:5,previousS:4.95},'before',10)>4.95);
  assert.equal(C.bookmark(null,'at',10),null);
});
test('the radial numerical helper retains its physical radius limit',()=>{
  const result=C.radialClamp(.1,.1,.1);
  assert.ok(Math.abs(Math.hypot(...result)-.1)<1e-15);
  assert.ok(Math.abs(result[0]-result[1])<1e-15);
  assert.deepEqual(C.radialClamp(.02,-.03,.1),[.02,-.03]);
  assert.deepEqual(C.radialClamp(0,0,0),[0,0]);
  assert.throws(()=>C.radialClamp(1,NaN),RangeError);
});
test('length narration never calls an unresolved or positive change downhill',()=>{
  assert.match(C.lengthDescription({delta:-.1,error:.001,verified:true},[.1,0]),/^Shorter path/);
  assert.match(C.lengthDescription({delta:-.00001,error:.001,verified:false},[.1,0]),/below numerical resolution/);
  assert.match(C.lengthDescription({delta:.1,error:.001,verified:true},[.1,0]),/^Longer path/);
  assert.match(C.lengthDescription({delta:0,error:0,verified:true},[0,0]),/Same endpoints/);
});

// Exercise the real component with deterministic timers and small DOM doubles.
// Geometry/length accuracy belongs to downhill.test.cjs; these profiles isolate
// state transitions, physical amplitudes, and asynchronous view ownership.
function componentHarness(settings={}){
  const tasks=new Map(),idleTasks=new Map(),delays=[],landscapes=[],emissions=[],calls=[],nodes={};let serial=0,component;
  function element(){return {value:'',textContent:'',open:false,hidden:false,disabled:false,dataset:{},attributes:{},handlers:{},children:[],
    classList:{add(){},toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];},
    setAttribute(name,value){this.attributes[name]=String(value);},replaceChildren(...children){this.children=children;},
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};},setPointerCapture(){}};}
  const doc={hidden:false,handlers:{},createElement:element,addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(){}};
  doc.defaultView={setTimeout(fn,delay){delays.push(delay);tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);},
    GeodesicSurfaceModeComparison:{create(root,options){return settings.createComparison(root,options);}},
    GeodesicEnergyLandscape:{create(){return {setContext(value){landscapes.push(value);},destroy(){}};}},
    GeodesicDownhill:{prepare(options){
      calls.push(options);
      const {T,eventS,type}=options,status=Math.abs(T-eventS)<1e-8?'neutral':T<eventS?'uphill':'downhill';
      const length=(a,b=0)=>{
        const r2=a*a+b*b,baseline=T;
        const delta=settings.delta?settings.delta({a,b,T,eventS,status}):(status==='uphill'?r2:status==='downhill'?-r2:r2*r2);
        return {baseline,delta,length:baseline+delta,relativeChange:delta/baseline,error:r2?1e-9:0,verified:r2===0||Math.abs(delta)>1e-9};
      };
      return {status,maxAmplitude:settings.cap?settings.cap(options):.12,eigenvalue:status==='neutral'?0:status==='uphill'?1:-1,eigenError:1e-8,tubeRadius:.2,
        length,sample(a,b){return {length:length(a,b),samples:[{s:0,y:[0,0]},{s:T,y:[0,0]}]};},type};
    }}
  };
  if(settings.idle){doc.defaultView.requestIdleCallback=fn=>{idleTasks.set(++serial,fn);return serial;};
    if(settings.idle!== 'request-only')doc.defaultView.cancelIdleCallback=id=>idleTasks.delete(id);}
  const root={...element(),id:'controls-test',ownerDocument:doc,querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];return nodes[key]||(nodes[key]=element());}};
  component=C.create(root,{preparation:settings.preparation,onOpen(){settings.onOpen?.();},onDock(){settings.onDock?.();},onUpdate(study){emissions.push(study);},onSeek(s){const length=currentData.length;component.setContext({position:s/length*length});}});
  let currentData=null;
  function context(data,position=data.events[0].s){currentData=data;component.setContext({data,model:model,position});}
  const model={};
  const fire=(name,type='click')=>nodes[name].handlers[type]();
  const open=()=>{nodes.details.open=true;fire('details','toggle');};
  const close=()=>{nodes.details.open=false;fire('details','toggle');};
  const next=()=>{const queue=tasks.size?tasks:idleTasks,entry=queue.entries().next().value;if(!entry)return false;queue.delete(entry[0]);entry[1]();return true;};
  const flush=()=>{let n=0;while(next())assert.ok(++n<100,'Timer work must finish.');};
  const input=(name,value)=>{nodes[name].value=String(value);fire(name,'input');};
  return {component,nodes,root,doc,tasks,idleTasks,delays,landscapes,emissions,calls,context,open,close,fire,next,flush,input};
}
const studyData=(length=13.7,focus=5.235987755982989)=>({length,events:[{s:focus,hidden:true},{s:8,surface:true},{s:10.471975511965978,hidden:true}],countBefore(s){return this.events.filter(e=>e.s<s-1e-10).reduce((n,e)=>n+(e.hidden?2:1),0);}});

test('the focus study immediately consumes a background-verified surface profile',()=>{
  let warm=null;const requests=[],preparation={peek:options=>options.type==='hidden'?v.doc.defaultView.GeodesicDownhill.prepare(options):warm,request(options){requests.push(options);return Promise.reject(Error('A warm profile must not be requested again.'));}};
  const v=componentHarness({preparation}),data=studyData();v.context(data,9);v.open();v.flush();v.input('hidden-size',50);
  warm=v.doc.defaultView.GeodesicDownhill.prepare({T:9,eventS:8,type:'surface',mode:1});const calls=v.calls.length;
  v.nodes.event.value='surface:1';v.fire('event','change');
  assert.equal(v.component.snapshot().preparing,false);assert.deepEqual(v.component.snapshot().amplitude,[.06,0]);
  assert.equal(v.emissions.at(-1).profile,warm);assert.equal(v.calls.length,calls);assert.equal(requests.length,0);
  v.close();v.component.destroy();
});

test('surface demand uses cooperative preparation and stale completions cannot replace a new selection',async()=>{
  const requests=[],preparation={peek:options=>options.type==='hidden'?v.doc.defaultView.GeodesicDownhill.prepare(options):null,request(options,priority){return new Promise((resolve,reject)=>requests.push({options,priority,resolve,reject}));}};
  const v=componentHarness({preparation}),data=studyData();data.events.push({s:12,surface:true});v.context(data,13);v.open();v.flush();
  const initial=v.calls.length;
  v.nodes.event.value='surface:1';v.fire('event','change');v.next();
  assert.equal(requests.length,1);assert.equal(requests[0].priority.priority,'demand');assert.equal(v.component.snapshot().preparing,true);
  v.nodes.event.value='surface:2';v.fire('event','change');v.next();assert.equal(requests.length,2);
  assert.equal(v.calls.length,initial,'Neither missing surface mode may fall back to a blocking prepare.');
  const make=o=>v.doc.defaultView.GeodesicDownhill.prepare({...o,eventS:o.eventS??8});
  requests[0].resolve(make(requests[0].options));await Promise.resolve();await Promise.resolve();
  assert.equal(v.component.snapshot().mode,2);assert.equal(v.component.snapshot().preparing,true);
  requests[1].resolve(make(requests[1].options));await Promise.resolve();await Promise.resolve();
  assert.equal(v.component.snapshot().preparing,false);assert.equal(v.emissions.at(-1).mode,2);
  v.next();const reference=requests.at(-1);assert.equal(reference.priority.priority,'reference');
  v.close();const count=v.emissions.length;reference.resolve(make(reference.options));await Promise.resolve();await Promise.resolve();
  assert.equal(v.emissions.length,count);assert.equal(v.emissions.at(-1),null);v.component.destroy();
});

test('an exact current surface push displays before its full range is available without enabling unchecked amplitudes',async()=>{
 const currents=[],ranges=[],service={peek:options=>options.type==='hidden'?v.doc.defaultView.GeodesicDownhill.prepare(options):null,setContext(){},requestCurrent(options,a,settings){return new Promise(resolve=>currents.push({options,a,settings,resolve}));},
  request(options,settings){return new Promise(resolve=>ranges.push({options,settings,resolve}));}};
 const v=componentHarness({preparation:service});v.context(studyData(),9);v.open();v.flush();v.input('hidden-size',50);
 v.nodes.event.value='surface:1';v.fire('event','change');assert.equal(currents.length,1);assert.equal(currents[0].a,.06);
 const full=v.doc.defaultView.GeodesicDownhill.prepare(currents[0].options),current={...full,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:.06,displayReferenceAmplitude:.12,
  sample(a,b){assert.equal(a,.06);assert.equal(b,0);return full.sample(a,b);}};
 currents[0].resolve(current);await Promise.resolve();await Promise.resolve();
 assert.equal(v.emissions.at(-1).profile,current);assert.equal(v.component.snapshot().preparing,false);assert.equal(v.component.snapshot().maxAmplitude,0);
 assert.deepEqual(v.component.snapshot().amplitude,[.06,0]);assert.equal(v.nodes.surface.disabled,true);assert.equal(Number(v.nodes.surface.value),50);
 assert.match(v.nodes.status.textContent,/Current push verified/);assert.equal(ranges.length,1);assert.equal(ranges[0].settings.priority,'reference');
 ranges[0].resolve({...full,maxAmplitude:.04});await Promise.resolve();await Promise.resolve();
 assert.deepEqual(v.component.snapshot().amplitude,[.04,0]);assert.equal(v.nodes.surface.disabled,false);assert.equal(Number(v.nodes.surface.value),100);
 assert.equal(v.component.snapshot().length.delta,full.length(.04).delta);v.close();v.component.destroy();
});

test('hidden current preparation preserves the second direction and allows only the verified radius until the range is ready',async()=>{
  const currents=[],ranges=[],service={setContext(){},peek:options=>options.T===9?v.doc.defaultView.GeodesicDownhill.prepare(options):null,
    requestCurrent(options,a,settings){return new Promise(resolve=>currents.push({options,a,settings,resolve}));},
    request(options,settings){return new Promise(resolve=>ranges.push({options,settings,resolve}));}};
  const v=componentHarness({preparation:service});v.context(studyData(),9);v.open();v.input('hidden-size',75);v.fire('hidden-direction-2');
  v.component.setContext({position:6});assert.equal(currents.length,1);assert.equal(currents[0].a,0);assert.equal(currents[0].settings.B,.09);
  assert.deepEqual(v.component.snapshot().amplitude,[0,.09]);assert.equal(Number(v.nodes['hidden-size'].value),75);assert.equal(v.emissions.at(-1).result,null);
  const full=v.doc.defaultView.GeodesicDownhill.prepare(currents[0].options);let scanned=0;
  const current={...full,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:0,currentSecondAmplitude:.09,currentRadius:.09,displayReferenceAmplitude:.12,
    length(){scanned++;throw Error('The unchecked radial graph must wait.');},sample(a,b){assert.equal(Math.hypot(a,b),.09);return full.sample(a,b);}};
  currents[0].resolve(current);await Promise.resolve();await Promise.resolve();
  assert.equal(scanned,0);assert.equal(v.tasks.size,0,'Current-only publication schedules no graph or bookmark scans.');assert.equal(ranges.length,1);
  assert.deepEqual(v.component.snapshot().amplitude,[0,.09]);assert.equal(v.nodes['hidden-size'].disabled,true);assert.equal(v.nodes['hidden-direction-1'].disabled,false);
  assert.equal(v.landscapes.at(-1).pending,true);assert.equal(v.landscapes.at(-1).current.samples,null);assert.equal(v.landscapes.at(-1).current.sampleAt,null);
  const length=v.component.snapshot().length;v.fire('hidden-direction-1');assert.deepEqual(v.component.snapshot().amplitude,[.09,0]);assert.deepEqual(v.component.snapshot().length,length);
  v.fire('hidden-direction-2');assert.deepEqual(v.component.snapshot().amplitude,[0,.09]);assert.equal(v.component.snapshot().error,'');
  ranges[0].resolve({...full,maxAmplitude:.04});await Promise.resolve();await Promise.resolve();
  assert.deepEqual(v.component.snapshot().amplitude,[0,.04]);assert.equal(v.component.snapshot().hiddenDirection,2);assert.equal(v.nodes['hidden-size'].disabled,false);assert.equal(Number(v.nodes['hidden-size'].value),100);
  v.close();v.component.destroy();
});

test('hidden current and full-range completions from an older segment cannot replace the active push',async()=>{
  const currents=[],ranges=[],service={setContext(){},peek:options=>options.T===9?v.doc.defaultView.GeodesicDownhill.prepare(options):null,
    requestCurrent(options,a,settings){return new Promise((resolve,reject)=>currents.push({options,a,settings,resolve,reject}));},
    request(options,settings){return new Promise(resolve=>ranges.push({options,settings,resolve}));}};
  const v=componentHarness({preparation:service});v.context(studyData(),9);v.open();v.input('hidden-size',50);v.fire('hidden-direction-2');
  const live=entry=>{const full=v.doc.defaultView.GeodesicDownhill.prepare(entry.options);return {...full,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:entry.a,currentSecondAmplitude:entry.settings.B,currentRadius:.06,displayReferenceAmplitude:.12};};
  v.component.setContext({position:6});currents[0].resolve(live(currents[0]));await Promise.resolve();await Promise.resolve();assert.equal(ranges.length,1);
  v.component.setContext({position:6.2});const count=v.emissions.length;ranges[0].resolve(v.doc.defaultView.GeodesicDownhill.prepare(ranges[0].options));await Promise.resolve();await Promise.resolve();
  assert.equal(v.emissions.length,count);assert.equal(v.emissions.at(-1).result,null);assert.equal(v.component.snapshot().T,6.2);
  v.component.setContext({position:6.4});currents[1].resolve(live(currents[1]));await Promise.resolve();await Promise.resolve();assert.equal(v.component.snapshot().preparing,true);
  currents[2].resolve(live(currents[2]));await Promise.resolve();await Promise.resolve();assert.equal(v.component.snapshot().T,6.4);assert.deepEqual(v.component.snapshot().amplitude,[0,.06]);
  v.close();v.component.destroy();
});

test('optional comparison owns the emitted surface study while preserving traversal on mode switches and return',()=>{
  let created=0,context={},bridge,rank=1;
  const v=componentHarness({createComparison(root,options){
    created++;bridge=options;
    return {setContext(next){const changed=Object.keys(next).some(k=>context[k]!==next[k]);context={...context,...next};if(changed)options.onUpdate(context.active?{active:true,comparison:true,data:context.data,T:context.position,type:'surface',mode:rank,amplitude:[.03,0]}:null);},
      snapshot(){return {mode:rank,amplitude:.03};},destroy(){options.onUpdate(null);}};
  }});
  v.context(studyData());v.open();v.flush();assert.equal(created,0,'The optional comparison is lazy.');
  const T=v.component.snapshot().T;
  v.fire('compare');assert.equal(created,1);assert.equal(context.position,T);assert.equal(v.nodes['single-study'].hidden,true);
  assert.equal(v.emissions.at(-1).comparison,true);assert.equal(v.emissions.at(-1).type,'surface');
  rank=2;bridge.onUpdate({active:true,comparison:true,data:context.data,T,type:'surface',mode:rank,amplitude:[.03,0]});
  assert.equal(v.component.snapshot().T,T);assert.equal(v.emissions.at(-1).mode,2);
  bridge.onSeek(10.7);assert.equal(v.component.snapshot().T,10.7,'Only the explicit endpoint action seeks.');
  v.fire('compare');v.flush();assert.equal(context.active,false);assert.equal(v.component.snapshot().comparison,false);
  assert.equal(v.component.snapshot().T,10.7);assert.equal(v.nodes['single-study'].hidden,false);
  v.fire('compare');assert.equal(created,1,'Reopening reuses the component.');
  v.close();assert.equal(context.active,false);assert.equal(v.emissions.at(-1),null);assert.equal(v.tasks.size,0);
  v.component.destroy();
});

test('hidden directions are selected separately with one nonnegative physical push size',()=>{
  let docked=0;const v=componentHarness({onDock:()=>docked++});v.context(studyData());v.open();v.flush();
  assert.equal(v.component.snapshot().hiddenDirection,1);assert.equal(v.nodes['hidden-direction-1'].attributes['aria-pressed'],'true');
  assert.equal(v.nodes.pad,undefined);assert.doesNotMatch(v.root.innerHTML,/data-downhill="(?:pad|a|b)"/);
  v.input('hidden-size',50);assert.deepEqual(v.component.snapshot().amplitude,[.06,0]);
  const firstLength=v.component.snapshot().length,preparations=v.calls.length;
  v.fire('hidden-direction-2');assert.deepEqual(v.component.snapshot().amplitude,[0,.06]);
  assert.equal(v.component.snapshot().hiddenDirection,2);assert.equal(v.nodes['hidden-direction-1'].attributes['aria-pressed'],'false');
  assert.equal(v.nodes['hidden-direction-2'].attributes['aria-pressed'],'true');
  assert.deepEqual(v.component.snapshot().length,firstLength,'Changing basis direction keeps the accurate radial length response.');
  assert.equal(v.calls.length,preparations,'Direction switching does not repeat eigenmode preparation.');
  assert.equal(v.emissions.at(-1).hiddenDirection,2);assert.deepEqual(v.emissions.at(-1).amplitude,[0,.06]);
  v.input('hidden-size',-40);assert.deepEqual(v.component.snapshot().amplitude,[0,0],'Hidden size cannot become negative.');
  v.input('hidden-size',140);assert.deepEqual(v.component.snapshot().amplitude,[0,.12],'Only the checked physical range is permitted.');
  v.fire('reset');assert.deepEqual(v.component.snapshot().amplitude,[0,0]);assert.equal(v.component.snapshot().hiddenDirection,2);
  assert.equal(docked,0,'Opening and choosing hidden directions must not force the optional hidden view.');
  v.fire('dock');assert.equal(docked,1);v.component.destroy();
});

test('switching hidden modes retains the maximum physical push and selected direction on the same segment',()=>{
  const v=componentHarness({delta:({a,b,eventS})=>-(a*a+b*b)/eventS});v.context(studyData(),11);v.open();v.flush();
  for(const direction of [1,2]){
    v.nodes.event.value='hidden:1';v.fire('event','change');v.flush();
    v.fire('hidden-direction-'+direction);v.input('hidden-size',100);
    const push=direction===1?[.12,0]:[0,.12];
    for(const mode of [2,1,2]){
      const previous=v.component.snapshot().length;
      v.nodes.event.value='hidden:'+mode;v.fire('event','change');
      assert.deepEqual(v.component.snapshot().amplitude,push,'Preparation must retain the physical push.');
      assert.equal(Number(v.nodes['hidden-size'].value),100,'The disabled slider must stay put while the new mode prepares.');
      v.flush();const state=v.component.snapshot();
      assert.equal(state.mode,mode);assert.equal(state.T,11);assert.equal(state.hiddenDirection,direction);
      assert.deepEqual(state.amplitude,push);assert.equal(Number(v.nodes['hidden-size'].value),100);
      assert.equal(v.emissions.at(-1).mode,mode);assert.deepEqual(v.emissions.at(-1).result.length,state.length);
      assert.notEqual(state.length.delta,previous.delta,'The newly selected profile must be measured at the retained push.');
    }
  }
  v.component.destroy();
});

test('mode changes clamp only to a smaller verified range and cancel stale preparation',()=>{
  const v=componentHarness({cap:({mode})=>mode===2?.04:.12});v.context(studyData());v.open();v.flush();
  v.input('hidden-size',100);v.fire('hidden-direction-2');
  v.nodes.event.value='hidden:2';v.fire('event','change');const stale=Array.from(v.tasks.values())[0];
  v.nodes.event.value='hidden:1';v.fire('event','change');stale();v.flush();
  assert.equal(v.component.snapshot().mode,1);assert.deepEqual(v.component.snapshot().amplitude,[0,.12]);
  v.nodes.event.value='hidden:2';v.fire('event','change');v.flush();
  assert.deepEqual(v.component.snapshot().amplitude,[0,.04]);assert.equal(Number(v.nodes['hidden-size'].value),100);
  v.nodes.event.value='hidden:1';v.fire('event','change');v.flush();
  assert.deepEqual(v.component.snapshot().amplitude,[0,.04],'Returning to a larger range must not enlarge the physical push.');
  assert.equal(v.component.snapshot().hiddenDirection,2);v.component.destroy();
});

test('surface mode changes preserve signed pushes and conjugate-point clicks retain the push',()=>{
  const data=studyData();data.events.push({s:12,surface:true});
  const v=componentHarness();v.context(data,13);v.open();v.flush();
  v.nodes.event.value='surface:1';v.fire('event','change');v.flush();v.input('surface',-75);
  v.nodes.event.value='surface:2';v.fire('event','change');v.flush();
  assert.equal(v.component.snapshot().mode,2);assert.equal(v.component.snapshot().T,13);
  assert.deepEqual(v.component.snapshot().amplitude,[-.09,0]);assert.equal(Number(v.nodes.surface.value),-75);
  assert.equal(v.component.selectEvent(data.events.find(e=>e.surface)),true);v.flush();
  assert.equal(v.component.snapshot().mode,1);assert.equal(v.component.snapshot().T,8);
  assert.deepEqual(v.component.snapshot().amplitude,[-.09,0]);
  v.nodes.event.value='hidden:1';v.fire('event','change');v.flush();v.fire('hidden-direction-2');v.input('hidden-size',100);
  assert.equal(v.component.selectEvent(data.events.find(e=>e.hidden&&e.s>8)),true);v.flush();
  assert.equal(v.component.snapshot().mode,2);assert.deepEqual(v.component.snapshot().amplitude,[0,.12]);
  v.component.destroy();
});

test('a selected surface maximum follows the verified range through traversal and zero-cap round trips',()=>{
 for(const sign of [-1,1]){
  const data=studyData(),v=componentHarness({cap:({T})=>T<.01?0:T<1?.03:.12});v.context(data,9);v.open();v.flush();
  v.nodes.event.value='surface:1';v.fire('event','change');v.flush();v.input('surface',sign*100);
  for(const [T,cap]of [[.1,.03],[9,.12],[.001,0],[0,null],[9,.12],[.1,.03],[9,.12]]){
   v.component.setContext({position:T});assert.equal(Number(v.nodes.surface.value),sign*100,'Preparation must retain the requested endpoint.');v.flush();
   assert.equal(Number(v.nodes.surface.value),sign*100,'A maximum must never become an interior slider value.');
   if(cap!==null){assert.equal(v.component.snapshot().amplitude[0],cap?sign*cap:0);assert.equal(v.component.snapshot().maxAmplitude,cap);}
  }
  v.input('surface',sign*50);v.component.setContext({position:.1});v.flush();v.component.setContext({position:9});v.flush();
  assert.equal(Math.abs(v.component.snapshot().amplitude[0]),.03,'An explicitly chosen interior push retains the previous physical-amplitude behavior.');
  assert.equal(Number(v.nodes.surface.value),sign*25);
  v.input('surface',sign*100);v.component.setContext({position:.001});v.flush();assert.equal(v.nodes.reset.disabled,false);
  v.fire('reset');v.component.setContext({position:9});v.flush();assert.deepEqual(v.component.snapshot().amplitude,[0,0]);assert.equal(Number(v.nodes.surface.value),0);
  v.input('surface',sign*100);v.component.setContext({position:0});v.fire('reset');assert.equal(Number(v.nodes.surface.value),0);
  v.component.setContext({position:9});v.flush();assert.deepEqual(v.component.snapshot().amplitude,[0,0]);v.component.destroy();
 }
});

test('surface maximum survives failed current checks, asynchronous range growth, and stale smaller ranges',async()=>{
 const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
 for(const sign of [-1,1]){
  const currents=[],ranges=[],service={setContext(){},peek:options=>options.T===9?v.doc.defaultView.GeodesicDownhill.prepare(options):null,
   requestCurrent(options,a,settings){return new Promise((resolve,reject)=>currents.push({options,a,settings,resolve,reject}));},
   request(options,settings){return new Promise(resolve=>ranges.push({options,settings,resolve}));}};
  const v=componentHarness({preparation:service});v.context(studyData(),9);v.open();
  v.nodes.event.value='surface:1';v.fire('event','change');v.input('surface',sign*100);
  const full=(options,cap)=>({...v.doc.defaultView.GeodesicDownhill.prepare(options),maxAmplitude:cap});
  const current=entry=>({...full(entry.options,.12),maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:entry.a,displayReferenceAmplitude:entry.settings.referenceAmplitude,
   sample(a,b){assert.equal(a,entry.a,'Only the verified current push can be sampled.');assert.equal(b,0);return full(entry.options,.12).sample(a,b);}});
  v.component.setContext({position:.1});currents[0].reject(Error('Current push does not fit this short segment.'));await settle();
  assert.equal(Number(v.nodes.surface.value),sign*100);ranges[0].resolve(full(ranges[0].options,.03));await settle();
  assert.deepEqual(v.component.snapshot().amplitude,[sign*.03,0]);assert.equal(Number(v.nodes.surface.value),sign*100);
  v.component.setContext({position:10});currents[1].resolve(current(currents[1]));await settle();
  assert.equal(v.nodes.surface.disabled,true);assert.equal(Number(v.nodes.surface.value),sign*100);
  v.component.setContext({position:10.2});ranges[1].resolve(full(ranges[1].options,.0075));await settle();
  assert.equal(v.component.snapshot().T,10.2);assert.equal(v.component.snapshot().preparing,true);assert.equal(Number(v.nodes.surface.value),sign*100);
  currents[2].resolve(current(currents[2]));await settle();ranges[2].resolve(full(ranges[2].options,.12));await settle();
  assert.deepEqual(v.component.snapshot().amplitude,[sign*.12,0]);assert.equal(Number(v.nodes.surface.value),sign*100);assert.equal(v.nodes.surface.disabled,false);
  v.component.setContext({position:.2});currents[3].reject(Error('No finite range.'));await settle();ranges[3].resolve(full(ranges[3].options,0));await settle();
  v.component.setContext({position:10.4});assert.equal(currents[4].a,sign*.12,'A zero-cap segment must not erase the last nonzero current-push candidate.');
  v.close();v.component.destroy();
 }
});

test('surface maximum intent clears with a new owner or study and survives mode changes and bookmarks',()=>{
 const data=studyData();data.events.push({s:12,surface:true});
 const v=componentHarness({cap:({mode})=>mode===2?.03:.12});v.context(data,13);v.open();v.flush();
 v.nodes.event.value='surface:1';v.fire('event','change');v.flush();v.input('surface',100);
 for(const mode of [2,1,2,1]){v.nodes.event.value='surface:'+mode;v.fire('event','change');v.flush();assert.equal(Number(v.nodes.surface.value),100);assert.equal(v.component.snapshot().amplitude[0],mode===2?.03:.12);}
 for(const bookmark of ['before','at','after']){v.fire(bookmark);v.flush();assert.equal(Number(v.nodes.surface.value),100);}
 v.close();v.open();v.flush();assert.equal(v.component.snapshot().amplitude[0],0);assert.equal(Number(v.nodes.surface.value),0);
 v.nodes.event.value='surface:1';v.fire('event','change');v.flush();v.input('surface',100);
 const nextData=studyData(14);v.context(nextData,9);v.flush();assert.deepEqual(v.component.snapshot().amplitude,[0,0]);v.component.destroy();
});

test('verified surface modes switch immediately without another debounce or preparation frame',()=>{
  const data=studyData();data.events.push({s:12,surface:true});
  const v=componentHarness();v.context(data,13);v.open();v.flush();
  const profiles=new Map();
  for(const mode of [1,2]){
    v.nodes.event.value='surface:'+mode;v.fire('event','change');
    assert.equal(v.component.snapshot().preparing,true);assert.equal(v.delays.at(-1),80);
    v.flush();profiles.set(mode,v.emissions.at(-1).profile);
  }
  v.input('surface',-75);const count=v.calls.length,delays=v.delays.length;
  for(const mode of [1,2,1,2]){
    const packets=v.emissions.length;v.nodes.event.value='surface:'+mode;v.fire('event','change');
    const state=v.component.snapshot(),study=v.emissions.at(-1);
    assert.equal(state.preparing,false);assert.equal(state.mode,mode);assert.equal(state.T,13);
    assert.equal(study.profile,profiles.get(mode));assert.ok(study.result);
    assert.deepEqual(state.amplitude,[-.09,0]);assert.equal(Number(v.nodes.surface.value),-75);
    assert.equal(v.nodes.surface.disabled,false);assert.equal(v.tasks.size,0);
    assert.ok(v.emissions.slice(packets).every(p=>p?.status!=='preparing'),'A warm switch never blanks the already verified deformation.');
  }
  assert.equal(v.calls.length,count);assert.equal(v.delays.length,delays);v.component.destroy();
});

test('a warm mode switch cancels a cold selection before its callback can emit',()=>{
  const data=studyData();data.events.push({s:12,surface:true});
  const v=componentHarness({idle:true});v.context(data,13);v.open();v.flush();
  v.nodes.event.value='surface:1';v.fire('event','change');v.flush();v.input('surface',100);
  const profile=v.emissions.at(-1).profile,count=v.calls.length;
  v.nodes.event.value='surface:2';v.fire('event','change');const stale=Array.from(v.tasks.values())[0];
  assert.equal(v.component.snapshot().preparing,true);assert.equal(typeof stale,'function');
  v.nodes.event.value='surface:1';v.fire('event','change');
  assert.equal(v.tasks.size,0);assert.equal(v.component.snapshot().preparing,false);
  assert.equal(v.emissions.at(-1).profile,profile);assert.deepEqual(v.emissions.at(-1).amplitude,[.12,0]);
  const packets=v.emissions.length;stale();v.flush();
  assert.equal(v.calls.length,count);assert.equal(v.emissions.length,packets);assert.equal(v.emissions.at(-1).mode,1);
  v.component.destroy();
});

test('traversal roundoff preserves the established interval and its warm surface cache',()=>{
  const data=studyData();data.events.push({s:12,surface:true});
  const v=componentHarness(),position=9.1,roundtrip=position+8*Number.EPSILON;
  assert.notEqual(position,roundtrip);assert.ok(Math.abs(position-roundtrip)<1e-10);
  v.context(data,position);v.open();v.flush();
  v.nodes.event.value='surface:1';v.fire('event','change');v.flush();
  const profile=v.emissions.at(-1).profile;
  v.context(data,roundtrip);assert.equal(v.component.snapshot().T,position);
  v.nodes.event.value='surface:2';v.fire('event','change');v.flush();const count=v.calls.length;
  v.nodes.event.value='surface:1';v.fire('event','change');
  assert.equal(v.component.snapshot().preparing,false);assert.equal(v.emissions.at(-1).profile,profile);
  assert.equal(v.component.snapshot().T,position);assert.equal(v.calls.length,count);
  v.context(data,position+1e-8);assert.equal(v.component.snapshot().preparing,true);
  assert.equal(v.delays.at(-1),80,'A genuinely changed interval still uses the existing debounce.');
  v.flush();assert.equal(v.component.snapshot().T,position+1e-8);assert.ok(v.calls.length>count);
  v.component.destroy();
});

test('display magnification changes only the drawing metadata and retains physical length',()=>{
  const v=componentHarness();v.context(studyData());v.open();v.flush();v.input('hidden-size',70);v.fire('hidden-direction-2');
  const before=v.component.snapshot(),result=v.emissions.at(-1).result,calls=v.calls.length;
  assert.equal(before.displayMagnification,3);v.input('magnification',5.5);
  const after=v.component.snapshot();assert.equal(after.displayMagnification,5.5);assert.deepEqual(after.amplitude,before.amplitude);
  assert.deepEqual(after.length,before.length);assert.equal(v.emissions.at(-1).result,result,'Visual scaling reuses the exact finite-curve calculation.');
  assert.equal(v.emissions.at(-1).displayMagnification,5.5);assert.equal(v.calls.length,calls);
  v.input('magnification',20);assert.equal(v.component.snapshot().displayMagnification,6);
  v.input('magnification',0);assert.equal(v.component.snapshot().displayMagnification,1);
  v.component.destroy();
});

test('follow surface is the default and changing projection preserves the physical push and length',()=>{
  const v=componentHarness();v.context(studyData());v.open();v.flush();v.input('hidden-size',75);
  const before=v.component.snapshot(),result=v.emissions.at(-1).result,calls=v.calls.length;
  assert.equal(before.displayProjection,'surface');assert.equal(v.nodes.projection.value,'surface');
  assert.equal(v.emissions.at(-1).displayProjection,'surface');
  for(const projection of ['fixed','surface']){
    v.nodes.projection.value=projection;v.fire('projection','change');
    const after=v.component.snapshot();assert.equal(after.displayProjection,projection);
    assert.deepEqual(after.amplitude,before.amplitude);assert.deepEqual(after.length,before.length);
    assert.equal(v.emissions.at(-1).result,result,'Projection changes reuse the exact physical computation.');
    assert.equal(v.emissions.at(-1).displayProjection,projection);assert.equal(v.calls.length,calls);
  }
  v.component.destroy();
});

test('all three focus stages accept pushes and retain the selected hidden direction and size through bookmark round trips',()=>{
  const view=componentHarness(),data=studyData(19.2093052);view.context(data);view.open();view.flush();
  const after=C.bookmark(C.eventChoices(data)[0],'after',data.length);
  assert.notEqual(after/data.length*data.length,after,'This fixture exercises the root traversal roundoff rather than an exact round trip.');
  assert.equal(view.component.snapshot().status,'neutral');assert.equal(view.nodes['hidden-size'].disabled,false);assert.equal(view.nodes['hidden-direction-2'].disabled,false);
  view.input('hidden-size',50);view.fire('hidden-direction-2');const push=view.component.snapshot().amplitude;
  assert.deepEqual(push,[0,.06]);
  const references=view.landscapes.at(-1).curves;assert.deepEqual(references.map(c=>c.key),['before','at','after']);
  assert.equal(view.landscapes.at(-1).axisMode,'radius');
  assert.ok(references.every(c=>c.samples.length===25&&c.samples[0].amplitude===0&&c.samples.at(-1).amplitude===.12&&c.samples.every(p=>p.amplitude>=0)));
  for(const [stage,status]of [['before','uphill'],['at','neutral'],['after','downhill']]){
    view.fire(stage);view.flush();
    const snapshot=view.component.snapshot();assert.equal(snapshot.status,status);assert.deepEqual(snapshot.amplitude,push);
    assert.equal(view.nodes['hidden-size'].disabled,false);assert.equal(view.nodes['hidden-direction-2'].disabled,false);
    assert.equal(view.landscapes.at(-1).curves,references,'Bookmark changes must retain the shared comparison array and scale.');
    assert.equal(view.landscapes.at(-1).activeKey,stage);
    assert.ok(Math.abs(view.landscapes.at(-1).current.amplitude-Math.hypot(...push))<1e-15,'The hidden graph uses the physical size of the selected direction.');
  }
  view.component.destroy();
});

test('a smaller permitted range clamps physical displacement rather than rescaling it',()=>{
  const view=componentHarness({cap:({T,eventS})=>T<eventS ? .04 : .12}),data=studyData();view.context(data);view.open();view.flush();
  view.input('hidden-size',75);view.fire('hidden-direction-2');const original=view.component.snapshot().amplitude;
  view.fire('before');view.flush();const clipped=view.component.snapshot().amplitude;
  assert.deepEqual(clipped,[0,.04]);assert.equal(view.component.snapshot().hiddenDirection,2);
  assert.ok(clipped[1]<original[1]);view.fire('after');view.flush();
  assert.deepEqual(view.component.snapshot().amplitude,clipped,'Returning to a larger range cannot silently enlarge the push.');
  view.component.destroy();
});

test('same-path traversal preparation preserves one hidden direction and ignores stale work',()=>{
  const view=componentHarness(),data=studyData();view.context(data);view.open();view.flush();
  view.input('hidden-size',50);view.fire('hidden-direction-2');view.input('magnification',4.5);
  const push=view.component.snapshot().amplitude;
  view.context(data,6);const stale=Array.from(view.tasks.values())[0];
  assert.equal(view.component.snapshot().preparing,true);assert.deepEqual(view.component.snapshot().amplitude,push);
  view.context(data,6.2);stale();view.flush();
  const state=view.component.snapshot();assert.equal(state.T,6.2);assert.equal(state.hiddenDirection,2);
  assert.equal(state.displayMagnification,4.5);assert.deepEqual(state.amplitude,[0,.06]);
  assert.deepEqual(view.emissions.at(-1).amplitude,[0,.06]);assert.equal(view.emissions.at(-1).T,6.2);
  view.component.destroy();
});

test('the hidden length marker follows size and stays fixed when switching directions',()=>{
  const view=componentHarness(),data=studyData();view.context(data);view.open();view.flush();
  view.input('hidden-size',50);const length=view.component.snapshot().length;
  assert.equal(view.landscapes.at(-1).current.amplitude,.06);assert.equal(view.landscapes.at(-1).axisMode,'radius');
  for(const direction of [2,1,2]){
    view.fire('hidden-direction-'+direction);assert.equal(view.landscapes.at(-1).current.amplitude,.06);
    assert.deepEqual(view.component.snapshot().length,length);
    assert.equal(view.component.snapshot().amplitude.filter(Boolean).length,1,'No control sequence can produce a combined hidden push.');
  }
  view.component.destroy();
});

test('axis labels and modes switch immediately while a new field is preparing',()=>{
  const view=componentHarness(),data=studyData();view.context(data);view.open();
  assert.equal(view.landscapes.at(-1).axisMode,'radius');
  assert.equal(view.landscapes.at(-1).pending,true);assert.equal(view.landscapes.at(-1).current,null);
  assert.match(view.root.innerHTML,/hidden push size, starting at 0/);
  assert.match(view.root.innerHTML,/signed sideways push, negative left and positive right/);
  view.flush();view.nodes.event.value='surface:1';view.fire('event','change');
  assert.equal(view.landscapes.at(-1).axisMode,'signed');
  assert.equal(view.landscapes.at(-1).pending,true);assert.equal(view.landscapes.at(-1).current,null);
  view.flush();view.context(studyData(14,5.6));
  assert.equal(view.landscapes.at(-1).axisMode,'radius');assert.equal(view.landscapes.at(-1).pending,true);
  view.flush();view.component.destroy();
});

test('graph zoom receives true length samplers confined to the checked physical range',()=>{
  const view=componentHarness(),data=studyData();view.context(data);view.open();view.flush();
  const graph=view.landscapes.at(-1),before=graph.curves.find(c=>c.key==='before');
  const a=.0012,measured=before.sampleAt(a);
  assert.equal(measured.amplitude,a);
  assert.ok(Math.abs(measured.relativeChange-a*a/(C.bookmark(C.eventChoices(data)[0],'before',data.length)))<1e-15);
  assert.equal(before.sampleAt(.13),null,'Zoom cannot evaluate outside the safe finite neighborhood.');
  assert.equal(before.sampleAt(-a),null,'A radius cannot be negative, even within the physical cap.');
  assert.equal(graph.current.sampleAt(-a),null);
  assert.equal(graph.current.sampleAt(-.13),null);
  assert.equal(graph.current.maxAmplitude,.12);
  view.component.destroy();
});

test('finite length narration follows measured sign independently of second-order mode status',()=>{
  const view=componentHarness({delta:()=>.001}),data=studyData();view.context(data);view.open();view.flush();
  view.fire('after');view.flush();view.input('hidden-size',50);
  assert.equal(view.component.snapshot().status,'downhill');assert.match(view.nodes.status.textContent,/Longer path with the same endpoints/);
  view.fire('at');view.flush();assert.match(view.nodes.status.textContent,/flat to second order/);assert.match(view.nodes.status.textContent,/Longer path/);
  view.component.destroy();
});

test('stale reference work cannot render a new event, a new path, or a closed study',()=>{
  const view=componentHarness(),first=studyData();view.context(first);view.open();view.next();
  const staleEvent=Array.from(view.tasks.values())[0];assert.equal(typeof staleEvent,'function');
  view.nodes.event.value='surface:1';view.fire('event','change');staleEvent();view.flush();
  assert.equal(view.component.snapshot().type,'surface');assert.ok(view.emissions.filter(Boolean).at(-1).type==='surface');
  assert.equal(view.landscapes.at(-1).axisMode,'signed');
  const second=studyData(14,5.6);view.context(second);view.next();const stalePath=Array.from(view.tasks.values())[0];
  assert.equal(typeof stalePath,'function');const third=studyData(15,5.9);view.context(third);
  const beforeStale=view.landscapes.length;stalePath();assert.equal(view.landscapes.length,beforeStale);view.flush();
  assert.equal(view.emissions.filter(Boolean).at(-1).data,third);
  assert.equal(view.landscapes.at(-1).axisMode,'radius');
  assert.ok(view.landscapes.at(-1).curves.every(curve=>curve.samples.every(p=>Number.isFinite(p.relativeChange))));
  const fourth=studyData(16,6.1);view.context(fourth);view.next();const staleClosed=Array.from(view.tasks.values())[0];
  assert.equal(typeof staleClosed,'function');view.close();
  const count=view.landscapes.length;staleClosed();view.flush();
  assert.equal(view.landscapes.length,count);assert.equal(view.emissions.at(-1),null);assert.equal(view.tasks.size,0);
  view.component.destroy();
});

test('profile and reference caches belong to both the geodesic and its metric model',()=>{
  const view=componentHarness({cap:({model})=>model.limit??.12}),data=studyData();
  view.context(data);view.open();view.flush();
  const firstModel=view.calls[0].model,firstCurves=view.landscapes.at(-1).curves,firstCount=view.calls.length;
  assert.equal(view.component.snapshot().maxAmplitude,.12);
  const secondModel={limit:.04};view.component.setContext({model:secondModel});view.flush();
  assert.equal(view.component.snapshot().maxAmplitude,.04,'The current metric must determine the verified push limit.');
  assert.equal(view.calls.length,firstCount*2);assert.ok(view.calls.slice(firstCount).every(call=>call.model===secondModel));
  const secondCurves=view.landscapes.at(-1).curves;
  assert.notEqual(secondCurves,firstCurves);assert.ok(secondCurves.every(curve=>curve.maxAmplitude===.04));
  view.component.setContext({model:firstModel});view.flush();
  assert.equal(view.component.snapshot().maxAmplitude,.12);assert.equal(view.calls.length,firstCount*2);
  assert.equal(view.landscapes.at(-1).curves,firstCurves,'Returning to a metric can safely reuse only its own reference curves.');
  view.component.destroy();
});

test('optional reference profiles yield to input and finish one stage per idle callback',()=>{
  const v=componentHarness({idle:true});v.context(studyData());v.open();v.next();
  assert.equal(v.component.snapshot().preparing,false);assert.ok(v.emissions.at(-1).result);
  assert.equal(v.calls.length,1);assert.equal(v.tasks.size,0);assert.equal(v.idleTasks.size,1);
  assert.equal(v.landscapes.at(-1).pending,true);
  v.input('hidden-size',100);assert.deepEqual(v.component.snapshot().amplitude,[.12,0]);
  assert.equal(v.calls.length,1,'A push can update before optional references consume idle time.');
  v.next();assert.equal(v.calls.length,2);assert.equal(v.idleTasks.size,1);
  v.next();assert.equal(v.idleTasks.size,1);
  v.next();assert.equal(v.idleTasks.size,0);assert.equal(v.landscapes.at(-1).pending,false);
  assert.equal(v.landscapes.at(-1).curves.length,3);assert.deepEqual(v.component.snapshot().amplitude,[.12,0]);
  v.component.destroy();
});

test('event changes cancel idle references and stale callbacks cannot overwrite or uncancel new work',()=>{
  const v=componentHarness({idle:true});v.context(studyData());v.open();v.next();
  const stale=Array.from(v.idleTasks.values())[0];
  v.nodes.event.value='hidden:2';v.fire('event','change');assert.equal(v.idleTasks.size,0);
  v.next();assert.equal(v.idleTasks.size,1);const count=v.landscapes.length;
  stale();assert.equal(v.landscapes.length,count);assert.equal(v.idleTasks.size,1);
  v.close();assert.equal(v.idleTasks.size,0,'Stale work must not lose the handle needed to cancel the new job.');
  v.flush();assert.equal(v.emissions.at(-1),null);v.component.destroy();
});

test('idle references are cancelled on context changes, visibility loss, closing, and destruction',()=>{
  for(const action of ['context','hide','close','destroy']){
    const v=componentHarness({idle:true}),data=studyData();v.context(data);v.open();v.next();
    const stale=Array.from(v.idleTasks.values())[0];assert.equal(typeof stale,'function');
    if(action==='context')v.context(studyData(14,5.6));
    else if(action==='hide'){v.doc.hidden=true;v.doc.handlers.visibilitychange();}
    else if(action==='close')v.close();else v.component.destroy();
    assert.equal(v.idleTasks.size,0,action+' must cancel the queued idle callback.');
    const count=v.landscapes.length;stale();assert.equal(v.landscapes.length,count);
    v.flush();if(action==='context')assert.equal(v.landscapes.at(-1).curves.length,3);
    else assert.equal(v.emissions.at(-1),null);
    if(action!=='destroy')v.component.destroy();
  }
});

test('reference fallback yields briefly when idle callbacks cannot be safely cancelled',()=>{
  for(const idle of [false,'request-only']){
    const v=componentHarness({idle});v.context(studyData());v.open();v.next();
    assert.equal(v.idleTasks.size,0);assert.equal(v.tasks.size,1);assert.equal(v.delays.at(-1),32);
    v.flush();assert.equal(v.landscapes.at(-1).pending,false);assert.equal(v.landscapes.at(-1).curves.length,3);
    v.component.destroy();
  }
});

test('signed surface pushes remain available and preserve their sign at every focus stage',()=>{
  const view=componentHarness(),data=studyData();view.context(data,8);view.open();view.flush();
  assert.equal(view.component.snapshot().type,'surface');view.input('surface',-75);
  assert.equal(view.landscapes.at(-1).axisMode,'signed');
  assert.deepEqual(view.component.snapshot().amplitude,[-.09,0]);
  for(const stage of ['before','at','after']){
    view.fire(stage);view.flush();assert.equal(view.nodes.surface.disabled,false);
    assert.deepEqual(view.component.snapshot().amplitude,[-.09,0]);
    assert.equal(view.landscapes.at(-1).current.amplitude,-.09);
    assert.ok(view.landscapes.at(-1).curves.every(c=>c.samples[0].amplitude<0&&c.samples.at(-1).amplitude>0));
    const curve=view.landscapes.at(-1).curves[0];
    assert.equal(curve.sampleAt(-.0012).amplitude,-.0012,'Signed surface sampling keeps the negative branch.');
  }
  view.component.destroy();
});

test('closed controls schedule no numerical or landscape jobs during ordinary traversal',()=>{
  const view=componentHarness(),data=studyData();view.context(data);
  for(const position of [0,1,3,6,9,12])view.context(data,position);
  assert.equal(view.tasks.size,0);assert.equal(view.calls.length,0);
  view.open();view.flush();assert.ok(view.calls.length>0);view.close();
  const previous=view.calls.length;for(const position of [2,4,8])view.context(data,position);view.flush();
  assert.equal(view.calls.length,previous);assert.equal(view.tasks.size,0);view.component.destroy();
});

test('opening can frame the observation console once without scrolling on each push',()=>{
  let opened=0;const view=componentHarness({onOpen:()=>opened++});view.context(studyData());view.open();view.flush();
  assert.equal(opened,1);
  view.input('hidden-size',50);view.fire('after');view.flush();view.fire('hidden-direction-2');view.input('hidden-size',25);
  assert.equal(opened,1,'Pushes and mode preparation must preserve the audience’s viewport.');
  view.close();view.open();view.flush();assert.equal(opened,2);view.component.destroy();
});
