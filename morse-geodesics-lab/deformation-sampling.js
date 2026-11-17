/* Adaptive drawing vertices for finite deformations. Nothing in this module
 * measures length or modifies a Hessian mode: every new vertex re-evaluates
 * the prepared mathematical curve, including the surface retraction. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicDeformationSampling=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const norm=a=>Math.hypot(...a);
  const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  function angle(a,b){
    const x=norm(a),y=norm(b);
    return x>1e-14&&y>1e-14?Math.acos(Math.max(-1,Math.min(1,dot(a,b)/(x*y)))):0;
  }
  function chordDistance(point,a,b){
    const chord=sub(b,a),q=sub(point,a),squared=dot(chord,chord);
    const t=squared>1e-28?Math.max(0,Math.min(1,dot(q,chord)/squared)):0;
    return norm(q.map((x,i)=>x-t*chord[i]));
  }
  function push(heap,item){
    let i=heap.length;heap.push(item);
    while(i){const parent=(i-1)>>1;if(heap[parent].error>=item.error)break;heap[i]=heap[parent];i=parent;}
    heap[i]=item;
  }
  function pop(heap){
    const top=heap[0],last=heap.pop();if(!heap.length)return top;
    let i=0;
    while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&heap[child+1].error>heap[child].error)child++;
      if(heap[child].error<=last.error)break;heap[i]=heap[child];i=child;}
    heap[i]=last;return top;
  }
  function sampleCurve(evaluate,T,options={}){
    if(typeof evaluate!=='function'||!Number.isFinite(T)||T<=0)throw TypeError('A finite drawing curve and positive interval are required.');
    const {sagitta=.00012,maxTurn=.03,maxSpacing=.08,maxPoints=14000,maxDepth=16,mapSample=p=>p.point,seeds=[],mode=1}=options;
    if(![sagitta,maxTurn,maxSpacing].every(x=>Number.isFinite(x)&&x>0)||!Number.isSafeInteger(maxPoints)||maxPoints<3||
      !Number.isSafeInteger(maxDepth)||maxDepth<1||!Number.isSafeInteger(mode)||mode<1||typeof mapSample!=='function')
      throw RangeError('Finite positive drawing tolerances and limits are required.');
    // At least eight intervals per lobe prevent midpoint tests from missing
    // higher-mode oscillations. Surface/Hermite knots are also retained.
    const count=Math.max(24,Math.ceil(T/maxSpacing),8*mode),positions=[0,T];
    for(let i=1;i<count;i++)positions.push(T*i/count);
    for(const value of seeds)if(Number.isFinite(value)&&value>0&&value<T)positions.push(value);
    positions.sort((a,b)=>a-b);
    const knots=positions.filter((s,i)=>i===0||s-positions[i-1]>1e-12*Math.max(1,T));
    knots[0]=0;knots[knots.length-1]=T;
    if(knots.length>maxPoints)throw RangeError('The drawing point budget must accommodate its seed knots.');
    const cache=new Map();let evaluations=0;
    function at(s){
      if(cache.has(s))return cache.get(s);
      const raw=evaluate(s),sample=Array.isArray(raw)?{s,point:raw}:{...raw,s},point=mapSample(sample);
      if(!finitePoint(sample.point)||!finitePoint(point))throw RangeError('The drawing curve must have finite three-dimensional points.');
      const value={s,sample,point:point.slice()};cache.set(s,value);evaluations++;return value;
    }
    const leaves=[],heap=[];
    function interval(a,b,depth){
      const width=b.s-a.s,probes=[a,at(a.s+width/4),at(a.s+width/2),at(a.s+3*width/4),b];
      const chords=probes.slice(1).map((p,i)=>sub(p.point,probes[i].point));
      const bend=angle(chords[0],chords[1])+angle(chords[1],chords[2])+angle(chords[2],chords[3]);
      const deviation=Math.max(...probes.slice(1,-1).map(p=>chordDistance(p.point,a.point,b.point)));
      const leaf={a,b,mid:probes[2],depth,active:true,turn:bend,sagitta:deviation,
        error:Math.max(bend/maxTurn,deviation/sagitta,width/maxSpacing)};
      leaves.push(leaf);if(leaf.error>1&&depth<maxDepth)push(heap,leaf);return leaf;
    }
    for(let i=1;i<knots.length;i++)interval(at(knots[i-1]),at(knots[i]),0);
    let pointCount=knots.length;
    // Refine the worst interval first: the fixed budget cannot be consumed by
    // an early collar while leaving later sharp bends coarse.
    while(heap.length&&pointCount<maxPoints){
      const leaf=pop(heap);leaf.active=false;pointCount++;
      interval(leaf.a,leaf.mid,leaf.depth+1);interval(leaf.mid,leaf.b,leaf.depth+1);
    }
    const final=leaves.filter(leaf=>leaf.active).sort((a,b)=>a.a.s-b.a.s),vertices=[final[0].a,...final.map(leaf=>leaf.b)];
    return {points:vertices.map(v=>v.sample),displayPoints:vertices.map(v=>v.point),diagnostics:{evaluations,
      limited:final.some(leaf=>leaf.error>1+1e-10),maxSagitta:Math.max(...final.map(leaf=>leaf.sagitta)),
      maxTurn:Math.max(...final.map(leaf=>leaf.turn)),maxSpacing:Math.max(...final.map(leaf=>leaf.b.s-leaf.a.s)),pointCount:vertices.length}};
  }
  function sample(study,model,options={}){
    if(!study?.profile||typeof study.profile.displaySampleAt!=='function'||!Array.isArray(study.amplitude)){
      // Legacy/synthetic studies may carry only drawing samples. Preserve
      // those vertices; interpolating them would invent mathematical data.
      const points=study?.result?.points,mapSample=options.mapSample||(p=>p.point);
      if(!Array.isArray(points)||points.length<2)throw TypeError('A prepared finite deformation and its physical amplitude are required.');
      const displayPoints=points.map(p=>mapSample(p));
      if(displayPoints.some(p=>!finitePoint(p)))throw RangeError('The drawing curve must have finite three-dimensional points.');
      return {points:points.slice(),displayPoints:displayPoints.map(p=>p.slice()),diagnostics:{evaluations:0,limited:true,reason:'No exact display evaluator.',pointCount:points.length}};
    }
    const [A=0,B=0]=study.amplitude;
    return sampleCurve(s=>study.profile.displaySampleAt(A,B,s),study.T,{seeds:(study.data?.samples||[]).map(p=>p.s),mode:study.mode||study.profile.mode||1,...options});
  }
  return Object.freeze({sampleCurve,sample});
});
