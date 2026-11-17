'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('./surface.js'),Collar=require('./compact-collar.js');

// The original normal-Newton calculation, including its scalar reevaluations.
// The production fast path must return the identical points and failures.
function originalProjection(model,p){
  if(!p||p.length!==3||!Array.from(p).every(Number.isFinite))throw TypeError('Projection needs three finite coordinates.');
  const q=[p[0],p[1],p[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  for(let iteration=0;iteration<40;iteration++){
    const value=model.value(q);if(Math.abs(value)<1e-12)return q;
    const g=model.gradient(q),lengthSquared=dot(g,g);if(!(lengthSquared>1e-26)||!Number.isFinite(value))break;
    const scale=value/lengthSquared;let damping=1,candidate,accepted=false;
    for(let trial=0;trial<14;trial++){
      candidate=[q[0]-damping*scale*g[0],q[1]-damping*scale*g[1],q[2]-damping*scale*g[2]];
      if(Math.abs(model.value(candidate))<Math.abs(value)){accepted=true;break;}damping*=.5;
    }
    if(!accepted)break;q[0]=candidate[0];q[1]=candidate[1];q[2]=candidate[2];
  }
  if(Math.abs(model.value(q))<1e-9)return q;
  throw RangeError('Normal-Newton projection did not converge; start near the regular surface.');
}

test('the first-order collar pullback exactly equals the full Cartesian jet gradient',()=>{
  for(const x of [.94,.955,1.02,1.5,1.89,2,2.11,2.5,3.04,3.06])for(let j=0;j<17;j++)for(const r of [0,.1,.45,.8]){
    const theta=j*.43,p=[x,r*Math.cos(theta),r*Math.sin(theta)],gradient=Collar.gradient(p),full=Collar.jet(p).gradient;
    for(let k=0;k<3;k++)assert.ok(Object.is(gradient[k],full[k]),'First-order components must retain even signed-zero identity.');
  }
});

test('projection skips unused Hessians and repeated scalar work without changing normal-Newton results',()=>{
  for(const id of ['torus','double','triple']){
    const model=S.getModel(id),value=model.value,jet=model.jet;let values=0;
    model.value=p=>{values++;return value(p);};
    try{
      for(let i=0;i<80;i++){
        const body=id==='torus'?0:i%model.count,p=model.point(i*.139,i*.17,body),raw=p.map((v,k)=>v+.07*Math.sin(i*.23+k));
        values=0;const expected=originalProjection(model,raw),originalValues=values;values=0;
        model.jet=()=>{throw Error('Projection does not need a Hessian.');};
        let actual;try{actual=model.project(raw);}finally{model.jet=jet;}
        assert.deepEqual(actual,expected);assert.ok(values<originalValues,'Accepted scalar values should not be recomputed on the next iteration.');
        assert.notEqual(actual,raw,'The retraction must keep cloning its input.');
      }
    }finally{model.value=value;model.jet=jet;}
  }
});

test('projection retains its invalid-input and nonconvergence behavior at singular or remote points',()=>{
  for(const id of ['torus','double','triple']){
    const model=S.getModel(id);
    for(const p of [null,[0,0],[NaN,0,0],[Infinity,0,0],[0,0,0],[2,0,0],[1e300,0,0]]){
      let before,after,beforeError,afterError;
      try{before=originalProjection(model,p);}catch(e){beforeError={name:e.name,message:e.message};}
      try{after=model.project(p);}catch(e){afterError={name:e.name,message:e.message};}
      assert.deepEqual(afterError,beforeError);if(!beforeError)assert.deepEqual(after,before);
    }
  }
});
