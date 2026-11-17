/* The picture uses the induced metric of the displayed smooth surface.
 * Only endpoint-converged numerical trajectories from solver.js enter this view.
 * The chosen four-dimensional tube metric supplies the two normal Jacobi modes.
 */
(function () {
  'use strict';
  const S = window.GeodesicSurface, Solver = window.GeodesicSolver, Surgery = window.GeodesicSurgery, Jacobi = window.GeodesicJacobi, FieldExplanation = window.GeodesicJacobiExplanation, SurgeryMotion = window.GeodesicSurgeryMotion;
  const Views=window.GeodesicViews, Theorem=window.GeodesicTheorem, Camera=window.GeodesicCamera;
  const $ = id => document.getElementById(id);
  const updateText = (id,value) => {if($(id).textContent!==value)$(id).textContent=value;};
  const setDisabled = (id,value) => {if($(id).disabled!==value)$(id).disabled=value;};
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub = (a,b) => a.map((v,i)=>v-b[i]);
  const norm = a => Math.hypot(...a);
  const unit = a => {const n=norm(a)||1;return a.map(v=>v/n);};
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  const state = {
    surface:'torus', endpointPreset:'default', c:.36, cutoff:0, mode:'explore',
    curves:[], selected:null, lastSelected:null, running:false,
    playing:false, travel:.35, speed:1,
    viewMode:'all', wire:true, focusing:true, surfaceVisible:false, surfaceOpacity:.55,
    ribbon:{mode:'amplitude',halfWidth:.16,power:.5},
    cutawayDock:false,neckOpen:false,
    camera:Camera.defaultCamera(), mesh:null, surgery:null
  };
  const cache = new Map(), meshes = new Map(), surgeryPlans = new Map(), surgeryGPU = new Map(), surgeryWires = new Map();
  let searchManager=null;
  let surgeryToken=0,surgeryWarmFrame=0,surgeryWarmToken=0;
  const surgeryPreparation=window.GeodesicSurgeryPreparation.create({
    createWorker:window.GeodesicSearchWorkers.create({source:window.GeodesicSurgeryWorkerSource,
      workerURL:'./surgery-preparation-worker.js?v=compact-collar-3'}),
    prepareFallback:from=>{
      const to=S.getModel(from).count===1?'double':'triple';
      if(!meshes.has(to))meshes.set(to,S.buildMesh(to,S.getModel(to).meshResolution));
      const targetMesh=meshes.get(to);
      return {plan:surgeryPlans.get(from)||Surgery.prepareTransition(from,{targetMesh}),targetMesh};
    },
    onReady:(from,{plan,targetMesh,targetWire})=>{
      surgeryPlans.set(from,plan);if(!meshes.has(plan.toId))meshes.set(plan.toId,targetMesh);
      if(targetWire)surgeryWires.set(plan.toId,targetWire);
    }
  });
  let frame=0, lastTime=0, dragging=null,surfaceTraversal=null;
  let neckViewer=null,neckResize=null,lastCompletedNeck=null,neckScene=null,neckOverlayPlan=null;
  const neckSections=new WeakMap(),neckOverlayGPU=new Map();
  let reveal=null,explorationSnapshot=null,showcaseReturn=null;
  const canvas=$('scene');
  let cssW=1,cssH=1, matrix=null;
  const gpu = new Map();
  const jacobiCache = new WeakMap();
  const graphZoom=[1,1,1];
  const ambientExplorer = window.GeodesicAmbientExplorer.create($('ambient-explorer'));
  const hiddenCutaway = window.GeodesicHiddenCutaway.create($('hidden-cutaway'),{
    onSeek:seekFromCutaway,onPlay:toggleTraversal,onPause:pauseTraversal
  });
  const viewResize=window.GeodesicViewResize.create({workspace:$('workspace'),sceneColumn:$('observation-console'),
    surfacePanel:$('scene-stage').closest('.scene-panel'),hiddenPanel:$('hidden-neighborhood-details'),onResize:requestDraw});
  // Move the existing component so both layouts keep the same camera, scale,
  // and shared traversal. Never create a second independently timed cutaway.
  function setCutawayDock(dock,{scroll=false}={}) {
    if(dock&&state.neckOpen)setNeckOpen(false);
    const details=$('hidden-neighborhood-details');
    const focus=details.contains(document.activeElement)?document.activeElement:null;
    state.cutawayDock=!!dock;
    $('dock-cutaway').checked=state.cutawayDock;
    $('workspace').classList.toggle('cutaway-study',state.cutawayDock);
    if(state.cutawayDock){
      details.open=true;
      const console=$('observation-console');
      if(details.parentElement!==console)console.insertBefore(details,console.querySelector('.selection-panel'));
    }else if(details.parentElement!==$('cutaway-home'))$('cutaway-home').append(details);
    updateText('cutaway-layout-toggle',state.cutawayDock?'Full width':'Beside torus');
    $('cutaway-layout-toggle').setAttribute('aria-label',state.cutawayDock?'Show cutaway at full width':'Show cutaway beside the torus');
    viewResize.setContext({docked:state.cutawayDock,locked:!!state.surgery});
    if(focus)focus.focus({preventScroll:true});
    if(scroll)(state.cutawayDock?$('observation-console'):details).scrollIntoView({block:'start',behavior:'instant'});
    requestDraw();
  }
  let focusCurve=null, focusData=null, focusError='', ribbonGPU=null, ribbonEdgesGPU=null;
  let downhillStudy=null,downhillOriginalGPU=null,downhillPathGPU=null;
  let downhillGuidesGPU=null,downhillDisplayStudy=null,downhillDisplay=null;
  let downhillReferenceData=null,downhillReferenceT=null;
  let cutawayDeformationSource=null,cutawayContext={study:null,deformation:null};
  const traversalHold=window.GeodesicTraversalHold.create([$('travel'),$('hidden-cutaway').querySelector('[data-cutaway="position"]')],{
    onChange:held=>{
      // Update synchronously: the cutaway's linked range also draws on input.
      hiddenCutaway.setContext(held?{study:null,deformation:null}:hiddenStudyContext(activeDownhill()));
      requestDraw();
    }
  });
  let downhillControls=null;
  const downhillPreparation=window.GeodesicDownhillPreparation.create({window,prepareSteps:window.GeodesicDownhill.prepareSteps,prepareBasisSteps:window.GeodesicDownhill.prepareBasisSteps});
  surfaceTraversal=window.GeodesicSurfaceTraversal.create({window,onStart:startSurfaceTraversal,onCommit:commitSurfaceTraversal});
  downhillControls=window.GeodesicDownhillControls.create($('downhill-controls'),{
    preparation:downhillPreparation,
    onPause:()=>{pauseTraversal();pauseReveal();},
    onOpen:()=>{if(focusData)$('observation-console').scrollIntoView({block:'start',behavior:'instant'});},
    onSeek:s=>{cancelSurfaceTraversal({seekLatest:false});if(focusData){state.travel=clamp(s/focusData.length,0,1);$('travel').value=state.travel;pauseTraversal();}},
    onDock:()=>setCutawayDock(true,{scroll:true}),
    onUpdate:study=>{if(!downhillControls)return;if(handleSurfaceTraversalStudy(study))return;downhillStudy=study;clearDownhillGPU({keepReference:!!study});syncDownhillLayout();requestDraw();}
  });
  let gl=null, program=null, locations=null, surfaceGPU=null, wireGPU=null;
  let fallback=null, contextLost=false;
  const model = () => S.getModel(state.surface);
  const endpoints = () => model().endpoints[state.endpointPreset] || model().endpoints.default;
  const key = () => state.surface+':'+state.endpointPreset;
  function updateSurfaceTraversalUI(){
    const flow=surfaceTraversal?.snapshot(),latest=flow?.latest;
    const requested=latest&&latest.data===focusData&&latest.model===model()?clamp(latest.position/latest.data.length,0,1):state.travel;
    $('travel').value=requested;
    updateText('travel-output',Math.round(state.travel*100)+'%');
    $('travel').setAttribute('aria-valuetext',flow?.pending?`Requested ${Math.round(requested*100)}%; showing ${Math.round(state.travel*100)}% while the mode is checked.`:`${Math.round(state.travel*100)}% along the geodesic`);
  }
  function cancelSurfaceTraversal({seekLatest=true}={}){
    const latest=surfaceTraversal?.cancel();
    if(latest&&seekLatest&&latest.data===focusData&&latest.model===model())state.travel=clamp(latest.position/latest.data.length,0,1);
    if(latest)updateSurfaceTraversalUI();
    return latest;
  }
  function startSurfaceTraversal(target){
    if(target.data!==focusData||target.model!==model()||state.surgery){cancelSurfaceTraversal({seekLatest:false});return;}
    const context={data:target.data,model:target.model,position:target.position,playing:false,surgery:false};
    downhillPreparation.setContext({...context,active:true});downhillControls.setContext(context);
    updateSurfaceTraversalUI();requestDraw();
  }
  function commitSurfaceTraversal(study){
    state.travel=clamp(study.T/study.data.length,0,1);downhillStudy=study;
    clearDownhillGPU({keepReference:true});updateSurfaceTraversalUI();syncDownhillLayout();requestDraw();
  }
  function handleSurfaceTraversalStudy(study){
    const flow=surfaceTraversal?.snapshot();if(!flow?.pending)return false;
    const owner=flow.running||flow.latest,owned=owner?.data===focusData&&owner?.model===model();
    if(!owned||!study||study.type!==(owner.type??'surface')||study.data!==focusData||study.status==='error'){
      cancelSurfaceTraversal({seekLatest:owned});return false;
    }
    if(surfaceTraversal.accept(study,model()))return true;
    // Keep the last exact frame through preparation and ignore superseded
    // completions. Facts, markers and the hidden cutaway retain that same T.
    return true;
  }
  function activeDownhill(){
    return downhillStudy?.active&&!state.surgery&&downhillStudy.data===focusData&&
      Math.abs(downhillStudy.T-state.travel*(focusData?.length||0))<1e-7?downhillStudy:null;
  }
  function clearNeckOverlay(){
    for(const item of neckOverlayGPU.values())removeGPU(item);
    neckOverlayGPU.clear();neckOverlayPlan=null;
  }
  function setNeckOpen(open){
    state.neckOpen=!!open;
    $('workspace').classList.toggle('neck-explaining',state.neckOpen);
    $('neck-explanation').hidden=!state.neckOpen;
    $('neck-explanation-toggle').setAttribute('aria-expanded',String(state.neckOpen));
    const controls=$('surgery-controls'),host=state.neckOpen?$('neck-construction-controls'):$('surgery-controls-home').parentElement;
    if(controls.parentElement!==host){
      if(state.neckOpen)host.append(controls);
      else host.insertBefore(controls,$('surgery-controls-home').nextSibling);
    }
    $('neck-construction-controls').hidden=!state.neckOpen||!state.surgery;
    if(!state.neckOpen){clearNeckOverlay();$('neck-main-marker').hidden=true;}
    updateNeckExplanation();requestDraw();
  }
  function updateNeckExplanation(){
    neckResize?.setContext({active:state.neckOpen&&!document.hidden});
    if(!neckViewer)return null;
    if(!state.neckOpen||document.hidden){neckViewer.setContext({active:false});neckScene=null;return null;}
    const operation=state.surgery,completed=!operation&&lastCompletedNeck?.surface===state.surface;
    const plan=operation?.plan||(completed?lastCompletedNeck.plan:null);
    const display=operation?.motion.sample(operation.progress),geometry=operation?display.geometry:1;
    const sample=plan?.sample(geometry);
    const active=state.neckOpen&&!document.hidden;
    neckViewer.setContext({active,ready:!!plan,geometry:plan?geometry:0,joinProgress:sample?.joinProgress??0,
      constructionId:operation?.token??(completed?lastCompletedNeck.id:null),
      phase:operation?plan?display.phase:'preparing':completed?'complete':'idle',
      paused:operation?.paused??true,fromCount:plan?.fromCount??model().genus,completed:!!completed});
    neckScene=null;
    if(!active||!plan)return null;
    const selection=neckViewer.selection(),side=selection.side,index=side==='old'?0:1;
    const span=plan.cuts[1]-plan.cuts[0];
    let scanX=Number.isFinite(selection.station)?plan.cuts[0]+Math.max(0,Math.min(1,selection.station))*span:sample.gap[index];
    // The scanner follows actual constructed material, even when scrubbing
    // backwards with a manual inspection position from the completed neck.
    if(scanX>sample.gap[0]&&scanX<sample.gap[1]){
      const left=scanX-sample.gap[0],right=sample.gap[1]-scanX;
      scanX=left<right||(left===right&&side==='old')?sample.gap[0]:sample.gap[1];
    }
    const x=Math.fround(scanX),slot=x===Math.fround(sample.gap[0])?'old':x===Math.fround(sample.gap[1])?'new':'scanner';
    const translation=sample.joinProgress===0&&x===Math.fround(plan.cuts[1])?sample.pieces.find(p=>p.key==='incoming').translation:[0,0,0];
    neckScene={plan,geometry,side,slot,station:(scanX-plan.cuts[0])/span,theta:selection.theta,x,translation,
      mode:selection.mode||'scanner',scannerBlend:selection.scannerBlend??1,
      incomingTranslation:sample.pieces.find(p=>p.key==='incoming')?.translation||[0,0,0],
      gap:sample.gap,joinProgress:sample.joinProgress};
    return neckScene;
  }
  function neckSection(plan,x,key='selected'){
    let cache=neckSections.get(plan);if(!cache){cache=new Map();neckSections.set(plan,cache);}
    const previous=cache.get(key);if(previous?.x===x)return previous.section;
    const section=plan.sectionAt(x,64);cache.set(key,{x,section});return section;
  }
  function neckLineMesh(section){
    const p=section.positions,n=section.normals,count=p.length/3;
    const positions=new Float32Array(count*6),normals=new Float32Array(count*6);
    for(let i=0;i<count;i++)for(let end=0;end<2;end++){
      const j=(i+end)%count;positions.set(p.subarray(j*3,j*3+3),i*6+end*3);normals.set(n.subarray(j*3,j*3+3),i*6+end*3);
    }
    return {positions,normals};
  }
  function drawNeckOverlay(){
    const marker=$('neck-main-marker');marker.hidden=true;
    const scene=neckScene;
    if(!scene){if(neckOverlayPlan)clearNeckOverlay();return;}
    marker.setAttribute('data-neck-mode',scene.mode);
    if(scene.geometry<=0)return;
    if(neckOverlayPlan!==scene.plan){clearNeckOverlay();neckOverlayPlan=scene.plan;}
    const {plan,x,translation}=scene,section=neckSection(plan,x,scene.slot),count=section.positions.length/3;
    const fraction=((scene.theta/(2*Math.PI))%1+1)%1*count,i=Math.floor(fraction)%count,amount=fraction-Math.floor(fraction);
    const point=[0,1,2].map(axis=>section.positions[i*3+axis]*(1-amount)+section.positions[((i+1)%count)*3+axis]*amount+translation[axis]);
    const p=screenPoint(point);
    if(p.z>=-1&&p.z<=1&&p.x>=0&&p.x<=cssW&&p.y>=0&&p.y<=cssH){
      marker.hidden=false;marker.style.transform=`translate(${p.x-5.5}px,${p.y-5.5}px)`;
    }
    const outlines=[];
    if(scene.joinProgress>0)for(let j=0;j<=4;j++){
      const traceX=Math.fround(plan.cuts[0]+(plan.cuts[1]-plan.cuts[0])*j/4);
      if(traceX<=scene.gap[0]||traceX>=scene.gap[1])outlines.push({key:'trace-'+j,x:traceX,section:neckSection(plan,traceX,'trace-'+j),translation:[0,0,0],alpha:.22});
    }
    outlines.push({key:'selected',x,section,translation,alpha:Math.min(1,scene.geometry/.12)});
    // During the close-up, both actual boundary fronts participate in the
    // matching. Reuse their existing section caches and one counterpart GPU
    // slot; identical fronts become one highlighted section when they meet.
    const otherSide=scene.side==='old'?'new':'old',otherX=Math.fround(scene.gap[otherSide==='old'?0:1]);
    const counterpartAlpha=.75*(1-Math.max(0,Math.min(1,scene.scannerBlend)));
    const paired=(scene.mode==='join'||scene.mode==='handoff')&&counterpartAlpha>0&&otherX!==x;
    if(paired)outlines.push({key:'other-front',x:otherX,section:neckSection(plan,otherX,otherSide),
      translation:otherSide==='new'&&scene.joinProgress===0?scene.incomingTranslation:[0,0,0],alpha:counterpartAlpha});
    else if(neckOverlayGPU.has('other-front')){removeGPU(neckOverlayGPU.get('other-front'));neckOverlayGPU.delete('other-front');}
    if(gl){
      gl.depthMask(false);
      for(const outline of outlines){
        let item=neckOverlayGPU.get(outline.key);
        if(!item||item.sectionX!==outline.x){
          const mesh=neckLineMesh(outline.section);
          if(item){gl.bindBuffer(gl.ARRAY_BUFFER,item.a);gl.bufferData(gl.ARRAY_BUFFER,mesh.positions,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,item.b);gl.bufferData(gl.ARRAY_BUFFER,mesh.normals,gl.DYNAMIC_DRAW);}
          else{item=upload(mesh.positions,mesh.normals);neckOverlayGPU.set(outline.key,item);}
          item.sectionX=outline.x;
        }
        const highlighted=outline.key==='selected'||outline.key==='other-front';
        if(highlighted)gl.disable(gl.DEPTH_TEST);else gl.enable(gl.DEPTH_TEST);
        renderGPU(item,gl.LINES,highlighted?[.36,.94,.81]:[1,.79,.39],1,.003,outline.alpha,1,outline.translation);
      }
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    }else if(fallback){
      const c=fallback;c.save();
      for(const outline of outlines){
        c.beginPath();const points=outline.section.positions;
        for(let j=0;j<points.length;j+=3){const q=screenPoint([points[j]+outline.translation[0],points[j+1]+outline.translation[1],points[j+2]+outline.translation[2]]);if(j)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);}
        const highlighted=outline.key==='selected'||outline.key==='other-front';
        c.closePath();c.lineWidth=highlighted?2:1;c.strokeStyle=highlighted?`rgba(92,240,207,${outline.alpha})`:`rgba(255,201,99,${outline.alpha})`;c.stroke();
      }c.restore();
    }
  }
  function syncDownhillLayout(){
    const snapshot=downhillControls?.snapshot(),open=snapshot?.open||false;
    $('workspace').classList.toggle('downhill-active',open);
    $('workspace').classList.toggle('surface-mode-study',open&&!!snapshot?.comparison);
    setDisabled('play',open||!!state.surgery||!selected());
    $('play').title=open?'Close the length study to animate traversal; the studied endpoints stay pinned while pushing.':'';
  }
  function clearDownhillGPU({keepReference=false}={}){
    if(!keepReference)surfaceDeformationCache.length=0;
    removeGPU(downhillPathGPU);downhillPathGPU=null;
    removeGPU(downhillGuidesGPU?.band);
    removeGPU(downhillGuidesGPU);downhillGuidesGPU=null;
    downhillDisplayStudy=null;downhillDisplay=null;
    if(!keepReference){
      removeGPU(downhillOriginalGPU);downhillOriginalGPU=null;
      downhillReferenceData=null;downhillReferenceT=null;
    }
  }
  function hiddenStudyContext(study){
    if(study!==cutawayDeformationSource){
      cutawayDeformationSource=study;
      const descriptor=study?{type:study.type,T:study.T,magnification:30,
        ...(study.type==='hidden'?{hiddenDirection:study.hiddenDirection??1}:{})}:null;
      cutawayContext={study:descriptor,deformation:study&&(study.result||study.type==='surface')?
        {...descriptor,samples:study.result?.samples||[]}:null};
    }
    return cutawayContext;
  }
  function initialCatalogue() {
    const presentation=state.mode==='presentation',showcase=state.mode==='showcase';
    const data=showcase?window.GeodesicShowcaseData:presentation?window.GeodesicPresentationData:window.MorseGeodesicCatalogues;
    const entry=data?.schemaVersion===1?(showcase?data:presentation?{...data,...data.stages?.[state.surface]}:data.catalogues?.[key()]):null;
    const e=endpoints();
    if(!entry||entry.geometryVersion!==model().geometryVersion||entry.normalCurvature!==state.c||
      !entry.endpoints||norm(sub(entry.endpoints.p,e.p))>1e-12||norm(sub(entry.endpoints.q,e.q))>1e-12)return [];
    return entry.curves.filter(c=>c.geometryVersion===model().geometryVersion&&Number.isFinite(c.length)&&
      c.residual<=2e-5&&c.refinementError<=2e-5&&!c.nearConjugate&&c.points?.length>=2&&
      norm(sub(c.points[0],e.p))<=1e-8&&norm(sub(c.points[c.points.length-1],e.q))<=2e-5).map((c,i)=>
        Solver.classifyCurve({...c,id:presentation||showcase?c.id:key()+':'+i},state.c));
  }
  const knownIndex = curve => !curve.nearConjugate && Number.isFinite(curve.index);
  const visible = () => {
    // Explore's zero position is the blank introduction. Positive positions
    // reveal all admitted indices, including genuine index-zero geodesics.
    if(state.surgery||state.mode==='explore'&&state.cutoff===0)return [];
    const complete=state.mode==='presentation'&&reveal?new Set(reveal.snapshot().completeIds):null;
    return state.curves.filter(c=>knownIndex(c)&&c.index<=state.cutoff&&(!complete||complete.has(c.id)));
  };
  const selected = () => state.surgery?null:state.curves.find(c=>c.id===state.selected)||null;
  const color = index => {
    const h=((188-index*23)%360+360)%360/60, s=.73,l=.61;
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
    const a=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return a.map(v=>v+m);
  };
  const cssColor = i => 'rgb('+color(i).map(x=>Math.round(x*255)).join(',')+')';
  const scientific = n => Number.isFinite(n) ? n.toExponential(1) : '—';
  function announce(text) { $('live-status').textContent=text; }
  function requestDraw() {
    syncSearchPriority();
    if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);
  }
  function syncSearchPriority(){
    downhillPreparation.block('connected sum',!!state.surgery);
    downhillPreparation.block('traversal',state.playing||!!reveal?.snapshot().playing);
    if(searchManager){
      searchManager.block('connected sum',!!state.surgery);
      searchManager.block('traversal',state.playing);
      searchManager.block('length study',!!downhillStudy?.active);
    }
  }
  function cancelSurgeryWarmup(){
    surgeryWarmToken++;
    if(surgeryWarmFrame)cancelAnimationFrame(surgeryWarmFrame);
    surgeryWarmFrame=0;searchManager?.block('geometry preparation',false);downhillPreparation.block('geometry preparation',false);
  }
  function warmNextSurgery(){
    cancelSurgeryWarmup();
    if(document.hidden||state.mode==='showcase'||state.surface==='triple'||state.surgery)return;
    const from=state.surface,token=surgeryWarmToken;
    searchManager?.block('geometry preparation',true);downhillPreparation.block('geometry preparation',true);
    // Keep initial paint ahead of background geometry work. The same exact
    // default meshes and plan are then ready before the first Add click.
    surgeryWarmFrame=requestAnimationFrame(()=>{surgeryWarmFrame=requestAnimationFrame(()=>{
      surgeryWarmFrame=0;
      if(!document.hidden&&state.surface===from&&state.mode!=='showcase'&&!state.surgery){
        surgeryPreparation.warm(from).finally(()=>{
          // A later warmup owns the priority block until its own job settles.
          if(token===surgeryWarmToken){searchManager?.block('geometry preparation',false);downhillPreparation.block('geometry preparation',false);}
        });
      }else{searchManager?.block('geometry preparation',false);downhillPreparation.block('geometry preparation',false);}
    });});
  }
  function pauseReveal(){if(reveal){reveal.pause();updatePresentationUI();}}
  function updatePresentationUI(){
    const active=state.mode==='presentation',snapshot=reveal?.snapshot(),busy=!!state.surgery;
    $('presentation-bar').hidden=!active;$('presentation-caption').hidden=!active||busy||!!selected();
    $('workspace').classList.toggle('presenting',active);
    $('workspace').classList.toggle('showcasing',state.mode==='showcase');
    updateShowcaseUI();
    $('experience-mode').value=state.mode;
    if(!active)return;
    const data=window.GeodesicPresentationData;
    updateText('presentation-cutoff',String(data.indexCutoff));
    for(const [i,id]of S.modelIds.entries()){
      updateText('presentation-total-'+(i+1),String(data.stages[id].curves.length));
      const stage=document.querySelector(`[data-presentation-stage="${i+1}"]`);
      stage.classList.toggle('current',id===state.surface);stage.classList.toggle('past',i+1<model().genus);
      if(id===state.surface)stage.setAttribute('aria-current','step');else stage.removeAttribute('aria-current');
    }
    if(!snapshot)return;
    const total=snapshot.total,done=snapshot.done,next=snapshot.activeId?state.curves.find(c=>c.id===snapshot.activeId):null;
    const route=next?.presentation?.label||(model().genus===1?'Paths around the original torus':`Excursions into summand ${model().genus}`);
    updateText('presentation-caption',busy?'':done?`${total} computed examples · ${model().genus===3?'Three summands, more routes between the same endpoints.':'Add a summand to reveal more routes between the same endpoints.'}`:
      `${snapshot.completed} / ${total} revealed · ${snapshot.playing?'Drawing':'Paused'}: ${route}`);
    $('presentation-bar').dataset.completed=String(snapshot.completed);$('presentation-bar').dataset.total=String(total);
    $('presentation-bar').dataset.playing=String(snapshot.playing);$('presentation-bar').dataset.stage=String(model().genus);
    updateText('reveal-play',snapshot.playing?'Pause reveal':'Resume reveal');
    $('reveal-play').setAttribute('aria-pressed',String(snapshot.playing));
    setDisabled('reveal-play',busy||done);setDisabled('reveal-replay',busy);setDisabled('reveal-all',busy||done);
  }
  function setExperienceMode(mode){
    if(mode===state.mode||state.surgery)return;
    cancelSurfaceTraversal();
    if(mode==='showcase'){
      showcaseReturn={mode:state.mode,surface:state.surface,preset:state.endpointPreset,cutoff:state.cutoff,viewMode:state.viewMode,
        selected:state.selected,lastSelected:state.lastSelected,travel:state.travel,camera:{...state.camera},curves:state.curves.slice(),
        ribbon:{...state.ribbon},focusing:state.focusing,speed:state.speed,pauseAtConjugate:$('pause-at-conjugate').checked,reveal};
      if(state.mode==='explore')explorationSnapshot={...showcaseReturn};
      pauseReveal();stopSearch();cache.set(key(),state.curves.slice());
      state.mode='showcase';state.cutoff=window.GeodesicShowcaseData.indexCutoff;state.viewMode='solo';
      setSurface('double','presentation');selectShowcase(window.GeodesicShowcaseData.picks[0].id);return;
    }
    if(state.mode==='showcase'&&showcaseReturn){
      const saved=showcaseReturn;showcaseReturn=null;
      state.ribbon={...saved.ribbon};state.focusing=saved.focusing;state.speed=saved.speed;
      $('show-focusing').checked=state.focusing;$('speed').value=state.speed;
      $('pause-at-conjugate').checked=saved.pauseAtConjugate;
      if(mode===saved.mode){
        state.mode=saved.mode;state.cutoff=saved.cutoff;state.viewMode=saved.viewMode;
        setSurface(saved.surface,saved.preset,saved.camera);reveal=saved.reveal;state.curves=saved.curves;
        state.selected=saved.selected;state.lastSelected=saved.lastSelected;state.travel=saved.travel;state.viewMode=saved.viewMode;
        updateCatalogue();return;
      }
    }
    if(mode==='presentation'){
      if(state.mode==='explore')explorationSnapshot={surface:state.surface,preset:state.endpointPreset,cutoff:state.cutoff,viewMode:state.viewMode,
        selected:state.selected,lastSelected:state.lastSelected,travel:state.travel,camera:{...state.camera}};
      stopSearch();cache.set(key(),state.curves.slice());
      state.mode='presentation';state.cutoff=window.GeodesicPresentationData.indexCutoff;state.viewMode='all';
      setSurface('torus','presentation');
    }else{
      pauseReveal();state.mode='explore';reveal=null;
      const saved=explorationSnapshot;
      state.cutoff=saved?.cutoff??0;state.viewMode=saved?.viewMode??'all';
      setSurface(saved?.surface??'torus',saved?.preset??'default',saved?.camera??null);
      if(saved){state.selected=saved.selected;state.lastSelected=saved.lastSelected;state.travel=saved.travel;updateCatalogue();}
    }
    updatePresentationUI();
  }
  function currentShowcase(){return state.mode==='showcase'?window.GeodesicShowcaseData.picks.find(p=>p.curveId===state.selected):null;}
  function updateShowcaseUI(){
    const active=state.mode==='showcase';$('showcase-bar').hidden=!active;if(!active)return;
    const pick=currentShowcase();
    for(const entry of window.GeodesicShowcaseData.picks)$('showcase-'+entry.id).setAttribute('aria-pressed',String(entry===pick));
    for(const id of ['showcase-start','showcase-hidden','showcase-surface'])setDisabled(id,!pick||!focusData);
    updateText('showcase-return',showcaseReturn?.mode==='presentation'?'Back to presentation':'Back to Explore');
    const earlier=pick&&focusData?focusData.countBefore(pick.startS):0;
    updateText('showcase-help',`Watch +2: hidden pair vanishes, ribbon stays open. Then +1: surface field vanishes, ribbon pinches.${earlier?' This excerpt starts after '+earlier+' earlier index contributions.':''}`);
    $('showcase-bar').dataset.pick=pick?.id||'';
  }
  function selectShowcase(id){
    if(state.mode!=='showcase'||state.surgery)return;
    const pick=window.GeodesicShowcase.findPick(window.GeodesicShowcaseData,id),curve=pick&&state.curves.find(c=>c.id===pick.curveId);
    if(!curve)return;
    state.playing=false;state.viewMode='solo';state.selected=curve.id;state.lastSelected=curve.id;
    state.travel=pick.startS/curve.length;state.speed=.5;state.focusing=true;
    $('speed').value='0.5';$('show-focusing').checked=true;$('pause-at-conjugate').checked=true;
    state.camera={...Camera.defaultCamera(),...(id==='neck-return'?{yaw:3,pitch:.43,zoom:.83,targetOffset:[-.4,0,0]}:{yaw:-.6,pitch:1.03,zoom:.64,targetOffset:[-1,0,0]})};
    changeRibbonScale(pick.ribbon);updateCatalogue();
    announce(pick.title+'. '+pick.description);
  }
  function seekShowcase(type){
    const pick=currentShowcase();if(!pick||!focusData)return;
    const event=window.GeodesicShowcase.resolveEvent(focusData,pick,type);if(event)inspectEvent(event);
  }

  function currentBounds() {
    let bounds=model().bounds;
    const operation=state.surgery;
    if(operation?.plan){
      const t=operation.motion.sample(operation.progress).geometry,wide=operation.plan.bounds,target=S.getModel(operation.to).bounds;
      const amount=t<.12?smooth(t/.12):1-smooth((t-.94)/.06);
      const base=t<.12?model().bounds:target;
      bounds=base.map((p,i)=>mix(p,wide[i],amount));
    }
    return bounds;
  }
  function cameraMatrix() {
    const operation=state.surgery;
    const camera=operation?SurgeryMotion.cameraAt(operation.snapshot.camera,state.camera,
      operation.motion.sample(operation.progress).geometry):state.camera;
    return Camera.frame(currentBounds(),camera,cssW,cssH);
  }
  function screenPoint(point) {
    const p=[...point,1],o=[0,0,0,0];
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)o[i]+=matrix[j*4+i]*p[j];
    return {x:(o[0]/o[3]*.5+.5)*cssW,y:(.5-o[1]/o[3]*.5)*cssH,z:o[2]/o[3]};
  }
  function compile(type,source) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function initGL() {
    gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
    if(!gl){fallback=canvas.getContext('2d');return;}
    const vs=compile(gl.VERTEX_SHADER,`
      attribute vec3 aPosition; attribute vec3 aNormal;
      uniform mat4 uMatrix; uniform float uOffset; uniform float uPointSize; uniform vec3 uTranslation;
      varying vec3 vNormal; varying vec3 vPosition;
      void main(){vec3 p=aPosition+uOffset*aNormal+uTranslation;vNormal=aNormal;vPosition=p;
        gl_Position=uMatrix*vec4(p,1.0);gl_PointSize=uPointSize;}`);
    const fs=compile(gl.FRAGMENT_SHADER,`
      precision highp float; uniform vec3 uColor; uniform vec3 uEye; uniform float uMode; uniform float uAlpha;
      uniform vec2 uClipGap;
      varying vec3 vNormal; varying vec3 vPosition;
      void main(){
        if(vPosition.x>uClipGap.x&&vPosition.x<uClipGap.y)discard;
        if(uMode>1.5){float r=length(gl_PointCoord-vec2(.5));if(r>.5)discard;
          vec3 c=r>.34?vec3(.95,.97,.98):uColor;gl_FragColor=vec4(c,1.0);return;}
        vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
        vec3 light=normalize(vec3(-.5,-.6,1.0)),view=normalize(uEye-vPosition);
        float diffuse=max(dot(n,light),0.0),rim=pow(1.0-abs(dot(n,view)),3.0);
        float spec=pow(max(dot(n,normalize(light+view)),0.0),42.0);
        vec3 c=uMode>.5?uColor*(.83+.17*diffuse)+vec3(.22)*spec:
          uColor*(.30+.65*diffuse)+vec3(.48,.61,.66)*spec*.65+vec3(.15,.24,.28)*rim;
        gl_FragColor=vec4(c,uAlpha);
      }`);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    locations={};
    for(const name of ['aPosition','aNormal'])locations[name]=gl.getAttribLocation(program,name);
    for(const name of ['uMatrix','uEye','uColor','uMode','uAlpha','uOffset','uPointSize','uTranslation','uClipGap'])locations[name]=gl.getUniformLocation(program,name);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gpu.clear();surgeryGPU.clear();surfaceGPU=null;wireGPU=null;ribbonGPU=null;ribbonEdgesGPU=null;downhillOriginalGPU=null;downhillPathGPU=null;
    downhillGuidesGPU=null;downhillDisplayStudy=null;downhillDisplay=null;
    neckOverlayGPU.clear();neckOverlayPlan=null;
    downhillReferenceData=null;downhillReferenceT=null;
  }
  function upload(positions,normals) {
    const a=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,a);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);
    return {a,b,count:positions.length/3};
  }
  function removeGPU(item) {if(gl&&item){gl.deleteBuffer(item.a);gl.deleteBuffer(item.b);}}
  function clearGPU() {for(const item of gpu.values())removeGPU(item);gpu.clear();clearDownhillGPU();}
  function renderGPU(item,type,rgb,mode=0,offset=0,alpha=1,pointSize=1,translation=[0,0,0],clipGap=[1,-1]) {
    gl.bindBuffer(gl.ARRAY_BUFFER,item.a);gl.enableVertexAttribArray(locations.aPosition);
    gl.vertexAttribPointer(locations.aPosition,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,item.b);gl.enableVertexAttribArray(locations.aNormal);
    gl.vertexAttribPointer(locations.aNormal,3,gl.FLOAT,false,0,0);
    gl.uniform3fv(locations.uColor,rgb);gl.uniform1f(locations.uMode,mode);
    gl.uniform1f(locations.uOffset,offset);gl.uniform1f(locations.uAlpha,alpha);
    gl.uniform3fv(locations.uTranslation,translation);gl.uniform2fv(locations.uClipGap,clipGap);
    gl.uniform1f(locations.uPointSize,pointSize);gl.drawArrays(type,0,item.count);
  }
  function reducedPoints(curve,limit=760) {
    const points=curve.points||[];
    if(points.length<=limit)return points;
    return Array.from({length:limit},(_,i)=>points[Math.round(i*(points.length-1)/(limit-1))]);
  }
  function tube(curve) {
    const points=reducedPoints(curve),positions=[],normals=[],rings=[];
    const radius=.012, sides=7;
    for(let i=0;i<points.length;i++) {
      const tangent=unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]));
      const sourceIndex=curve.points.length===points.length?i:Math.round(i*(curve.points.length-1)/(points.length-1));
      const n=curve.normals?.[sourceIndex]||model().normal(points[i]),b=unit(cross(tangent,n));
      const center=points[i].map((v,j)=>v+n[j]*.007);
      rings.push(Array.from({length:sides},(_,j)=>{
        const angle=TAU*j/sides;
        const normal=n.map((v,k)=>v*Math.cos(angle)+b[k]*Math.sin(angle));
        return {p:center.map((v,k)=>v+radius*normal[k]),n:normal};
      }));
    }
    for(let i=1;i<rings.length;i++)for(let j=0;j<sides;j++) {
      const next=(j+1)%sides;
      for(const [a,b] of [[i-1,j],[i,j],[i,next],[i-1,j],[i,next],[i-1,next]]) {
        positions.push(...rings[a][b].p);normals.push(...rings[a][b].n);
      }
    }
    return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
  }
  function curveGPU(curve) {
    if(!gpu.has(curve.id)){const t=tube(curve);gpu.set(curve.id,upload(t.positions,t.normals));}
    return gpu.get(curve.id);
  }
  function hiddenDisplayGeometry(study=activeDownhill()){
    return study?.type==='hidden'?deformationDisplayGeometry(study):null;
  }
  // Keep only a few exact CPU drawings. GPU groups still belong to the current
  // study, so a mode switch can never leave another mode's buffers on screen.
  const surfaceDeformationCache=[];
  function deformationDisplayGeometry(study=activeDownhill()){
    if(!study?.result?.points?.length)return null;
    if(downhillDisplayStudy!==study){
      const currentModel=model(),profiles=study.displayProfiles?.length?study.displayProfiles:[study.profile];
      const sampling=window.GeodesicDeformationSampling,hidden=study.type==='hidden',exactSurface=!hidden&&typeof study.profile?.displaySampleAt==='function';
      const mapping=hidden?
        window.GeodesicHiddenPushDisplay.createMap(study,currentModel,{magnification:study.displayMagnification??3,projection:study.displayProjection??'surface'}):
        exactSurface?window.GeodesicSurfacePushDisplay.createMap(study,currentModel,{magnification:3}):
        {mapSample:p=>p.point,magnification:1,effectiveMagnification:1,limited:false};
      const owns=profile=>window.GeodesicDownhill?.displayProfileModel?.(profile)===currentModel;
      const identity=profile=>owns(profile)?profile.coefficient:profile;
      // Current-only and full-range profiles from one exact mathematical
      // basis share a drawing only after their mapping checks have passed,
      // with the same physical push, reference scale and display context.
      const cacheKey=(exactSurface||hidden&&owns(study.profile))&&Array.isArray(study.amplitude)?
        [study.type,study.data,currentModel,identity(study.profile),study.T,study.mode,...study.amplitude,
          profiles.length,...profiles.map(identity),study.hiddenDirection,mapping.projection,mapping.magnification,
          mapping.effectiveMagnification,mapping.referenceAmplitude]:null;
      const hit=cacheKey?surfaceDeformationCache.findIndex(entry=>entry.key.length===cacheKey.length&&entry.key.every((value,i)=>value===cacheKey[i])):-1;
      if(hit>=0){
        const [entry]=surfaceDeformationCache.splice(hit,1);surfaceDeformationCache.push(entry);
        downhillDisplayStudy=study;downhillDisplay=entry.display;return downhillDisplay;
      }
      let sampled;
      if(hidden){
        sampled=sampling.sample(study,currentModel,{mapSample:mapping.mapSample});
        downhillDisplay={...window.GeodesicHiddenPushDisplay.build(study,currentModel,{mapping,samples:sampled.points}),diagnostics:sampled.diagnostics};
      }else{
        // The mapper evaluates the exact magnified surface curve. Its input
        // needs the original frame, not another unused physical retraction.
        sampled=exactSurface?sampling.sampleCurve(s=>study.profile.displaySampleAt(0,0,s),study.T,
          {seeds:(study.data?.samples||[]).map(p=>p.s),mode:study.mode||study.profile.mode||1,mapSample:mapping.mapSample}):
          sampling.sample(study,currentModel,{mapSample:mapping.mapSample});
        downhillDisplay={points:sampled.displayPoints,normals:sampled.displayPoints.map(p=>currentModel.normal(p)),
          magnification:mapping.magnification,effectiveMagnification:mapping.effectiveMagnification,limited:mapping.limited,
          limitReason:'surface',diagnostics:sampled.diagnostics};
      }
      const fieldSamples=sampled.points.map((p,i)=>{
        const original=p.original||p.point,point=downhillDisplay.points[i];
        const lifted=(q,n)=>q.map((x,k)=>x+.014*n[k]);
        return {s:p.s,original:hidden?original:lifted(original,mapping.originalNormalSample?mapping.originalNormalSample(p):currentModel.normal(original)),
          point:hidden?point:lifted(point,downhillDisplay.normals[i])};
      });
      const field=window.GeodesicVariationField.build({samples:fieldSamples,T:study.T,count:Math.min(48,Math.max(20,(study.mode||1)*6))});
      downhillDisplay={...downhillDisplay,field,guides:field.guides,fieldSamples};
      if(cacheKey){surfaceDeformationCache.push({key:cacheKey,display:downhillDisplay});if(surfaceDeformationCache.length>4)surfaceDeformationCache.shift();}
      downhillDisplayStudy=study;
    }
    return downhillDisplay;
  }
  function downhillBuffers(){
    const study=activeDownhill();if(!study||!focusData)return null;
    // The original prefix depends only on this curve and endpoint. Its tube
    // stays unchanged when a push or Hessian mode changes; the finite tube does not.
    if(downhillReferenceData!==focusData||downhillReferenceT!==study.T){
      clearDownhillGPU();downhillReferenceData=focusData;downhillReferenceT=study.T;
    }
    if(!downhillOriginalGPU){
      const currentModel=model(),profile=study.profile;
      const sharedBaseline=study.type==='surface'&&profile?.T===study.T&&
        window.GeodesicDownhill?.displayProfileModel?.(profile)===currentModel;
      // A zero-push sample is the exact original geodesic point. Reusing the
      // selected basis here fills its bounded frame cache before the pushed
      // curve asks for the same stations; each sampler keeps its own knots
      // and refinement decisions. Pending/synthetic studies keep the direct
      // geodesic evaluator.
      const sampled=window.GeodesicDeformationSampling.sampleCurve(s=>sharedBaseline?profile.displaySampleAt(0,0,s):focusData.sampleAt(s),study.T,
        {seeds:focusData.samples?.map(p=>p.s)});
      const points=sampled.displayPoints;
      const mesh=window.GeodesicDeformationTube.build(points,{lift:.007,
        liftNormals:sharedBaseline?sampled.points.map(p=>p.normal):points.map(p=>currentModel.normal(p))});
      downhillOriginalGPU=upload(mesh.positions,mesh.normals);
    }
    if(study.result?.points?.length>1&&!downhillPathGPU){
      const display=deformationDisplayGeometry(study),hidden=study.type==='hidden';
      // Adaptive vertices must reach the mesh unchanged. Surface lift prevents
      // z-fighting; off-surface pushes need no extra moving-normal displacement.
      const mesh=window.GeodesicDeformationTube.build(display.points,
        {lift:hidden?0:.007,liftNormals:hidden?undefined:display.normals,initialNormal:display.normals?.[0]});
      downhillPathGPU=upload(mesh.positions,mesh.normals);
      downhillGuidesGPU=upload(display.field.positions,display.field.normals);
      downhillGuidesGPU.band=upload(display.field.band.positions,display.field.band.normals);
    }
    return {reference:downhillOriginalGPU,deformed:downhillPathGPU,guides:downhillGuidesGPU};
  }
  function drawDownhillGL(frontOnly=false){
    const items=downhillBuffers();if(!items)return;
    const study=activeDownhill(),hidden=study.type==='hidden',rgb=hidden?(study.hiddenDirection===2?[.72,.43,1]:[.30,.72,1]):study.mode===2?[.94,.75,.30]:[1,.48,.35];
    gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.depthFunc(frontOnly?gl.LEQUAL:gl.LESS);
    renderGPU(items.reference,gl.TRIANGLES,[.82,.90,.88],1,0,.75);
    if(items.guides?.band)renderGPU(items.guides.band,gl.TRIANGLES,rgb,1,0,.22);
    if(hidden&&frontOnly&&items.deformed){
      // Faint occluded lobes preserve higher modes' sign changes through the
      // surface. The depth-tested pass restores bright foreground fragments.
      gl.disable(gl.DEPTH_TEST);renderGPU(items.deformed,gl.TRIANGLES,rgb,1,0,.18);gl.enable(gl.DEPTH_TEST);
    }
    if(hidden&&frontOnly&&items.guides){
      gl.disable(gl.DEPTH_TEST);
      if(items.guides.band)renderGPU(items.guides.band,gl.TRIANGLES,rgb,1,0,.045);
      renderGPU(items.guides,gl.TRIANGLES,rgb,1,0,.12);gl.enable(gl.DEPTH_TEST);
    }
    if(items.guides)renderGPU(items.guides,gl.TRIANGLES,rgb,1,0,.92);
    if(items.deformed){
      gl.depthMask(!frontOnly);
      renderGPU(items.deformed,gl.TRIANGLES,rgb,1,0,1);
    }
    gl.depthMask(true);gl.depthFunc(gl.LESS);
  }
  function drawDownhillFallback(c){
    const study=activeDownhill();if(!study||!focusData)return;
    const stroke=(points,color,width,dash=[])=>{c.save();c.beginPath();points.forEach((point,i)=>{const p=screenPoint(point);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.restore();};
    stroke(Array.from({length:321},(_,i)=>focusData.sampleAt(study.T*i/320).point),'#dae9e5',1.8,[5,4]);
    const display=deformationDisplayGeometry(study);
    if(display){
      const color=study.type==='surface'?(study.mode===2?'#f0bf4d':'#ff7b59'):study.hiddenDirection===2?'#b86eff':'#4db8ff';
      if(display.field.band.positions.length){
        c.save();c.fillStyle=color+'38';
        for(let i=1;i<display.fieldSamples.length;i++){
          const a=display.fieldSamples[i-1],b=display.fieldSamples[i];c.beginPath();
          [a.original,b.original,b.point,a.point].forEach((p,j)=>{const q=screenPoint(p);if(j)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});
          c.closePath();c.fill();
        }
        c.restore();
      }
      for(const guide of display.guides){
        stroke([guide.original,guide.point],color+'eb',2);
        const p=screenPoint(guide.original),q=screenPoint(guide.point),dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);
        if(length>3){
          const head=Math.min(8,length*.35),width=head*.46,ux=dx/length,uy=dy/length;
          c.save();c.beginPath();c.moveTo(q.x,q.y);c.lineTo(q.x-head*ux-width*uy,q.y-head*uy+width*ux);
          c.lineTo(q.x-head*ux+width*uy,q.y-head*uy-width*ux);c.closePath();c.fillStyle=color;c.fill();c.restore();
        }
      }
      stroke(display.points,color,3);
    }
  }
  function revealedGPU(curve){
    const item=curveGPU(curve),fraction=state.mode==='presentation'&&reveal?reveal.fraction(curve.id):1;
    // One complete seven-sided tube segment uses 42 vertices.
    return fraction>=1?item:{...item,count:Math.floor(item.count*fraction/42)*42};
  }
  function presentationOpacity(curve){
    return state.mode==='presentation'&&reveal?.snapshot().playing&&curve.presentation?.group<model().genus ? .42 : 1;
  }
  function pointOn(curve,t) {
    if(curve===focusCurve&&focusData)return focusData.sampleAt(clamp(t,0,1)*curve.length).point;
    const points=curve.points;if(!points?.length)return [0,0,0];
    const x=clamp(t,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(x));
    return mix(points[i],points[i+1],x-i);
  }
  function drawMarkers(paths,current,overlay=false) {
    const e=endpoints(),traveler=current,study=activeDownhill();
    const end=study?focusData.sampleAt(study.T).point:e.q;
    const points=overlay?[e.p,end]:traveler?[pointOn(traveler,state.travel)]:[];
    const rgb=overlay?[[.15,.91,.78],[1,.63,.34]]:[[1,.94,.68]];
    for(let i=0;i<points.length;i++) {
      if(overlay)gl.disable(gl.DEPTH_TEST);else gl.enable(gl.DEPTH_TEST);
      const item=upload(new Float32Array(points[i]),new Float32Array(model().normal(points[i])));
      renderGPU(item,gl.POINTS,rgb[i],2,overlay?0:.025,1,(overlay?13:10)*Math.min(devicePixelRatio||1,2));removeGPU(item);
    }
    gl.enable(gl.DEPTH_TEST);
  }
  const smooth = x => {const t=clamp(x,0,1);return t*t*(3-2*t);};
  function boundaryTube(boundary) {
    const p=boundary.positions,points=Array.from({length:p.length/3},(_,i)=>Array.from(p.slice(i*3,i*3+3)));
    const positions=[],normals=[],rings=points.map((point,i)=>{
      const tangent=unit(sub(points[(i+1)%points.length],points[(i+points.length-1)%points.length]));
      const axis=[1,0,0],radial=unit(cross(tangent,axis));
      return Array.from({length:6},(_,j)=>{const n=axis.map((v,k)=>v*Math.cos(j*TAU/6)+radial[k]*Math.sin(j*TAU/6));
        return {p:point.map((v,k)=>v+.019*n[k]),n};});
    });
    for(let i=0;i<rings.length;i++)for(let j=0;j<6;j++){
      const next=(i+1)%rings.length,k=(j+1)%6;
      for(const [a,b]of [[i,j],[next,j],[next,k],[i,j],[next,k],[i,k]]){positions.push(...rings[a][b].p);normals.push(...rings[a][b].n);}
    }
    return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
  }
  function clearSurgeryGPU() {for(const item of surgeryGPU.values())removeGPU(item);surgeryGPU.clear();}
  function prepareSurgeryGPU(operation) {
    if(!gl||contextLost||!operation?.plan)return;
    const plan=operation.plan,target=plan.meshes.target;
    const preload=(key,mesh)=>{if(!surgeryGPU.has(key))surgeryGPU.set(key,upload(mesh.positions,mesh.normals));};
    preload('fade-target',target);
    if(operation.snapshot.wire)preload('fade-target-wire',surgeryWires.get(operation.to)||wireData(target));
    operation.pieceCenters={};
    for(const key of ['retained','incoming','removedOld','removedNew','join']){
      const mesh=plan.meshes[key];preload(key,mesh);
      // Cache translucent-part sorting centers before playback starts too.
      const p=mesh.positions;
      let lx=Infinity,ly=Infinity,lz=Infinity,hx=-Infinity,hy=-Infinity,hz=-Infinity;
      for(let i=0;i<p.length;i+=3){
        const x=p[i],y=p[i+1],z=p[i+2];
        if(x<lx)lx=x;if(x>hx)hx=x;if(y<ly)ly=y;if(y>hy)hy=y;if(z<lz)lz=z;if(z>hz)hz=z;
      }
      operation.pieceCenters[key]=[(lx+hx)/2,(ly+hy)/2,(lz+hz)/2];
    }
    operation.frontXs={};
    for(const [key,index]of [['old',0],['new',1]]){
      const x=Math.fround(plan.cuts[index]);
      preload('front-'+key,boundaryTube(plan.sectionAt(x,64)));
      operation.frontXs[key]=x;
    }
  }
  function wireData(mesh) {
    const p=mesh.positions,n=mesh.normals,lines=[],normals=[];
    for(let i=0;i<p.length;i+=9)for(const j of [0,3,3,6,6,0]){lines.push(...p.slice(i+j,i+j+3));normals.push(...n.slice(i+j,i+j+3));}
    return {positions:new Float32Array(lines),normals:new Float32Array(normals)};
  }
  function operationMesh(display) {
    return display.phase==='fade-out'?meshes.get(state.surgery.to):meshes.get(state.surgery.from);
  }
  function drawOperationLayersGL(display) {
    const mesh=operationMesh(display);if(!mesh)return;
    const target=display.phase==='fade-out',key='fade-target';
    // Preparing and fading in still show the current surface. Its ordinary
    // buffers already contain exactly this mesh, including the original grid.
    // Keep their ownership separate so cancelling surgery cannot delete them.
    if(target){if(!surgeryGPU.has(key))surgeryGPU.set(key,upload(mesh.positions,mesh.normals));}
    else if(!surfaceGPU)surfaceGPU=upload(mesh.positions,mesh.normals);
    const item=target?surgeryGPU.get(key):surfaceGPU;
    const drawGrid=()=>{
      if(!(display.grid>0))return;
      let wireItem;
      if(target){
        const wireKey=key+'-wire';
        if(!surgeryGPU.has(wireKey)){const wire=wireData(mesh);surgeryGPU.set(wireKey,upload(wire.positions,wire.normals));}
        wireItem=surgeryGPU.get(wireKey);
      }else{
        if(!wireGPU){const wire=wireData(mesh);wireGPU=upload(wire.positions,wire.normals);}
        wireItem=wireGPU;
      }
      // Match the ordinary grid renderer exactly, including self-occlusion.
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LESS);
      renderGPU(wireItem,gl.LINES,[.37,.69,.73],1,.003,display.grid);
    };
    const gridFirst=!state.surgery.snapshot.surfaceVisible;
    // Preserve the grid's existing depth visibility while the fill is still
    // faint. Compositing the shell afterwards avoids abruptly removing the rear
    // grid as soon as its opacity becomes nonzero.
    if(gridFirst)drawGrid();
    if(display.fill>0){
      gl.enable(gl.DEPTH_TEST);
      gl.colorMask(false,false,false,false);gl.depthMask(true);gl.depthFunc(gl.LESS);
      renderGPU(item,gl.TRIANGLES,[.26,.55,.58],0);
      gl.colorMask(true,true,true,true);gl.depthMask(false);gl.depthFunc(gl.EQUAL);
      renderGPU(item,gl.TRIANGLES,[.26,.55,.58],0,0,display.fill);
    }
    if(!gridFirst)drawGrid();
    gl.colorMask(true,true,true,true);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.enable(gl.DEPTH_TEST);
  }
  function drawMeshLayersFallback(mesh,fill,grid) {
    if(!mesh)return;
    const c=fallback,p=mesh.positions,n=mesh.normals,faces=[];
    for(let i=0;i<p.length;i+=9){
      const v=[0,3,6].map(j=>screenPoint(Array.from(p.slice(i+j,i+j+3))));
      faces.push({v,z:v.reduce((sum,q)=>sum+q.z,0)/3,light:.45+.35*Math.max(0,n[i+2])});
    }
    faces.sort((a,b)=>b.z-a.z);
    if(fill>0){
      c.save();c.globalAlpha=fill;
      for(const f of faces){c.beginPath();f.v.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.closePath();
        c.fillStyle=`rgb(${Math.round(65*f.light)},${Math.round(135*f.light)},${Math.round(145*f.light)})`;c.fill();}
      c.restore();
    }
    if(grid>0){
      c.save();c.strokeStyle=`rgba(94,176,186,${grid})`;c.lineWidth=.6;
      c.beginPath();for(const f of faces){c.moveTo(f.v[0].x,f.v[0].y);c.lineTo(f.v[1].x,f.v[1].y);c.lineTo(f.v[2].x,f.v[2].y);c.closePath();}c.stroke();c.restore();
    }
  }
  function drawOperationLayersFallback(display) {
    fallback.clearRect(0,0,cssW,cssH);drawMeshLayersFallback(operationMesh(display),display.fill,display.grid);
  }
  function surgeryFrame() {
    const operation=state.surgery,t=operation.motion.sample(operation.progress).geometry,frame=operation.plan.sample(t);
    const arrival=smooth(t/.12);
    // Match the ordinary translucent shell at both handoffs, but keep the
    // construction itself opaque so cutting and gluing do not look hollow.
    const shellBlend=arrival*(1-smooth((t-.94)/.06));
    const shellOpacity=operation.snapshot.surfaceOpacity+(1-operation.snapshot.surfaceOpacity)*shellBlend;
    for(const piece of frame.pieces){
      if(piece.key==='incoming'||piece.key==='removedNew')piece.opacity*=arrival;
      piece.visible=piece.visible&&piece.opacity>.001;
      piece.color=piece.key.startsWith('removed')?mix([.26,.55,.58],[.96,.63,.25],arrival):piece.key==='join'?mix([.31,.67,.63],[.26,.55,.58],smooth((t-.94)/.06)):[.26,.55,.58];
      piece.alpha=piece.opacity*shellOpacity;
    }
    frame.ringOpacity=arrival*(1-smooth((frame.joinProgress-.85)/.15))*.95;
    return frame;
  }
  function surgeryPieceDepth(piece) {
    const operation=state.surgery;
    operation.pieceCenters=operation.pieceCenters||{};
    if(!operation.pieceCenters[piece.key]){
      const p=piece.mesh.positions,low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<p.length;i++){
        const axis=i%3;low[axis]=Math.min(low[axis],p[i]);high[axis]=Math.max(high[axis],p[i]);
      }
      operation.pieceCenters[piece.key]=low.map((v,i)=>(v+high[i])/2);
    }
    return screenPoint(operation.pieceCenters[piece.key].map((v,i)=>v+piece.translation[i])).z;
  }
  function drawSurgeryGL() {
    const operation=state.surgery,display=operation.motion.sample(operation.progress);
    if(!operation.plan||display.phase!=='construct'){drawOperationLayersGL(display);return;}
    const frame=surgeryFrame(),pieces=frame.pieces.filter(p=>p.visible);
    const itemFor=piece=>{
      if(!surgeryGPU.has(piece.key))surgeryGPU.set(piece.key,upload(piece.mesh.positions,piece.mesh.normals));
      return surgeryGPU.get(piece.key);
    };
    const render=piece=>renderGPU(itemFor(piece),gl.TRIANGLES,piece.color,0,0,piece.alpha,1,piece.translation,piece.key==='join'?frame.gap:[1,-1]);
    const pass=group=>{
      gl.colorMask(false,false,false,false);gl.depthMask(true);gl.depthFunc(gl.LESS);
      for(const piece of group)render(piece);
      gl.colorMask(true,true,true,true);gl.depthMask(false);gl.depthFunc(gl.EQUAL);
      for(const piece of group)render(piece);
    };
    pass(pieces.filter(piece=>piece.opacity===1));
    // Paint the stable shell before fading parts write depth. Otherwise an
    // almost invisible incoming surface/disc can erase the shell behind it.
    const fading=pieces.filter(piece=>piece.opacity<1).map(piece=>({piece,z:surgeryPieceDepth(piece)}))
      .sort((a,b)=>b.z-a.z);
    for(const {piece} of fading)pass([piece]);
    gl.depthFunc(gl.LESS);gl.depthMask(true);
    // Mark both boundary loops even when one is on the far side of the surface.
    const ringOpacity=frame.ringOpacity;
    if(ringOpacity>.001){
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      for(const key of ['old','new']){
        const moving=frame.joinProgress>0,meshKey='front-'+key;
        const frontX=Math.fround(frame.gap[key==='old'?0:1]);
        operation.frontXs=operation.frontXs||{};
        if(!surgeryGPU.has(meshKey)||operation.frontXs[key]!==frontX){
          const mesh=boundaryTube(neckSection(operation.plan,frontX,key));
          if(!surgeryGPU.has(meshKey))surgeryGPU.set(meshKey,upload(mesh.positions,mesh.normals));
          else {const item=surgeryGPU.get(meshKey);gl.bindBuffer(gl.ARRAY_BUFFER,item.a);gl.bufferData(gl.ARRAY_BUFFER,mesh.positions,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,item.b);gl.bufferData(gl.ARRAY_BUFFER,mesh.normals,gl.DYNAMIC_DRAW);item.count=mesh.positions.length/3;}
          operation.frontXs[key]=frontX;
        }
        const incoming=frame.pieces.find(p=>p.key==='incoming');
        renderGPU(surgeryGPU.get(meshKey),gl.TRIANGLES,[1,.76,.37],1,0,ringOpacity,1,key==='new'&&!moving?incoming.translation:[0,0,0]);
      }
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    }
  }
  function surgeryClippedPolygons(triangle,gap) {
    const clip=(cut,keepLeft)=>{
      const polygon=[];
      let previous=triangle[triangle.length-1],insidePrevious=keepLeft?previous[0]<=cut:previous[0]>=cut;
      for(const point of triangle){
        const inside=keepLeft?point[0]<=cut:point[0]>=cut;
        if(inside!==insidePrevious){
          const amount=(cut-previous[0])/(point[0]-previous[0]);
          polygon.push([cut,previous[1]+amount*(point[1]-previous[1]),previous[2]+amount*(point[2]-previous[2])]);
        }
        if(inside)polygon.push(point);
        previous=point;insidePrevious=inside;
      }
      return polygon;
    };
    if(gap[0]>=gap[1])return [triangle];
    return [clip(gap[0],true),clip(gap[1],false)].filter(polygon=>polygon.length>=3);
  }
  function drawSurgeryFallback() {
    const display=state.surgery.motion.sample(state.surgery.progress);
    if(!state.surgery.plan||display.phase!=='construct'){drawOperationLayersFallback(display);return;}
    const c=fallback,frame=surgeryFrame(),faces=[];
    c.clearRect(0,0,cssW,cssH);
    for(const piece of frame.pieces.filter(p=>p.visible)){
      const p=piece.mesh.positions,n=piece.mesh.normals;
      for(let i=0;i<p.length;i+=9){
        const triangle=[0,3,6].map(j=>[p[i+j],p[i+j+1],p[i+j+2]]);
        const polygons=piece.key==='join'?surgeryClippedPolygons(triangle,frame.gap):[triangle];
        for(const polygon of polygons){
          const v=polygon.map(point=>screenPoint(point.map((value,j)=>value+piece.translation[j])));
          faces.push({v,z:v.reduce((s,q)=>s+q.z,0)/v.length,alpha:piece.alpha,color:piece.color,light:.48+.35*Math.max(0,n[i+2])});
        }
      }
    }
    faces.sort((a,b)=>b.z-a.z);
    for(const f of faces){c.beginPath();f.v.forEach((point,i)=>i?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y));c.closePath();
      c.fillStyle=`rgba(${f.color.map(v=>Math.round(v*255*f.light)).join(',')},${f.alpha})`;c.fill();}
    if(frame.ringOpacity>.001)for(const key of ['old','new']){
      const moving=frame.joinProgress>0;
      const p=state.surgery.plan.sectionAt(frame.gap[key==='old'?0:1],64).positions;
      const translation=key==='new'&&!moving?frame.pieces.find(q=>q.key==='incoming').translation:[0,0,0];
      c.beginPath();for(let i=0;i<p.length;i+=3){const q=screenPoint([p[i]+translation[0],p[i+1]+translation[1],p[i+2]+translation[2]]);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);}c.closePath();
      c.strokeStyle=`rgba(255,205,114,${frame.ringOpacity})`;c.lineWidth=2;c.stroke();
    }
  }
  function drawFallback(paths,current) {
    const c=fallback;c.clearRect(0,0,cssW,cssH);
    drawMeshLayersFallback(state.mesh,state.surfaceVisible?state.surfaceOpacity:0,state.wire?.18:0);
    drawRibbonFallback(c);
    const study=activeDownhill();
    const ordered=state.viewMode==='focus'&&current?[...paths.filter(curve=>curve.id!==current.id),...paths.filter(curve=>curve.id===current.id)]:paths;
    for(const curve of ordered){const style=Views.style(state.viewMode,curve,current);c.globalAlpha=study&&curve===current?.18:style.opacity*presentationOpacity(curve);c.beginPath();const points=reducedPoints(curve),fraction=state.mode==='presentation'&&reveal?reveal.fraction(curve.id):1;
      points.slice(0,Math.max(1,Math.floor((points.length-1)*fraction)+1)).forEach((point,i)=>{const p=screenPoint(point);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});
      c.strokeStyle=style.emphasized?'#fff0c4':cssColor(curve.index);c.lineWidth=style.emphasized?3:1.7;c.stroke();}
    c.globalAlpha=1;
    drawDownhillFallback(c);
    if(!state.surgery)for(const [point,color]of [[endpoints().p,'#42e3c0'],[study?focusData.sampleAt(study.T).point:endpoints().q,'#ffb274'],[current?pointOn(current,state.travel):null,'#fff3cf']])if(point){const p=screenPoint(point);c.beginPath();c.arc(p.x,p.y,5,0,TAU);c.fillStyle=color;c.fill();}
  }
  function resize() {
    const box=canvas.getBoundingClientRect();cssW=Math.max(1,box.width);cssH=Math.max(1,box.height);
    const ratio=Math.min(devicePixelRatio||1,2),w=Math.round(cssW*ratio),h=Math.round(cssH*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    if(fallback)fallback.setTransform(ratio,0,0,ratio,0,0);
  }
  function draw(now) {
    frame=0;if(contextLost)return;
    const constructionElapsed=lastTime?Math.max(0,now-lastTime):0;
    const elapsed=Math.min(constructionElapsed,50);lastTime=now;
    if(state.surgery?.plan&&!state.surgery.paused){
      state.surgery.progress=state.surgery.motion.advance(state.surgery.progress,constructionElapsed);
      if(state.surgery.progress>=1)completeSurgery();else updateSurgeryUI();
    }
    if(state.mode==='presentation'&&reveal&&!state.surgery){
      const previous=reveal.snapshot().completed;
      const progress=reveal.advance(elapsed,{active:!document.hidden});
      if(previous!==progress.completed)updateCatalogue();
      updatePresentationUI();
    }
    const current=selected();
    prepareFocusing(current);
    if(state.playing&&current) {
      const s=state.travel*current.length;
      const approaching=focusData?.interiorEvents.some(e=>e.s>=s&&e.s-s<.20);
      state.travel=Math.min(1,state.travel+elapsed*.001*state.speed*(approaching ? .22 : 1)/Math.max(3,current.length));
      if($('pause-at-conjugate').checked&&focusData){
        const guard=16*Number.EPSILON*Math.max(1,current.length,s);
        const reached=focusData.interiorEvents.find(e=>e.s>s+guard&&e.s<=state.travel*current.length);
        if(reached){state.travel=reached.s/current.length;state.playing=false;updateText('play','Continue traversal');$('play').setAttribute('aria-pressed','false');}
      }
      if(state.travel===1){state.playing=false;updateText('play','Play traversal');$('play').setAttribute('aria-pressed','false');}
      $('travel').value=state.travel;$('travel-output').textContent=Math.round(state.travel*100)+'%';
    }
    const studyContext={data:focusData,model:model(),position:focusData?(surfaceTraversal.snapshot().running?.position??state.travel*focusData.length):0,playing:state.playing,surgery:!!state.surgery};
    downhillPreparation.setContext({...studyContext,active:!!focusData});
    $('workspace').dataset.hessianPreparation=JSON.stringify(downhillPreparation.snapshot());
    downhillControls.setContext(studyContext);
    syncDownhillLayout();
    updateNeckExplanation();
    resize();const camera=cameraMatrix();matrix=camera.m;
    const cameraState=JSON.stringify(state.camera);
    if(canvas.dataset.camera!==cameraState)canvas.dataset.camera=cameraState;
    const paths=Views.layout(state.viewMode,visible(),state.selected).paths;
    const growing=state.mode==='presentation'&&!state.surgery&&state.viewMode==='all'?reveal?.snapshot():null;
    if(growing?.activeProgress>0){const curve=state.curves.find(c=>c.id===growing.activeId);if(curve)paths.push(curve);}
    if(canvas.dataset.viewMode!==state.viewMode)canvas.dataset.viewMode=state.viewMode;
    if(gl) {
      gl.depthMask(true);gl.depthFunc(gl.LESS);
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);gl.uniformMatrix4fv(locations.uMatrix,false,matrix);gl.uniform3fv(locations.uEye,camera.eye);
      if(state.surgery)drawSurgeryGL();
      else {
      if(state.mesh&&!surfaceGPU)surfaceGPU=upload(state.mesh.positions,state.mesh.normals);
      // Keep the context's own occlusion while drawing its translucent color.
      for(const curve of paths)if(curve.id!==current?.id)renderGPU(revealedGPU(curve),gl.TRIANGLES,color(curve.index),1,0,Views.style(state.viewMode,curve,current).opacity*presentationOpacity(curve));
      // Its dim tubes must not become opaque blockers for the selected path.
      // Discard only their depth; the selected tube and torus then establish
      // normal occlusion without accumulating every context tube's back faces.
      if(state.viewMode==='focus')gl.clear(gl.DEPTH_BUFFER_BIT);
      drawRibbonGL();
      if(current&&paths.some(c=>c.id===current.id)){
        if(activeDownhill()){
          gl.depthMask(false);renderGPU(curveGPU(current),gl.TRIANGLES,[.65,.75,.75],1,0,.18);gl.depthMask(true);
          drawDownhillGL();
        }else {
          // This offset expands the tube along its radial normals. Keep the gold
          // centerline thick enough to stand above its ribbon when fields are on.
          renderGPU(curveGPU(current),gl.TRIANGLES,[1,.84,.46],1,.006);
        }
      }
      drawMarkers(paths,current&&paths.includes(current)?current:null);
      if(state.surfaceVisible&&surfaceGPU) {
        // A depth-only pass selects the nearest shell, so concave torus layers
        // blend once per pixel without triangle-order artifacts or CPU sorting.
        gl.colorMask(false,false,false,false);
        renderGPU(surfaceGPU,gl.TRIANGLES,[.26,.55,.58],0);
        gl.colorMask(true,true,true,true);gl.depthMask(false);gl.depthFunc(gl.EQUAL);
        renderGPU(surfaceGPU,gl.TRIANGLES,[.26,.55,.58],0,0,state.surfaceOpacity);
        gl.depthMask(true);gl.depthFunc(gl.LESS);
      }
      if(state.wire&&state.mesh) {
        if(!wireGPU){const wire=wireData(state.mesh);wireGPU=upload(wire.positions,wire.normals);}
        renderGPU(wireGPU,gl.LINES,[.37,.69,.73],1,.003,.18);
      }
      // The translucent underpass retains tinted rear ribbons. Restore only
      // front fragments after the shell/grid, with deliberate extra emphasis:
      // their non-writing depth must not let an opaque shell erase them.
      drawRibbonGL(true);
      drawDownhillGL(true);
      if(!state.surgery)drawMarkers(paths,current&&paths.includes(current)?current:null,true);
      }
    } else if(fallback){if(state.surgery)drawSurgeryFallback();else drawFallback(paths,current);}
    drawNeckOverlay();drawFocusMarkers();updateFocusing();
    const study=activeDownhill();
    if(!state.surgery){
      if(study)updateText('scene-title','Push the segment from x to p');
      else if($('scene-title').textContent==='Push the segment from x to p')$('scene-title').innerHTML='Many ways from <i>x</i> to <i>y</i>';
    }
    updateText('endpoint-y',study?'p':'y');
    $('downhill-scene-note').hidden=!study;
    const hiddenDisplay=hiddenDisplayGeometry(study),pushDisplay=hiddenDisplay||(study?.type==='surface'?deformationDisplayGeometry(study):null);
    const requestedScale=pushDisplay?.magnification??(study?.type==='surface'?3:study?.displayMagnification??3);
    const displayScale=pushDisplay?.limited?`${pushDisplay.effectiveMagnification.toFixed(2)}× (${requestedScale.toFixed(1)}× requested; ${pushDisplay.limitReason==='short-segment'?'short segment':study.type==='surface'?'surface':'bend'} limit)`:`${requestedScale.toFixed(1)}×`;
    if(study)updateText('downhill-scene-note',study.comparison?`Surface Hessian mode ${study.mode} · displayed push ${displayScale} · length uses physical push · green: Jacobi field`:study.type==='hidden'?`Hidden ${study.hiddenDirection||1} · ${(hiddenDisplay?.projection??study.displayProjection??'surface')==='fixed'?'fixed 3D axes':'surface-following axes'} · schematic ${displayScale} · length uses manifold metric`:`Fixed x → p · surface push shown ${displayScale} · length uses physical push`);
    for(const [id,point]of [['endpoint-x',endpoints().p],['endpoint-y',study?focusData.sampleAt(study.T).point:endpoints().q],['endpoint-original-y',endpoints().q]]) {
      $(id).hidden=!!state.surgery||id==='endpoint-original-y'&&!study;if($(id).hidden)continue;
      const p=screenPoint(point);
      $(id).style.transform=`translate(${clamp(p.x+11,12,cssW-16)}px,${clamp(p.y-19,14,cssH-12)}px)`;
    }
    canvas.setAttribute('aria-label',state.surgery?`Connected-sum construction from ${state.surgery.fromCount} to ${state.surgery.fromCount+1} summands. ${surgeryNarration().title}.`:
      study?`${model().name}. Fixed-endpoint length study from x to p at distance ${study.T.toFixed(3)}. ${study.comparison?'Surface Hessian mode '+study.mode+' is selected. Switching modes keeps the endpoints fixed. ':''}${study.type==='hidden'?`The ${study.hiddenDirection===2?'purple':'blue'} curve shows hidden direction ${study.hiddenDirection||1}, in a labelled schematic 3D projection. Its drawing axes represent hidden coordinates, rather than literal directions in three-dimensional space. Visual magnification does not change the metric length. Faint portions lie behind the surface; the separate hidden view is optional.`:`The ${study.mode===2?'gold':'coral'} curve shows a surface push with its coefficient magnified ${displayScale}. The curve stays on the surface; measured length uses the physical push.`} ${state.focusing?'The green ribbon shows the surface Jacobi field along the original geodesic. ':''}The remaining original path to y is dimmed.`:
      state.mode==='explore'&&state.cutoff===0?`${model().name}. No geodesics revealed. Increase the index slider to reveal paths. Drag or use arrow keys to rotate. Plus and minus zoom.`:
      `${model().name} with ${paths.length} computed fixed-endpoint geodesics of Morse index at most ${state.cutoff}. Drag or use arrow keys to rotate. Plus and minus zoom.`);
    syncSearchPriority();
    if((state.playing||state.surgery?.plan&&!state.surgery.paused||state.mode==='presentation'&&reveal?.snapshot().playing)&&!document.hidden)requestDraw();else lastTime=0;
  }
  const eventColor = event => event.surface&&event.hidden?'#d6c2ff':event.surface?'#67e5c3':'#f4ba71';
  const eventName = event => event.surface&&event.hidden?'All three fields Jₛ, J₁, and J₂':event.surface?'Surface field Jₛ':'Hidden fields J₁ and J₂';
  function inspectEvent(event) {
    if(!focusData)return;
    cancelSurfaceTraversal({seekLatest:false});
    state.playing=false;state.travel=event.s/focusData.length;
    $('travel').value=state.travel;updateText('play',event.endpoint?'Play traversal':'Continue traversal');$('play').setAttribute('aria-pressed','false');
    downhillControls.selectEvent(event);
    requestDraw();
  }
  function seekFromCutaway(s) {
    if(!focusData||state.surgery)return;
    return requestTraversal(clamp(s/focusData.length,0,1));
  }
  function requestTraversal(requested){
    pauseReveal();const snapshot=downhillControls.snapshot();
    state.playing=false;updateText('play',requested>=1?'Play traversal':'Continue traversal');$('play').setAttribute('aria-pressed','false');
    if(requested>0&&focusData&&!state.surgery&&snapshot.open&&(snapshot.comparison||['surface','hidden'].includes(snapshot.type))){
      surfaceTraversal.request({data:focusData,model:model(),position:requested*focusData.length,type:snapshot.comparison?'surface':snapshot.type});
      updateSurfaceTraversalUI();requestDraw();return true;
    }
    cancelSurfaceTraversal({seekLatest:false});state.travel=requested;updateSurfaceTraversalUI();requestDraw();
  }
  function pauseTraversal() {
    cancelSurfaceTraversal();
    state.playing=false;
    updateText('play',state.travel>=1?'Play traversal':'Continue traversal');
    $('play').setAttribute('aria-pressed','false');requestDraw();
  }
  function toggleTraversal() {
    if(!selected()||state.surgery)return;
    if(downhillControls.snapshot().open){pauseTraversal();return;}
    pauseReveal();
    if(!state.playing&&state.travel>=1)state.travel=0;
    state.playing=!state.playing;updateCatalogue();requestDraw();
  }
  function prepareFocusing(curve) {
    if(focusCurve===curve)return;
    cancelSurfaceTraversal({seekLatest:false});
    downhillStudy=null;clearDownhillGPU();
    focusCurve=curve;focusData=null;focusError='';
    removeGPU(ribbonGPU);removeGPU(ribbonEdgesGPU);ribbonGPU=null;ribbonEdgesGPU=null;
    for(const id of ['conjugate-markers','conjugate-timeline','focus-tokens'])$(id).replaceChildren();
    if(curve){
      if(!jacobiCache.has(curve)){
        try {
          const data=Jacobi.prepare(curve,model(),state.c);
          if(data.index!==curve.index)throw Error('The refined focusing count does not agree with this trajectory’s recorded index.');
          jacobiCache.set(curve,{data});
        } catch(error) {jacobiCache.set(curve,{error:error.message});}
      }
      const cached=jacobiCache.get(curve);focusData=cached.data||null;focusError=cached.error||'';
    }
    if(!focusData)return;
    const events=focusData.events;
    for(const [i,event] of events.entries()){
      const label=event.endpoint?`Conjugate endpoint: ${event.multiplicity} null directions; not counted in the index`:
        `Conjugate point ${i+1}, distance ${event.s.toFixed(3)}: ${eventName(event).toLowerCase()} ${event.multiplicity===1?'refocuses':'refocus'}; adds ${event.multiplicity} after passing`;
      for(const id of ['conjugate-markers','conjugate-timeline','focus-tokens']){
        const button=document.createElement('button');button.type='button';button.className='conjugate-badge';
        button.textContent=event.endpoint?'end':`+${event.multiplicity}`;button.title=label;button.setAttribute('aria-label',label);
        button.style.setProperty('--event-color',eventColor(event));button.dataset.event=i;
        if(event.endpoint)button.classList.add('endpoint-event');
        if(id==='conjugate-timeline')button.style.left=100*event.s/focusData.length+'%';
        button.addEventListener('click',()=>inspectEvent(event));$(id).append(button);
      }
    }
    const cursor=document.createElement('span');cursor.className='timeline-cursor';cursor.setAttribute('aria-hidden','true');$('conjugate-timeline').append(cursor);
  }
  function ribbonGeometry() {
    const scaleKey=JSON.stringify(state.ribbon);
    if(focusData.ribbon&&focusData.ribbonScale===scaleKey)return focusData.ribbon;
    focusData.ribbon=window.GeodesicJacobiRibbonMesh.build(model(),
      window.GeodesicJacobiRibbon.profile(focusData,state.ribbon),focusData.orientation||1);
    focusData.ribbonScale=scaleKey;
    return focusData.ribbon;
  }
  function drawRibbonGL(frontOnly=false) {
    if(!focusData||!state.focusing||frontOnly&&(!state.surfaceVisible||!surfaceGPU))return;
    const mesh=ribbonGeometry();
    if(!ribbonGPU)ribbonGPU=upload(mesh.positions,mesh.normals);
    if(!ribbonEdgesGPU)ribbonEdgesGPU=upload(mesh.edges,mesh.edgeNormals);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
    gl.depthMask(false);
    renderGPU(ribbonGPU,gl.TRIANGLES,[.25,.94,.75],1,0,.48);
    renderGPU(ribbonEdgesGPU,gl.LINES,[.50,1,.86],1,0,.95);
    gl.depthMask(true);
  }
  function drawRibbonFallback(c) {
    if(!focusData||!state.focusing)return;
    const rings=ribbonGeometry().rings;
    for(let i=1;i<rings.length;i++)for(let j=1;j<rings[i].length;j++){
      const p=[rings[i-1][j-1],rings[i][j-1],rings[i][j],rings[i-1][j]].map(v=>screenPoint(v.p));
      c.beginPath();p.forEach((v,k)=>k?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle='#67e5c378';c.fill();
    }
    for(const j of [0,rings[0].length-1]){
      c.beginPath();rings.forEach((r,i)=>{const p=screenPoint(r[j].p);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});
      c.strokeStyle='#90ffdadb';c.lineWidth=1;c.stroke();
    }
  }
  function drawFocusMarkers() {
    const container=$('conjugate-markers');container.hidden=!state.focusing||!focusData||!!state.surgery;
    $('ribbon-key').hidden=container.hidden;
    if(container.hidden)return;
    for(const button of container.children){
      const event=focusData.events[Number(button.dataset.event)],sample=focusData.sampleAt(event.s),p=screenPoint(sample.point);
      button.hidden=!!activeDownhill()&&event.s>activeDownhill().T+focusData.eventTolerance||p.z>1||p.z< -1||p.x<0||p.x>cssW||p.y<0||p.y>cssH;
      // Keep the badge off the actual zero so it cannot cover the pinch.
      button.style.transform=`translate(${p.x}px,${p.y-16}px) translate(-50%,-100%)`;
    }
  }
  function focusAt(s) {
    // A tight arclength neighborhood only controls narration/highlighting;
    // counts and geometric values always use the actual, unsnapped parameter.
    return focusData?.events.find(e=>Math.abs(e.s-s)<=focusData.eventTolerance)||null;
  }
  function updateRibbonControls() {
    const {mode,halfWidth,power}=state.ribbon,compression=Math.round(100*(1-power));
    $('ribbon-mode').value=mode;$('ribbon-width').value=Math.round(halfWidth*100);$('ribbon-compression').value=compression;
    updateText('ribbon-width-value',halfWidth.toFixed(2));updateText('ribbon-compression-value',compression+'%');
    $('ribbon-width').setAttribute('aria-valuetext',halfWidth.toFixed(2)+' surface units, maximum half-width');
    $('ribbon-compression').setAttribute('aria-valuetext',compression===0?'No compression; proportional magnitude':compression+' percent compression; amplitude exponent '+power.toFixed(2));
    updateText('ribbon-scale-summary',mode==='focus'?'Focusing aid':compression===0?'Proportional magnitude':`Field magnitude · ${compression}% compression`);
    updateText('ribbon-scaling-description',mode==='focus'?
      'Focusing aid uses the field and its derivative to emphasize zeros. This local magnification suppresses magnitude growth. Size and compression adjust the illustration.':
      'Field magnitude uses one fixed scale along the whole path. At 0% compression, width is proportional to |Jₛ|; increasing compression reveals smaller separations. Very small widths can fall below visibility.');
    const formula=mode==='focus'?`Half-width = ${halfWidth.toFixed(2)} × (|Jₛ| / √(Jₛ² + (0.30 Jₛ′)²))^${power.toFixed(2)}.`:
      `Half-width = ${halfWidth.toFixed(2)} × (|Jₛ| / max |Jₛ|)^${power.toFixed(2)}.${focusData?' Along this path, max |Jₛ| ≈ '+scientific(focusData.maxSurfaceAmplitude)+'.':''}`;
    updateText('ribbon-scaling-formula',formula);
    $('ribbon-settings').dataset.mode=mode;
  }
  function changeRibbonScale(patch) {
    Object.assign(state.ribbon,patch);
    // Keep the expensive numerical preparation; only the illustration changes.
    removeGPU(ribbonGPU);removeGPU(ribbonEdgesGPU);ribbonGPU=null;ribbonEdgesGPU=null;
    if(focusData){focusData.ribbon=null;focusData.ribbonScale=null;}
    updateRibbonControls();requestDraw();
  }
  function updateFieldExplanation(data,s,event) {
    const description=data?FieldExplanation.describe(data,s,event):null;
    $('field-event-explanation').classList.toggle('is-conjugate',!!event);
    updateText('field-event-title',event?description.title:s===0&&data?'At x: all fields start at zero':'Spread out, then refocus');
    updateText('field-event-why',description?.why||'');
    updateText('field-event-remaining',event?description.remaining:s===0&&data?'The shared starting zero is not counted.':'Drag the travel slider to watch the ribbon and hidden fields spread out and refocus. Select a + badge to inspect a conjugate point.');
    updateText('ribbon-field-status',event?event.surface?'Surface zero · ribbon pinches':'Hidden fields vanish · ribbon stays open':
      state.ribbon.mode==='focus'?'Surface field · focusing aid':state.ribbon.power===1?'Surface field · proportional width':'Surface field · compressed magnitude');
    return description;
  }
  function updateFocusing() {
    const data=focusData,s=data?state.travel*data.length:0,event=data?focusAt(s):null;
    updateFieldExplanation(data,s,event);
    updateText('travel-output',Math.round(state.travel*100)+'%');
    updateText('focus-count',data?String(data.countBefore(s)):'—');updateText('focus-index',data?String(data.index):'—');
    let message=state.viewMode==='all'?'All visible paths keep their full index colors. Choose a geodesic to inspect its Jacobi fields.':'Select a path to watch its nearby launch directions refocus.';
    if(focusError)message='Focusing display unavailable: '+focusError;
    else if(data){
      if(event)message=event.endpoint?`At the destination: ${event.multiplicity} null directions. This endpoint event is not part of the index.`:
        `${eventName(event)} ${event.multiplicity===1?'is':'are'} zero here. Passing this conjugate point adds ${event.multiplicity} to the index.`;
      else if(state.travel===0)message='Launch nearby paths from x in slightly different directions. The starting point is not counted.';
      else if(state.travel>=1)message=`Destination reached: ${data.countBefore(s)} focusing directions before y give Morse index ${data.index}.`;
      else {
        const next=data.interiorEvents.find(e=>e.s>s);
        message=next?`Next: ${eventName(next).toLowerCase()} ${next.multiplicity===1?'refocuses':'refocus'} at distance ${next.s.toFixed(2)}. Passing adds ${next.multiplicity}.`:
          data.index?'All interior focusing events have been passed. Continue to the destination.':'No direction refocuses before the destination. This path has Morse index 0.';
      }
    }
    updateText('focus-status',message);
    for(const id of ['conjugate-markers','conjugate-timeline','focus-tokens'])for(const button of $(id).querySelectorAll('button')){
      const e=data.events[Number(button.dataset.event)];
      button.classList.toggle('passed',!e.endpoint&&e.s<s-16*Number.EPSILON*Math.max(1,data.length,s));
      button.classList.toggle('at-event',event===e);button.setAttribute('aria-pressed',String(event===e));
    }
    const cursor=$('conjugate-timeline').querySelector('.timeline-cursor');if(cursor)cursor.style.left=state.travel*100+'%';
    if(surfaceTraversal.snapshot().pending)updateSurfaceTraversalUI();
    else $('travel').setAttribute('aria-valuetext',data?`${Math.round(state.travel*100)} percent; ${data.countBefore(s)} of ${data.index} focusing directions passed`:Math.round(state.travel*100)+' percent');
    const ambientActive=$('ambient-details').open&&!document.hidden&&!state.surgery,curve=selected();
    ambientExplorer.setContext({surface:state.surface,selected:!!curve,active:ambientActive,
      point:ambientActive&&state.surface==='torus'&&curve?pointOn(curve,state.travel):null});
    const study=activeDownhill();
    hiddenCutaway.setContext({active:$('hidden-neighborhood-details').open&&!document.hidden,
      data,position:s,requestedPosition:surfaceTraversal.snapshot().latest?.position??null,playing:state.playing,error:state.surgery?'Geodesics resume after gluing.':focusError,
      ...(traversalHold.isHeld()?{study:null,deformation:null}:hiddenStudyContext(study))});
    updateStudyFacts(study);
    if($('jacobi').closest('details').open)drawJacobi(selected());
  }
  function updateStudyFacts(study){
    const curve=selected();
    updateText('selected-index-label',study?'Segment index':'Morse index');
    updateText('selected-length-label',study?'Segment length':'Length');
    updateText('selected-index',study?String(focusData.countBefore(study.T)):curve?String(curve.index):'—');
    updateText('selected-length',study?study.T.toFixed(3):curve?curve.length.toFixed(3):'—');
    if(study){
      const guard=16*Number.EPSILON*Math.max(1,study.T,focusData.length);
      const passed=focusData.interiorEvents.filter(e=>e.s<study.T-guard);
      updateText('selected-intrinsic',String(passed.reduce((n,e)=>n+(e.surface?1:0),0)));
      updateText('selected-normal',String(passed.reduce((n,e)=>n+(e.hidden?2:0),0)));
    }else{
      updateText('selected-intrinsic',curve?String(curve.intrinsicIndex):'—');
      updateText('selected-normal',curve?String(curve.normalIndex):'—');
    }
  }
  function updateGraphScaleControls(data=focusData) {
    const scale=window.GeodesicJacobiGraphScale;
    for(const [k,name]of ['surface','hidden-one','hidden-two'].entries()){
      const amplitude=data?(k===0?data.maxSurfaceAmplitude:data.maxHiddenAmplitude):null;
      updateText('graph-zoom-'+name+'-value',scale.format(graphZoom[k])+'×');
      updateText('graph-range-'+name,amplitude?'Vertical reference ±'+scale.format(scale.range(amplitude,graphZoom[k]))+' field units':'Select a path to see its scale.');
      $('graph-zoom-'+name).setAttribute('aria-valuetext',scale.format(graphZoom[k])+' times vertical zoom'+(amplitude?'; reference plus or minus '+scale.format(scale.range(amplitude,graphZoom[k]))+' field units':''));
    }
  }
  function drawJacobi(curve) {
    const node=$('jacobi'),c=node.getContext('2d'),box=node.getBoundingClientRect();
    const w=Math.max(1,box.width),h=Math.max(1,box.height),ratio=Math.min(devicePixelRatio||1,2);
    if(node.width!==Math.round(w*ratio)||node.height!==Math.round(h*ratio)){node.width=Math.round(w*ratio);node.height=Math.round(h*ratio);}
    c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
    updateGraphScaleControls();
    if(w<120||h<70)return;
    const data=focusData,left=w<330?65:77,right=w-14,top=20,bottom=h-27,row=(bottom-top)/3;
    if(!curve||!data){c.fillStyle='#526970';c.font='12px system-ui';c.fillText(focusError?'Field data unavailable.':'Select a path to inspect its focusing.',12,h/2);return;}
    const colors=['#247e72','#a96825','#8b66ae'],labels=['Surface','Hidden 1','Hidden 2'],names=['Jₛ','J₁','J₂'];
    const activeEvent=focusAt(state.travel*data.length);
    const plotSamples=[...data.samples];
    const scale=window.GeodesicJacobiGraphScale;
    const references=[data.maxSurfaceAmplitude,data.maxHiddenAmplitude,data.maxHiddenAmplitude];
    const sample=data.sampleAt(state.travel*data.length),cursorX=left+(right-left)*state.travel;
    for(let k=0;k<3;k++){
      const mid=top+row*(k+.5),amp=row*.34;
      const vanishes=!!activeEvent&&(k===0?activeEvent.surface:activeEvent.hidden);
      c.save();
      if(vanishes){c.fillStyle=colors[k]+'13';c.fillRect(left-4,mid-row*.46,right-left+8,row*.92);}
      c.strokeStyle='#deded4';c.lineWidth=1;c.beginPath();c.moveTo(left,mid);c.lineTo(right,mid);c.stroke();
      c.fillStyle=colors[k];c.font='bold 13px system-ui';c.textAlign='left';c.fillText(names[k],0,mid-2);
      c.font='10px system-ui';c.fillText(labels[k],0,mid+13);
      c.save();c.beginPath();c.rect(left,top+row*k+2,right-left,row-4);c.clip();
      c.strokeStyle='#dbe5dd';c.lineWidth=.8;c.setLineDash([2,4]);
      for(const sign of [-1,1]){c.beginPath();c.moveTo(left,mid+sign*amp);c.lineTo(right,mid+sign*amp);c.stroke();}
      c.setLineDash([]);
      c.beginPath();plotSamples.forEach((p,i)=>{
        const value=scale.scaled(k===0?p.j:Jacobi.hiddenValue(p.s,data.curvature),references[k],graphZoom[k]);
        const x=left+(right-left)*p.s/data.length,y=mid-amp*value;
        if(i)c.lineTo(x,y);else c.moveTo(x,y);
      });c.strokeStyle=colors[k];c.lineWidth=1.6;c.stroke();
      for(const event of data.events)if(k===0?event.surface:event.hidden){
        const x=left+(right-left)*event.s/data.length;c.beginPath();c.arc(x,mid,3.3,0,TAU);c.fillStyle=colors[k];c.fill();
      }
      const currentValue=scale.scaled(vanishes?0:k===0?sample.j:sample.hidden,references[k],graphZoom[k]);
      c.beginPath();c.arc(cursorX,mid-amp*currentValue,4,0,TAU);c.fillStyle=colors[k];c.fill();
      c.restore();
      if(vanishes){
        const x=left+(right-left)*state.travel;
        c.beginPath();c.arc(x,mid,7,0,TAU);c.strokeStyle=colors[k];c.lineWidth=2;c.stroke();
        c.font='bold 11px system-ui';c.textAlign=x>right-65?'right':'left';
        c.fillText(names[k]+' = 0',x>right-65?x-10:x+10,mid-12);
      }
      c.restore();
    }
    const x=left+(right-left)*state.travel;c.strokeStyle='#173c49';c.lineWidth=1;c.setLineDash([3,3]);
    c.beginPath();c.moveTo(x,top-8);c.lineTo(x,bottom+3);c.stroke();c.setLineDash([]);
    c.fillStyle='#526970';c.font='10px system-ui';c.textAlign='left';c.fillText('x · 0',left,h-7);c.textAlign='right';c.fillText(`y · ${data.length.toFixed(2)}`,right,h-7);
    node.setAttribute('aria-label',`Three separate fields Jₛ, J₁, and J₂ with independent vertical zoom ${graphZoom.map(v=>scale.format(v)+' times').join(', ')}. Large peaks are clipped within their own rows. ${activeEvent?FieldExplanation.describe(data,state.travel*data.length,activeEvent).title+'. ':''}${data.interiorEvents.length} interior conjugate events contribute Morse index ${data.index}. Cursor at ${Math.round(state.travel*100)} percent.`);
  }
  function updateDetails() {
    const curve=selected();
    prepareFocusing(curve);
    updateRibbonControls();
    const endpointResidual=focusData?norm(sub(focusData.endpoint,endpoints().q)):curve?.residual;
    $('selected-name').textContent=state.surgery?'Geodesics resume after gluing':currentShowcase()?.title||(curve?`Geodesic ${state.curves.indexOf(curve)+1}`:state.viewMode==='all'?'All paths · full color':'Select a geodesic');
    for(const [id,value]of [['selected-index',curve?curve.index:'—'],['selected-length',curve?curve.length.toFixed(3):'—'],
      ['selected-intrinsic',curve?curve.intrinsicIndex:'—'],['selected-normal',curve?curve.normalIndex:'—'],['selected-residual',curve?scientific(endpointResidual):'—']])$(id).textContent=value;
    $('jacobi-caption').textContent=curve?
      `Each graph tracks a separate field’s signed size in its own direction; the other two components of that field are always zero. Jₛ contributes ${curve.intrinsicIndex} to the index; J₁ and J₂ together contribute ${curve.normalIndex}. The surface ribbon shows Jₛ alone. These fields use the chosen ambient metric.`:
      'The cursor follows the travel control. A field reaching zero marks refocusing in that direction.';
    if($('solver-diagnostics')){
      const verification=focusData?.verification||curve?.verification,raw=focusData?.integrationError;
      $('solver-diagnostics').textContent=verification?
        `Nested-grid differences: path ${scientific(verification.pathError)} · Jacobi field and derivative ${scientific(verification.jacobiError)} relative · zero times ${scientific(verification.rootTimeError)}. Before constraint correction: surface ${scientific(raw?.rawSurface??curve.rawSurfaceError)} · speed ${scientific(raw?.rawSpeed??curve.rawSpeedError)} · tangency ${scientific(raw?.rawTangency??curve.rawTangencyError)}. Display interpolation: ${scientific(focusData?.sampling.jacobiError)} relative on the fine grid. These comparisons estimate accuracy; they are not rigorous error bounds.`:
        curve?`Catalogue endpoint error ${scientific(curve.residual)} · whole-path refinement ${scientific(curve.refinementError)}.`:
        'The selected path is rechecked for geodesic, Jacobi-field, and conjugate-time convergence.';
    }
    drawJacobi(curve);
  }
  function normalSceneCaption() {
    return state.surface!=='torus'?
      `This genus-${model().genus} surface is totally geodesic inside #${superscript(model().genus)}(S² × S²) for the chosen metric. Round tori of tube radius 0.45 meet through broad, gently rounded collars that stay within the original torus height.`:
      'This torus is totally geodesic inside S² × S² for the chosen ambient metric. The trajectories are computed in its induced surface metric.';
  }
  function surgeryNarration() {
    const operation=state.surgery,display=operation?.motion.sample(operation.progress),t=display?.geometry||0;
    if(operation?.plan&&display.phase==='fade-in')return {stage:-3,title:'Fade into the surface',description:'The surface fills in while the original grid fades away. The connected sum starts next.'};
    if(operation?.plan&&display.phase==='fade-out')return {stage:5,title:'Restore the surface view',description:'The completed connected sum fades back to your surface and grid settings.'};
    if(!operation?.plan)return {stage:-1,title:'Preparing the connected sum',description:'Preparing the two curved discs and their matching boundary loops.'};
    if(t<.14)return {stage:0,title:'Prepare the two surfaces',description:'Gold marks a disc on the existing surface and a disc on a new round torus.'};
    if(t<.36)return {stage:1,title:'Remove a disc from each surface',description:'Lift away the gold discs. Each surface now has an open boundary loop.'};
    if(t<.60)return {stage:2,title:'Bring the boundaries together',description:operation.fromCount===2?'Move the new torus into position. The first neck stays in place.':'Move the new torus into position. The two torus bodies keep their round geometry.'};
    if(t<.94)return {stage:3,title:'Glue the boundary loops',description:'Extend the collars from both openings until they meet in a smooth neck.'};
    return {stage:4,title:'Connected sum complete',description:`The genus-${operation.fromCount+1} surface is complete. Its computed geodesics appear next.`};
  }
  function lockConstructionControls() {
    const busy=!!state.surgery;
    viewResize.setContext({docked:state.cutawayDock,locked:busy});
    for(const id of ['surface-torus','surface-double','surface-triple','endpoint-preset','index-cutoff','search-quality','sort-curves','path-view','show-surface','show-wire','show-focusing','speed','ribbon-mode','ribbon-width','ribbon-compression','ribbon-proportional','ribbon-reset','dock-cutaway','cutaway-layout-toggle'])setDisabled(id,busy);
    setDisabled('study-curve',busy||!visible().length);
    const presenting=state.mode==='presentation';
    const showcasing=state.mode==='showcase';
    setDisabled('experience-mode',busy);
    for(const id of ['surface-torus','surface-double','surface-triple'])setDisabled(id,busy||showcasing);
    for(const id of ['endpoint-preset','index-cutoff','search-quality'])setDisabled(id,busy||presenting||showcasing);
    setDisabled('add-handle',busy||showcasing||state.surface==='triple'||presenting&&!reveal?.snapshot().done);
    updateText('add-handle',busy?'Adding…':'Add');
    setDisabled('search-more',busy||state.running||presenting||showcasing);
    setDisabled('play',busy||!selected()||downhillControls.snapshot().open);setDisabled('travel',busy||!selected());setDisabled('speed',busy||!selected());
    setDisabled('surface-opacity',busy||!state.surfaceVisible);
    for(const button of $('curve-list').querySelectorAll('button'))if(button.disabled!==busy)button.disabled=busy;
  }
  function updateSurgeryUI() {
    const operation=state.surgery;
    $('neck-construction-controls').hidden=!state.neckOpen||!operation;
    const display=operation?.motion.sample(operation.progress);
    // Keep the display stages inspectable without exposing mutable app state.
    $('surgery-controls').dataset.phase=operation?(operation.plan?display.phase:'preparing'):'idle';
    $('surgery-controls').dataset.geometry=String(display?.geometry??0);
    $('surgery-controls').dataset.fill=String(display?.fill??(state.surfaceVisible?state.surfaceOpacity:0));
    $('surgery-controls').dataset.grid=String(display?.grid??(state.wire?.18:0));
    $('workspace').classList.toggle('constructing',!!operation);
    $('surgery-controls').hidden=!operation;$('scene-count').hidden=!!operation;
    if(!operation){
      $('scene-title').innerHTML='Many ways from <i>x</i> to <i>y</i>';
      $('scene-kicker').textContent='The visible surface';$('scene-caption').textContent=normalSceneCaption();
      lockConstructionControls();return;
    }
    const narration=surgeryNarration();
    if(operation.lastStage!==narration.stage){
      $('scene-kicker').textContent=`Connected sum · ${operation.fromCount} → ${operation.fromCount+1} summands`;
      $('scene-title').textContent=narration.title;$('scene-caption').textContent=narration.description;
      $('surgery-stage').textContent=narration.title;$('surgery-controls').dataset.stage=narration.stage;
      operation.lastStage=narration.stage;announce(narration.title+'. '+narration.description);
    }
    $('surgery-progress').value=Math.round(operation.progress*1000);
    const valueText=`${Math.round(operation.progress*100)}%, ${narration.title}`;
    if($('surgery-progress').getAttribute('aria-valuetext')!==valueText)$('surgery-progress').setAttribute('aria-valuetext',valueText);
    updateText('surgery-percent',operation.plan?Math.round(operation.progress*100)+'%':'Preparing…');
    updateText('surgery-pause',operation.paused?'Play':'Pause');
    if($('surgery-pause').getAttribute('aria-pressed')!==String(!operation.paused))$('surgery-pause').setAttribute('aria-pressed',String(!operation.paused));
    setDisabled('surgery-pause',!operation.plan);setDisabled('surgery-progress',!operation.plan);
    $('surgery-motion-note').hidden=!operation.reducedMotion;
    lockConstructionControls();
  }
  async function startSurgery() {
    if(state.surgery||model().genus>=3||state.mode==='showcase')return;
    cancelSurfaceTraversal();
    pauseReveal();
    const snapshot={selected:state.selected,travel:state.travel,camera:{...state.camera},surfaceVisible:state.surfaceVisible,wire:state.wire,surfaceOpacity:state.surfaceOpacity};
    state.playing=false;stopSearch('Geodesic searches pause during the connected sum.');
    const from=state.surface,fromCount=model().genus,to=fromCount===1?'double':'triple',token=++surgeryToken;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.surgery={from,to,fromCount,token,snapshot,endpointPreset:state.endpointPreset,progress:0,paused:reducedMotion,reducedMotion,plan:null,lastStage:-2,
      motion:SurgeryMotion.create(snapshot)};
    state.camera={...Camera.defaultCamera(),yaw:snapshot.camera.yaw,pitch:snapshot.camera.pitch};
    // Render the first frame from the original snapshot, even while meshes are
    // preparing. Layer fades are independent of these temporary UI settings.
    state.surfaceVisible=true;state.wire=false;$('show-surface').checked=true;$('show-wire').checked=false;
    clearSurgeryGPU();updateCatalogue();$('surgery-cancel').focus({preventScroll:true});requestDraw();
    // Let the preparation state paint before constructing the cached meshes.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(state.surgery?.token!==token)return;
    try{
      if(!surgeryPlans.has(from))await surgeryPreparation.prepare(from);
      if(state.surgery?.token!==token)return;
      state.surgery.plan=surgeryPlans.get(from);
      // Upload every static piece and the final grid before starting the clock.
      // First-use allocations must not stall a cut, ring, or final layer fade.
      prepareSurgeryGPU(state.surgery);
      state.surgery.motion=SurgeryMotion.create({...snapshot,durationMs:state.surgery.plan.durationMs});
      if(state.surgery.finishRequested){finishSurgery();return;}
      lastTime=0;updateSurgeryUI();
      if(document.activeElement===$('surgery-cancel')&&!document.hidden)$('surgery-pause').focus({preventScroll:true});
      requestDraw();
    }catch(error){if(state.surgery?.token!==token)return;cancelSurgery();$('search-status').textContent='The construction could not start: '+error.message;announce('The construction could not start.');}
  }
  function cancelSurgery() {
    const operation=state.surgery;if(!operation)return;
    if(lastCompletedNeck?.surface!==state.surface)lastCompletedNeck=null;
    surgeryToken++;state.surgery=null;clearSurgeryGPU();
    state.selected=operation.snapshot.selected;state.travel=operation.snapshot.travel;state.camera=operation.snapshot.camera;
    restoreSurgeryLayers(operation);
    lastTime=0;updateCatalogue();$('search-status').textContent=`${state.curves.length} trajectories retained on the original surface. Search is paused.`;
    if(!document.hidden)$('add-handle').focus({preventScroll:true});
    announce('Connected sum cancelled. The original surface and trajectories are restored.');
    if(state.mode==='explore')searchManager?.activate(searchConfig());
  }
  function restoreSurgeryLayers(operation) {
    state.surfaceVisible=operation.snapshot.surfaceVisible;state.wire=operation.snapshot.wire;
    state.surfaceOpacity=operation.snapshot.surfaceOpacity;
    $('show-surface').checked=state.surfaceVisible;$('show-wire').checked=state.wire;
  }
  function finishSurgery() {
    const operation=state.surgery;if(!operation)return;
    if(!operation.plan){operation.finishRequested=true;return;}
    const next=operation.motion.finishProgress(operation.progress,operation.reducedMotion);
    if(next>=1){completeSurgery();return;}
    operation.progress=next;operation.paused=false;lastTime=0;updateSurgeryUI();requestDraw();
  }
  function completeSurgery() {
    const operation=state.surgery;if(!operation)return;
    lastCompletedNeck={surface:operation.to,plan:operation.plan,id:operation.token};
    const targetGPU={surface:surgeryGPU.get('fade-target')||null,wire:surgeryGPU.get('fade-target-wire')||null};
    // Transfer ownership to the ordinary view instead of deleting and uploading
    // the same target again at the last frame of the construction.
    surgeryGPU.delete('fade-target');surgeryGPU.delete('fade-target-wire');
    const camera={...state.camera};surgeryToken++;state.surgery=null;clearSurgeryGPU();
    restoreSurgeryLayers(operation);
    state.cutoff=state.mode==='presentation'?window.GeodesicPresentationData.indexCutoff:0;
    setSurface(operation.to,operation.endpointPreset,camera,targetGPU);
    if(!document.hidden)$('surface-'+operation.to).focus({preventScroll:true});
    announce(`Connected sum complete. ${model().genus} summands, with ${state.curves.length} computed trajectories.`);
  }
  function updateTheory() {
    const guarantee=Theorem.bounds(model().genus,state.cutoff);
    $('picker-bound-label').textContent=guarantee.applicable?`Theorem B · guaranteed through index ${state.cutoff}`:'Theorem B · ambient guarantee';
    $('picker-bound').textContent=guarantee.applicable?'≥ '+guarantee.cumulative.toLocaleString():'—';
    $('picker-bound-scope').textContent=guarantee.applicable?
      `Guaranteed at index ${state.cutoff} alone: ≥ ${guarantee.degree.toLocaleString()}`:
      'The connected-sum bound applies from two summands.';
    $('theory-bound-label').textContent=guarantee.applicable?`Theorem B · guaranteed at index ${state.cutoff} alone`:'Theorem B · connected-sum bound';
    $('picker-bound').title=guarantee.applicable?'At least this many ambient geodesics under the fixed-endpoint Morse nondegeneracy assumptions. The numerical catalogue searches only the visible surface.':'Theorem B requires at least two summands.';
    if(state.surface==='torus') {
      $('theory-bound').textContent='One summand';
      $('theory-note').textContent='S² × S². The connected-sum estimate begins with two summands. The visible torus is a totally geodesic submanifold.';
    } else {
      const k=model().genus;
      const bound=state.cutoff===0?1n:BigInt(2*k)*BigInt(2*(k-1))**BigInt(state.cutoff-1);
      const formula=k===2?`2${superscript(state.cutoff+1)}`:`6 · 4${superscript(state.cutoff-1)}`;
      $('theory-bound').textContent=bound.toLocaleString();
      $('theory-note').textContent=state.cutoff===0?
        'b₀(ΩX) = 1. The catalogue is a selected subset of ambient geodesics.':
        `Theorem B: b${subscript(state.cutoff)}(ΩX) ≥ ${formula} for X = #${superscript(k)}(S² × S²). This is a per-degree bound; the slider shows indices ≤ ${state.cutoff}. This search stays on the visible surface and does not search other ambient trajectories.`;
    }
  }
  function superscript(n){return String(n).split('').map(x=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(x)]).join('');}
  function subscript(n){return String(n).split('').map(x=>'₀₁₂₃₄₅₆₇₈₉'[Number(x)]).join('');}
  function updateCatalogue() {
    const paths=visible();
    state.selected=Views.layout(state.viewMode,paths,state.selected||state.lastSelected).selected?.id||null;
    if(state.selected)state.lastSelected=state.selected;
    if(!state.selected)state.playing=false;
    $('path-view').value=state.viewMode;
    $('index-value').textContent=state.cutoff;$('index-cutoff').value=state.cutoff;
    const unrevealed=state.mode==='explore'&&state.cutoff===0;
    updateText('index-cutoff-label','Morse index ≤');
    const revealHint=!state.surgery&&state.mode==='explore'&&paths.length===0;
    $('index-reveal-hint').dataset.visible=String(revealHint);
    $('index-reveal-hint').setAttribute('aria-hidden',String(!revealHint));
    $('index-cutoff').setAttribute('aria-describedby',revealHint?'index-reveal-hint index-help':'index-help');
    $('index-cutoff').setAttribute('aria-valuetext',unrevealed?'0, no geodesics revealed; increase to reveal paths, including index-zero geodesics':`${state.cutoff}, show computed geodesics with Morse index at most ${state.cutoff}`);
    $('visible-count').textContent=state.viewMode==='solo'?(state.selected?1:0):paths.length;$('total-count').textContent=state.curves.length;
    $('index-max').textContent=$('index-cutoff').max;
    if(surfaceTraversal?.snapshot().pending)updateSurfaceTraversalUI();else{$('travel').value=state.travel;$('travel-output').textContent=Math.round(state.travel*100)+'%';}
    $('scene-empty').hidden=!!state.surgery||paths.length>0||state.mode==='presentation';
    const firstIndex=Math.min(...state.curves.filter(knownIndex).map(c=>c.index));
    $('scene-empty').textContent=unrevealed?state.curves.length?`${state.curves.length} geodesic${state.curves.length===1?'':'s'} ready. Increase the index slider to reveal them.`:'Preparing geodesics. Increase the index slider to reveal them when ready.':state.running?'Computing fixed-endpoint trajectories…':Number.isFinite(firstIndex)?
      `The lowest found Morse index is ${firstIndex}. Increase the cutoff to reveal curves.`:'Choose “Search for more geodesics” to compute trajectories between x and y.';
    $('play').disabled=!state.selected;$('travel').disabled=!state.selected;
    const list=$('curve-list'),keepFocus=list.contains(document.activeElement);list.replaceChildren();
    const sorted=paths.slice().sort($('sort-curves').value==='index'?(a,b)=>a.index-b.index||a.length-b.length:(a,b)=>a.length-b.length);
    const picker=$('study-curve'),options=sorted.map(curve=>({id:curve.id,label:`γ${state.curves.indexOf(curve)+1} · index ${curve.index} · L ${curve.length.toFixed(2)}`}));
    const signature=JSON.stringify(options);
    if(picker.dataset.options!==signature){
      const placeholder=new Option('Choose a geodesic','');placeholder.disabled=true;
      picker.replaceChildren(placeholder,...options.map(option=>new Option(option.label,option.id)));
      picker.dataset.options=signature;
    }
    picker.value=state.selected||'';
    for(const curve of sorted){
      const button=document.createElement('button');button.type='button';button.className='curve-chip';
      button.setAttribute('aria-pressed',String(curve.id===state.selected));button.style.setProperty('--curve-color',cssColor(curve.index));
      button.setAttribute('aria-label',`Select geodesic ${state.curves.indexOf(curve)+1}, Morse index ${curve.index}, length ${curve.length.toFixed(2)}${curve.presentation?', '+curve.presentation.label:''}`);
      if(curve.presentation){button.title=curve.presentation.label;button.dataset.summand=String(curve.presentation.group);}
      const name=document.createElement('strong');name.textContent=`γ${subscript(state.curves.indexOf(curve)+1)}`;
      if(curve.presentation){const tag=document.createElement('small');tag.className='route-tag';tag.textContent=curve.presentation.group===1?'original':`visits ${curve.presentation.maxBody??curve.presentation.group}`;name.append(tag);}
      const detail=document.createElement('span');detail.textContent=`i ${curve.index} · L ${curve.length.toFixed(2)}`;
      button.append(name,detail);button.addEventListener('click',()=>{
        if(state.mode==='showcase'){
          const pick=window.GeodesicShowcaseData.picks.find(p=>p.curveId===curve.id);
          if(pick){selectShowcase(pick.id);return;}
        }
        pauseReveal();
        if(state.viewMode==='all')state.viewMode='focus';
        state.selected=curve.id;state.travel=.35;updateCatalogue();$('travel').value=state.travel;requestDraw();
        // Bring the shared view and travel bar back together after choosing a
        // path from controls below the console on a narrow screen.
        if(window.matchMedia('(max-width: 900px)').matches)$('scene-stage').closest('.scene-column').scrollIntoView({block:'start',behavior:'instant'});
      });list.append(button);
    }
    if(keepFocus)list.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    $('play').textContent=state.playing?'Pause traversal':'Play traversal';$('play').setAttribute('aria-pressed',String(state.playing));
    updateDetails();updateTheory();updateSurgeryUI();updatePresentationUI();requestDraw();
  }
  function searchConfig(){
    const e=endpoints();
    return {surface:state.surface,endpointPreset:state.endpointPreset,geometryVersion:model().geometryVersion,
      solverVersion:Solver.solverVersion,normalCurvature:state.c,endpoints:{p:e.p,q:e.q}};
  }
  function acceptSearchCurves(curves,config){
    if(state.mode!=='explore'||state.surgery||config.surface!==state.surface||config.endpointPreset!==state.endpointPreset)return;
    // Existing objects keep their Jacobi/GPU caches while new paths arrive.
    state.curves=curves.map(c=>c.normalCurvature===state.c?c:Solver.classifyCurve(c,state.c));
    cache.set(key(),state.curves.slice());
    $('index-cutoff').max=Math.max(Number($('index-cutoff').max),...state.curves.filter(knownIndex).map(c=>Math.min(100,c.index)));
    updateCatalogue();
  }
  function updateSearchStatus(status){
    state.running=status.running;
    if(state.mode!=='explore'||state.surgery)return;
    const progress=$('search-progress');
    progress.dataset.workerActive=String(status.workerActive);progress.dataset.paused=String(status.paused);
    progress.dataset.reason=status.reason||'';progress.dataset.loading=String(status.loading);
    $('cancel-search').hidden=!status.running;$('cancel-search').disabled=!status.running;
    $('search-more').disabled=status.loading||status.running;
    progress.value=status.progress;
    $('search-status').textContent=status.loading?'Loading saved and precomputed trajectories…':status.error?status.found?
      `${status.found} validated trajectories available. Automatic expansion is unavailable in this viewer; use “Search for more geodesics” to continue.`:
      `The search could not start: ${status.error}`:status.catalogueLoading?
      `${status.found} validated trajectories available. Loading the larger collection…`:
      status.running?`${status.found} validated trajectories · ${status.paused?'search waits for '+status.reason:status.automatic?'expanding automatically':'searching further'} · ${Math.round(status.progress)}% of this starting-guess grid`:
      `${status.found} validated trajectories available. Search is finite, not exhaustive.${status.storageAvailable?'':' Storage unavailable; paths remain available this visit.'}`;
  }
  function stopSearch(message,byUser=false) {
    if(byUser)searchManager?.stop();else searchManager?.deactivate();
    state.running=false;$('cancel-search').hidden=true;$('cancel-search').disabled=true;$('search-more').disabled=false;
    if(message)$('search-status').textContent=message;
    updateCatalogue();
  }
  function startSearch() {
    if(state.running||state.surgery||state.mode!=='explore')return;
    searchManager?.manual($('search-quality').value);
  }
  function setSurface(id,preset=state.endpointPreset,camera=null,preparedGPU=null) {
    cancelSurfaceTraversal({seekLatest:false});
    if(state.surgery)cancelSurgery();
    if(lastCompletedNeck?.surface!==id)lastCompletedNeck=null;
    stopSearch();cache.set(key(),state.curves.slice());
    state.surface=id;state.endpointPreset=preset;
    if(state.mode!=='explore'){state.endpointPreset='presentation';state.cutoff=window.GeodesicPresentationData.indexCutoff;}
    state.curves=state.mode!=='explore'?initialCatalogue():cache.has(key())?cache.get(key()).slice():initialCatalogue();
    state.selected=null;state.lastSelected=null;state.playing=false;state.travel=.35;
    if(state.mode==='presentation'){
      state.viewMode='all';
      reveal=window.GeodesicPresentation.create({curves:state.curves,stage:model().genus,intervalMs:1500});
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)reveal.play();
    }
    $('index-cutoff').max=Math.max(18,...state.curves.filter(knownIndex).map(c=>c.index),state.cutoff);
    clearGPU();
    if(surfaceGPU!==preparedGPU?.surface)removeGPU(surfaceGPU);
    if(wireGPU!==preparedGPU?.wire)removeGPU(wireGPU);
    surfaceGPU=preparedGPU?.surface||null;wireGPU=preparedGPU?.wire||null;
    if(!meshes.has(id))meshes.set(id,S.buildMesh(id,model().meshResolution));state.mesh=meshes.get(id);
    for(const surface of S.modelIds)$('surface-'+surface).setAttribute('aria-pressed',String(id===surface));
    $('endpoint-preset').value=state.endpointPreset;
    $('add-handle').disabled=id==='triple';$('add-handle').textContent='Add';
    state.camera=camera||Camera.defaultCamera();$('travel').value=state.travel;
    $('search-progress').value=state.curves.length?100:0;
    $('search-status').textContent=state.curves.length?`${state.curves.length} computed trajectories available. Search to expand this collection.`:'Ready to compute fixed-endpoint geodesics.';
    updateCatalogue();
    announce(`${model().name}. ${state.curves.length} computed fixed-endpoint geodesics available.`);
    if(state.mode==='explore')searchManager?.activate(searchConfig());
    warmNextSurgery();
  }
  $('experience-mode').addEventListener('change',()=>setExperienceMode($('experience-mode').value));
  for(const pick of window.GeodesicShowcaseData.picks)$('showcase-'+pick.id).addEventListener('click',()=>selectShowcase(pick.id));
  $('showcase-hidden').addEventListener('click',()=>seekShowcase('hidden'));
  $('showcase-surface').addEventListener('click',()=>seekShowcase('surface'));
  $('showcase-start').addEventListener('click',()=>{
    const pick=currentShowcase();if(!pick||!focusData)return;
    state.travel=pick.startS/focusData.length;$('travel').value=state.travel;pauseTraversal();
  });
  $('showcase-return').addEventListener('click',()=>setExperienceMode(showcaseReturn?.mode||'explore'));
  $('reveal-play').addEventListener('click',()=>{
    if(!reveal||state.surgery)return;
    if(reveal.snapshot().playing)reveal.pause();else{state.playing=false;state.viewMode='all';state.selected=null;state.lastSelected=null;reveal.play();}
    lastTime=0;updateCatalogue();
  });
  $('reveal-replay').addEventListener('click',()=>{
    if(!reveal||state.surgery)return;state.playing=false;state.viewMode='all';state.selected=null;state.lastSelected=null;
    reveal.replay({playing:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});lastTime=0;updateCatalogue();
  });
  $('reveal-all').addEventListener('click',()=>{
    if(!reveal||state.surgery)return;state.playing=false;state.viewMode='all';state.selected=null;state.lastSelected=null;
    reveal.showAll();updateCatalogue();
  });
  $('surface-torus').addEventListener('click',()=>setSurface('torus'));
  $('surface-double').addEventListener('click',()=>setSurface('double'));
  $('surface-triple').addEventListener('click',()=>setSurface('triple'));
  $('add-handle').addEventListener('click',startSurgery);
  $('neck-explanation-toggle').addEventListener('click',()=>setNeckOpen(!state.neckOpen));
  $('neck-explanation-close').addEventListener('click',()=>{setNeckOpen(false);$('neck-explanation-toggle').focus({preventScroll:true});});
  $('surgery-pause').addEventListener('click',()=>{if(!state.surgery?.plan)return;state.surgery.paused=!state.surgery.paused;lastTime=0;updateSurgeryUI();requestDraw();});
  $('surgery-progress').addEventListener('input',()=>{if(!state.surgery?.plan)return;state.surgery.progress=Number($('surgery-progress').value)/1000;state.surgery.paused=true;lastTime=0;if(state.surgery.progress>=1)completeSurgery();else{updateSurgeryUI();requestDraw();}});
  $('surgery-finish').addEventListener('click',finishSurgery);
  $('surgery-cancel').addEventListener('click',cancelSurgery);
  $('endpoint-preset').addEventListener('change',()=>setSurface(state.surface,$('endpoint-preset').value));
  $('index-cutoff').addEventListener('input',()=>{state.cutoff=Number($('index-cutoff').value);updateCatalogue();});
  $('search-more').addEventListener('click',()=>startSearch());
  $('cancel-search').addEventListener('click',()=>stopSearch('Search paused. Accepted trajectories remain available.',true));
  $('sort-curves').addEventListener('change',updateCatalogue);
  $('play').addEventListener('click',toggleTraversal);
  $('travel').addEventListener('input',()=>{
    requestTraversal(Number($('travel').value));
  });
  $('speed').addEventListener('change',()=>{state.speed=Number($('speed').value);});
  $('path-view').addEventListener('change',()=>{pauseReveal();state.viewMode=$('path-view').value;updateCatalogue();});
  $('ribbon-mode').addEventListener('change',()=>changeRibbonScale({mode:$('ribbon-mode').value}));
  $('ribbon-width').addEventListener('input',()=>changeRibbonScale({halfWidth:Number($('ribbon-width').value)/100}));
  $('ribbon-compression').addEventListener('input',()=>changeRibbonScale({power:(100-Number($('ribbon-compression').value))/100}));
  $('ribbon-proportional').addEventListener('click',()=>changeRibbonScale({mode:'amplitude',power:1}));
  $('ribbon-reset').addEventListener('click',()=>changeRibbonScale({mode:'amplitude',halfWidth:.16,power:.5}));
  for(const[id,key]of [['show-wire','wire'],['show-surface','surfaceVisible'],['show-focusing','focusing']])$(id).addEventListener('change',()=>{state[key]=$(id).checked;if(key==='surfaceVisible')$('surface-opacity').disabled=!state.surfaceVisible;requestDraw();});
  $('surface-opacity').addEventListener('input',()=>{
    state.surfaceOpacity=clamp(Number($('surface-opacity').value)/100,.1,1);
    $('surface-opacity-value').textContent=Math.round(state.surfaceOpacity*100)+'%';requestDraw();
  });
  function cameraChange(yaw,pitch,zoom=1){
    state.camera=Camera.turn(state.camera,yaw,pitch);
    if(zoom!==1)state.camera=Camera.zoomAt({bounds:currentBounds(),camera:state.camera,width:cssW,height:cssH,x:cssW/2,y:cssH/2,factor:zoom});
    requestDraw();
  }
  $('reset-camera').addEventListener('click',()=>{state.camera=Camera.defaultCamera();requestDraw();});
  $('rotate-left').addEventListener('click',()=>cameraChange(-.18,0));$('rotate-right').addEventListener('click',()=>cameraChange(.18,0));
  $('zoom-in').addEventListener('click',()=>cameraChange(0,0,.9));$('zoom-out').addEventListener('click',()=>cameraChange(0,0,1/.9));
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||dragging)return;dragging={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging||dragging.id!==e.pointerId)return;if(e.buttons===0){dragging=null;return;}cameraChange((e.clientX-dragging.x)*.007,-(e.clientY-dragging.y)*.007);dragging.x=e.clientX;dragging.y=e.clientY;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(dragging?.id===e.pointerId)dragging=null;});
  window.addEventListener('blur',()=>{dragging=null;});
  $('scene-stage').addEventListener('wheel',e=>{
    if(e.target.closest('.scene-toolbar,.surgery-controls'))return;
    e.preventDefault();
    const box=canvas.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?box.height:1);
    state.camera=Camera.zoomAt({bounds:currentBounds(),camera:state.camera,width:box.width,height:box.height,
      x:e.clientX-box.left,y:e.clientY-box.top,factor:Math.exp(clamp(delta,-300,300)*.001),model:state.surgery?null:model()});
    requestDraw();
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    const actions={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.1],ArrowDown:[0,-.1],'+':[0,0,.9],'=':[0,0,.9],'-':[0,0,1/.9]};
    if(actions[e.key]){e.preventDefault();cameraChange(...actions[e.key]);}
    if(e.key==='Home'){e.preventDefault();state.camera=Camera.defaultCamera();requestDraw();}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelSurfaceTraversal();contextLost=true;pauseReveal();if(state.surgery){state.surgery.paused=true;updateSurgeryUI();}$('search-status').textContent='Graphics paused; waiting for the rendering context to recover.';});
  canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;initGL();requestDraw();});
  document.addEventListener('visibilitychange',()=>{searchManager?.block('hidden page',document.hidden);downhillPreparation.block('hidden page',document.hidden);if(document.hidden){cancelSurfaceTraversal();neckResize?.setContext({active:false});neckViewer?.setContext({active:false});cancelSurgeryWarmup();dragging=null;pauseReveal();ambientExplorer.setContext({active:false});hiddenCutaway.setContext({active:false});state.playing=false;if(state.surgery){state.surgery.paused=true;updateSurgeryUI();}if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;updateCatalogue();}else{requestDraw();warmNextSurgery();}});
  window.addEventListener('pagehide',()=>{searchManager?.block('hidden page',true);downhillPreparation.block('hidden page',true);cancelSurfaceTraversal();cancelSurgeryWarmup();surgeryPreparation.cancelPending();dragging=null;pauseReveal();ambientExplorer.setContext({active:false});hiddenCutaway.setContext({active:false});if(state.surgery)cancelSurgery();if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;state.playing=false;stopSearch();searchManager?.flush();});
  window.addEventListener('pageshow',()=>{searchManager?.block('hidden page',document.hidden);downhillPreparation.block('hidden page',document.hidden);if(state.mode==='explore'&&!state.surgery)searchManager?.activate(searchConfig());requestDraw();warmNextSurgery();});
  $('jacobi').closest('details').addEventListener('toggle',requestDraw);
  for(const [k,name]of ['surface','hidden-one','hidden-two'].entries())$('graph-zoom-'+name).addEventListener('input',()=>{
    graphZoom[k]=window.GeodesicJacobiGraphScale.gain(Number($('graph-zoom-'+name).value));
    updateGraphScaleControls();requestDraw();
  });
  $('graph-zoom-fit').addEventListener('click',()=>{
    graphZoom.fill(1);for(const name of ['surface','hidden-one','hidden-two'])$('graph-zoom-'+name).value=0;
    updateGraphScaleControls();requestDraw();
  });
  $('ambient-details').addEventListener('toggle',()=>{if(!$('ambient-details').open)ambientExplorer.setContext({active:false});requestDraw();});
  $('dock-cutaway').addEventListener('change',()=>setCutawayDock($('dock-cutaway').checked,{scroll:true}));
  $('cutaway-layout-toggle').addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();setCutawayDock(!state.cutawayDock,{scroll:true});
  });
  $('study-curve').addEventListener('change',()=>{
    const curve=visible().find(curve=>curve.id===$('study-curve').value);
    if(!curve)return;
    if(state.mode==='showcase'){
      const pick=window.GeodesicShowcaseData.picks.find(p=>p.curveId===curve.id);
      if(pick){selectShowcase(pick.id);return;}
    }
    pauseReveal();
    if(state.viewMode==='all')state.viewMode='focus';
    state.selected=curve.id;state.travel=.35;updateCatalogue();
  });
  $('hidden-neighborhood-details').addEventListener('toggle',()=>{
    if(!$('hidden-neighborhood-details').open){
      if(state.surgery&&state.cutawayDock){$('hidden-neighborhood-details').open=true;return;}
      if(state.cutawayDock)setCutawayDock(false);
      hiddenCutaway.setContext({active:false});
    }
    requestDraw();
  });
  $('hidden-neighborhood-details').querySelector('summary').addEventListener('click',event=>{
    if(state.surgery&&state.cutawayDock)event.preventDefault();
  });
  const resizeObserver=new ResizeObserver(requestDraw);resizeObserver.observe(canvas);resizeObserver.observe($('jacobi'));
  neckViewer=window.GeodesicNeckExplanation.create($('neck-explanation-view'),{onChange:requestDraw});
  neckResize=window.GeodesicNeckViewResize.create({
    workspace:$('workspace'),sceneColumn:$('observation-console'),
    surfacePanel:$('scene-stage').closest('.scene-panel'),neckPanel:$('neck-explanation'),
    constructionControls:$('neck-construction-controls'),onResize:requestDraw
  });
  const searchStore=window.GeodesicSearchStore.create(),catalogueLoader=window.GeodesicCatalogues.create();
  searchManager=window.GeodesicSearchManager.create({store:searchStore,loadCatalogue:catalogueLoader.load,
    getStarter:config=>window.GeodesicStarterData?.catalogues?.[config.surface+':'+config.endpointPreset],
    validateCurve:window.GeodesicSearchStore.validateCurve,
    sameCurve:Solver.duplicate,searchSeed:Solver.searchSeed,
    createWorker:window.GeodesicSearchWorkers.create(),
    searchFallback:Solver.search,onCurves:acceptSearchCurves,onStatus:updateSearchStatus});
  searchManager.block('hidden page',document.hidden);downhillPreparation.block('hidden page',document.hidden);
  // Capture before individual controls do work. A held slider/drag blocks the
  // worker even when the pointer stops moving; release starts the quiet period.
  const searchPointers=new Set();
  const traversalPreparationPointers=new Set(),otherPreparationPointers=new Set();
  function syncPreparationPointers(){
    // A stationary traversal hold may finish the requested exact mode in small
    // slices. Speculation and other drag gestures continue to pause completely.
    downhillPreparation.block('traversal pointer held',traversalPreparationPointers.size>0,{allowDemand:true});
    downhillPreparation.block('pointer held',otherPreparationPointers.size>0);
    downhillPreparation.interact();
  }
  document.addEventListener('pointerdown',event=>{searchPointers.add(event.pointerId);searchManager.block('pointer held',true);searchManager.interact();
    (event.target?.closest?.('#travel,[data-cutaway="position"]')?traversalPreparationPointers:otherPreparationPointers).add(event.pointerId);syncPreparationPointers();},{capture:true,passive:true});
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{searchPointers.delete(event.pointerId);searchManager.block('pointer held',searchPointers.size>0);searchManager.interact();
    traversalPreparationPointers.delete(event.pointerId);otherPreparationPointers.delete(event.pointerId);syncPreparationPointers();},{capture:true,passive:true});
  for(const type of ['input','keydown','wheel'])document.addEventListener(type,()=>{searchManager.interact();downhillPreparation.interact();},{capture:true,passive:true});
  window.addEventListener('blur',()=>{searchPointers.clear();searchManager.block('pointer held',false);searchManager.interact();traversalPreparationPointers.clear();otherPreparationPointers.clear();syncPreparationPointers();});
  for(const id of ['endpoint-x','endpoint-y']){$(id).style.left='0';$(id).style.top='0';}
  try{initGL();}catch(error){$('scene-empty').hidden=false;$('scene-empty').textContent='The 3D renderer could not start: '+error.message;}
  // Read-only numerical catalogue, useful for inspecting a downloaded result.
  window.MorseGeodesicsLab=Object.freeze({getState:()=>({surface:state.surface,endpointPreset:state.endpointPreset,
    geometryVersion:model().geometryVersion,cutoff:state.cutoff,normalCurvature:state.c,surfaceOpacity:state.surfaceOpacity,ribbon:{...state.ribbon},cutawayDock:state.cutawayDock,
    mode:state.mode,presentation:reveal?reveal.snapshot():null,
    computed:state.curves.length,shown:state.viewMode==='solo'?(selected()?1:0):visible().length,allGeodesics:state.viewMode!=='solo',viewMode:state.viewMode,selected:selected(),searching:state.running,search:searchManager.snapshot(),
    focusing:focusData?{index:focusData.index,count:focusData.countBefore(state.travel*focusData.length),travel:state.travel,
      events:focusData.events.map(e=>({...e})),error:focusError}:null,
    surfaceVisible:state.surfaceVisible,wire:state.wire,camera:{...state.camera},
    surgery:state.surgery?{from:state.surgery.from,to:state.surgery.to,progress:state.surgery.progress,paused:state.surgery.paused,phase:surgeryNarration().title,
      display:state.surgery.motion.sample(state.surgery.progress),snapshot:{surfaceVisible:state.surgery.snapshot.surfaceVisible,wire:state.surgery.snapshot.wire}}:null})});
  setSurface('torus');
})();
