/* Schematic display of one hidden Hessian direction on the visible surface.
 * Physical samples and metric lengths remain owned by downhill.js. This map
 * supplies drawing vertices only; it is not an ambient isometric embedding. */
(function(root,factory){
  'use strict';const downhill=typeof module==='object'&&module.exports?require('./downhill.js'):root?.GeodesicDownhill,api=factory(downhill);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicHiddenPushDisplay=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(downhill){
  'use strict';
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const finiteVector=(value,size)=>Array.isArray(value)&&value.length===size&&value.every(Number.isFinite);
  const norm=a=>Math.hypot(...a);
  const unit=a=>{const length=norm(a);if(!(length>1e-12))throw RangeError('The hidden display requires a regular curve frame.');return a.map(x=>x/length);};
  const transverse=(a,t)=>a.map((x,i)=>x-dot(a,t)*t[i]);
  const SQRT2=Math.sqrt(2),MAX_FRAME_DRIFT=.45,MAX_FIXED_SLOPE=.55;
  // Match camera.js's canonical default pose only. Never follow live camera
  // motion: a user orbit must not rotate or reshape the displayed variation.
  const CANONICAL_BACK=[Math.cos(.95)*Math.sin(.22),-Math.cos(.95)*Math.cos(.22),Math.sin(.95)];
  const turningCache=new WeakMap();

  function tangent(points,index,normal=null){
    // A repeated sample or symmetric chord need not make a regular nearby
    // path singular. Search progressively farther neighbors before giving up.
    for(let step=1;step<points.length;step++){
      const lo=Math.max(0,index-step),hi=Math.min(points.length-1,index+step);
      for(const candidate of [sub(points[hi],points[lo]),sub(points[hi],points[index]),sub(points[index],points[lo])]){
        const t=normal?transverse(candidate,normal):candidate;
        if(norm(t)>1e-12)return unit(t);
      }
    }
    throw RangeError('The hidden display requires distinct neighboring curve samples.');
  }

  function checkedSamples(study,samples=study?.result?.points){
    if(study?.type!=='hidden'||!Array.isArray(samples)||samples.length<3)
      throw TypeError('A sampled hidden deformation with at least three points is required.');
    if(!Number.isFinite(study.T)||study.T<=0)throw RangeError('A positive finite study interval is required.');
    const last=samples.length-1;
    const original=samples.map((p,i)=>{
      const point=p.original||p.point;
      if(!finiteVector(point,3)||!finiteVector(p.y,2)||!Number.isFinite(p.s)||p.s<0||p.s>study.T+1e-9||i&&p.s<=samples[i-1].s)
        throw TypeError('Ordered finite original points and two hidden coordinates are required.');
      return point.slice();
    });
    const tolerance=1e-9*Math.max(1,study.T);
    if(Math.abs(samples[0].s)>tolerance||Math.abs(samples[last].s-study.T)>tolerance||norm(samples[0].y)>1e-9||norm(samples[last].y)>1e-9)
      throw RangeError('The hidden display must preserve both pinned endpoints.');
    const hasA=samples.some(p=>p.y[0]!==0),hasB=samples.some(p=>p.y[1]!==0);
    if(hasA&&hasB)throw RangeError('Choose one hidden direction at a time.');
    const direction=study.hiddenDirection??(hasB?2:1);
    if(direction!==1&&direction!==2)throw RangeError('Hidden direction must be 1 or 2.');
    if(direction===1&&hasB||direction===2&&hasA)throw RangeError('The selected hidden direction must match the sampled displacement.');
    return {samples,original,direction};
  }

  // Equal requested scales remain exact until near the slope bound. This C1
  // shoulder approaches the bound without a kink as a short segment grows.
  function stableGain(requested,limit){
    const start=.75*limit;
    return requested<=start?requested:start+.25*limit*(-Math.expm1(-(requested-start)/(.25*limit)));
  }
  function createMap(study,model,{magnification=3,projection='surface'}={}){
    const {samples,original,direction}=checkedSamples(study);
    if(!model||typeof model.normal!=='function')throw TypeError('A surface normal model is required.');
    if(!Number.isFinite(magnification)||magnification<=0)throw RangeError('Display magnification must be finite and positive.');
    if(projection!=='surface'&&projection!=='fixed')throw RangeError('Hidden projection must be surface or fixed.');
    // Only the mathematical module can attest which model supplied these
    // stored normals. Synthetic samples and another model still re-evaluate.
    const exactFrame=downhill?.displayProfileModel?.(study.profile)===model;
    const frameCache=new WeakMap();
    function frameSample(p,index){
      if(frameCache.has(p))return frameCache.get(p);
      const point=p.original||p.point,value=exactFrame&&finiteVector(p.normal,3)?p.normal:model.normal(point);
      if(!finiteVector(value,3))throw TypeError('Finite surface normals are required.');
      const n=unit(value),t=finiteVector(p.tangent,3)?unit(transverse(p.tangent,n)):tangent(original,index??samples.indexOf(p),n),b=unit(cross(n,t));
      const frame={n,t,b};frameCache.set(p,frame);return frame;
    }
    if(projection==='fixed'){
      // Choose the schematic axes once at x, independently of T, mode, and
      // push size. They do not turn with each collar or claim to be the true
      // ambient normal directions of the four-dimensional manifold.
      const anchor=typeof study.data?.sampleAt==='function'?study.data.sampleAt(0):
        typeof study.profile?.displaySampleAt==='function'?study.profile.displaySampleAt(0,0,0):samples[0];
      const anchorFrame=frameSample(anchor,0),toward=transverse(CANONICAL_BACK,anchorFrame.t);
      const u=norm(toward)>1e-10?unit(toward):anchorFrame.n,e=unit(cross(anchorFrame.t,u));
      const fixedFrame={n:u,t:anchorFrame.t,b:e},axes=[1,-1].map(sign=>u.map((x,k)=>(x+sign*e[k])/SQRT2));
      // e is perpendicular to the canonical viewing direction; splitting u
      // equally between the two axes makes both at least 1/sqrt(2) visible
      // in that pose, rather than making one hidden direction nearly edge-on.
      const mode=study.mode??study.profile?.mode??1;
      if(!Number.isSafeInteger(mode)||mode<1)throw RangeError('A positive hidden mode rank is required.');
      const sampledPeak=Math.max(...samples.map(p=>norm(p.y))),physicalSize=finiteVector(study.amplitude,2)?norm(study.amplitude):sampledPeak;
      const permitted=Number.isFinite(study.profile?.maxAmplitude)&&study.profile.maxAmplitude>0?study.profile.maxAmplitude:.12;
      // A fixed permitted reference, not the current push, sets the bound.
      // Therefore halving a physical push halves every displayed vector.
      const referenceAmplitude=Math.max(permitted,physicalSize,sampledPeak),frequency=mode*Math.PI/study.T;
      const effectiveMagnification=stableGain(magnification,MAX_FIXED_SLOPE/(referenceAmplitude*frequency));
      const limited=effectiveMagnification<magnification*(1-1e-4);
      function mapSample(p){
        const point=p.original||p.point,y=p.y;
        if(p.s===0||p.s===study.T||y.every(x=>x===0))return point.slice();
        const result=point.map((x,k)=>x+effectiveMagnification*(y[0]*axes[0][k]+y[1]*axes[1][k]));
        if(!result.every(Number.isFinite))throw RangeError('The displayed hidden displacement must remain finite.');
        return result;
      }
      // q' = gamma' + gain*y'*d for a fixed unit d. The slope bound gives
      // |q'| >= 1 - .55 throughout each unit-speed computed geodesic.
      return Object.freeze({mapSample,frameSample:()=>fixedFrame,direction,magnification,effectiveMagnification,projection,
        limited,limitReason:limited?'short-segment':null,referenceAmplitude,
        displacementDerivativeBound:effectiveMagnification*referenceAmplitude*frequency,frameDriftBound:0});
    }
    const frames=samples.map((p,i)=>frameSample(p,i));
    function analyticTurning(p,frame){
      // Along a surface geodesic t' is normal, hence (n × t)' = n' × t.
      // This derivative measures the display frame only, never an eigenmode.
      if(typeof model.jet!=='function')return null;
      const jet=model.jet(p.original||p.point),gradient=jet.gradient,hessian=jet.hessian;
      if(!gradient||gradient.length!==3||!hessian||hessian.length!==9||!(norm(gradient)>1e-12))return null;
      const ht=[0,1,2].map(row=>frame.t.reduce((sum,x,k)=>sum+hessian[row*3+k]*x,0));
      const nd=transverse(ht,frame.n).map(x=>x/norm(gradient)),bd=cross(nd,frame.t);
      return Math.max(norm(nd.map((x,k)=>(x+bd[k])/SQRT2)),norm(nd.map((x,k)=>(x-bd[k])/SQRT2)));
    }
    let rotation=0;
    const profile=study.profile,amplitude=study.amplitude;
    if(profile&&typeof profile.displaySampleAt==='function'&&finiteVector(amplitude,2)){
      const profileKey=exactFrame?profile.coefficient:profile;
      let entry=turningCache.get(profileKey);
      if(!entry||entry.model!==model||entry.T!==study.T){
        // Fixed, mode-aware seeds make the gain independent of adaptive output
        // resolution. Keep collar knots as well as the dense uniform stations.
        const count=Math.max(40,Math.ceil(study.T/.01),48*(study.mode||1));
        const stations=new Set(Array.from({length:count+1},(_,i)=>i===count?study.T:study.T*(i/count)));
        for(const p of study.data?.samples||[])if(p.s>0&&p.s<study.T)stations.add(p.s);
        const seedSamples=[...stations].sort((a,b)=>a-b).map(s=>profile.displaySampleAt(0,0,s));
        const seedFrames=seedSamples.map(p=>frameSample(p));
        let rate=0;
        for(let i=0;i<seedSamples.length;i++){
          const p=seedSamples[i],analytic=analyticTurning(p,seedFrames[i]);
          const lo=Math.max(0,i-1),hi=Math.min(seedSamples.length-1,i+1),ds=seedSamples[hi].s-seedSamples[lo].s;
          const nd=sub(seedFrames[hi].n,seedFrames[lo].n).map(x=>x/ds),bd=sub(seedFrames[hi].b,seedFrames[lo].b).map(x=>x/ds);
          const turning=analytic??Math.max(norm(nd.map((x,k)=>(x+bd[k])/SQRT2)),norm(nd.map((x,k)=>(x-bd[k])/SQRT2)));
          rate=Math.max(rate,Math.abs(p.f)*turning);
        }
        // A small margin covers the finite spacing of the bounding stations.
        entry={model,T:study.T,rate:rate*1.05};turningCache.set(profileKey,entry);
      }
      rotation=Math.hypot(...amplitude)*entry.rate;
    }else{
      for(let i=0;i<samples.length;i++){
        const lo=Math.max(0,i-1),hi=Math.min(samples.length-1,i+1),ds=samples[hi].s-samples[lo].s;
        const nd=sub(frames[hi].n,frames[lo].n).map(x=>x/ds),bd=sub(frames[hi].b,frames[lo].b).map(x=>x/ds);
        const turning=analyticTurning(samples[i],frames[i])??Math.max(norm(nd.map((x,k)=>(x+bd[k])/SQRT2)),norm(nd.map((x,k)=>(x-bd[k])/SQRT2)));
        rotation=Math.max(rotation,norm(samples[i].y)*turning*1.05);
      }
    }
    // One global soft limit preserves all signed lobes and relative widths.
    // Since d is transverse to the unit-speed geodesic, bounding |gain*y*d'|
    // prevents the rotating schematic axes from cancelling its forward speed.
    // The two axes use the same conservative bound, so switching directions
    // never changes the displayed displacement size or the physical length.
    const limit=rotation>0?MAX_FRAME_DRIFT/rotation:Infinity;
    const effectiveMagnification=magnification<=limit?magnification/(1+(magnification/limit)**8)**.125:limit/(1+(limit/magnification)**8)**.125;
    function mapSample(p){
      const point=p.original||p.point,y=p.y;
      if(p.s===0||p.s===study.T||y.every(x=>x===0))return point.slice();
      const {n,b}=frameSample(p),gain=effectiveMagnification/SQRT2;
      const result=point.map((x,k)=>x+gain*(y[0]*(n[k]+b[k])+y[1]*(n[k]-b[k])));
      if(!result.every(Number.isFinite))throw RangeError('The displayed hidden displacement must remain finite.');
      return result;
    }
    const limited=effectiveMagnification<magnification*(1-1e-4);
    return Object.freeze({mapSample,frameSample,direction,magnification,effectiveMagnification,projection,
      limited,limitReason:limited?'curvature':null,frameDriftBound:effectiveMagnification*rotation});
  }

  function build(study,model,{magnification=3,projection='surface',samples=study?.result?.points,mapping=null}={}){
    const {original,direction}=checkedSamples(study,samples),last=samples.length-1;
    mapping=mapping||createMap(study,model,{magnification,projection});
    const frames=samples.map(p=>mapping.frameSample(p));
    const points=samples.map(p=>mapping.mapSample(p));
    const normals=points.map((point,i)=>{
      const t=tangent(points,i),frame=frames[i],normal=transverse(frame.n,t);
      return unit(norm(normal)>1e-10?normal:transverse(frame.b,t));
    });
    const guides=[];
    // Pick the strongest nonzero sample in each interval. Even modes whose
    // nodes coincide with evenly spaced guide stations retain visible guides.
    // Use arclength intervals: adaptive refinement must not crowd the guides
    // into a narrow neck just because it has more drawing vertices.
    for(let bin=0;bin<8;bin++){
      let selected=-1,largest=1e-12;
      for(let i=1;i<last;i++)if(Math.min(7,Math.floor(8*samples[i].s/study.T))===bin){
        const displacement=norm(sub(points[i],original[i]));
        if(displacement>largest){selected=i;largest=displacement;}
      }
      if(selected>=0)guides.push({original:original[selected].slice(),point:points[selected].slice()});
    }
    return {points,normals,guides,direction,magnification:mapping.magnification,
      effectiveMagnification:mapping.effectiveMagnification,limited:mapping.limited,frameDriftBound:mapping.frameDriftBound,
      projection:mapping.projection,limitReason:mapping.limitReason,referenceAmplitude:mapping.referenceAmplitude,
      displacementDerivativeBound:mapping.displacementDerivativeBound};
  }
  return Object.freeze({build,createMap});
});
