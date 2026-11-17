'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('./energy-landscape.js');
const curves=[
  {key:'before',samples:[{amplitude:-.12,relativeChange:.0002},{amplitude:0,relativeChange:0},{amplitude:.12,relativeChange:.0002}]},
  {key:'at',samples:[{amplitude:-.12,relativeChange:-1e-9,error:1e-14},{amplitude:0,relativeChange:0},{amplitude:.12,relativeChange:2e-9,error:1e-14}]},
  {key:'after',samples:[{amplitude:-.12,relativeChange:-.00018},{amplitude:0,relativeChange:0},{amplitude:.12,relativeChange:-.00018}]}
];
function harness(){
  const nodes={},timers=new Map();let n=0;
  const node=()=>({value:'',textContent:'',innerHTML:'',className:'',attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=String(v);},addEventListener(k,v){this.handlers[k]=v;},removeEventListener(k){delete this.handlers[k];}});
  const root={classList:{add(){}},dataset:{},innerHTML:'',ownerDocument:{defaultView:{setTimeout(fn){timers.set(++n,fn);return n;},clearTimeout(id){timers.delete(id);}}},querySelector(s){const key=s.match(/"([^"]+)"/)[1];return nodes[key]||(nodes[key]=node());},replaceChildren(){this.innerHTML='';},getBoundingClientRect(){return {width:500};}};
  const chart=E.create(root);return {root,chart,nodes,timers,flush(){for(const [id,fn]of timers){timers.delete(id);fn();}}};
}
test('measured length signs and unresolved uncertainty drive narration independently of mode status',()=>{
  assert.equal(E.energyState({amplitude:.1,relativeChange:.0001,error:1e-8,verified:true}),'higher');
  assert.equal(E.energyState({amplitude:.1,relativeChange:-.0001,error:1e-8,verified:true}),'lower');
  assert.equal(E.energyState({amplitude:.1,relativeChange:-1e-10,error:1e-8,verified:false}),'unresolved');
  assert.equal(E.energyState({amplitude:0,relativeChange:0,error:0,verified:true}),'original');
});
test('shared length scale preserves actual ratios and exact zero with no minimum visual curvature',()=>{
  const normalized=E.validateCurves(curves),v=E.extent(normalized);
  assert.equal(v,.0002*1.12);
  const before=E.coordinates(.12,.0002,.12,v),after=E.coordinates(.12,-.00018,.12,v),zero=E.coordinates(0,0,.12,v);
  assert.equal(zero.y,62);assert.equal(zero.x,207);assert.equal(before.x,342);
  assert.ok(zero.y-before.y>37&&zero.y-before.y<38);
  assert.ok(Math.abs((zero.y-before.y)/(after.y-zero.y)-.0002/.00018)<1e-12);
  assert.equal(E.path([{amplitude:-.12,relativeChange:.0002},{amplitude:0,relativeChange:0}],.12,v),`M72.000 ${before.y.toFixed(3)} L207.000 62.000`);
  const tiny=E.coordinates(.12,2e-9,.12,v);assert.ok(Math.abs(tiny.y-zero.y)<.001,'Shared fit cannot exaggerate the neutral curve independently.');
});
test('Hessian comparison uses two named modes on one fixed segment with a common measured scale',()=>{
  const {root,chart,nodes}=harness(),modes=[
    {...curves[0],key:'mode-1',label:'Surface Hessian mode 1',color:'#c8794d'},
    {...curves[2],key:'mode-2',label:'Surface Hessian mode 2',color:'#8a6ab0'}
  ];
  chart.setContext({curves:modes,activeKey:'mode-1',comparisonKind:'modes',heading:'Length vs signed surface push',comparisonLabel:'Same fixed segment · both Hessian modes'});
  const extent=Number(root.dataset.energyExtent);
  assert.match(nodes.legend.innerHTML,/Surface Hessian mode 1/);assert.match(nodes.legend.innerHTML,/Surface Hessian mode 2/);
  assert.doesNotMatch(nodes.legend.innerHTML,/Before|After|At focus/);
  assert.match(nodes.plot.innerHTML,/Both Hessian modes share the same fixed segment/);
  assert.match(nodes.plot.innerHTML,/stroke="#c8794d"/);assert.match(nodes.plot.innerHTML,/stroke="#8a6ab0"/);
  assert.match(nodes.caption.textContent,/Same fixed segment/);
  chart.setContext({activeKey:'mode-2'});assert.equal(Number(root.dataset.energyExtent),extent,'Switching modes preserves the common graph scale.');
  assert.throws(()=>E.validateCurves([{...modes[0],color:'red" onclick="bad'}]),RangeError);
  chart.destroy();
});
test('invalid inputs cannot create fabricated curves and labels remain actual relative length',()=>{
  assert.equal(E.percent(.0002),'+0.02%');assert.equal(E.percent(-.00018),'−0.018%');assert.equal(E.percent(0),'0%');
  for(const sample of [{amplitude:0,relativeChange:NaN},{amplitude:0,relativeChange:0,error:-1}])assert.throws(()=>E.validateCurves([{key:'bad',samples:[sample]}]),RangeError);
  assert.throws(()=>E.validateCurves([{key:'bad',samples:[{amplitude:0,relativeChange:0},{amplitude:0,relativeChange:1}]}]),RangeError);
});
test('auto fit exposes tiny resolved focus shape, while Compare all preserves the comparison scale',()=>{
  const {root,chart,nodes}=harness();
  chart.setContext({curves,activeKey:'before',current:{amplitude:.12,relativeChange:.0002,error:1e-9,verified:true}});
  const shared=Number(root.dataset.energyExtent);assert.equal(root.dataset.scaleMode,'comparison');assert.equal(nodes.state.textContent,'Longer path');
  chart.setContext({curves,activeKey:'at',current:{amplitude:.12,relativeChange:2e-9,error:1e-14,verified:true}});
  const fitted=Number(root.dataset.energyExtent);assert.equal(root.dataset.scaleMode,'selected');assert.ok(shared/fitted>80000);
  assert.match(nodes.caption.textContent,/Selected curve scale/);assert.match(nodes.plot.innerHTML,/viewBox="0 0 500 132"/);
  chart.setScale({mode:'comparison'});assert.equal(Number(root.dataset.energyExtent),shared);assert.equal(root.dataset.scaleMode,'comparison');
  chart.setContext({curves,activeKey:'after'});assert.equal(Number(root.dataset.energyExtent),shared);
  chart.destroy();
});
test('a removed or replaced current-segment curve cannot hold the cached bookmark scale open',()=>{
  const {root,chart}=harness(),sampled=peak=>[
    {amplitude:-.12,relativeChange:peak},{amplitude:0,relativeChange:0},{amplitude:.12,relativeChange:peak}
  ];
  const original=sampled(.02),replacement=sampled(.0004),shared=E.extent(E.validateCurves(curves));
  chart.setContext({curves,activeKey:'current',current:{amplitude:.12,relativeChange:.02,error:0,samples:original}});
  assert.equal(Number(root.dataset.energyExtent),.02*1.12);
  chart.setContext({activeKey:'current',current:{amplitude:.12,relativeChange:.0004,error:0,samples:replacement}});
  assert.equal(Number(root.dataset.energyExtent),.0004*1.12,'A different manually selected segment owns a new scale.');
  chart.setContext({activeKey:'after',current:{amplitude:.12,relativeChange:-.00018,error:0,samples:curves[2].samples}});
  assert.equal(Number(root.dataset.energyExtent),shared,'Returning to a bookmark removes the obsolete current curve from the fit.');
  chart.setContext({activeKey:'before',current:{amplitude:.06,relativeChange:.00005,error:0,samples:curves[0].samples}});
  assert.equal(Number(root.dataset.energyExtent),shared,'The same bookmark family still has one fixed comparison scale.');
  chart.destroy();
});
test('an explicit fit recomputes its extent from the displayed measurements rather than historical peaks',()=>{
  const {chart,root,nodes}=harness(),shared=E.extent(E.validateCurves(curves));
  chart.setContext({curves,activeKey:'before',current:{amplitude:.12,relativeChange:.02,error:0}});
  chart.setContext({current:{amplitude:.06,relativeChange:.00005,error:0}});
  assert.ok(Number(root.dataset.energyExtent)>shared,'Ordinary pushes keep a stable scale within the same curve family.');
  nodes.selected.handlers.click();assert.equal(Number(root.dataset.energyExtent),shared);
  nodes.comparison.handlers.click();assert.equal(Number(root.dataset.energyExtent),shared);
  chart.destroy();
});
test('zoom resamples the actual local curve within its safe domain and clips outside curves',()=>{
  let calls=0;
  const measured={key:'at',maxAmplitude:.06,samples:[{amplitude:-.06,relativeChange:-1e-7,error:1e-14},{amplitude:0,relativeChange:0},{amplitude:.06,relativeChange:1e-7,error:1e-14}],sampleAt(a){calls++;assert.ok(Math.abs(a)<=.06);return {relativeChange:a**3,error:1e-14};}};
  const {root,chart,nodes}=harness();chart.setContext({curves:[measured],activeKey:'at',maxAmplitude:.12,current:{amplitude:.06,relativeChange:1e-7,error:1e-14,verified:true}});
  chart.setScale({horizontalZoom:10,verticalZoom:100});assert.equal(Number(root.dataset.pushRange),.012);assert.equal(calls,33);
  const points=E.visibleSamples(E.validateCurves([measured])[0],.012,new WeakMap());assert.equal(points.length,33);assert.ok(points[16].relativeChange===0);assert.ok(points[0].relativeChange<0&&points.at(-1).relativeChange>0);
  assert.match(nodes.plot.innerHTML,/clip-path="url\(#length-landscape-[^\"]+-plot\)"/);assert.match(nodes.caption.textContent,/current push outside range/);
  const count=calls;chart.setContext({activeKey:'at'});assert.equal(calls,count,'Repeated pushes reuse the local measured scan.');
  assert.ok(Number(root.dataset.verticalZoom)===100);chart.destroy();
});
test('selected fitting exposes numerical uncertainty rather than magnifying noise into a claimed shape',()=>{
  const unresolved=[{key:'at',samples:[{amplitude:-.12,relativeChange:-1e-15,error:1e-12},{amplitude:0,relativeChange:0,error:0},{amplitude:.12,relativeChange:1e-15,error:1e-12}]}];
  const {root,chart,nodes}=harness();chart.setContext({curves:unresolved,activeKey:'at',current:{amplitude:.12,relativeChange:1e-15,error:1e-12,verified:false}});
  assert.equal(root.dataset.shapeResolved,'false');assert.equal(nodes.state.textContent,'Change unresolved');assert.match(nodes.plot.innerHTML,/Shape below numerical resolution/);
  assert.ok(Number(root.dataset.energyExtent)>1e-12);chart.destroy();
});
test('scale controls retain focus nodes and delayed zoom cannot revive a cleared or destroyed curve',()=>{
  const {root,chart,nodes,timers,flush}=harness();chart.setContext({curves,activeKey:'before'});
  const input=nodes.vertical,handler=input.handlers.input;input.value='2';handler();assert.equal(timers.size,1);
  chart.setContext({curves:[],current:null,activeKey:''});assert.equal(timers.size,0,'Clearing the study cancels pending zoom work immediately.');flush();assert.equal(nodes.state.textContent,'Choose a push');assert.equal(nodes.vertical,input);
  input.value='3';handler();chart.destroy();flush();assert.equal(root.innerHTML,'');assert.equal(timers.size,0);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./energy-landscape.js'),'utf8'),context);assert.equal(typeof context.GeodesicEnergyLandscape.create,'function');
});
test('fit buttons supersede queued slider zooms rather than being undone after the debounce',()=>{
  for(const fit of ['selected','comparison']){
    const {chart,nodes,timers,flush}=harness();chart.setContext({curves,activeKey:'before'});
    nodes.vertical.value='2';nodes.horizontal.value='1';nodes.horizontal.handlers.input();
    assert.equal(timers.size,1);
    nodes[fit].handlers.click();assert.equal(timers.size,0,'The old slider request is cancelled by the fit action.');
    flush();const state=chart.snapshot();
    assert.equal(state.mode,fit);assert.equal(state.verticalZoom,1);assert.equal(state.horizontalZoom,1);
    chart.destroy();
  }
});

test('hidden radius starts at the left origin while surface pushes retain both signed sides',()=>{
  const at=(a,axis)=>E.coordinates(a,0,.12,.001,500,132,axis);
  assert.equal(at(0,'radius').x,72);assert.equal(at(.06,'radius').x,277);assert.equal(at(.12,'radius').x,482);
  assert.equal(at(-.12,'signed').x,72);assert.equal(at(0,'signed').x,277);assert.equal(at(.12,'signed').x,482);
  assert.equal(at(0,'radius').y,at(0,'signed').y,'Only the horizontal domain changes.');
  assert.throws(()=>at(0,'unknown'),RangeError);
});

test('radius labels, zero guide, and length semantics follow the actual horizontal domain',()=>{
  const radial=curves.map(c=>({...c,samples:c.samples.filter(p=>p.amplitude>=0)}));
  const {root,chart,nodes}=harness();
  chart.setContext({curves:radial,activeKey:'after',axisMode:'radius',current:{amplitude:0,relativeChange:0,error:0,verified:true}});
  assert.equal(root.dataset.axisMode,'radius');assert.match(nodes.heading.textContent,/hidden push size/);
  assert.equal(nodes['axis-label'].textContent,'Hidden push size · 0 means no push');
  assert.equal(nodes['horizontal-label'].textContent,'Radius range');assert.equal(nodes['horizontal-value'].textContent,'0–0.12');
  assert.match(nodes.horizontal.attributes['aria-valuetext'],/radius from zero to 0.12/);
  assert.match(nodes.plot.innerHTML,/Horizontal axis: hidden push size, starting at zero/);
  assert.match(nodes.plot.innerHTML,/below zero means shorter/);
  assert.match(nodes.plot.innerHTML,/M72 20V108/,'The zero guide is at the left edge, not at the old signed center.');
  assert.match(nodes.plot.innerHTML,/>0 · no push<\/text>/);
  assert.doesNotMatch(nodes.plot.innerHTML,/>[−+]0\.12<\/text>/);
  assert.match(nodes.plot.innerHTML,/cx="72" cy="64"/,'No push is drawn at the reachable left origin.');
  chart.setContext({curves,axisMode:'signed',current:{amplitude:-.12,relativeChange:-.00018,error:0,verified:true}});
  assert.equal(root.dataset.axisMode,'signed');assert.match(nodes['axis-label'].textContent,/Signed surface push/);
  assert.equal(nodes['horizontal-value'].textContent,'±0.12');assert.match(nodes.plot.innerHTML,/>−0\.12<\/text>/);
  assert.match(nodes.plot.innerHTML,/>\+0\.12<\/text>/);assert.match(nodes.plot.innerHTML,/M277 20V108/);
  chart.destroy();
});

test('zoom measures only reachable radii and keeps radius and signed sampling caches separate',()=>{
  const seen=[],measured={key:'before',maxAmplitude:.12,samples:[{amplitude:0,relativeChange:0},{amplitude:.06,relativeChange:.06**2},{amplitude:.12,relativeChange:.12**2}],sampleAt(a){seen.push(a);return {relativeChange:a*a,error:1e-14};}};
  const normalized=E.validateCurves([measured])[0],cache=new WeakMap();
  const radial=E.visibleSamples(normalized,.012,cache,'radius');
  assert.equal(radial.length,33);assert.equal(radial[0].amplitude,0);assert.equal(radial.at(-1).amplitude,.012);
  assert.equal(radial[16].amplitude,.006);assert.ok(seen.every(a=>a>=0&&a<=.012));
  const count=seen.length;assert.equal(E.visibleSamples(normalized,.012,cache,'radius'),radial);assert.equal(seen.length,count);
  const signed=E.visibleSamples(normalized,.012,cache,'signed');
  assert.equal(signed[0].amplitude,-.012);assert.equal(signed[16].amplitude,0);assert.equal(seen.length,count+33);
  const {chart}=harness();assert.throws(()=>chart.setContext({curves:[measured],axisMode:'radius',current:{amplitude:-.01,relativeChange:0}}),RangeError);chart.destroy();
});

test('a layout redraw cannot discard a pending radius zoom selection',()=>{
  const {chart,nodes,root,flush}=harness(),radial=curves.map(c=>({...c,samples:c.samples.filter(p=>p.amplitude>=0)}));
  chart.setContext({curves:radial,axisMode:'radius',activeKey:'after'});
  nodes.horizontal.value='1';nodes.horizontal.handlers.input();
  chart.setContext({activeKey:'after'}); // A redraw restores the last committed input value.
  assert.equal(nodes.horizontal.value,0);
  flush();assert.equal(chart.snapshot().horizontalZoom,10);assert.equal(root.dataset.pushRange,'0.012');
  assert.equal(nodes['horizontal-value'].textContent,'0–0.012');chart.destroy();
});
