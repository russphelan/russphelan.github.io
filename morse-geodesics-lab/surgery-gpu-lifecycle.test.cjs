'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const helpers=between('  function clearSurgeryGPU()','  function wireData(');
const complete=between('  function completeSurgery()','  function updateTheory()');
const setSurface=between('  function setSurface(','  $(\'experience-mode\').addEventListener');
function fixture({wire=true,cachedWire=true,graphics=true,lost=false}={}){
  const mesh=key=>({key,positions:new Float32Array([0,1,2,3,4,5,6,7,8]),normals:new Float32Array(9)});
  const meshes=Object.fromEntries(['target','retained','incoming','removedOld','removedNew','join'].map(k=>[k,mesh(k)]));
  const sections=[],uploads=[],removed=[],wireBuilds=[],nodes={};
  const plan={meshes,cuts:[1.02,2.98],sectionAt(x,n){sections.push({x,n});return mesh('section-'+x);}};
  const operation={to:'double',endpointPreset:'default',snapshot:{wire,surfaceVisible:false,surfaceOpacity:.55},plan};
  const sourceSurface={key:'ordinary-source'},sourceWire={key:'ordinary-source-wire'},targetWire=mesh('prepared-wire');
  const context={gl:graphics?{}:null,contextLost:lost,surgeryGPU:new Map(),surgeryWires:new Map(cachedWire?[['double',targetWire]]:[]),
    state:{surface:'torus',mode:'explore',endpointPreset:'default',curves:[],camera:{yaw:.2},surgery:operation},
    surfaceGPU:sourceSurface,wireGPU:sourceWire,surgeryToken:0,cache:new Map(),meshes:new Map([['double',meshes.target]]),lastCompletedNeck:null,
    upload(positions,normals){const item={positions,normals};uploads.push(item);return item;},
    removeGPU(item){if(item)removed.push(item);},boundaryTube:boundary=>boundary,
    wireData(target){wireBuilds.push(target);return targetWire;},
    restoreSurgeryLayers(op){Object.assign(context.state,{wire:op.snapshot.wire,surfaceVisible:op.snapshot.surfaceVisible});},
    clearGPU(){},stopSearch(){},cancelSurfaceTraversal(){},cancelSurgery(){throw Error('Completed surgery must not cancel itself');},
    key:()=>context.state.surface+':'+context.state.endpointPreset,initialCatalogue:()=>[],knownIndex:()=>true,
    model:()=>({meshResolution:40,name:'double'}),Camera:{defaultCamera:()=>({yaw:0})},
    S:{modelIds:['torus','double','triple'],buildMesh(){throw Error('Target mesh should be retained');}},
    $:id=>nodes[id]||(nodes[id]={value:'',textContent:'',setAttribute(){},focus(){}}),
    updateCatalogue(){},announce(){},warmNextSurgery(){},searchConfig:()=>({}),searchManager:{activate(){}},
    document:{hidden:false},window:{GeodesicPresentationData:{indexCutoff:24}}
  };
  vm.runInNewContext(helpers+'\n'+complete+'\n'+setSurface,context);
  return {context,operation,plan,uploads,removed,wireBuilds,sections,sourceSurface,sourceWire,targetWire};
}

test('static construction pieces, final layers, ring buffers and sort centers prepare before the first animation frame',()=>{
  const v=fixture(),before=JSON.stringify(v.plan.meshes);v.context.prepareSurgeryGPU(v.operation);
  assert.deepEqual([...v.context.surgeryGPU.keys()],['fade-target','fade-target-wire','retained','incoming','removedOld','removedNew','join','front-old','front-new']);
  assert.equal(v.uploads.length,9);assert.equal(v.wireBuilds.length,0,'The worker-prepared final wire geometry is reused.');
  assert.deepEqual(v.sections,[{x:Math.fround(1.02),n:64},{x:Math.fround(2.98),n:64}]);
  assert.equal(v.operation.frontXs.old,Math.fround(1.02));assert.equal(v.operation.frontXs.new,Math.fround(2.98));
  for(const center of Object.values(v.operation.pieceCenters))assert.deepEqual(Array.from(center),[3,4,5]);
  assert.equal(JSON.stringify(v.plan.meshes),before,'Preparation never modifies cached geometry.');
  v.context.prepareSurgeryGPU(v.operation);assert.equal(v.uploads.length,9,'Repeated preparation reuses allocated GPU buffers.');
});

test('uncached wire geometry is built during preparation and grid-disabled construction needs no wire upload',()=>{
  const cold=fixture({cachedWire:false});cold.context.prepareSurgeryGPU(cold.operation);
  assert.equal(cold.wireBuilds.length,1);assert.equal(cold.context.surgeryGPU.get('fade-target-wire').positions,cold.targetWire.positions);
  const solid=fixture({wire:false,cachedWire:false});solid.context.prepareSurgeryGPU(solid.operation);
  assert.equal(solid.wireBuilds.length,0);assert.equal(solid.uploads.length,8);
  assert.equal(solid.context.surgeryGPU.has('fade-target-wire'),false);
});

test('fallback and lost WebGL contexts do not allocate invalid GPU buffers',()=>{
  for(const options of [{graphics:false},{lost:true}]){
    const v=fixture(options);v.context.prepareSurgeryGPU(v.operation);
    assert.equal(v.uploads.length,0);assert.equal(v.sections.length,0);assert.equal(v.wireBuilds.length,0);
  }
});

test('cancelling deletes prepared construction buffers but preserves ordinary source ownership',()=>{
  const v=fixture();v.context.prepareSurgeryGPU(v.operation);const prepared=[...v.context.surgeryGPU.values()];
  v.context.clearSurgeryGPU();assert.deepEqual(v.removed,prepared);assert.equal(v.context.surgeryGPU.size,0);
  assert.equal(v.context.surfaceGPU,v.sourceSurface);assert.equal(v.context.wireGPU,v.sourceWire);
});

test('the final grid fade performs no late buffer allocation or wire construction',()=>{
  const v=fixture();v.context.prepareSurgeryGPU(v.operation);
  Object.assign(v.context.gl,{DEPTH_TEST:1,LESS:2,EQUAL:3,LINES:4,TRIANGLES:5,
    enable(){},depthMask(){},depthFunc(){},colorMask(){}});
  v.context.operationMesh=()=>v.plan.meshes.target;v.context.renderGPU=()=>{};
  vm.runInNewContext(between('  function drawOperationLayersGL(display) {','  function drawMeshLayersFallback'),v.context);
  for(const fill of [.55,.3,.01,0])v.context.drawOperationLayersGL({phase:'fade-out',fill,grid:.18*(1-fill/.55)});
  assert.equal(v.uploads.length,9);assert.equal(v.wireBuilds.length,0);
});

test('completion transfers prepared target surface and grid into the ordinary view without rebuilding or deleting them',()=>{
  const v=fixture();v.context.prepareSurgeryGPU(v.operation);
  const target=v.context.surgeryGPU.get('fade-target'),wire=v.context.surgeryGPU.get('fade-target-wire');
  v.context.completeSurgery();
  assert.equal(v.context.state.surface,'double');assert.equal(v.context.state.surgery,null);
  assert.equal(v.context.surfaceGPU,target);assert.equal(v.context.wireGPU,wire);
  assert.equal(v.context.surgeryGPU.size,0);assert.equal(v.uploads.length,9);assert.equal(v.wireBuilds.length,0);
  assert.equal(v.removed.includes(target),false);assert.equal(v.removed.includes(wire),false);
  assert.equal(v.removed.includes(v.sourceSurface),true);assert.equal(v.removed.includes(v.sourceWire),true);
  assert.equal(v.context.state.mesh,v.plan.meshes.target);
});

test('solid-only and no-WebGL completion preserve their normal layer ownership',()=>{
  const solid=fixture({wire:false});solid.context.prepareSurgeryGPU(solid.operation);
  const target=solid.context.surgeryGPU.get('fade-target');solid.context.completeSurgery();
  assert.equal(solid.context.surfaceGPU,target);assert.equal(solid.context.wireGPU,null);
  const fallback=fixture({graphics:false});fallback.context.prepareSurgeryGPU(fallback.operation);fallback.context.completeSurgery();
  assert.equal(fallback.context.surfaceGPU,null);assert.equal(fallback.context.wireGPU,null);assert.equal(fallback.uploads.length,0);
});
