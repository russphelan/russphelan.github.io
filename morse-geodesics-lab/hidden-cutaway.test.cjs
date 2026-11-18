'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('./hidden-cutaway.js'),J=require('./jacobi.js');
const c=.36,spacing=Math.PI/Math.sqrt(c);
function data(length=2.3*spacing,events){
 return {length,curvature:c,events:events||[1,2].map(n=>({s:n*spacing,hidden:true,surface:false,multiplicity:2,endpoint:false}))};
}

test('two normal fields are independent vectors despite equal signed scalar size',()=>{
 const d=data(),p=H.fieldState(d,1.7),expected=J.hiddenValue(1.7,c);
 assert.equal(p.h,expected);assert.deepEqual(p.vectors,[[expected,0],[0,expected]]);
 assert.equal(p.vectors[0].reduce((sum,x,i)=>sum+x*p.vectors[1][i],0),0);
 assert.ok(H.fieldState(d,spacing-.01).h>0);assert.ok(H.fieldState(d,spacing+.01).h<0);
 assert.equal(H.fieldState(d,spacing).h,0);assert.equal(H.fieldState(d,spacing).radius,0);
 assert.equal(H.fieldState(d,0).h,0);assert.equal(H.contributionBefore(d,0),0);
});

test('hidden roots are exact profile rows and surface-only events never pinch the hidden family',()=>{
 const d=data(2.3*spacing,[{s:2,hidden:false,surface:true,multiplicity:1},...data().events]);
 const before=JSON.stringify(d),p=H.prepareProfile(d);
 for(const root of [spacing,2*spacing]){
  const row=p.samples.find(sample=>sample.s===root);assert.ok(row);assert.equal(row.h,0);
 }
 assert.ok(H.fieldState(d,2).h>0);assert.equal(H.fieldState(d,2).zero,false);
 assert.ok(H.fieldState(d,d.length).h!==0,'An ordinary destination is not a fabricated focus.');
 assert.equal(p.samples.at(-1).s,d.length);assert.notEqual(p.samples.at(-1).h,0);
 assert.equal(p.maximum,1/Math.sqrt(c));assert.equal(JSON.stringify(d),before);
});

test('hidden contribution counts two after passage, including at combined events, with endpoint nullity separate',()=>{
 const d=data(2*spacing,[{s:spacing,hidden:true,surface:true,multiplicity:3,endpoint:false},
  {s:2*spacing,hidden:true,surface:false,multiplicity:2,endpoint:true}]);
 assert.equal(H.contributionBefore(d,spacing),0);
 assert.equal(H.contributionBefore(d,spacing/d.length*d.length),0);
 assert.equal(H.contributionBefore(d,spacing+1e-7),2,'A combined event still has only two hidden directions.');
 assert.equal(H.contributionBefore(d,d.length),2);
 const p=H.prepareProfile(d);assert.equal(p.hiddenIndex,2);assert.equal(p.hiddenNullity,2);
 assert.equal(p.samples.at(-1).h,0);
 assert.equal(H.fieldState(d,d.length).event.endpoint,true);
});

test('flat and negative normal curvature grow without invented off-surface conjugate points',()=>{
 for(const curvature of [0,-.36]){
  const d={length:4,curvature,events:[]},p=H.prepareProfile(d);
  assert.ok(p.samples.slice(1).every(row=>row.h>0));assert.equal(p.hiddenIndex,0);assert.equal(p.hiddenNullity,0);
  assert.equal(p.samples.at(-1).h,J.hiddenValue(4,curvature));
  assert.equal(p.maximum,p.samples.at(-1).h);assert.equal(H.contributionBefore(d,4),0);
 }
});

test('surface-only and simultaneous endpoint zeros are described as nullity rather than new index',()=>{
 const surfaceOnly=data(2,[{s:2,hidden:false,surface:true,endpoint:true,multiplicity:1}]);
 assert.equal(H.surfaceEventLabel(surfaceOnly.events[0],2),'surface nullity 1');
 const description=H.describePosition(surfaceOnly,2);
 assert.ok(description.state.h!==0);assert.match(description.message,/surface nullity 1/);assert.match(description.message,/remain nonzero/);
 const combined=data(spacing,[{s:spacing,hidden:true,surface:true,endpoint:true,multiplicity:3}]);
 const d=H.describePosition(combined,spacing);
 assert.equal(d.state.h,0);assert.match(d.message,/Hidden nullity is 2/);assert.match(d.message,/total endpoint nullity 3/);
 assert.equal(H.contributionBefore(combined,spacing),0);
});

test('a real prepared path shares hidden times and strict contribution counts with the main data',()=>{
 const S=require('./surface.js'),catalogues=require('./catalogue-data.js').catalogues;
 const curve=catalogues['double:default'].curves.find(x=>x.normalIndex>=4),d=J.prepare(curve,S.getModel('double'));
 const p=H.prepareProfile(d);
 assert.equal(p.hiddenIndex,curve.normalIndex);
 for(const event of d.events.filter(e=>e.hidden)){
  assert.equal(H.fieldState(d,event.s).h,0);
  assert.equal(H.contributionBefore(d,event.s),2*d.events.filter(e=>e.hidden&&!e.endpoint&&e.s<event.s-1e-10).length);
 }
 assert.equal(H.contributionBefore(d,d.length),curve.normalIndex);
});

test('the cutaway is available as a dependency-free browser component and validates its numerical inputs',()=>{
 const context={GeodesicJacobi:{hiddenValue:J.hiddenValue}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./hidden-cutaway.js'),'utf8'),context);
 assert.equal(typeof context.GeodesicHiddenCutaway.create,'function');
 assert.equal(context.GeodesicHiddenCutaway.fieldState(data(),spacing).h,0);
 assert.throws(()=>H.prepareProfile({length:0,curvature:.36}),RangeError);
 assert.throws(()=>H.fieldState(data(),NaN),RangeError);
});

test('finite hidden pushes preserve physical offsets and both pinned endpoints at a fixed display scale',()=>{
 const d=data(),input={type:'hidden',T:6,samples:[{s:0,y:[0,0]},{s:3,y:[.03,.04]},{s:6,y:[1e-17,-2e-17]}]};
 const original=JSON.stringify(input),p=H.prepareDeformation(d,input);
 assert.equal(p.T,6);assert.equal(p.magnification,30);assert.equal(p.maxRadius,.05);
 assert.deepEqual(p.samples[0],{s:0,y:[0,0]});assert.deepEqual(p.samples.at(-1),{s:6,y:[0,0]});
 assert.deepEqual(p.samples[1].y,[.03,.04]);assert.equal(JSON.stringify(input),original);
 const smaller=H.prepareDeformation(d,{...input,samples:input.samples.map(row=>({s:row.s,y:row.y.map(v=>v/2)}))});
 assert.equal(smaller.magnification,p.magnification);assert.equal(smaller.maxRadius,p.maxRadius/2);
 assert.deepEqual(H.prepareDeformation(d,{type:'surface',T:6}).samples,[]);
 assert.equal(H.prepareDeformation(d,null),null);
});

test('finite curve validation rejects loose endpoints, reordered samples, and invalid segment/scaling data',()=>{
 const d=data(),valid={type:'hidden',T:6,samples:[{s:0,y:[0,0]},{s:3,y:[.03,.04]},{s:6,y:[0,0]}]};
 for(const patch of [{T:0},{T:d.length+1},{type:'unknown'},{magnification:0},{magnification:Infinity},
   {samples:[]},{samples:[{s:0,y:[0,0]},{s:6,y:[.001,0]}]},
   {samples:[{s:0,y:[0,0]},{s:6,y:[NaN,0]}]},
   {samples:[{s:0,y:[0,0]},{s:5,y:[.1,0]},{s:4,y:[.1,0]},{s:6,y:[0,0]}]}])
  assert.throws(()=>H.prepareDeformation(d,{...valid,...patch}),RangeError);
});

function fakeComponent(options={},box={width:700,height:330},environment={}){
 const labels=[],strokes=[],texts=[],fills=[];let draws=0,resize=null;
 function events(target){const registered=new Map();
  target.addEventListener=(type,fn)=>{if(!registered.has(type))registered.set(type,new Set());registered.get(type).add(fn);
   target.handlers[type]=event=>{for(const callback of [...(registered.get(type)||[])])callback(event);};};
  target.removeEventListener=(type,fn)=>{registered.get(type)?.delete(fn);if(!registered.get(type)?.size)delete target.handlers[type];};return target;
 }
 function element(){return events({textContent:'',value:'',disabled:false,dataset:{},style:{},children:[],attributes:{},handlers:{},
   classList:{add(){},toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(){},
   setAttribute(name,value){this.attributes[name]=value;},replaceChildren(){this.children=[];},
   append(child){this.children.push(child);},querySelectorAll(){return this.children;}});}
 let path=[];
 const ctx={setTransform(){},clearRect(){draws++;},createLinearGradient(){return {addColorStop(){}};},fillRect(){},
   beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},arc(){},setLineDash(){},closePath(){},
   fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha,points:path.slice()});},
   stroke(){strokes.push({color:this.strokeStyle,alpha:this.globalAlpha,points:path.slice()});},
   measureText(text){return {width:text.length*5};},fillText(text){labels.push(text);texts.push({text,color:this.fillStyle});}};
 const nodes={};for(const name of ['canvas','play','position','position-value','gain','gain-value','reset','events','readout','scale','note','field-ring-legend'])nodes[name]=element();
 nodes.canvas.getContext=()=>ctx;nodes.canvas.getBoundingClientRect=()=>({left:0,top:0,...box});
 const doc=events({hidden:false,handlers:{},createElement:element,
   addEventListener(type,handler){this.handlers[type]=handler;},removeEventListener(type){delete this.handlers[type];},
   defaultView:events({handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},removeEventListener(type){delete this.handlers[type];},devicePixelRatio:1,ResizeObserver:class{constructor(callback){resize=callback;}observe(){}disconnect(){}},...environment})});
 for(const node of Object.values(nodes))node.ownerDocument=doc;
 const root={...element(),id:'test-cutaway',ownerDocument:doc,querySelector(selector){return nodes[selector.match(/"([^"]+)"/)[1]];}};
 return {component:H.create(root,options),root,nodes,labels,strokes,texts,fills,doc,box,resize:()=>resize?.(),draws:()=>draws,clear(){labels.length=0;strokes.length=0;texts.length=0;fills.length=0;}};
}

function globalFieldBounds(view){
 const points=view.strokes.filter(row=>/^#(?:f4ba71|c4abff)(?:e6|48)$/.test(row.color)).flatMap(row=>row.points);
 assert.ok(points.length>100,'The bounds must describe the actual signed Jacobi traces.');
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 return {left,right,top,bottom,width:right-left,height:bottom-top};
}

test('coordinated traversal keeps the requested thumb while displaying only its committed exact endpoint',()=>{
 const requested=[],view=fakeComponent({onSeek:s=>{requested.push(s);return true;}}),d=data(12);
 view.component.setContext({active:true,data:d,position:3});
 view.nodes.position.value='80000';view.nodes.position.handlers.input();
 assert.equal(view.component.getState().position,3);assert.equal(view.nodes.position.value,80000);
 assert.deepEqual(requested,[9.6]);assert.match(view.nodes.position.attributes['aria-valuetext'],/Requested 80 percent; showing 25 percent/);
 view.component.setContext({position:4.8,requestedPosition:9.6});
 assert.equal(view.component.getState().position,4.8);assert.equal(view.nodes.position.value,80000);
 assert.match(view.nodes['position-value'].textContent,/40%/);
 view.component.setContext({position:9.6,requestedPosition:null});assert.equal(view.nodes.position.value,80000);
 assert.doesNotMatch(view.nodes.position.attributes['aria-valuetext'],/Requested/);
 view.component.setContext({data:data(2),position:1});assert.equal(view.nodes.position.value,50000);
});

test('the whole-path fields fill the resized global pane within the available aspect ratio',()=>{
 for(const box of [{width:620,height:280},{width:620,height:600},{width:1000,height:600}]){
  const view=fakeComponent({},box),d=data(12);
  view.component.setContext({active:true,data:d,position:3,study:null,deformation:null});
  const b=globalFieldBounds(view);
  assert.equal(view.component.getState().framing.mode,'whole-path');
  assert.ok(b.left>=10&&b.right<=box.width-10,'Actual fields fit the global horizontal frame.');
  assert.ok(b.top>=29&&b.bottom<=box.height-23,'Actual fields fit between the heading and bottom help.');
  assert.ok(b.height>.6*(box.height-78),'The field height uses the enlarged pane, not a width-capped miniature.');
  assert.ok(b.width>.5*(box.width-100),'The full path remains spread across the available width.');
  assert.equal(view.component.getState().gain,1);view.component.destroy();
 }
});

test('resizing during a held traversal refits the whole path without changing field values or gain',()=>{
 const box={width:620,height:280},view=fakeComponent({},box),d=data(12),before=JSON.stringify(d);
 view.component.setContext({active:true,data:d,position:3,study:null,deformation:null});
 const small=globalFieldBounds(view),h=view.component.getState().field.h;
 view.clear();box.height=600;view.resize();
 const large=globalFieldBounds(view),state=view.component.getState();
 assert.equal(state.framing.mode,'whole-path');assert.equal(state.framing.end,12);
 assert.ok(large.height>2*small.height,'A taller pane visibly enlarges the global field instead of retaining its old width cap.');
 assert.equal(state.field.h,h);assert.equal(state.gain,1);assert.equal(JSON.stringify(d),before);
 view.clear();view.component.setContext({position:4,study:null,deformation:null});
 const moved=globalFieldBounds(view);
 for(const key of ['left','right','top','bottom'])assert.ok(Math.abs(moved[key]-large[key])<.5,
  'Moving the held slider changes its cursor, not the whole-path fit: '+key);
 view.component.destroy();
});

test('short and long global fields fit extreme pane shapes while preserving the audience camera',()=>{
 for(const length of [.7,60]){
  const box={width:1000,height:600},view=fakeComponent({},box);
  const events=Array.from({length:Math.floor(length/spacing)},(_,i)=>({s:(i+1)*spacing,hidden:true,endpoint:false}));
  view.component.setContext({active:true,data:data(length,events),position:length/2});
  const directionRatio=()=>{
   const bounds=globalFieldBounds(view),center=(bounds.top+bounds.bottom)/2;
   const ordinate=color=>view.strokes.find(row=>row.color===color&&row.points.length===2).points[1][1]-center;
   return ordinate('#f4ba71e6')/ordinate('#c4abffe6');
  };
  const initial=directionRatio();
  view.clear();view.nodes.canvas.handlers.keydown({key:'ArrowRight',preventDefault(){}});
  const turned=directionRatio();assert.ok(Math.abs(turned-initial)>.01,'The test exercises an audience-turned camera.');
  view.clear();box.width=400;box.height=800;view.resize();
  const bounds=globalFieldBounds(view);
  assert.ok(bounds.left>=10&&bounds.right<=390);
  assert.ok(bounds.top>=29&&bounds.bottom<=777);
  assert.ok(bounds.width>.7*(box.width-100)||bounds.height>.6*(box.height-78),
   'An extreme aspect ratio should fill its limiting dimension.');
  assert.ok(Math.abs(directionRatio()-turned)<1e-9,'Resizing preserves the chosen transverse orientation.');
  assert.equal(view.component.getState().framing.end,length);view.component.destroy();
 }
});

test('global auto-fitting does not cancel an explicitly requested field magnification',()=>{
 const view=fakeComponent({}, {width:620,height:600}),d=data(12),immutable=JSON.stringify(d);
 view.component.setContext({active:true,data:d,position:3});
 const before=globalFieldBounds(view),h=view.component.getState().field.h;
 view.clear();view.nodes.gain.value='150';view.nodes.gain.handlers.input();
 const after=globalFieldBounds(view),state=view.component.getState();
 assert.ok(Math.abs(after.height/before.height-1.5)<1e-12,
  'Auto-fit supplies the base frame; manual magnification still enlarges the actual fields.');
 assert.equal(state.gain,1.5);assert.equal(state.field.h,h);assert.equal(JSON.stringify(d),immutable);
 assert.equal(state.framing.mode,'whole-path');view.component.destroy();
});

test('the finite hidden push field has a signed band and arrows in both directions, disappearing exactly at zero push',()=>{
 const d=data(),T=6;
 for(const [direction,color]of [[1,'#4db8ff'],[2,'#b86eff']]){
  const view=fakeComponent(),samples=Array.from({length:81},(_,i)=>{
   const s=T*i/80,y=.08*Math.sin(2*Math.PI*i/80);
   return {s,y:direction===1?[y,0]:[0,y]};
  }),packet={type:'hidden',T,hiddenDirection:direction,samples},original=JSON.stringify(packet);
  view.component.setContext({active:true,data:d,position:T,deformation:packet});
  const arrows=view.strokes.filter(s=>s.color===color+'c0'),band=view.fills.filter(p=>p.color===color+'28');
  assert.ok(arrows.filter(s=>s.points.length===2).length>=16,'The push field has visible transverse arrow stems along the whole segment.');
  assert.equal(arrows.filter(s=>s.points.length===3).length,arrows.filter(s=>s.points.length===2).length,'Each stem has a screen-space arrowhead.');
  assert.ok(band.length>=76&&band.every(p=>p.points.length===4),'Signed finite coordinates form a translucent ruled band.');
  const offsets=arrows.filter(s=>s.points.length===2).map(s=>s.points[1][1]-s.points[0][1]);
  assert.ok(offsets.some(y=>y>3)&&offsets.some(y=>y< -3),'Opposite signed mode lobes remain on opposite sides of the baseline.');
  assert.equal(JSON.stringify(packet),original,'Drawing the more prominent field never alters the physical coordinates.');
  view.clear();view.component.setContext({deformation:{...packet,samples:samples.map(p=>({s:p.s,y:[0,0]}))}});
  assert.equal(view.strokes.filter(s=>s.color===color+'c0').length,0,'No arrows are manufactured at zero push.');
  assert.equal(view.fills.filter(p=>p.color===color+'28').length,0,'The ruled band disappears at zero push.');
  view.component.destroy();
 }
});

test('selected hidden direction metadata preserves physical coordinates and the independent cutaway scale',()=>{
 const d=data(),samples=[{s:0,y:[0,0]},{s:3,y:[.08,0]},{s:6,y:[0,0]}],input={type:'hidden',T:6,hiddenDirection:1,samples};
 const before=JSON.stringify(input),first=H.prepareDeformation(d,input);
 assert.equal(first.hiddenDirection,1);assert.equal(first.magnification,30);assert.equal(first.maxRadius,.08);
 assert.deepEqual(first.samples,samples);assert.equal(JSON.stringify(input),before);
 const second=H.prepareDeformation(d,{...input,hiddenDirection:2,samples:samples.map(p=>({s:p.s,y:[p.y[1],p.y[0]]}))});
 assert.equal(second.hiddenDirection,2);assert.equal(second.maxRadius,first.maxRadius);assert.equal(second.magnification,first.magnification);
 const legacy=H.prepareDeformation(d,{type:'hidden',T:6,samples});assert.equal('hiddenDirection' in legacy,false);
 for(const hiddenDirection of [0,3,NaN,'1',null])assert.throws(()=>H.prepareDeformation(d,{...input,hiddenDirection}),/Hidden direction/);
});

test('the optional cutaway uses the main hidden direction colors without rescaling a switched push',()=>{
 const view=fakeComponent(),d=data(),packet=direction=>({type:'hidden',T:6,hiddenDirection:direction,
   samples:[{s:0,y:[0,0]},{s:3,y:direction===1?[.08,0]:[0,.08]},{s:6,y:[0,0]}]});
 for(const [direction,color]of [[1,'#4db8ff'],[2,'#b86eff'],[1,'#4db8ff']]){
  view.clear();view.component.setContext({active:true,data:d,position:6,deformation:packet(direction)});
  const finite=view.strokes.filter(s=>s.color===color&&s.points.length===2);
  assert.equal(finite.length,2,'The finite path segments use the selected main-view color.');
  assert.equal(view.root.dataset.deformationMagnification,'30');assert.equal(view.root.dataset.hiddenDirection,String(direction));
  assert.equal(view.component.getState().deformation.maxRadius,.08);
  assert.ok(view.texts.some(t=>t.text==='Finite push · direction '+direction&&t.color===color));
  assert.ok(view.texts.some(t=>t.text==='Direction 1'&&t.color==='#4db8ff'));
  assert.ok(view.texts.some(t=>t.text==='Direction 2'&&t.color==='#b86eff'));
  assert.ok(view.labels.includes('FINITE HIDDEN PUSH · direction '+direction+' · transverse ×30.0'));
  assert.match(view.nodes.canvas.attributes['aria-label'],new RegExp('hidden direction '+direction));
  assert.match(view.nodes.readout.textContent,new RegExp('hidden direction '+direction));
 }
 view.clear();view.component.setContext({study:{type:'hidden',T:6,hiddenDirection:2},deformation:null});
 assert.match(view.nodes.readout.textContent,/direction 2 is not yet available/);
 assert.ok(view.texts.some(t=>t.text==='Direction 2'&&t.color==='#b86eff'));
 assert.equal(view.nodes['gain-value'].textContent,'30.00×','Preparation keeps the optional view scale independent of the main display.');
 assert.throws(()=>view.component.setContext({study:{type:'hidden',T:6,hiddenDirection:3}}),/Hidden direction/);
 view.clear();view.component.setContext({study:null,deformation:{type:'hidden',T:6,samples:packet(1).samples}});
 assert.equal(view.strokes.filter(s=>s.color==='#6de8ff').length,2,'Legacy studies retain their old styling.');
 assert.ok(view.labels.includes('A axis')&&view.labels.includes('B axis'));view.component.destroy();
});

test('cutaway camera drags stop on interrupted input and unrelated pointers cannot take ownership',()=>{
 for(const interruption of ['blur','pagehide','hidden','closed','released']){
  const v=fakeComponent();v.component.setContext({active:true,data:data(),position:2});
  v.nodes.canvas.setPointerCapture=()=>{};v.nodes.canvas.focus=()=>{};
  const event=(id=7,extra={})=>({button:0,buttons:1,pointerId:id,clientX:100,clientY:100,...extra});
  const pointer=(name,id=7,extra={})=>v.nodes.canvas.handlers[name](event(id,extra));
  pointer('pointerdown');pointer('pointerdown',8,{isPrimary:false});pointer('pointerup',8);
  let before=v.draws();pointer('pointermove',7,{clientX:110});assert.equal(v.draws(),before+1);
  if(interruption==='hidden'){v.doc.hidden=true;v.doc.handlers.visibilitychange();v.doc.hidden=false;v.doc.handlers.visibilitychange();}
  else if(interruption==='closed'){v.component.setContext({active:false});v.component.setContext({active:true});}
  else if(interruption==='released')pointer('pointermove',7,{buttons:0,clientX:120});
  else v.doc.defaultView.handlers[interruption]();
  before=v.draws();pointer('pointermove',7,{clientX:130});assert.equal(v.draws(),before,interruption+' ends the drag without waiting for another pointerup.');
  v.component.destroy();v.component.setContext({active:true,data:data(1),position:.5});assert.equal(v.draws(),before);
 }
});

test('deformation-only changes repaint the actual finite curve and restore ordinary Jacobi viewing when cleared',()=>{
 const view=fakeComponent(),d=data(),packet=amplitude=>({type:'hidden',T:6,
   samples:[{s:0,y:[0,0]},{s:3,y:[amplitude,0]},{s:6,y:[0,0]}]});
 view.component.setContext({active:true,data:d,position:6,deformation:packet(.05)});
 assert.equal(view.root.dataset.deformation,'hidden');assert.equal(view.root.dataset.studyEnd,'6');
 assert.equal(view.root.dataset.deformationMagnification,'30');
 assert.match(view.nodes.readout.textContent,/both endpoints are pinned/);
 assert.ok(view.labels.includes('p(T) · pinned'));assert.ok(view.labels.includes('Finite push'));
 const first=view.strokes.filter(s=>s.color==='#6de8ff');assert.equal(first.length,2);
 const previous=JSON.stringify(first.map(s=>s.points));
 view.clear();view.component.setContext({deformation:packet(.1)});
 const changed=view.strokes.filter(s=>s.color==='#6de8ff');assert.equal(changed.length,2);
 assert.notEqual(JSON.stringify(changed.map(s=>s.points)),previous);
 assert.equal(view.component.getState().deformation.maxRadius,.1);
 view.clear();view.component.setContext({deformation:{type:'surface',T:6}});
 assert.equal(view.strokes.filter(s=>s.color==='#6de8ff').length,0);
 assert.match(view.nodes.readout.textContent,/surface deformation is shown on the torus/);
 view.clear();view.component.setContext({deformation:null});
 assert.equal(view.root.dataset.deformation,'');assert.equal(view.component.getState().deformation,null);
 assert.ok(view.labels.includes('Off surface A'));assert.ok(view.labels.includes('Off surface B'));
 view.component.setContext({deformation:packet(.1)});
 view.component.setContext({data:data(3,[]),position:2});
 assert.equal(view.component.getState().deformation,null,'A new curve cannot inherit an old finite push.');
 view.component.destroy();
});

test('compact finite views emphasize the reference push without normalizing amplitude or magnification',()=>{
 const view=fakeComponent({}, {width:520,height:160}),d=data(),packet=(a,b=0)=>({type:'hidden',T:6,
   samples:[{s:0,y:[0,0]},{s:3,y:[a,b]},{s:6,y:[0,0]}]});
 view.component.setContext({active:true,data:d,position:6,deformation:packet(.06)});
 const peak=()=>view.strokes.filter(s=>s.color==='#6de8ff')[0].points.at(-1)[1];
 const center=(34+160-28)/2,small=peak();
 view.clear();view.component.setContext({deformation:packet(.12)});
 const large=peak();assert.ok(Math.abs(large-center)>30,'A full permitted push stays prominent in the compact pane.');
 assert.ok(Math.abs((large-center)/(small-center)-2)<1e-12,'Changing physical amplitude cannot auto-fit the curve.');
 assert.ok(view.labels.includes('A axis'));assert.ok(view.labels.includes('B axis'));
 for(const [a,b]of [[.12,0],[0,.12],[.12/Math.sqrt(2),.12/Math.sqrt(2)],[.12/Math.sqrt(2),-.12/Math.sqrt(2)]]){
  view.clear();view.component.setContext({deformation:packet(a,b)});
  const points=view.strokes.filter(s=>s.color==='#6de8ff').flatMap(s=>s.points);
  assert.ok(points.every(p=>p[1]>=30-1e-10&&p[1]<=137+1e-10),'Default gain fits the permitted physical push.');
  assert.equal(view.root.dataset.pushClipped,'false');
 }
 view.clear();view.component.setContext({deformation:packet(.12)});const beforeGain=peak();
 view.clear();view.nodes.gain.value='200';view.nodes.gain.handlers.input();
 assert.ok(Math.abs((peak()-center)/(beforeGain-center)-2)<1e-12,'Magnification must enlarge the physical displacement instead of being fitted away.');
 assert.equal(view.root.dataset.pushClipped,'true');assert.ok(view.labels.includes('Push exceeds frame · reduce magnification'));
 view.component.destroy();
});

test('the study segment fills the horizontal frame independently of the unused original tail',()=>{
 const box={width:620,height:280},view=fakeComponent({},box),packet={type:'hidden',T:3,samples:[{s:0,y:[0,0]},{s:1.5,y:[.06,.06]},{s:3,y:[0,0]}]};
 const finite=()=>view.strokes.filter(s=>s.color==='#6de8ff').flatMap(s=>s.points);
 view.component.setContext({active:true,data:data(12),position:3,deformation:packet});
 const first=finite(),start=first[0],end=first.at(-1);
 assert.equal(start[0],50);assert.equal(end[0],570);assert.ok((end[0]-start[0])/box.width>.8);
 assert.equal(view.root.dataset.framing,'study-segment');assert.equal(view.root.dataset.displayEnd,'3');
 assert.ok(view.labels.includes('tail to y →'));assert.ok(!view.labels.includes('+2'),'Future events do not crowd the studied segment.');
 view.clear();view.component.setContext({data:data(60),position:3,deformation:{...packet}});
 assert.deepEqual(finite(),first,'Extending only the ghosted tail cannot shrink or move the study.');
 const immutable=JSON.stringify(packet.samples);
 view.clear();box.width=360;box.height=200;view.component.setContext({deformation:{...packet}});
 assert.equal(finite()[0][0],50);assert.equal(finite().at(-1)[0],310);
 assert.equal(JSON.stringify(packet.samples),immutable,'Resizing affects drawing coordinates, never the measured curve.');
 view.component.destroy();
});

test('the default study camera shows equal hidden pushes and preserves user camera choices',()=>{
 const view=fakeComponent({}, {width:600,height:280}),d=data(),packet={type:'hidden',T:6,
  samples:[{s:0,y:[0,0]},{s:3,y:[.12/Math.sqrt(2),.12/Math.sqrt(2)]},{s:6,y:[0,0]}]};
 const peak=()=>view.strokes.filter(s=>s.color==='#6de8ff')[0].points.at(-1);
 view.component.setContext({active:true,data:d,position:6,deformation:packet});
 const original=peak(),center=(34+280-28)/2;
 assert.ok(Math.abs(original[1]-center)>100,'Equal A/B coefficients must not be almost edge-on by default.');
 const key=key=>view.nodes.canvas.handlers.keydown({key,preventDefault(){}});
 view.clear();key('ArrowRight');const rotated=peak();
 assert.ok(Math.abs(rotated[1]-original[1])<10,'The first camera input continues from the displayed study angle without a jump.');
 view.clear();view.component.setContext({deformation:null});view.clear();view.component.setContext({deformation:{...packet}});
 assert.deepEqual(peak(),rotated,'Leaving and reopening a study preserves an audience-adjusted camera.');
 view.clear();key('Home');assert.deepEqual(peak(),original,'Home restores the study framing and angle.');
 view.component.destroy();
});

test('fixed-endpoint studies disable cutaway playback and hide the absent field-ring explanation',()=>{
 const view=fakeComponent({onPlay(){}}),d=data();
 view.component.setContext({active:true,data:d,position:6});
 assert.equal(view.nodes.play.disabled,false);assert.equal(view.nodes.play.title,'');
 assert.equal(view.nodes['field-ring-legend'].hidden,false);
 for(const deformation of [{type:'hidden',T:6,samples:[{s:0,y:[0,0]},{s:3,y:[.1,0]},{s:6,y:[0,0]}]},
   {type:'surface',T:6}]){
  view.component.setContext({deformation});
  assert.equal(view.nodes.play.disabled,true);assert.match(view.nodes.play.title,/endpoints stay pinned/);
  assert.equal(view.nodes['field-ring-legend'].hidden,true);
 }
 view.component.setContext({deformation:null});
 assert.equal(view.nodes.play.disabled,false);assert.equal(view.nodes.play.title,'');
 assert.equal(view.nodes['field-ring-legend'].hidden,false);
 view.component.destroy();
});

test('local study framing is independent of finite-result readiness and can be cleared throughout a slider hold',()=>{
 const view=fakeComponent({onPlay(){}}),d=data(),study={type:'hidden',T:3,magnification:30};
 const packet={...study,samples:[{s:0,y:[0,0]},{s:1.5,y:[.06,0]},{s:3,y:[0,0]}]};
 const finite=()=>view.strokes.filter(s=>s.color==='#6de8ff');
 view.component.setContext({active:true,data:d,position:3,study,deformation:null});
 assert.equal(view.root.dataset.framing,'study-segment');assert.equal(view.root.dataset.displayEnd,'3');
 assert.equal(finite().length,0,'Pending samples must not be replaced by an invented finite push.');
 assert.equal(view.nodes.play.disabled,true);assert.match(view.nodes.readout.textContent,/not yet available/);
 view.clear();view.component.setContext({deformation:packet});
 assert.equal(view.root.dataset.framing,'study-segment');assert.equal(view.root.dataset.displayEnd,'3');
 assert.equal(finite().length,2,'A finished result changes the curve, never the framing mode.');
 view.clear();view.component.setContext({study:null,deformation:null});
 for(const position of [3,4,4,4])view.component.setContext({position});
 assert.equal(view.root.dataset.framing,'whole-path');assert.equal(view.root.dataset.displayEnd,String(d.length));
 view.clear();view.component.setContext({study:{...study,T:4},deformation:null});
 assert.equal(view.root.dataset.framing,'study-segment');assert.equal(view.root.dataset.displayEnd,'4');
 assert.equal(finite().length,0,'Release can restore local framing before a result is ready.');
 view.component.setContext({data:data(2,[]),position:1});
 assert.equal(view.root.dataset.framing,'whole-path','A new path cannot inherit stale study framing.');
 view.component.destroy();
});


function animationClock(reducedMotion=false){
 let time=0,next=0;const jobs=new Map(),preference={matches:reducedMotion,handlers:{},
  addEventListener(type,handler){this.handlers[type]=handler;},removeEventListener(type){delete this.handlers[type];}};
 return {environment:{performance:{now:()=>time},requestAnimationFrame(fn){const id=++next;jobs.set(id,fn);return id;},
  cancelAnimationFrame(id){jobs.delete(id);},matchMedia:()=>preference},
  pending:()=>jobs.size,preference,
  step(ms){time+=ms;const frame=[...jobs.values()];jobs.clear();for(const fn of frame)fn(time);}};
}
function animatedView(reducedMotion=false){
 const clock=animationClock(reducedMotion),view=fakeComponent({}, {width:620,height:280},clock.environment);
 const study={type:'hidden',T:3,magnification:30};
 const packet={...study,samples:[{s:0,y:[0,0]},{s:1.5,y:[.06,.04]},{s:3,y:[0,0]}]};
 view.component.setContext({active:true,data:data(12),position:3});
 return {...view,clock,study,packet,
  axis:()=>view.strokes.filter(s=>s.color==='#dff9e9').at(-1).points,
  finite:()=>view.strokes.filter(s=>s.color==='#6de8ff').at(-1)?.points};
}

test('camera transition continuously expands the same segment without changing its fields or physical push',()=>{
 const v=animatedView(),original=v.axis(),field=v.component.getState().field.h,samples=JSON.stringify(v.packet.samples);
 v.clear();v.component.setContext({study:v.study,deformation:v.packet});
 assert.deepEqual(v.axis(),original,'The first animated frame must begin at the exact whole-path pose.');
 assert.equal(v.component.getState().framing.mode,'transition');
 assert.equal(v.component.getState().framing.progress,0);assert.equal(v.clock.pending(),1);
 v.clear();v.clock.step(400);const middle=v.axis(),framing=v.component.getState().framing;
 assert.equal(framing.progress,.5);assert.equal(framing.targetMode,'study-segment');
 assert.ok(framing.end>3&&framing.end<12);assert.equal(v.component.getState().field.h,field);
 v.clear();v.clock.step(400);const end=v.axis();
 assert.equal(v.component.getState().framing.mode,'study-segment');
 assert.equal(v.component.getState().framing.end,3);assert.equal(v.component.getState().framing.progress,1);
 assert.equal(v.clock.pending(),0);assert.equal(end[0][0],50);assert.equal(end[1][0],570);
 assert.ok(middle[1][0]>original[1][0]&&middle[1][0]<end[1][0],'The current endpoint visibly travels to the local right endpoint.');
 assert.equal(v.component.getState().field.h,field);assert.equal(JSON.stringify(v.packet.samples),samples);
 assert.equal(v.component.getState().deformation.maxRadius,Math.hypot(.06,.04));
 v.component.destroy();
});

test('preparation finishing during the zoom adds the measured curve without restarting its framing',()=>{
 const v=animatedView();v.component.setContext({study:v.study,deformation:null});v.clock.step(200);
 const before=v.component.getState().framing.progress;
 v.clear();v.component.setContext({study:{...v.study},deformation:v.packet});
 assert.equal(v.component.getState().framing.progress,before);assert.ok(v.finite());
 v.clock.step(200);assert.equal(v.component.getState().framing.progress,.5);
 v.component.setContext({study:{...v.study},deformation:{...v.packet}});
 v.clock.step(400);assert.equal(v.component.getState().framing.mode,'study-segment');
 assert.equal(v.clock.pending(),0,'Fresh numerical packet identities cannot prolong camera motion.');v.component.destroy();
});

test('regrabbing reverses the animation from the exact current pose and returns to the whole path',()=>{
 const v=animatedView(),original=v.axis();v.component.setContext({study:v.study,deformation:v.packet});v.clock.step(400);
 const middle=v.axis(),progress=v.component.getState().framing.progress;
 v.clear();v.component.setContext({study:null,deformation:null});
 assert.deepEqual(v.axis(),middle,'Reversal cannot snap to either settled camera.');
 assert.equal(v.component.getState().framing.progress,progress);
 assert.equal(v.component.getState().framing.targetMode,'whole-path');
 v.clock.step(60);assert.ok(v.component.getState().framing.progress<progress);
 v.clear();v.clock.step(60);assert.equal(v.component.getState().framing.mode,'whole-path');
 assert.equal(v.component.getState().framing.end,12);assert.deepEqual(v.axis(),original);assert.equal(v.clock.pending(),0);
 v.component.destroy();
});

test('a short traversal press visibly zooms out and release immediately starts the smooth local return',()=>{
 const v=animatedView();v.component.setContext({study:v.study,deformation:v.packet});v.clock.step(800);
 const localAxis=v.axis();assert.equal(v.component.getState().framing.progress,1);
 v.clear();v.component.setContext({study:null,deformation:null});
 assert.deepEqual(v.axis(),localAxis,'Press starts at the currently displayed pose.');
 v.clock.step(60);const halfway=v.axis(),out=v.component.getState().framing;
 assert.equal(out.targetMode,'whole-path');assert.equal(out.progress,.5,'A brief press must produce a noticeable global zoom.');
 assert.ok(out.end>3,'The displayed segment has visibly expanded before release.');
 v.clear();v.component.setContext({study:{...v.study},deformation:null});
 assert.deepEqual(v.axis(),halfway,'Release reverses from the exact pose without a jump.');
 assert.equal(v.component.getState().framing.targetMode,'study-segment','There is no artificial global dwell after release.');
 v.clock.step(400);const incoming=v.component.getState().framing.progress;
 assert.ok(incoming>.5&&incoming<1,'The local return retains its slower smooth transition.');
 v.component.setContext({study:{...v.study},deformation:{...v.packet}});v.clock.step(400);
 assert.equal(v.component.getState().framing.mode,'study-segment');assert.equal(v.component.getState().framing.end,3);
 assert.equal(v.clock.pending(),0,'Finishing numerical work cannot prolong the return.');v.component.destroy();
});

test('a traversal press survives descendant blur and keeps the actual cutaway global until pointer release',()=>{
 const Hold=require('./traversal-hold.js');
 // Preserve the cutaway's existing listeners while adding capture observers,
 // just as the real document and window dispatch to both components.
 function events(target){
  const listeners=new Map(Object.entries(target.handlers||{}).map(([type,fn])=>[type,new Set([fn])]));
  target.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
  target.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
  target.fire=(type,extra={})=>{for(const fn of [...(listeners.get(type)||[])])fn({target,pointerId:7,button:0,buttons:1,isPrimary:true,...extra});};
  return target;
 }
 for(const origin of [0,1]){
  const v=animatedView(),doc=events(v.doc),win=events(doc.defaultView);
  const sliders=[events({ownerDocument:doc,disabled:false}),events(v.nodes.position)];sliders[1].ownerDocument=doc;
  let hold,latestStudy=v.study,latestPacket=v.packet;
  const publish=()=>v.component.setContext({position:latestStudy.T,
   ...(hold?.isHeld()?{study:null,deformation:null}:{study:latestStudy,deformation:latestPacket})});
  hold=Hold.create(sliders,{onChange:publish});publish();v.clock.step(800);
  assert.equal(v.component.getState().framing.mode,'study-segment');
  sliders[origin].fire('pointerdown');
  assert.equal(hold.isHeld(),true);assert.equal(v.component.getState().framing.targetMode,'whole-path');
  // Focusing a native range blurs the previously focused button. Window's
  // capture listener observes that element blur, although the window is active.
  win.fire('blur',{target:{ownerDocument:doc,tagName:'BUTTON'}});
  assert.equal(hold.isHeld(),true,'A descendant blur must not release a still-held traversal slider.');
  const T=origin===0?3:4; // Include a stationary press and a changed traversal.
  latestStudy={...v.study,T};latestPacket=null;publish();v.clock.step(400);
  assert.equal(v.component.getState().framing.targetMode,'whole-path');
  latestPacket={...latestStudy,samples:[{s:0,y:[0,0]},{s:T/2,y:[.06,.04]},{s:T,y:[0,0]}]};
  for(let n=0;n<3;n++){latestStudy={...latestStudy};latestPacket={...latestPacket};publish();}
  v.clock.step(400);
  assert.equal(v.component.getState().framing.mode,'whole-path');assert.equal(v.component.getState().framing.end,12);
  assert.equal(hold.isHeld(),true,'Idle motion and finishing numerical packets cannot restore local framing.');
  win.fire('pointerup',{buttons:0});assert.equal(hold.isHeld(),false);
  assert.equal(v.component.getState().framing.targetMode,'study-segment');
  v.clock.step(400);assert.equal(v.component.getState().framing.mode,'transition','Release keeps the smooth return to local.');
  v.clock.step(400);assert.equal(v.component.getState().framing.mode,'study-segment');assert.equal(v.component.getState().framing.end,T);
  sliders[origin].fire('pointerdown');win.fire('blur',{target:win});
  assert.equal(hold.isHeld(),false,'Actual window focus loss still ends the held gesture.');
  v.clock.step(800);assert.equal(v.component.getState().framing.mode,'study-segment');
  hold.destroy();v.component.destroy();
 }
});

test('camera input during a transition starts from the displayed angle',()=>{
 const v=animatedView();v.component.setContext({study:v.study,deformation:v.packet});v.clock.step(400);
 const before=v.finite();
 const key=key=>v.nodes.canvas.handlers.keydown({key,preventDefault(){}});
 v.clear();key('ArrowLeft');key('ArrowRight');const after=v.finite();
 for(let i=0;i<before.length;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(before[i][j]-after[i][j])<1e-10,
  'Opposite camera steps must return to the displayed intermediate angle, not jump to a default study angle.');
 v.component.destroy();
});

test('closing, hiding, replacing a path, and destroying cancel pending camera frames',()=>{
 for(const action of ['close','hidden','path','destroy']){
  const v=animatedView();v.component.setContext({study:v.study,deformation:v.packet});v.clock.step(200);
  assert.equal(v.clock.pending(),1);
  if(action==='close')v.component.setContext({active:false});
  if(action==='hidden'){v.doc.hidden=true;v.doc.handlers.visibilitychange();}
  if(action==='path')v.component.setContext({data:data(2,[]),position:1});
  if(action==='destroy')v.component.destroy();
  assert.equal(v.clock.pending(),0,action+' must cancel its frame request.');
  if(action==='close')v.component.setContext({active:true});
  if(action==='hidden'){v.doc.hidden=false;v.doc.handlers.visibilitychange();}
  if(action==='close'||action==='hidden')assert.equal(v.component.getState().framing.mode,'study-segment','Reopening uses the settled current target.');
  if(action==='path')assert.equal(v.component.getState().framing.mode,'whole-path','A replacement path cannot retain old study coordinates.');
  v.component.destroy();
 }
});

test('reduced motion settles immediately and a preference change ends an active transition',()=>{
 const quiet=animatedView(true);quiet.component.setContext({study:quiet.study,deformation:quiet.packet});
 assert.equal(quiet.component.getState().framing.mode,'study-segment');assert.equal(quiet.clock.pending(),0);quiet.component.destroy();
 const v=animatedView();v.component.setContext({study:v.study,deformation:v.packet});v.clock.step(200);
 v.clock.preference.matches=true;v.clock.preference.handlers.change();
 assert.equal(v.component.getState().framing.mode,'study-segment');assert.equal(v.clock.pending(),0);
 v.component.setContext({study:null,deformation:null});
 assert.equal(v.component.getState().framing.mode,'whole-path');assert.equal(v.clock.pending(),0);v.component.destroy();
});

function navigableView(box={width:700,height:330}){
 let handlers,cancellations=0,destructions=0;
 const gestures={create(options){handlers=options;return {cancel(){cancellations++;},destroy(){destructions++;}};}};
 const v=fakeComponent({gestures},box);
 return {...v,navigation:()=>handlers,cancellations:()=>cancellations,destructions:()=>destructions};
}
const closePixel=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,a+' differs from '+b);
const passedAxis=v=>v.strokes.find(row=>row.color==='#dff9e9').points;

test('shared touch navigation anchors simultaneous pan and pinch without changing hidden magnification or physical data',()=>{
 const v=navigableView(),d=data(12),original=JSON.stringify(d);
 v.component.setContext({active:true,data:d,position:2});
 const input=v.navigation(),before=passedAxis(v).map(p=>p.slice()),h=v.component.getState().field.h;
 const from={x:before[1][0],y:before[1][1],span:100},to={x:from.x+70,y:from.y+35,span:200};
 input.onInput('touch');v.clear();input.onTransform({from,to,factor:.5});
 const enlarged=passedAxis(v).at(-1),state=v.component.getState();
 closePixel(enlarged[0],to.x);closePixel(enlarged[1],to.y);
 assert.equal(state.camera.zoom,2);assert.equal(state.gain,1);assert.equal(state.field.h,h);
 assert.equal(JSON.stringify(d),original);assert.match(v.nodes.canvas.attributes['aria-label'],/two fingers pan and pinch/);
 v.clear();input.onTransform({from:to,to:from,factor:2});
 const returned=passedAxis(v);for(let i=0;i<2;i++)for(let k=0;k<2;k++)closePixel(returned[i][k],before[i][k]);
 assert.equal(v.component.getState().camera.zoom,1);v.component.destroy();assert.equal(v.destructions(),1);
});

test('hidden camera navigation crosses both end-on poles and reaches inverted views without singular projections',()=>{
 const v=navigableView(),d=data(12);v.component.setContext({active:true,data:d,position:2});
 const initial=v.component.getState().camera.tilt,input=v.navigation(),axis=passedAxis(v);
 assert.ok(axis[0][0]<axis[1][0]);
 v.clear();input.onRotate({dx:0,dy:Math.PI/.008,pointerType:'touch'});
 const inverted=passedAxis(v);assert.ok(inverted[0][0]>inverted[1][0],'The audience can view the full reversed longitudinal direction.');
 const setTilt=value=>{const current=v.component.getState().camera.tilt;v.clear();input.onRotate({dx:0,dy:(value-current)/.008,pointerType:'touch'});};
 for(const pole of [-Math.PI/2,Math.PI/2]){
  setTilt(pole-1e-8);const before=passedAxis(v).map(p=>p.slice());
  setTilt(pole+1e-8);const after=passedAxis(v);
  for(let i=0;i<2;i++)for(let k=0;k<2;k++)closePixel(after[i][k],before[i][k],.001);
  assert.ok(v.strokes.every(row=>row.points.every(p=>p.every(Number.isFinite))));
 }
 setTilt(initial);const restored=passedAxis(v);for(let i=0;i<2;i++)for(let k=0;k<2;k++)closePixel(restored[i][k],axis[i][k]);
 v.component.destroy();
});

test('double-tap focus recenters a picked cutaway point and retains it through rotation; background fits without altering field gain',()=>{
 const v=navigableView(),d=data(12);v.component.setContext({active:true,data:d,position:2});
 v.nodes.gain.value='150';v.nodes.gain.handlers.input();
 const input=v.navigation(),tip=passedAxis(v).at(-1),position={x:tip[0],y:tip[1],pointerType:'touch'};
 v.clear();input.onFocus(position);
 closePixel(v.component.getState().camera.focus.s,2);
 closePixel(passedAxis(v).at(-1)[0],350);closePixel(passedAxis(v).at(-1)[1],166);
 v.clear();input.onRotate({dx:130,dy:340,pointerType:'touch'});
 closePixel(passedAxis(v).at(-1)[0],350);closePixel(passedAxis(v).at(-1)[1],166);
 v.clear();input.onTransform({from:{x:350,y:166},to:{x:400,y:200},factor:.5});
 const chosen=v.component.getState().camera;assert.equal(chosen.zoom,2);assert.notDeepEqual(chosen.pan,[0,0]);
 const points=v.strokes.flatMap(row=>row.points);let blank=null,clearance=0;
 for(let x=5;x<700;x+=35)for(let y=5;y<330;y+=35){const distance=Math.min(...points.map(p=>Math.hypot(x-p[0],y-p[1])));
  if(distance>clearance){clearance=distance;blank={x,y,pointerType:'touch'};}}
 assert.ok(clearance>32,'The test double-taps a genuinely empty part of the pane.');
 v.clear();input.onFocus(blank);
 const fitted=v.component.getState();assert.equal(fitted.camera.focus,null);assert.equal(fitted.camera.zoom,1);
 assert.deepEqual(fitted.camera.pan,[0,0]);assert.equal(fitted.gain,1.5);assert.equal(fitted.camera.spin,chosen.spin);assert.equal(fitted.camera.tilt,chosen.tilt);
 v.nodes.reset.handlers.click();const reset=v.component.getState();assert.equal(reset.gain,1);assert.equal(reset.camera.focus,null);
 assert.equal(reset.camera.zoom,1);assert.deepEqual(reset.camera.pan,[0,0]);assert.equal(reset.camera.spin,-.75);assert.equal(reset.camera.tilt,.66);
 v.component.destroy();
});

test('cutaway camera framing survives resize and close-up navigation always permits zooming out',()=>{
 const box={width:700,height:330},v=navigableView(box),d=data(12);v.component.setContext({active:true,data:d,position:2});
 const input=v.navigation(),from={x:350,y:166},to={x:400,y:200};
 input.onTransform({from,to,factor:1e-9});const close=v.component.getState();assert.equal(close.camera.zoom,64);
 v.clear();input.onTransform({from:to,to,factor:2});assert.equal(v.component.getState().camera.zoom,32,'Outward navigation works after the close-up limit.');
 const pan=v.component.getState().camera.pan.slice();box.width=1000;box.height=700;v.resize();
 assert.deepEqual(v.component.getState().camera.pan,pan);assert.equal(v.component.getState().camera.zoom,32);assert.equal(v.component.getState().gain,1);
 const before=v.cancellations();v.component.setContext({active:false});assert.ok(v.cancellations()>before);
 const idle=v.draws();input.onRotate({dx:10,dy:10});input.onTransform({from,to,factor:2});assert.equal(v.draws(),idle);
 v.component.destroy();assert.equal(v.destructions(),1);
});

test('close-up focus picks visible line interiors between widely separated sample vertices without fitting the view away',()=>{
 for(const finite of [false,true]){
  const v=navigableView(),d=data(12),packet={type:'hidden',T:6,samples:[{s:0,y:[0,0]},{s:3,y:[.06,0]},{s:6,y:[0,0]}]};
  v.component.setContext({active:true,data:d,position:2,...(finite?{deformation:packet}:{})});
  const input=v.navigation(),pick=finite?v.strokes.filter(row=>row.color==='#6de8ff')[0].points.at(-1):passedAxis(v).at(-1);
  input.onFocus({x:pick[0],y:pick[1]});v.clear();
  input.onTransform({from:{x:350,y:168},to:{x:350,y:168},factor:1e-9});
  const state=v.component.getState(),line=finite?v.strokes.filter(row=>row.color==='#6de8ff').at(-1).points:
   v.strokes.find(row=>row.color==='#a7d8cb70').points;
  const t=finite?.005:2.025/12,spot={x:interpolatePixel(line[0][0],line[1][0],t),y:interpolatePixel(line[0][1],line[1][1],t)};
  assert.ok(spot.x>0&&spot.x<700&&spot.y>0&&spot.y<330,'The target lies on a visible line interior.');
  if(finite)assert.ok(Math.hypot(spot.x-line[0][0],spot.y-line[0][1])>32,'The visible finite-curve point is far from its sample vertices.');
  v.clear();input.onFocus(spot);const focused=v.component.getState();
  assert.equal(focused.camera.zoom,64,'A visible line must focus rather than being mistaken for blank space and fitting all.');
  closePixel(focused.camera.focus.s,finite?3.015:2.025);assert.equal(focused.gain,state.gain);
  assert.equal(JSON.stringify(d),JSON.stringify(data(12)));v.component.destroy();
 }
});
const interpolatePixel=(a,b,t)=>a+(b-a)*t;

test('the real multi-pointer controller pans and pinches the cutaway and yields to a Pencil operating its controls',()=>{
 const gestures=require('./camera-gestures.js'),v=fakeComponent({gestures}),d=data(12),source=JSON.stringify(d);
 v.component.setContext({active:true,data:d,position:2});let clock=0;
 const pointer=(type,id,x,y,extra={})=>{
  const event={type,target:v.nodes.canvas,pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0,buttons:1,
   isPrimary:id===1,timeStamp:clock+=20,cancelable:true,preventDefault(){this.prevented=true;},...extra};
  if(type==='pointerdown'){v.doc.handlers.pointerdown?.(event);if(event.target===v.nodes.canvas)v.nodes.canvas.handlers.pointerdown(event);}
  else v.doc.defaultView.handlers[type]?.(event);
  return event;
 };
 pointer('pointerdown',1,100,100);pointer('pointermove',1,110,100);
 const first=v.component.getState().camera;pointer('pointerdown',2,200,100);
 assert.deepEqual(v.component.getState().camera,first,'A second finger starts from the existing pose.');
 pointer('pointermove',1,100,100);assert.ok(v.component.getState().camera.zoom>1);
 assert.equal(v.component.getState().gain,1);assert.equal(v.component.getState().field.h,J.hiddenValue(2,c));
 pointer('pointerup',2,200,100);const settled=v.component.getState().camera;
 pointer('pointermove',1,100,100);assert.deepEqual(v.component.getState().camera,settled,'Lifting one finger cannot jump the remaining drag.');
 const pen=pointer('pointerdown',7,100,200,{pointerType:'pen',target:v.nodes.gain,isPrimary:true});
 assert.equal(pen.prevented,undefined,'Pencil contacts on ordinary controls keep their native behavior.');
 const beforePalm=v.component.getState().camera;pointer('pointermove',1,130,150);
 assert.deepEqual(v.component.getState().camera,beforePalm,'A resting finger cannot move the camera while the Pencil controls magnification.');
 pointer('pointerup',7,100,200,{pointerType:'pen',target:v.nodes.gain});pointer('pointermove',1,150,170);
 assert.deepEqual(v.component.getState().camera,beforePalm,'An old palm contact cannot resume a camera drag after Pencil release.');
 pointer('pointerdown',3,150,170);pointer('pointermove',3,160,180);
 assert.notEqual(v.component.getState().camera.spin,beforePalm.spin,'Fresh intentional touch works after Pencil use.');
 assert.equal(JSON.stringify(d),source);v.component.destroy();assert.equal(v.doc.defaultView.handlers.pointermove,undefined);
});
