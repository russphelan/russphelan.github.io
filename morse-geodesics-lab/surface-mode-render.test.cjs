'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('./downhill.js'),J=require('./jacobi.js'),S=require('./surface.js'),D=require('./showcase-data.js'),Display=require('./hidden-push-display.js');
const Sampling=require('./deformation-sampling.js'),Tube=require('./deformation-tube.js');
const VariationField=require('./variation-field.js');
const SurfaceDisplay=require('./surface-push-display.js');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'The rendering test must execute the current app implementation.');
  return source.slice(a,b);
}
const callbackLine=source.split('\n').find(line=>line.includes('onUpdate:study=>'));
assert.ok(callbackLine);
const callback=callbackLine.slice(callbackLine.indexOf('onUpdate:')+'onUpdate:'.length).trim();
const renderer=section('  function reducedPoints(','  function curveGPU(')+
  section('  function clearDownhillGPU(','  function hiddenStudyContext(')+
  section('  function clearGPU()','  function renderGPU(')+
  section('  function hiddenDisplayGeometry(','  function drawDownhillGL(');

function harness(data,model){
  const uploads=[],deleted=[];let draws=0,samples=0;
  const context={TAU:2*Math.PI,focusData:data,downhillControls:{},downhillStudy:null,downhillOriginalGPU:null,downhillPathGPU:null,
    downhillReferenceData:null,downhillReferenceT:null,downhillGuidesGPU:null,downhillDisplayStudy:null,downhillDisplay:null,gpu:new Map(),
    window:{GeodesicDownhill:H,GeodesicHiddenPushDisplay:Display,GeodesicSurfacePushDisplay:SurfaceDisplay,GeodesicDeformationSampling:{...Sampling,sample(...args){samples++;return Sampling.sample(...args);},sampleCurve(...args){if(args[2]?.mapSample)samples++;return Sampling.sampleCurve(...args);}},GeodesicDeformationTube:Tube,GeodesicVariationField:VariationField},
    model:()=>model,sub:(a,b)=>a.map((v,i)=>v-b[i]),
    cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    unit:a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);},
    upload(positions,normals){const item={positions:Array.from(positions),normals:Array.from(normals),deleted:false};uploads.push(item);return item;},
    removeGPU(item){if(item){item.deleted=true;deleted.push(item);}},
    handleSurfaceTraversalStudy(){return false;},syncDownhillLayout(){},requestDraw(){draws++;}};
  context.activeDownhill=()=>context.downhillStudy;
  vm.runInNewContext(renderer+'\nvar updateStudy='+callback+';',context);
  return {context,uploads,deleted,draws:()=>draws,samples:()=>samples,setModel(next){model=next;}};
}

test('repeated surface mode updates replace the actual 3D tube geometry and never reuse a stale GPU deformation',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-clear-pinch'),model);
  const T=data.events.filter(e=>e.surface)[1].s+.1,A=.06;
  const profiles=[1,2].map(mode=>H.prepare({data,model,T,type:'surface',mode}));
  const v=harness(data,model),expected=new Map();let previous=null,reference=null;
  for(const mode of [1,2,1,2,2,1,2,1]){
    const profile=profiles[mode-1],result=profile.sample(A,0,{count:120});
    v.context.updateStudy({active:true,comparison:true,data,T,type:'surface',mode,profile,result,amplitude:[A,0]});
    assert.equal(v.context.downhillStudy.mode,mode);assert.equal(v.context.downhillStudy.T,T);
    assert.equal(v.context.downhillPathGPU,null);
    if(previous){
      assert.equal(v.context.downhillOriginalGPU,previous.reference,'Mode and push changes retain the unchanged reference tube.');
      assert.equal(previous.reference.deleted,false);assert.equal(previous.deformed.deleted,true);
      assert.equal(previous.guides.deleted,true);assert.equal(previous.guides.band.deleted,true,'Changing mode releases the old field and filled band.');
    }
    const items=v.context.downhillBuffers();
    assert.ok(items.deformed);assert.equal(items.deformed.deleted,false);
    const shape=JSON.stringify(items.deformed.positions);
    if(expected.has(mode))assert.equal(shape,expected.get(mode),'A mode restores its own computed 3D shape after any sequence of switches.');
    expected.set(mode,shape);
    if(reference)assert.equal(items.reference,reference,'The exact original buffer is reused across every mode switch.');
    reference=items.reference;
    const uploads=v.uploads.length;
    assert.equal(v.context.downhillBuffers().deformed,items.deformed,'Rendering the same state again reuses its current buffer.');
    assert.equal(v.uploads.length,uploads);
    previous=items;
  }
  assert.notEqual(expected.get(1),expected.get(2),'The real eigenmodes must upload different tube vertices at the same physical push.');
  assert.equal(v.samples(),2,'Alternating warm modes must reuse their exact adaptive CPU drawings.');
  assert.equal(v.uploads.length,25,'Eight fresh deformation/field/band groups share just one reference upload.');assert.equal(v.draws(),8);
  v.context.updateStudy({active:true,comparison:true,data,T,type:'surface',mode:2,profile:null,result:null,amplitude:[0,0],status:'preparing'});
  assert.equal(previous.deformed.deleted,true);
  assert.equal(v.context.downhillBuffers().deformed,null,'Pending preparation cannot retain a previous mode’s finite push.');
  assert.equal(reference.deleted,false,'Preparation on the same interval keeps its reference.');
  const nextT=T+.05;
  v.context.updateStudy({active:true,data,T:nextT,type:'surface',mode:2,result:null,status:'preparing'});
  const moved=v.context.downhillBuffers();
  assert.equal(reference.deleted,true,'Changing the endpoint invalidates its original prefix.');
  assert.notEqual(moved.reference,reference);assert.notDeepEqual(moved.reference.positions,reference.positions);
  assert.equal(moved.deformed,null);
  const nextData={...data};v.context.focusData=nextData;
  v.context.updateStudy({active:true,data:nextData,T:nextT,type:'surface',mode:1,result:null,status:'preparing'});
  const replaced=v.context.downhillBuffers();
  assert.equal(moved.reference.deleted,true,'Curve identity owns the reference even at an unchanged T.');
  assert.notEqual(replaced.reference,moved.reference);
  v.context.updateStudy(null);assert.equal(v.context.downhillBuffers(),null);
  assert.equal(replaced.reference.deleted,true,'Closing the study releases its reference.');
  assert.equal(v.context.downhillOriginalGPU,null);assert.equal(v.context.downhillPathGPU,null);
  assert.equal(v.context.downhillReferenceData,null);assert.equal(v.context.downhillReferenceT,null);
  v.context.updateStudy({active:true,data:nextData,T:nextT,type:'surface',mode:1,result:null,status:'preparing'});
  const reopened=v.context.downhillBuffers();
  v.context.clearGPU();assert.equal(reopened.reference.deleted,true,'Full scene cleanup also discards the study cache.');
  assert.equal(v.context.downhillReferenceData,null);assert.equal(v.context.downhillOriginalGPU,null);
});

test('surface drawing reuse respects the full physical and display context and bounds retained meshes',()=>{
  const model={normal:()=>[0,0,1],project:p=>p.slice(),curvature:()=>0,value:p=>p[2]};
  const data={length:4,events:[],sampleAt:s=>({s,point:[s,0,0],tangent:[1,0,0]})},T=4;
  const profiles=[1,2].map(mode=>H.prepare({data,model,T,type:'surface',mode})),v=harness(data,model);
  function draw(amplitude=.03,changes={}){
    const study={active:true,data,T,type:'surface',mode:1,profile:profiles[0],displayProfiles:profiles,
      displayMaxAmplitude:.12,amplitude:[amplitude,0],result:profiles[0].sample(amplitude),...changes};
    v.context.updateStudy(study);return v.context.deformationDisplayGeometry();
  }
  const original=draw(),before=v.samples();
  assert.equal(draw(),original);assert.equal(v.samples(),before,'Identical newly emitted studies reuse the computed drawing.');
  assert.notEqual(draw(.03,{displayMaxAmplitude:.1}),original,'The common comparison cap affects the magnification preflight.');
  assert.notEqual(draw(.03,{displayProfiles:[profiles[0]]}),original,'Comparison profile ownership is part of the display context.');
  const physical=draw(.04);assert.notDeepEqual(physical.points,original.points);
  const otherModel={...model};v.setModel(otherModel);assert.notEqual(draw(),original,'A different surface model cannot reuse another model’s projection.');
  v.setModel(model);
  const otherProfile=H.prepare({data,model,T,type:'surface',mode:1});
  const repeated=draw(.03,{profile:otherProfile,displayProfiles:[otherProfile,profiles[1]]});
  assert.notEqual(repeated,original);assert.deepEqual(repeated.points,original.points,'Recomputation must produce exactly the same vertices.');
  assert.deepEqual(repeated.field.positions,original.field.positions);assert.deepEqual(repeated.field.band.positions,original.field.band.positions);
  for(let i=1;i<=8;i++)draw(i*.01);
  assert.equal(vm.runInNewContext('surfaceDeformationCache.length',v.context),4,'Continuous pushes cannot retain an unbounded drawing history.');
  const previous=v.samples();draw(.03);assert.equal(v.samples(),previous+1,'An evicted drawing must be recomputed.');
  v.context.updateStudy(null);assert.equal(vm.runInNewContext('surfaceDeformationCache.length',v.context),0,'Closing the study releases retained CPU drawings.');
});

test('exact surface rendering omits redundant physical probes while preserving every displayed vertex',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978;
  for(const mode of [1,2]){
    const original=H.prepare({data,model,T,type:'surface',mode}),amplitude=[.12,0],result=original.sample(...amplitude);
    const argumentsSeen=[],profile={...original,displaySampleAt(A,B,s){argumentsSeen.push(A);return original.displaySampleAt(A,B,s);}};
    const study={active:true,data,T,type:'surface',mode,profile,result,amplitude};
    const mapping=SurfaceDisplay.createMap(study,model),expected=Sampling.sample(study,model,{mapSample:mapping.mapSample});
    argumentsSeen.length=0;
    const v=harness(data,model);v.context.updateStudy(study);const display=v.context.deformationDisplayGeometry();
    assert.ok(argumentsSeen.length>100);assert.ok(argumentsSeen.every(A=>A===0),'Adaptive drawing must not evaluate the unused physical-A curve.');
    assert.deepEqual(display.points,expected.displayPoints);assert.deepEqual(display.diagnostics,expected.diagnostics);
    assert.deepEqual(result,original.sample(...amplitude),'Drawing optimizations cannot alter physical samples or measured length.');
    const current={...profile,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:.12,displayReferenceAmplitude:.12};
    v.context.updateStudy({...study,profile:current});const live=v.context.deformationDisplayGeometry();
    assert.deepEqual(live.points,display.points);assert.deepEqual(live.field.positions,display.field.positions);
    assert.deepEqual(live.field.band.positions,display.field.band.positions);
    v.context.updateStudy(null);
  }
});

function drain(steps){let next;do{next=steps.next();}while(!next.done);return next.value;}

test('verified-current upgrades reuse only the identical exact drawing basis and mapping context',()=>{
  const model={normal:()=>[0,0,1],project:p=>p.slice(),curvature:()=>0,value:p=>p[2]};
  const data={length:4,events:[],sampleAt:s=>({s,point:[s,0,0],tangent:[1,0,0]})},T=4,A=.12;
  for(const type of ['surface','hidden']){
    const basis=drain(H.prepareBasisSteps({data,model,T,type,mode:1})),current=drain(basis.verifyCurrentSteps(A)),full=drain(basis.finishSteps());
    assert.equal(current.coefficient,full.coefficient);assert.equal(H.displayProfileModel(current),model);
    const v=harness(data,model),study=profile=>({active:true,data,T,type,mode:1,hiddenDirection:1,profile,result:profile.sample(A),amplitude:[A,0]});
    v.context.updateStudy(study(current));const original=v.context.deformationDisplayGeometry(),count=v.samples();
    v.context.updateStudy(study(full));assert.equal(v.context.deformationDisplayGeometry(),original);
    assert.equal(v.samples(),count,'Completing the full physical range cannot repeat the same adaptive drawing.');
    if(type==='surface'){
      v.context.updateStudy({...study(current),amplitude:[A/2,0]});
      assert.throws(()=>v.context.deformationDisplayGeometry(),/current surface push/,'A cached drawing cannot bypass verification of the requested amplitude.');
    }else{
      v.context.updateStudy({...study(full),hiddenDirection:2,amplitude:[0,A],result:full.sample(0,A)});
      assert.notEqual(v.context.deformationDisplayGeometry(),original,'The other hidden direction has its own exact drawing.');
    }
    v.context.updateStudy({...study(full),displayMaxAmplitude:.06,displayMagnification:6});
    if(type==='surface')assert.throws(()=>v.context.deformationDisplayGeometry(),/physical push range/);
    else assert.notEqual(v.context.deformationDisplayGeometry(),original,'A different drawing scale cannot reuse the prior mesh.');
  }
});

test('reusing owned baseline normals preserves exact surface and both hidden drawings on short and long segments',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),A=.12;
  for(const T of [3,12])for(const type of ['surface','hidden'])for(const mode of [1,2]){
    const basis=drain(H.prepareBasisSteps({data,model,T,type,mode})),profile=drain(basis.verifyCurrentSteps(A));
    const fallback={...profile};
    assert.equal(H.displayProfileModel(fallback),undefined,'A copied or synthetic profile does not attest the source of its frames.');
    for(const hiddenDirection of type==='hidden'?[1,2]:[1]){
      const amplitude=hiddenDirection===2?[0,A]:[A,0],result=profile.sample(...amplitude),v=harness(data,model);
      const study={active:true,data,T,type,mode,hiddenDirection,profile,amplitude,result};
      v.context.updateStudy({...study,profile:fallback});const expected=v.context.deformationDisplayGeometry();
      v.context.updateStudy(study);const actual=v.context.deformationDisplayGeometry();
      assert.deepEqual(actual.points,expected.points);assert.deepEqual(actual.normals,expected.normals);
      assert.deepEqual(actual.diagnostics,expected.diagnostics);assert.deepEqual(actual.field.positions,expected.field.positions);
      assert.deepEqual(actual.field.normals,expected.field.normals);assert.deepEqual(actual.field.band.positions,expected.field.band.positions);
      assert.deepEqual(actual.field.band.normals,expected.field.band.normals);
      assert.deepEqual(result,profile.sample(...amplitude),'Drawing cannot change physical samples or accurately measured lengths.');
    }
  }
});

test('the reference and pushed surface curves share exact baseline evaluations without changing either mesh',()=>{
  const presentation=require('./presentation-data.js');
  for(const [surface,curve,T]of [['double',D.curves.find(c=>c.id==='showcase-neck-return'),12],['triple',presentation.stages.triple.curves.at(-1),30]]){
    const originalModel=S.getModel(surface);let projections=0;
    const model={...originalModel,project:p=>{projections++;return originalModel.project(p);}},data=J.prepare(curve,model);
    for(const mode of [1,2]){
      function draw(shared){
        const basis=drain(H.prepareBasisSteps({data,model,T,type:'surface',mode})),prepared=drain(basis.verifyCurrentSteps(.12));
        // A copied profile has the same exact evaluator but no model-ownership
        // attestation, so it exercises the original independent reference path.
        const profile=shared?prepared:{...prepared},v=harness(data,model);
        v.context.updateStudy({active:true,data,T,type:'surface',mode,profile,amplitude:[.12,0],result:profile.sample(.12)});
        projections=0;const items=v.context.downhillBuffers();return {items,projections};
      }
      const before=draw(false),after=draw(true);
      for(const part of ['reference','deformed','guides']){
        assert.deepEqual(after.items[part].positions,before.items[part].positions,`${part} vertices remain exact at T=${T}, mode ${mode}.`);
        assert.deepEqual(after.items[part].normals,before.items[part].normals);
      }
      assert.deepEqual(after.items.guides.band.positions,before.items.guides.band.positions);
      assert.deepEqual(after.items.guides.band.normals,before.items.guides.band.normals);
      assert.ok(after.projections<.8*before.projections,'Sharing exact baseline evaluations removes at least a fifth of the repeated projections.');
    }
  }
});

function hiddenFixture(){
  const model=S.getModel('torus'),radius=1.8,length=8.5;
  const data={length,curvature:.36,events:[],sampleAt(s){
    const t=s/radius;return {s,point:[radius*Math.cos(t),radius*Math.sin(t),0],tangent:[-Math.sin(t),Math.cos(t),0]};
  }};
  const T=Math.PI/Math.sqrt(data.curvature)+.15,profile=H.prepare({data,model,T,type:'hidden',mode:1});
  return {data,model,T,profile};
}

test('the app retains every adapted deformation vertex beyond the catalogue renderer point limit',()=>{
  const {data,model,T}=hiddenFixture(),v=harness(data,model),count=1600;
  const points=Array.from({length:count+1},(_,i)=>{
    const s=i===count?T:T*i/count,p=data.sampleAt(s).point;
    return {s,point:p,original:p.slice(),normal:model.normal(p),f:0,y:[0,0]};
  });
  v.context.updateStudy({active:true,data,T,type:'surface',mode:1,result:{points},amplitude:[0,0]});
  const mesh=v.context.downhillBuffers().deformed;
  assert.equal(mesh.positions.length,count*10*6*3,'All 1,600 adapted segments must reach the uploaded ten-sided tube.');
  assert.equal(mesh.normals.length,mesh.positions.length);
});

test('hidden direction and display-scale switches replace actual 3D geometry while retaining physical lengths and reference buffers',()=>{
  const {data,model,T,profile}=hiddenFixture(),v=harness(data,model),expected=new Map(),A=.07;
  let reference=null,previous=null,measuredLength=null;
  for(const [direction,magnification]of [[1,3],[2,3],[1,6],[2,6],[1,3],[2,3],[1,1]]){
    const amplitude=direction===1?[A,0]:[0,A],result=profile.sample(...amplitude,{count:120});
    const physical=JSON.stringify(result),study={active:true,data,T,type:'hidden',mode:1,hiddenDirection:direction,
      displayMagnification:magnification,profile,result,amplitude};
    if(measuredLength)assert.deepEqual(result.length,measuredLength,'Equal hidden push sizes retain the same ambient-metric length in either direction.');
    measuredLength=result.length;
    v.context.updateStudy(study);
    assert.equal(v.context.downhillPathGPU,null);assert.equal(v.context.downhillGuidesGPU,null);
    if(previous){assert.equal(previous.deformed.deleted,true);assert.equal(previous.guides.deleted,true);assert.equal(previous.reference.deleted,false);}
    const items=v.context.downhillBuffers(),display=v.context.hiddenDisplayGeometry();
    assert.ok(items.deformed.positions.length>0);assert.ok(items.guides.positions.length>0);
    assert.equal(display.direction,direction);assert.equal(display.magnification,magnification);
    assert.equal(display.projection,'surface','The main view defaults to surface-following illustration directions.');
    assert.equal(JSON.stringify(result),physical,'Drawing must not mutate sampled physical coordinates or length measurements.');
    assert.deepEqual(display.points[0],result.points[0].original);assert.deepEqual(display.points.at(-1),result.points.at(-1).original);
    if(reference)assert.equal(items.reference,reference,'Only the fixed original segment owns its reference tube.');
    reference=items.reference;
    const key=direction+':'+magnification,shape=JSON.stringify(items.deformed.positions);
    if(expected.has(key))assert.equal(shape,expected.get(key),'Returning to a direction and scale restores its exact displayed curve.');
    expected.set(key,shape);
    const uploads=v.uploads.length;
    assert.equal(v.context.downhillBuffers().deformed,items.deformed);assert.equal(v.context.hiddenDisplayGeometry(),display);
    assert.equal(v.uploads.length,uploads,'Repeated frames reuse projected geometry and tube/guide buffers.');
    previous=items;
  }
  assert.notEqual(expected.get('1:3'),expected.get('2:3'),'Independent hidden directions must actually draw different spatial curves.');
  assert.notEqual(expected.get('1:3'),expected.get('1:6'),'Visual magnification changes drawing vertices without changing physical length.');
  v.context.updateStudy({active:true,data,T,type:'hidden',mode:1,hiddenDirection:2,result:null,status:'preparing'});
  const pending=v.context.downhillBuffers();
  assert.equal(previous.deformed.deleted,true);assert.equal(previous.guides.deleted,true);
  assert.equal(pending.deformed,null);assert.equal(pending.guides,null);assert.equal(pending.reference,reference);
  assert.equal(v.context.hiddenDisplayGeometry(),null,'Pending preparation cannot show a previous direction or amplitude.');
  assert.equal(v.context.downhillDisplayStudy,null);assert.equal(v.context.downhillDisplay,null);
  const zero=profile.sample(0,0,{count:120});
  v.context.updateStudy({active:true,data,T,type:'hidden',mode:1,hiddenDirection:2,displayMagnification:6,result:zero,amplitude:[0,0]});
  const reset=v.context.downhillBuffers(),display=v.context.hiddenDisplayGeometry();
  assert.deepEqual(display.points,zero.points.map(p=>p.original),'A zero push returns to the exact unchanged footprint without singular frame scaling.');
  assert.equal(display.guides.length,0);assert.equal(reset.reference,reference);
  assert.equal(reset.guides.positions.length,0);assert.equal(reset.guides.band.positions.length,0,'Zero push cannot leave a manufactured field or filled band.');
  v.context.clearGPU();assert.equal(reset.deformed.deleted,true);assert.equal(reset.guides.deleted,true);assert.equal(reference.deleted,true);
  for(const key of ['downhillPathGPU','downhillGuidesGPU','downhillDisplayStudy','downhillDisplay','downhillOriginalGPU'])assert.equal(v.context[key],null);
});

test('Canvas fallback displays the hidden projected curve and its connecting guides in the selected direction color',()=>{
  const {data,model,T,profile}=hiddenFixture();
  const fallback=section('  function drawDownhillFallback(','  function revealedGPU(');
  for(const direction of [1,2]){
    const amplitude=direction===1?[.06,0]:[0,.06],result=profile.sample(...amplitude,{count:80});
    const study={active:true,data,T,type:'hidden',mode:1,hiddenDirection:direction,displayMagnification:3,result,amplitude};
    const v=harness(data,model);v.context.updateStudy(study);
    const strokes=[],heads=[];let path=[];
    const c={save(){},restore(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},setLineDash(){},
      closePath(){},fill(){heads.push({color:this.fillStyle,points:path.slice()});},
      stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth,points:path.slice()});}};
    v.context.screenPoint=p=>({x:50*p[0],y:50*p[2]});v.context.c=c;
    vm.runInNewContext(fallback+'\n drawDownhillFallback(c);',v.context);
    const display=v.context.hiddenDisplayGeometry(),color=direction===2?'#b86eff':'#4db8ff';
    assert.equal(strokes[0].color,'#dae9e5','The fixed-endpoint surface footprint remains a pale reference.');
    assert.equal(strokes.length,display.guides.length+2);
    assert.equal(strokes.at(-1).color,color);assert.equal(strokes.at(-1).width,3);
    assert.deepEqual(strokes.at(-1).points,display.points.map(p=>[50*p[0],50*p[2]]));
    assert.ok(strokes.slice(1,-1).every(s=>s.color===color+'eb'&&s.width===2&&s.points.length===2),'Bright, thicker guides connect the footprint to its projected hidden push.');
    assert.ok(heads.some(h=>h.color===color&&h.points.length===3),'Visible fallback vectors have matching arrowheads.');
    assert.ok(heads.some(h=>h.color===color+'38'&&h.points.length===4),'A translucent band connects the original and pushed curves.');
    assert.ok(strokes.at(-1).points.some(p=>Math.abs(p[1])>.02),'The fallback must actually lift the path out of the equatorial surface plane.');
  }
});
