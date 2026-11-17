'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./downhill.js'),J=require('./jacobi.js'),S=require('./surface.js'),D=require('./showcase-data.js');

function finish(iterator,between=()=>{}){
  let count=0,step;
  while(!(step=iterator.next()).done){assert.equal(step.value,undefined,'Checkpoints never expose an unverified partial profile.');between(++count);}
  return {profile:step.value,count};
}
function snapshot(p){
  const amplitudes=[-.12,-.073,-1e-9,0,1e-9,.073,.12];
  return {metadata:Object.fromEntries(Object.entries(p).filter(([,v])=>typeof v!=='function')),
    coefficient:Array.from({length:97},(_,i)=>p.coefficient(p.T*i/96)),
    measurements:amplitudes.map(a=>({a,energy:p.energy(a),length:p.length(a)})),
    samples:[p.sample(-.073),p.sample(.12)],
    display:Array.from({length:51},(_,i)=>p.displaySampleAt(.073,0,p.T*i/50))};
}

test('surface preparation can pause and resume between bounded geometry batches without changing a single result',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model);
  for(const mode of [1,2]){
    const options={data,model,T:10.671975511965978,type:'surface',mode},direct=H.prepare(options);
    const {profile,count}=finish(H.prepareSteps(options),i=>{
      // Rendering another point can invalidate the model's one-point jet cache
      // between tasks. A resumed calculation must remain exactly equivalent.
      if(i%97===0)model.normal(data.samples[i%data.samples.length].point);
    });
    assert.ok(count>100,'The expensive calculation must actually contain many resumable checkpoints.');
    assert.deepEqual(snapshot(profile),snapshot(direct));
    assert.equal(Object.isFrozen(profile),true);
  }
});

test('a surface job can stop at any checkpoint without publishing a profile or continuing numerical work',()=>{
  let calls=0;
  const model={normal:()=>[0,0,1],project:p=>{calls++;return p.slice();},curvature:()=>0};
  const data={length:8,events:[],sampleAt:s=>{calls++;return {point:[s,0,0],tangent:[1,0,0]};}};
  for(const stopAt of [1,30,200,600]){
    const job=H.prepareSteps({data,model,T:8,type:'surface',mode:2});let stopped=false;
    for(let i=0;i<stopAt;i++){const step=job.next();assert.equal(step.done,false);if(i===stopAt-1)stopped=true;}
    assert.equal(stopped,true);const before=calls;
    assert.deepEqual(job.return(),{value:undefined,done:true});assert.deepEqual(job.next(),{value:undefined,done:true});
    assert.equal(calls,before,'Cancelling cannot run a final verification or projection batch.');
  }
});

test('cooperative preparation limits calls to expensive geometric evaluators between checkpoints',()=>{
  let rows=0;
  const model={normal:()=>[0,0,1],project:p=>{rows++;return p.slice();},curvature:()=>0};
  const data={length:12,events:[],sampleAt:s=>{rows++;return {point:[s,0,0],tangent:[1,0,0]};}};
  let previous=0,maximum=0;
  const {profile}=finish(H.prepareSteps({data,model,T:12,type:'surface',mode:2}),()=>{
    maximum=Math.max(maximum,rows-previous);assert.ok(rows-previous<=64,'A checkpoint must arrive within 64 geometric rows.');previous=rows;
  });
  assert.ok(maximum>0);assert.equal(profile.maxAmplitude,.12);
});

test('paired surface quadrature reuses only the exactly matching coarse retractions',()=>{
  let projections=0;
  const T=10,model={normal:()=>[0,0,1],project:p=>{projections++;return p.slice();},curvature:()=>0};
  const data={length:T,events:[],sampleAt:s=>({point:[s,0,0],tangent:[1,0,0]})};
  const p=H.prepare({data,model,T,type:'surface',mode:2}),N=Math.ceil(Math.ceil(T/.008)/2)*2;
  assert.equal(p.maxAmplitude,.12);
  assert.equal(projections,24*((2*N-1)+(360-1)),
    'All 24 amplitudes retain the fine grid and safety probes, with one retraction per shared coarse/fine input.');
  const before=projections,measured=p.length(.073);
  assert.equal(projections-before,2*N-1,'A new amplitude independently computes its fine-grid union.');
  assert.equal(p.length(.073),measured);p.energy(.073);
  assert.equal(projections-before,2*N-1,'Length and energy still share their paired numerical evaluation.');
  const zero=p.sample(0);assert.ok(zero.points.every(row=>Object.is(row.point[2],0)));
});

test('the preparation iterator preserves validation failures and hidden numerical results',()=>{
  assert.throws(()=>H.prepareSteps({}).next(),/Prepared Jacobi data/);
  assert.throws(()=>H.prepare({}),/Prepared Jacobi data/);
  const model=S.getModel('torus'),radius=1.8;
  const data={length:8,curvature:.36,events:[],sampleAt:s=>({point:[radius*Math.cos(s/radius),radius*Math.sin(s/radius),0],tangent:[-Math.sin(s/radius),Math.cos(s/radius),0]})};
  for(const mode of [1,2]){
    const options={data,model,T:7,type:'hidden',mode};assert.deepEqual(snapshot(finish(H.prepareSteps(options)).profile),snapshot(H.prepare(options)));
  }
});
