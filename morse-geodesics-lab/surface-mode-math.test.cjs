'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./downhill.js'),J=require('./jacobi.js'),S=require('./surface.js'),D=require('./showcase-data.js');

function overlap(a,b,T,N=2000){
  let cross=0,aa=0,bb=0;
  for(let i=0;i<=N;i++){
    const x=a.coefficient(T*i/N),y=b.coefficient(T*i/N),w=i===0||i===N?1:i%2?4:2;
    cross+=w*x*y;aa+=w*x*x;bb+=w*y*y;
  }
  return cross/Math.sqrt(aa*bb);
}
function interiorSignChanges(profile){
  const signs=Array.from({length:1999},(_,i)=>profile.coefficient(profile.T*(i+1)/2000))
    .filter(x=>Math.abs(x)>1e-8).map(Math.sign);
  return signs.slice(1).filter((sign,i)=>sign!==signs[i]).length;
}

test('the first two surface Hessian modes are independent on the same segment as the second eigenvalue crosses zero',()=>{
  const model=S.getModel('double'),curve=D.curves.find(c=>c.id==='showcase-clear-pinch'),data=J.prepare(curve,model);
  const secondFocus=data.events.filter(event=>event.surface)[1].s;
  for(const [offset,status]of [[-.1,'uphill'],[0,'neutral'],[.1,'downhill']]){
    const T=secondFocus+offset;
    const profiles=[1,2].map(mode=>H.prepare({data,model,T,type:'surface',mode}));
    assert.equal(profiles[0].status,'downhill','The first mode stays negative at the second crossing.');
    assert.equal(profiles[1].status,status,'The second mode has its own Hessian sign.');
    assert.ok(profiles[0].eigenvalue< -profiles[0].eigenError);
    assert.ok(profiles[0].eigenvalue<profiles[1].eigenvalue);
    assert.ok(Math.abs(overlap(...profiles,T))<1e-7,'Their actual scalar profiles are L2 orthogonal, despite occupying the same segment.');
    assert.equal(interiorSignChanges(profiles[0]),0);
    assert.equal(interiorSignChanges(profiles[1]),1);
    for(const profile of profiles){
      assert.equal(profile.T,T);assert.equal(profile.coefficient(0),0);assert.equal(profile.coefficient(T),0);
      assert.equal(profile.length(0).length,T,'Both modes have the same original length at zero push.');
      const pushed=profile.sample(.03,0,{count:80});
      assert.deepEqual(pushed.points[0].point,data.sampleAt(0).point);
      assert.deepEqual(pushed.points.at(-1).point,data.sampleAt(T).point);
      if(profile.status!=='neutral'){
        const measured=profile.length(.03);
        assert.equal(measured.verified,true);
        assert.equal(Math.sign(measured.delta),profile.status==='downhill'?-1:1,
          'Resolved finite length agrees with the small-push sign on this demonstration segment.');
      }
    }
  }
});
