'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const ribbonRenderer=source.slice(source.indexOf('  function drawRibbonGL('),source.indexOf('  function drawRibbonFallback'));
const ribbonFallback=source.slice(source.indexOf('  function drawRibbonFallback('),source.indexOf('  function drawFocusMarkers'));
const start=source.indexOf('      drawRibbonGL();');
const sceneSequence=source.slice(start,source.indexOf('      if(!state.surgery)drawMarkers',start));
const pathStart=source.indexOf('      if(state.mesh&&!surfaceGPU)');
const pathSequence=source.slice(pathStart,source.indexOf('      drawMarkers(paths,current',pathStart));
const fullPathSequence=source.slice(pathStart,source.indexOf('      if(!state.surgery)drawMarkers',pathStart));
const tubeRenderer=source.slice(source.indexOf('  function reducedPoints('),source.indexOf('  function curveGPU('));
const fallbackRenderer=source.slice(source.indexOf('  function drawFallback('),source.indexOf('  function resize('));
const downhillRenderer=source.slice(source.indexOf('  function drawDownhillGL('),source.indexOf('  function drawDownhillFallback('));
const Views=require('./view-modes.js'),RibbonMesh=require('./jacobi-ribbon-mesh.js');

// Execute the real path draw calls and tube tessellation. Apply the vertex
// shader's normal displacement before measuring thickness: a fake fixed path
// depth would miss a selected tube being contracted into its translucent strip.
function pathGeometry(mode,focusing){
  const current=mode==='all'?null:{id:'chosen',points:[[0,0,0],[1,0,0],[2,0,0]]};
  const contextCurve={id:'context',points:[[0,0,0],[1,0,0],[2,0,0]]};
  const calls=[],plane={normal:()=>[0,0,1],value:p=>p[2],gradient:()=>[0,0,1],project:p=>[p[0],p[1],0]};
  const context={state:{viewMode:mode,focusing},current,paths:current?[contextCurve,current]:[contextCurve],
    Views,TAU:2*Math.PI,model:()=>plane,
    sub:(a,b)=>a.map((v,i)=>v-b[i]),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    unit:a=>{const n=Math.hypot(...a);return a.map(v=>v/n);},
    gl:{TRIANGLES:'TRIANGLES',DEPTH_BUFFER_BIT:'DEPTH_BUFFER_BIT',depthMask(){},clear(){}},color:()=>[1,1,1],presentationOpacity:()=>1,
    drawRibbonGL(){},drawDownhillGL(){},activeDownhill:()=>null,
    renderGPU(item,type,rgb,lighting=0,offset=0,alpha=1){
      const vertices=[];
      for(let i=0;i<item.positions.length;i+=3)vertices.push(Array.from(item.positions.slice(i,i+3),(v,j)=>v+offset*item.normals[i+j]));
      calls.push({id:item.id,vertices,alpha});
    }};
  vm.createContext(context);vm.runInContext(tubeRenderer,context);
  context.curveGPU=context.revealedGPU=curve=>({...context.tube(curve),id:curve.id});
  vm.runInContext(pathSequence,context);
  const ribbon=RibbonMesh.build(plane,[0,1,2].map(s=>({width:.1,sample:{s,point:[s,0,0],tangent:[1,0,0]}})));
  return {calls,ribbon};
}

test('selected path retains its full tube thickness and clears the Jacobi ribbon',()=>{
  const radius=call=>Math.max(...call.vertices.map(p=>Math.hypot(p[1],p[2]-.007)));
  for(const focusing of [true,false])for(const mode of ['focus','solo']){
    const ordinary=pathGeometry('all',focusing).calls[0],result=pathGeometry(mode,focusing);
    const selected=result.calls.find(c=>c.id==='chosen');
    assert.ok(radius(selected)>=radius(ordinary)-1e-8,`${mode}, Jacobi ${focusing}: selection must not shrink the path tube.`);
    assert.equal(selected.alpha,1,'The selected path remains fully illuminated.');
    if(focusing){
      const ribbonTop=Math.max(...Array.from(result.ribbon.positions).filter((_,i)=>i%3===2));
      const selectedTop=Math.max(...selected.vertices.map(p=>p[2]));
      const ordinaryTop=Math.max(...ordinary.vertices.map(p=>p[2]));
      assert.ok(selectedTop-ribbonTop>=ordinaryTop-ribbonTop-1e-8,'Selection must retain the visible clearance that All paths has above the ribbon.');
      assert.ok(selectedTop>ribbonTop,'The gold centerline must extend above the translucent ribbon.');
    }
  }
});

// Put a dim context tube in front of the selection at one overlapping pixel.
// Its ordinary self-occlusion must remain while its completed depth cannot
// reject the selected draw. Execute the actual loop, depth reset and shell pass.
function overlappingPixel(mode,{shell=null,opacity=1}={}){
  const chosen={id:'chosen',index:1},other={id:'context',index:0};
  const view=Views.layout(mode,[other,chosen],'chosen'),calls=[];
  const depthState={mask:true,func:'LESS',color:[true,true,true,true]};
  let value=0,depth=1;
  const gl={TRIANGLES:'TRIANGLES',LESS:'LESS',EQUAL:'EQUAL',DEPTH_BUFFER_BIT:'DEPTH_BUFFER_BIT',
    clear(bits){assert.equal(bits,'DEPTH_BUFFER_BIT','Discard depth without erasing the context color.');depth=1;calls.push({item:'depth-clear'});},
    depthMask(v){depthState.mask=v;},depthFunc(v){depthState.func=v;},colorMask(...v){depthState.color=v;}};
  const context={gl,Views,state:{viewMode:mode,surfaceVisible:shell!==null,surfaceOpacity:opacity,wire:false},
    paths:view.paths,current:view.selected,surfaceGPU:'surface',
    curveGPU:c=>c.id,revealedGPU:c=>c.id,color:index=>index?[.9,.9,.9]:[.35,.35,.35],presentationOpacity:()=>1,
    drawRibbonGL(){},drawDownhillGL(){},drawMarkers(){},activeDownhill:()=>null,
    renderGPU(item,type,rgb,lighting=0,offset=0,alpha=1){
      const z=item==='surface'?shell:item==='context'?.25:.3;
      const passes=depthState.func==='EQUAL'?z===depth:z<depth;
      calls.push({item,alpha,mask:depthState.mask,passes});
      if(!passes)return;
      if(depthState.color.every(Boolean))value=alpha*rgb[0]+(1-alpha)*value;
      if(depthState.mask)depth=z;
    }};
  vm.runInNewContext(fullPathSequence,context);
  return {value,depth,calls,depthState};
}

test('dim focus paths cannot depth-block the selected path, while the surface still occludes it',()=>{
  for(const shell of [null,.4,.2])for(const opacity of [1,.55]){
    const focus=overlappingPixel('focus',{shell,opacity}),solo=overlappingPixel('solo',{shell,opacity});
    assert.equal(focus.value,solo.value,'Highlight selected must be as bright as Selected only at a context overlap.');
    assert.equal(focus.value,shell===.2?opacity*.26+(1-opacity):1,'Only a foreground surface may tint or hide the selection.');
    assert.equal(focus.calls.find(c=>c.item==='context').mask,true,'Context keeps its normal self-occlusion during its own color pass.');
    assert.equal(focus.calls.filter(c=>c.item==='depth-clear').length,1);
    assert.ok(focus.calls.findIndex(c=>c.item==='context')<focus.calls.findIndex(c=>c.item==='depth-clear'));
    assert.ok(focus.calls.findIndex(c=>c.item==='depth-clear')<focus.calls.findIndex(c=>c.item==='chosen'));
    assert.equal(focus.calls.find(c=>c.item==='chosen').mask,true,'Restore depth writes before the selected tube.');
    assert.deepEqual(focus.depthState,{mask:true,func:'LESS',color:[true,true,true,true]});
  }
  const all=overlappingPixel('all');
  assert.equal(all.value,.35,'Full-color context keeps ordinary opaque occlusion.');
  assert.equal(all.depth,.25);
  assert.ok(all.calls.filter(c=>c.item!=='surface').every(c=>c.mask),'All paths must retain depth ownership.');
});

test('Canvas fallback keeps the selected stroke at least as wide as ordinary paths with or without ribbons',()=>{
  for(const focusing of [true,false]){
    const strokes=[],chosen={id:'chosen',index:1,points:[[0,0,0],[1,0,0]]},other={id:'other',index:1,points:[[0,0,0],[1,0,0]]};
    const c={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push({width:this.lineWidth,alpha:this.globalAlpha,color:this.strokeStyle});}};
    const context={fallback:c,cssW:100,cssH:100,Views,state:{viewMode:'focus',focusing,surgery:true},
      drawMeshLayersFallback(){},drawRibbonFallback(){},drawDownhillFallback(){},activeDownhill:()=>null,
      reducedPoints:curve=>curve.points,presentationOpacity:()=>1,screenPoint:p=>({x:p[0],y:p[1]}),cssColor:()=> '#abc'};
    vm.runInNewContext(fallbackRenderer+'\n drawFallback(paths,current);',{...context,paths:[chosen,other],current:chosen});
    assert.equal(strokes.length,2);
    assert.equal(strokes[1].color,'#fff0c4','Paint the selected path last so later dim context strokes cannot cover it.');
    assert.ok(strokes[1].width>=strokes[0].width,`Jacobi ${focusing}: the chosen stroke must not become thinner than context paths.`);
    assert.equal(strokes[1].alpha,1);
    assert.notEqual(strokes[1].color,strokes[0].color);
  }
});

test('All paths retains opaque depth ownership and normal mutual occlusion',()=>{
  const result=overlappingPixel('all');
  assert.equal(result.value,.35);assert.equal(result.depth,.25);
  assert.equal(result.calls.find(c=>c.item==='context').mask,true);
  assert.equal(result.calls.find(c=>c.item==='context').alpha,1);
  assert.equal(result.calls.find(c=>c.item==='chosen').passes,false,'The nearer full-color tube still occludes the farther one.');
  assert.equal(result.calls.filter(c=>c.item==='depth-clear').length,0);
  assert.equal(result.depthState.mask,true);assert.equal(result.depthState.func,'LESS');
});

// A one-pixel depth/blend model executes the actual scene call sequence. Unlike
// checking call names alone, this detects a front ribbon disappearing beneath
// the later surface pass, and checks that rear fragments cannot redraw on top.
function pixel({rear=false,opacity=.55,filled=true,grid=false,selected=false,focusing=true,study=null}={}){
  const state={surfaceVisible:filled,surfaceOpacity:opacity,wire:grid,mesh:{},focusing};
  const glState={depth:true,mask:true,func:'LESS',color:[true,true,true,true]};
  const calls=[];
  let value=0,depth=1,uploads=0,geometries=0;
  const gl={DEPTH_TEST:'DEPTH_TEST',LESS:'LESS',EQUAL:'EQUAL',TRIANGLES:'TRIANGLES',LINES:'LINES',
    enable(){glState.depth=true;},depthMask(v){glState.mask=v;},depthFunc(v){glState.func=v;},colorMask(...v){glState.color=v;}};
  const current=selected?{id:'chosen'}:null,paths=selected?[current]:[];
  const context={gl,state,current,paths,focusData:{},activeDownhill:()=>study,surfaceGPU:'surface',wireGPU:null,ribbonGPU:null,ribbonEdgesGPU:null,
    ribbonGeometry:()=>{geometries++;return {positions:'ribbon',normals:[],edges:'edges',edgeNormals:[]};},
    upload:p=>{uploads++;return p;},curveGPU:()=> 'gold',wireData:()=>({positions:'grid',normals:[]}),drawMarkers(){},drawDownhillGL(){},
    renderGPU:(item,type,rgb,mode=0,offset=0,alpha=1)=>{
      calls.push({item,alpha,...glState,color:[...glState.color]});
      // Model an interior ribbon pixel, away from its edge lines and the grid.
      if(item==='edges'||item==='grid')return;
      const z=item==='surface'?.5:item==='gold'?.3:rear?.6:.4;
      const passes=!glState.depth||(glState.func==='EQUAL'?z===depth:z<depth);
      if(!passes)return;
      if(glState.color.every(Boolean)){
        const color=item==='surface'?.2:item==='gold'?.8:1;
        value=alpha*color+(1-alpha)*value;
      }
      if(glState.mask)depth=z;
    }};
  vm.runInNewContext(ribbonRenderer+'\n'+sceneSequence,context);
  return {value,depth,calls,state:glState,uploads,geometries};
}

test('an opaque surface leaves its front ribbon visible and hides a rear ribbon',()=>{
  assert.ok(pixel({opacity:1}).value>.5,'A front translucent ribbon must survive the opaque shell pass.');
  assert.equal(pixel({opacity:1,rear:true}).value,.2,'A rear ribbon must remain behind an opaque shell.');
});
test('a translucent shell retains rear tint while its front ribbon receives extra emphasis',()=>{
  const back=pixel({opacity:.55,rear:true}),front=pixel({opacity:.55});
  const tinted=.55*.2+.45*.48;
  assert.ok(Math.abs(back.value-tinted)<1e-12);
  assert.ok(front.value>back.value+.2);
  assert.ok(Math.abs(front.value-(.48+.52*tinted))<1e-12);
});
test('the front pass respects the selected tube and restores normal GL depth state',()=>{
  const result=pixel({selected:true,grid:true});
  assert.equal(result.value,.8,'The selected gold centerline must stay in front of the ribbon.');
  assert.equal(result.depth,.3);
  assert.deepEqual(result.state,{depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
  const ribbonCalls=result.calls.filter(c=>c.item==='ribbon'||c.item==='edges');
  assert.equal(ribbonCalls.length,4);
  assert.ok(ribbonCalls.every(c=>c.depth&&c.mask===false&&c.func==='LESS'));
  assert.equal(result.uploads,3,'The second ribbon pass must reuse its GPU buffers; only grid adds an upload.');
});
test('unfilled views draw the ribbon once and a disabled ribbon performs no draw or upload',()=>{
  const unfilled=pixel({filled:false,grid:true});
  assert.equal(unfilled.calls.filter(c=>c.item==='ribbon').length,1);
  assert.equal(unfilled.value,.48);
  const disabled=pixel({focusing:false});
  assert.equal(disabled.calls.filter(c=>c.item==='ribbon'||c.item==='edges').length,0);
  assert.equal(disabled.uploads,0);
});
test('finite length studies retain the focusing ribbon, depth visibility, and dim original path',()=>{
  for(const type of ['surface','hidden'])for(const filled of [true,false]){
    const study={active:true,type,T:5.4,amplitude:[.1,0]};
    const result=pixel({study,selected:true,filled,opacity:1,grid:true});
    const ribbonCalls=result.calls.filter(c=>c.item==='ribbon'||c.item==='edges');
    assert.equal(ribbonCalls.length,filled?4:2,`${type} study keeps the ribbon's ordinary visible passes.`);
    assert.ok(ribbonCalls.every(c=>c.depth&&c.mask===false&&c.func==='LESS'));
    assert.equal(result.uploads,3,'Ribbon, edges, and grid each upload once; the front pass reuses buffers.');
    assert.equal(result.calls.find(c=>c.item==='gold').alpha,.18,'The selected original curve remains as a dimmed reference.');
    const disabled=pixel({study,selected:true,filled,opacity:1,focusing:false});
    assert.ok(result.value>disabled.value+.2,'The visible ribbon contributes to the rendered pixel during a push.');
    assert.equal(disabled.calls.filter(c=>c.item==='ribbon'||c.item==='edges').length,0,'The Jacobi fields switch still hides the ribbon when requested.');
    assert.equal(disabled.geometries,0);assert.equal(disabled.uploads,0);
    assert.deepEqual(result.state,{depth:true,mask:true,func:'LESS',color:[true,true,true,true]});
    if(filled){
      const rear=pixel({study,selected:true,filled:true,opacity:1,rear:true});
      assert.equal(rear.value,.2,'The restored study ribbon must not draw a rear fragment through an opaque surface.');
    }
  }
});

test('Canvas fallback shows the Jacobi strip during both kinds of push and respects its visibility switch',()=>{
  for(const type of ['surface','hidden'])for(const focusing of [true,false]){
    let fills=0,strokes=0,geometries=0;
    const c={beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;},stroke(){strokes++;}};
    const rings=[[[0,0],[0,1]],[[1,0],[1,1]]].map(row=>row.map(p=>({p})));
    const context={state:{focusing},focusData:{},activeDownhill:()=>({active:true,type}),
      ribbonGeometry(){geometries++;return {rings};},screenPoint:p=>({x:p[0],y:p[1]})};
    vm.runInNewContext(ribbonFallback+'\n drawRibbonFallback(c);',{...context,c});
    assert.equal(fills,focusing?1:0);assert.equal(strokes,focusing?2:0);assert.equal(geometries,focusing?1:0);
  }
});

// The late surface pass has already established its depth here. Run the actual
// hidden front renderer against an overlapping pixel to distinguish its faint
// occluded lobe from its fully lit foreground without ignoring depth for both.
function hiddenPushPixel({rear=false,direction=1,type='hidden'}={}){
  const state={depth:true,mask:true,func:'LESS'},calls=[];
  let value=.2,depth=.5;
  const gl={DEPTH_TEST:'DEPTH_TEST',LESS:'LESS',LEQUAL:'LEQUAL',TRIANGLES:'TRIANGLES',LINES:'LINES',
    enable(){state.depth=true;},disable(){state.depth=false;},depthMask(v){state.mask=v;},depthFunc(v){state.func=v;}};
  const context={gl,activeDownhill:()=>({type,hiddenDirection:direction}),
    downhillBuffers:()=>({reference:'reference',deformed:'push',guides:'guides'}),
    renderGPU(item,primitive,rgb,lighting=0,offset=0,alpha=1){
      const z=item==='push'?(rear?.6:.4):.7;
      const passes=!state.depth||(state.func==='LEQUAL'?z<=depth:z<depth);
      calls.push({item,primitive,rgb:Array.from(rgb),alpha,passes,...state});
      if(!passes)return;
      value=alpha*rgb[0]+(1-alpha)*value;
      if(state.mask)depth=z;
    }};
  vm.runInNewContext(downhillRenderer+'\n drawDownhillGL(true);',context);
  return {value,depth,calls,state};
}

test('hidden pushes keep occluded lobes faint, foreground lobes bright, and restore ordinary GL depth state',()=>{
  for(const direction of [1,2])for(const rear of [true,false]){
    const result=hiddenPushPixel({rear,direction}),rgb=direction===2?[.72,.43,1]:[.30,.72,1];
    const xray=result.calls.find(c=>c.item==='push'&&!c.depth),front=result.calls.find(c=>c.item==='push'&&c.depth);
    assert.ok(xray,'Higher-mode hidden lobes need a faint view through the shell.');
    assert.equal(xray.alpha,.18);assert.equal(xray.mask,false);assert.equal(xray.passes,true);
    assert.equal(front.alpha,1);assert.equal(front.mask,false);assert.equal(front.func,'LEQUAL');
    assert.equal(front.passes,!rear);
    assert.deepEqual(front.rgb,rgb,'Direction changes must choose the corresponding blue or purple main-view curve.');
    assert.ok(Math.abs(result.value-(rear?.2784*rgb[0]+.7216*.2:rgb[0]))<1e-12,
      'Overlapping rear path/field passes stay faint; front paths receive their full selected color.');
    assert.equal(result.depth,.5,'The late emphasis pass must not replace the shell or path depth.');
    assert.deepEqual(result.state,{depth:true,mask:true,func:'LESS'});
    const guide=result.calls.find(c=>c.item==='guides'&&c.depth);
    assert.equal(guide.primitive,'TRIANGLES');assert.equal(guide.alpha,.92);assert.equal(guide.depth,true);assert.equal(guide.mask,false);
    const faintGuide=result.calls.find(c=>c.item==='guides'&&!c.depth);
    assert.equal(faintGuide.alpha,.12);assert.equal(faintGuide.mask,false);
  }
  const surface=hiddenPushPixel({type:'surface',rear:true});
  assert.equal(surface.value,.2,'Surface pushes retain normal surface occlusion.');
  assert.ok(surface.calls.every(c=>c.depth),'The x-ray convention is specific to hidden schematic pushes.');
});
