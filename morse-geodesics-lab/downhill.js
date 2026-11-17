/* Local fixed-endpoint length and energy variations. These are nearby curves, generally
 * not geodesics. Hidden coordinates use the explicit tube metric; the drawing
 * of that tube is never used as a Euclidean energy measurement.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicDownhill=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TUBE_RADIUS=.2,DEFAULT_AMPLITUDE=.12;
  // Two currently inspected modes may share the stage. Keep only their exact
  // drawing baselines; retained numerical profiles must not each accumulate a
  // large display cache after repeated traversal or mode changes.
  const DISPLAY_BASE_LIMIT=32768,BASE_SAMPLE_LIMIT=16384,recentDisplayBases=[],profileModels=new WeakMap();
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const DERIVATIVE_STENCILS=[[-25,48,-36,16,-3],[-3,-10,18,-6,1],[1,-8,0,8,-1],[-1,6,-18,10,3],[3,-16,36,-48,25]];
  const unit=a=>{const n=Math.hypot(...a);if(!(n>1e-15))throw RangeError('Degenerate variation frame.');return a.map(x=>x/n);};
  const even=n=>Math.ceil(n/2)*2;
  // Continuous pad motion can generate arbitrarily many distinct amplitudes.
  // Retain a bounded working set; evicted evaluations recompute unchanged.
  function cacheResult(cache,key,value){
    cache.set(key,value);if(cache.size>512)cache.delete(cache.keys().next().value);
    return value;
  }
  // Synchronous callers and background work execute the same arithmetic. The
  // iterator exposes only checkpoints; partial profiles are never published.
  function drain(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
  function* eigenvalueSteps(diagonal,off,rank){
    let lo=Infinity,hi=-Infinity;
    for(let i=0;i<diagonal.length;i++){const d=diagonal[i];lo=Math.min(lo,d-2*Math.abs(off));hi=Math.max(hi,d+2*Math.abs(off));if((i&63)===63)yield;}
    yield;
    for(let iteration=0;iteration<64;iteration++){
      const lambda=(lo+hi)/2,guard=Number.EPSILON*Math.max(1,Math.abs(lambda),Math.abs(diagonal[0]));
      let pivot=diagonal[0]-lambda;if(Math.abs(pivot)<guard)pivot=-guard;
      let count=pivot<0?1:0;
      // Only the comparison count < rank is needed. Once it is false,
      // subsequent pivots cannot change this same bisection decision.
      for(let i=1;i<diagonal.length&&count<rank;i++){
        pivot=diagonal[i]-lambda-off*off/pivot;
        if(Math.abs(pivot)<guard)pivot=-guard;
        if(pivot<0)count++;
        if((i&63)===63)yield;
      }
      if(count<rank)lo=lambda;else hi=lambda;
      yield;
    }
    return (lo+hi)/2;
  }
  function* solveShiftedSteps(diagonal,off,lambda,rhs){
    const n=diagonal.length,pivots=new Float64Array(n),work=new Float64Array(n),result=new Float64Array(n);
    pivots[0]=diagonal[0]-lambda;work[0]=rhs[0];
    for(let i=1;i<n;i++){
      if(Math.abs(pivots[i-1])<1e-20)pivots[i-1]=pivots[i-1]<0?-1e-20:1e-20;
      const factor=off/pivots[i-1];pivots[i]=diagonal[i]-lambda-factor*off;work[i]=rhs[i]-factor*work[i-1];
      if((i&63)===63)yield;
    }
    yield;
    result[n-1]=work[n-1]/pivots[n-1];
    for(let i=n-2;i>=0;i--){result[i]=(work[i]-off*result[i+1])/pivots[i];if((i&63)===0)yield;}
    return result;
  }
  function* surfaceModeSteps(curvatureAt,T,rank,N,vector=false){
    const h=T/N,b=1/(h*h),diagonal=new Float64Array(N-1);
    for(let i=0;i<diagonal.length;i++){diagonal[i]=2*b-curvatureAt((i+1)*h);if((i&63)===63)yield;}
    yield;
    const lambda=yield* eigenvalueSteps(diagonal,-b,rank);
    if(!vector)return {lambda};
    let u=Float64Array.from(diagonal,(_,i)=>Math.sin(rank*Math.PI*(i+1)/N)+.01*Math.cos(.71*(i+1)));
    const shift=lambda+Math.max(1e-7,Math.abs(lambda)*1e-7);
    for(let k=0;k<9;k++){
      u=yield* solveShiftedSteps(diagonal,-b,shift,u);
      let maximum=0;for(let i=0;i<u.length;i++){maximum=Math.max(maximum,Math.abs(u[i]));if((i&63)===63)yield;}
      if(!Number.isFinite(maximum)||maximum===0)throw Error('Surface eigenmode did not converge.');
      for(let i=0;i<u.length;i++){u[i]/=maximum;if((i&63)===63)yield;}
    }
    // Fix the mode's sign by its initial derivative, not by its largest lobe.
    // The largest lobe can change as T moves and must not reverse the push.
    const sign=u[0]<0?-1:1,values=new Float64Array(N+1),slopes=new Float64Array(N+1);
    for(let i=1;i<N;i++){values[i]=sign*u[i-1];if((i&63)===63)yield;}
    slopes[0]=(4*values[1]-values[2])/(2*h);slopes[N]=(-4*values[N-1]+values[N-2])/(2*h);
    for(let i=1;i<N;i++){
      slopes[i]=i>1&&i<N-1?(-values[i+2]+8*values[i+1]-8*values[i-1]+values[i-2])/(12*h):(values[i+1]-values[i-1])/(2*h);
      if((i&63)===63)yield;
    }
    function f(s){
      if(s<=0||s>=T)return 0;
      const i=Math.min(N-1,Math.floor(s/h)),t=s/h-i,t2=t*t,t3=t2*t;
      return (2*t3-3*t2+1)*values[i]+(t3-2*t2+t)*h*slopes[i]+(-2*t3+3*t2)*values[i+1]+(t3-t2)*h*slopes[i+1];
    }
    return {lambda,f,values,step:h};
  }
  function derivative(points,i,h){
    const N=points.length-1;
    const coefficients=DERIVATIVE_STENCILS[i===0?0:i===1?1:i===N?4:i===N-1?3:2];
    const start=i<2?0:i>N-2?N-4:i-2;
    // Each coordinate retains its original five-term reduction, starting at
    // +0. Interleaving coordinates removes temporary callbacks and arrays.
    let x=0,y=0,z=0;
    for(let j=0;j<5;j++){const c=coefficients[j],p=points[start+j];x+=c*p[0];y+=c*p[1];z+=c*p[2];}
    const denominator=12*h;return [x/denominator,y/denominator,z/denominator];
  }
  function prepare(options){return drain(prepareSteps(options));}
  function* prepareSteps(options){
    const basis=yield* prepareBasisSteps(options);
    return yield* basis.finishSteps();
  }
  function* prepareBasisSteps({data,model,T,type='hidden',mode=1,eventS}={}){
    if(!data||typeof data.sampleAt!=='function'||!Number.isFinite(data.length)||!(data.length>0))throw TypeError('Prepared Jacobi data required.');
    if(!model||typeof model.normal!=='function'||typeof model.project!=='function'||typeof model.curvature!=='function')throw TypeError('A regular surface model is required.');
    if(!Number.isFinite(T)||T<=0||T>data.length+1e-10)throw RangeError('Study endpoint must lie on the selected geodesic.');
    T=Math.min(T,data.length);
    if(type!=='hidden'&&type!=='surface')throw RangeError('Variation type must be hidden or surface.');
    if(!Number.isSafeInteger(mode)||mode<1||mode>128)throw RangeError('Positive mode rank required.');
    const curvature=data.curvature??.36;
    if(!Number.isFinite(curvature))throw RangeError('Finite normal curvature required.');
    const baseline=T/2,energyCache=new Map(),lengthCache=new Map(),surfaceMetricCache=new Map(),baseCache=new Map(),exactBaseSamples=new Map(),baselineMetricCache=new Map(),hiddenWaveCache=new Map(),hiddenMetricCache=new Map();
    const metricIntervals=even(Math.max(512,Math.min(4096,Math.ceil(T/.008))));
    let coarseProjection=null;
    const surfaceRoots=(data.events||[]).filter(e=>e.surface).map(e=>e.s);
    const root=type==='hidden'&&curvature>0?mode*Math.PI/Math.sqrt(curvature):type==='surface'?surfaceRoots[mode-1]:null;
    // A bookmark is used only if it agrees with the actual prepared event.
    if(eventS!==undefined&&(!Number.isFinite(eventS)||root===null||Math.abs(eventS-root)>Math.max(1e-6,data.eventTolerance||0)))throw RangeError('The chosen focus does not match this mode.');
    const tolerance=Math.max(1e-8,data.eventTolerance||0);
    const atRoot=Number.isFinite(root)&&Math.abs(T-root)<=tolerance;
    let eigenvalue,eigenError=0,f,rawEigenvalue,meshIntervals=0;
    if(type==='hidden'){
      eigenvalue=(mode*Math.PI/T)**2-curvature;rawEigenvalue=eigenvalue;
      f=s=>s<=0||s>=T?0:Math.sin(mode*Math.PI*s/T);
    }else{
      const N=even(Math.max(256,Math.min(2048,Math.ceil(T/.018))));meshIntervals=2*N;
      if(mode>=N)throw RangeError('Mode rank exceeds the resolved surface mesh.');
      // Nested meshes often revisit exactly the same floating-point position.
      // Reuse that identical curvature without replacing either mesh's nodes.
      const curvatures=new Map(),curvatureAt=s=>{
        if(curvatures.has(s))return curvatures.get(s);
        const value=model.curvature(data.sampleAt(s).point);curvatures.set(s,value);return value;
      };
      const coarse=yield* surfaceModeSteps(curvatureAt,T,mode,N),fine=yield* surfaceModeSteps(curvatureAt,T,mode,2*N,true);
      curvatures.clear();
      rawEigenvalue=eigenvalue=fine.lambda;f=fine.f;
      eigenError=2*Math.abs(fine.lambda-coarse.lambda)+1e-8;
    }
    const status=atRoot?'neutral':eigenvalue< -eigenError?'downhill':eigenvalue>eigenError?'uphill':'uncertain';
    if(atRoot)eigenvalue=0;
    function base(N){return drain(baseSteps(N));}
    function* baseSteps(N){
      if(baseCache.has(N))return baseCache.get(N);
      const samples=[];
      for(let i=0;i<=N;i++){
        const s=i===N?T:i===0?0:T*i/N;
        let sample=exactBaseSamples.get(s);
        if(!sample){
          const p=data.sampleAt(s),normal=model.normal(p.point),direction=unit(cross(normal,p.tangent));
          sample={s,original:p.point.slice(),normal,direction,tangent:p.tangent.slice(),f:f(s)};
          exactBaseSamples.set(s,sample);
          if(exactBaseSamples.size>BASE_SAMPLE_LIMIT)exactBaseSamples.delete(exactBaseSamples.keys().next().value);
        }
        samples.push(sample);
        if((i&63)===63)yield;
      }
      yield;
      baseCache.set(N,samples);return samples;
    }
    function* projectedPointsSteps(A,N){
      const samples=yield* baseSteps(N),points=[];
      // Paired quadrature evaluates N and 2N. Reuse a coarse retraction only
      // when its three actual Newton inputs match exactly (including -0).
      // The fine baseline, coefficient, derivatives and every check are still
      // evaluated on their original grids. Keep only this one temporary pair.
      const previous=coarseProjection;coarseProjection=null;
      const reusable=previous&&previous.A===A&&2*previous.N===N,inputs=N===metricIntervals?[]:null;
      for(let i=0;i<samples.length;i++){
        const p=samples[i];
        if(i===0||i===N||A===0){points.push(p.original.slice());if(inputs)inputs.push(null);}
        else{
          const offset=A*p.f,input=[p.original[0]+offset*p.direction[0],p.original[1]+offset*p.direction[1],p.original[2]+offset*p.direction[2]],j=i/2,prior=reusable&&i%2===0?previous.inputs[j]:null;
          points.push(prior&&Object.is(input[0],prior[0])&&Object.is(input[1],prior[1])&&Object.is(input[2],prior[2])?previous.points[j].slice():model.project(input));
          if(inputs)inputs.push(input);
        }
        if((i&63)===63)yield;
      }
      if(inputs)coarseProjection={A,N,inputs,points};
      yield;
      return points;
    }
    function* surfaceDeltasSteps(A,N,cache=surfaceMetricCache){
      const key=N+':'+A.toPrecision(15);
      if(cache.has(key))return cache.get(key);
      const samples=yield* baseSteps(N),points=yield* projectedPointsSteps(A,N),h=T/N;
      // The original curve and quadrature mesh do not change with amplitude.
      // Reuse its identical finite-difference velocities and speeds across all
      // verified pushes; the deformed derivatives and arithmetic stay unchanged.
      let baselineMetrics=baselineMetricCache.get(N);
      if(!baselineMetrics){
        const original=samples.map(p=>p.original);
        baselineMetrics=[];
        for(let i=0;i<original.length;i++){
          const velocity=derivative(original,i,h);baselineMetrics.push({velocity,speed:Math.hypot(velocity[0],velocity[1],velocity[2])});
          if((i&63)===63)yield;
        }
        baselineMetricCache.set(N,baselineMetrics);
      }
      let energySum=0,lengthSum=0;
      for(let i=0;i<=N;i++){
        const v=derivative(points,i,h),v0=baselineMetrics[i].velocity;
        // Paired evaluation suppresses the much larger common discretization
        // error in the baseline; this is still the finite curve speed energy.
        const speedSquaredDifference=((0+(v[0]-v0[0])*(v[0]+v0[0]))+(v[1]-v0[1])*(v[1]+v0[1]))+(v[2]-v0[2])*(v[2]+v0[2]);
        const weight=i===0||i===N?1:i%2?4:2;
        energySum+=weight*.5*speedSquaredDifference;
        // |v|-|v0| = (|v|²-|v0|²)/(|v|+|v0|) avoids subtracting
        // nearly equal speeds. Pairing also cancels baseline sampling error.
        lengthSum+=weight*speedSquaredDifference/(Math.hypot(v[0],v[1],v[2])+baselineMetrics[i].speed);
        if((i&63)===63)yield;
      }
      const result={energy:energySum*h/3,length:lengthSum*h/3};
      return cacheResult(cache,key,result);
    }
    function* hiddenMetricsSteps(radius,N){
      // Keep this shared intermediate cache exact. The public energy and
      // length caches retain their existing independent precision policies.
      const key=N+':'+radius.toString();
      if(hiddenMetricCache.has(key))return hiddenMetricCache.get(key);
      const omega=mode*Math.PI/T;
      let waves=hiddenWaveCache.get(N);
      if(!waves){
        waves=[];
        for(let i=0;i<=N;i++){
          // Keep the original Simpson node arithmetic, including its endpoint
          // rounding. These nodes do not depend on the physical push size.
          const s=i*T/N;waves.push({wave:Math.sin(omega*s),cosine:Math.cos(omega*s)});
          if((i&63)===63)yield;
        }
        hiddenWaveCache.set(N,waves);
      }
      let energySum=0,lengthSum=0;
      for(let i=0;i<=N;i++){
        const {wave,cosine}=waves[i],velocity=radius*omega*cosine,r=radius*wave;
        // The two original Simpson sums share the same exact speed. Retain
        // their own original summation and multiplication order, while only
        // evaluating their identical trigonometry once.
        const warping=curvature>0?-(Math.sin(Math.sqrt(curvature)*r)**2):curvature<0?Math.sinh(Math.sqrt(-curvature)*r)**2:0;
        const q=velocity*velocity+warping,speed=Math.sqrt(1+q),weight=i===0||i===N?1:i%2?4:2;
        energySum+=weight*(.5*q);
        // Rationalizing sqrt(1+q)-1 retains small finite length changes.
        lengthSum+=weight*(q/(speed+1));
        if((i&63)===63)yield;
      }
      return cacheResult(hiddenMetricCache,key,{energy:energySum*T/(3*N),length:lengthSum*T/(3*N)});
    }
    function energy(A,B=0){return drain(energySteps(A,B));}
    function* energySteps(A,B=0,caches){
      if(!Number.isFinite(A)||!Number.isFinite(B)||type==='surface'&&B!==0)throw RangeError('Finite valid displacement coefficients required.');
      const radius=Math.hypot(A,B);
      if(radius>=TUBE_RADIUS)throw RangeError('Displacement must remain strictly inside the demonstration neighborhood.');
      if(A===0&&B===0)return {energy:baseline,baseline,delta:0,relativeChange:0,error:0,verified:true};
      const key=type==='hidden'?'r'+radius.toPrecision(15):'a'+A.toPrecision(15),cache=caches?.energy||energyCache;
      if(cache.has(key))return cache.get(key);
      let coarse,fine,error;
      if(type==='hidden'){
        const N=Math.max(256,mode*128);coarse=(yield* hiddenMetricsSteps(radius,N)).energy;fine=(yield* hiddenMetricsSteps(radius,2*N)).energy;
        error=2*Math.abs(fine-coarse)+32*Number.EPSILON*T;
      }else{
        const N=even(Math.max(512,Math.min(4096,Math.ceil(T/.008))));
        coarse=(yield* surfaceDeltasSteps(A,N,caches?.surface)).energy;fine=(yield* surfaceDeltasSteps(A,2*N,caches?.surface)).energy;
        error=2*Math.abs(fine-coarse)+1e-9*Math.max(1,T);
      }
      const result={energy:baseline+fine,baseline,delta:fine,relativeChange:fine/baseline,error,
        verified:Number.isFinite(fine)&&Math.abs(fine)>error};
      return cacheResult(cache,key,result);
    }
    function length(A,B=0){return drain(lengthSteps(A,B));}
    function* lengthSteps(A,B=0,caches){
      if(!Number.isFinite(A)||!Number.isFinite(B)||type==='surface'&&B!==0)throw RangeError('Finite valid displacement coefficients required.');
      const radius=Math.hypot(A,B);
      if(radius>=TUBE_RADIUS)throw RangeError('Displacement must remain strictly inside the demonstration neighborhood.');
      if(A===0&&B===0)return {length:T,baseline:T,delta:0,relativeChange:0,error:0,verified:true};
      const key=type==='hidden'?'r'+radius.toPrecision(15):'a'+A.toPrecision(15),cache=caches?.length||lengthCache;
      if(cache.has(key))return cache.get(key);
      let coarse,fine,error;
      if(type==='hidden'){
        const N=Math.max(256,mode*128);coarse=(yield* hiddenMetricsSteps(radius,N)).length;fine=(yield* hiddenMetricsSteps(radius,2*N)).length;
        error=2*Math.abs(fine-coarse)+32*Number.EPSILON*T;
      }else{
        const N=even(Math.max(512,Math.min(4096,Math.ceil(T/.008))));
        coarse=(yield* surfaceDeltasSteps(A,N,caches?.surface)).length;fine=(yield* surfaceDeltasSteps(A,2*N,caches?.surface)).length;
        error=2*Math.abs(fine-coarse)+1e-9*Math.max(1,T);
      }
      const result={length:T+fine,baseline:T,delta:fine,relativeChange:fine/T,error,
        verified:Number.isFinite(fine)&&Math.abs(fine)>error};
      return cacheResult(cache,key,result);
    }
    function* verifyAmplitudeSteps(A,B=0,caches){
      const e=yield* energySteps(A,B,caches),l=yield* lengthSteps(A,B,caches);
      if(![e.energy,e.delta,e.error,l.length,l.delta,l.error].every(Number.isFinite)||e.error>2e-6*Math.max(1,baseline)||l.error>2e-6*Math.max(1,T))return false;
      if(type==='surface'){
        const samples=yield* baseSteps(360),points=yield* projectedPointsSteps(A,360);
        for(let i=0;i<points.length;i++){
          const p=points[i],expected=Math.abs(A*samples[i].f);
          if(!p.every(Number.isFinite)||Math.hypot(...p.map((v,k)=>v-samples[i].original[k]))>2*expected+1e-7||
            typeof model.value==='function'&&Math.abs(model.value(p))>1e-7)return false;
          if((i&63)===63)yield;
        }
      }
      return true;
    }
    let completedProfile=null;
    function* finishSteps(){
      if(completedProfile)return completedProfile;
      let maxAmplitude=0,candidate=DEFAULT_AMPLITUDE;
      // The permitted physical range is independent of the Hessian's sign.
      // These are the original sampled checks, not interval certificates.
      for(let attempt=0;attempt<8;attempt++,candidate*=.5){
        let valid=true;
        for(const sign of type==='surface'?[-1,1]:[1]){
          for(let step=1;step<=12;step++){
            const A=sign*candidate*step/12;
            try{valid=yield* verifyAmplitudeSteps(A);}catch(_){valid=false;}
            if(!valid)break;
            yield;
          }
          if(!valid)break;
        }
        if(valid){maxAmplitude=candidate;break;}
      }
      completedProfile=completedProfile||makeProfile(maxAmplitude);
      return completedProfile;
    }
    function* verifyCurrentSteps(A,{referenceAmplitude=DEFAULT_AMPLITUDE,B=0}={}){
      const radius=Math.hypot(A,B);
      if(!Number.isFinite(A)||!Number.isFinite(B)||type==='surface'&&B!==0||!Number.isFinite(referenceAmplitude)||referenceAmplitude<0||referenceAmplitude>DEFAULT_AMPLITUDE||radius>referenceAmplitude||radius>=TUBE_RADIUS)
        throw RangeError('A finite current push inside its display reference is required.');
      // Rounded public cache keys preserve the historical full-range scan.
      // A current push must not seed those caches with a nearby floating-point
      // coefficient before that original scan reaches its own sampled value.
      const currentCaches={energy:new Map(),length:new Map(),surface:new Map()};
      if(!(yield* verifyAmplitudeSteps(A,B,currentCaches)))throw RangeError('The current finite push did not meet the geometry and convergence checks.');
      const requireCurrent=(a,b)=>{
        // The two hidden coordinates have an exactly radial tube metric.
        // Rotating a verified radius changes only the direction of the push;
        // it has the identical finite length and energy already checked here.
        const verified=type==='hidden'?Number.isFinite(a)&&Number.isFinite(b)&&Math.hypot(a,b)===radius:a===A&&b===0;
        if(!verified)throw RangeError('This profile verifies only its current physical push.');
      };
      return makeProfile(0,{
        rangePending:true,currentVerified:true,currentAmplitude:A,currentSecondAmplitude:B,currentRadius:radius,displayReferenceAmplitude:referenceAmplitude,
        energy(a=0,b=0){requireCurrent(a,b);return drain(energySteps(a,b,currentCaches));},
        length(a=0,b=0){requireCurrent(a,b);return drain(lengthSteps(a,b,currentCaches));},
        sample(a=0,b=0,settings){requireCurrent(a,b);return sample(a,b,settings,currentCaches);},
        displaySampleAt(a=0,b=0,s=0){
          // Exact zero-push samples establish the drawing's baseline/frame.
          // They make no claim about another finite push's permitted range.
          if(a!==0||b!==0)requireCurrent(a,b);
          return displaySampleAt(a,b,s);
        }
      });
    }
    // Drawing-only point evaluation. Adaptive display meshes must evaluate the
    // same finite variation, rather than interpolate or smooth a coarse mesh.
    // This does not enter the Hessian, quadrature, or physical range checks.
    const displayBaseHolder={cache:null};
    function displaySampleAt(A=0,B=0,s=0){
      if(!Number.isFinite(A)||!Number.isFinite(B)||type==='surface'&&B!==0||Math.hypot(A,B)>=TUBE_RADIUS)
        throw RangeError('Finite valid displacement coefficients required.');
      if(!Number.isFinite(s)||s<0||s>T)throw RangeError('Display sample must lie on the study interval.');
      if(!displayBaseHolder.cache){
        displayBaseHolder.cache=new Map();recentDisplayBases.push(displayBaseHolder);
        if(recentDisplayBases.length>2)recentDisplayBases.shift().cache=null;
      }else if(recentDisplayBases.at(-1)!==displayBaseHolder){
        recentDisplayBases.splice(recentDisplayBases.indexOf(displayBaseHolder),1);recentDisplayBases.push(displayBaseHolder);
      }
      const cache=displayBaseHolder.cache;let base=cache.get(s);
      if(!base){
        const prepared=exactBaseSamples.get(s);
        if(prepared)base={original:prepared.original,normal:prepared.normal,direction:prepared.direction,tangent:prepared.tangent,value:prepared.f};
        else{
          const p=data.sampleAt(s),original=p.point.slice(),normal=model.normal(original);
          base={original,normal,direction:unit(cross(normal,p.tangent)),tangent:p.tangent.slice(),value:f(s)};
        }
        cache.set(s,base);if(cache.size>DISPLAY_BASE_LIMIT)cache.delete(cache.keys().next().value);
      }
      const {direction,value}=base,original=base.original.slice();
      const endpoint=s===0||s===T,y=type==='hidden'&&!endpoint?[A*value,B*value]:[0,0];
      const point=type==='surface'&&!endpoint&&A!==0?model.project(original.map((v,k)=>v+A*value*direction[k])):original.slice();
      return {s,point,original,normal:type==='surface'&&!endpoint&&A!==0?model.normal(point):base.normal.slice(),tangent:base.tangent.slice(),f:value,y};
    }
    function sample(A=0,B=0,{count=360}={},caches){
      const measured=drain(energySteps(A,B,caches)),measuredLength=drain(lengthSteps(A,B,caches)),N=even(Math.max(40,Math.min(1200,Math.round(count))));
      const points=base(N).map((p,i)=>{
        const y=type==='hidden'&&i!==0&&i!==N?[A*p.f,B*p.f]:[0,0];
        const surfacePush=type==='surface'&&i!==0&&i!==N&&A!==0;
        const point=surfacePush?model.project(p.original.map((v,k)=>v+A*p.f*p.direction[k])):p.original.slice();
        return {s:p.s,point,original:p.original.slice(),normal:surfacePush?model.normal(point):p.normal.slice(),f:p.f,y};
      });
      return {points,samples:points.map(p=>({s:p.s,y:p.y.slice()})),energy:measured,length:measuredLength};
    }
    function makeProfile(maxAmplitude,extra={}){
      const profile=Object.freeze({type,T,mode,eigenvalue,rawEigenvalue,eigenError,status,maxAmplitude,tubeRadius:TUBE_RADIUS,
        baseline,lengthBaseline:T,root,meshIntervals,energy,length,sample,displaySampleAt,coefficient:f,...extra});
      profileModels.set(profile,model);return profile;
    }
    return Object.freeze({type,T,mode,eigenvalue,rawEigenvalue,eigenError,status,tubeRadius:TUBE_RADIUS,
      baseline,lengthBaseline:T,root,meshIntervals,coefficient:f,finishSteps,verifyCurrentSteps});
  }
  return Object.freeze({prepare,prepareSteps,prepareBasisSteps,TUBE_RADIUS,displayProfileModel:profile=>profileModels.get(profile)});
});
