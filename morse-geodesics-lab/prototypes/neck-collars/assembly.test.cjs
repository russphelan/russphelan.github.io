'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const G=require('./geometry.js'),A=require('./assembly.js'),H=require('./height-profile.js');
const near=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);
const nearVector=(a,b,tolerance)=>a.forEach((x,k)=>near(x,b[k],tolerance));

test('construction starts on the two real round-torus attachment ovals',()=>{
  for(const profile of G.profiles){
    const frame=A.sample(profile,0);
    assert.equal(frame.progress,0);assert.equal(frame.joined,false);assert.equal(frame.rings.length,2);
    assert.equal(frame.left,profile.seamX);assert.equal(frame.right,profile.spacing-profile.seamX);
    for(const ring of frame.rings){
      assert.equal(ring.closed,true);assert.equal(ring.points.length,96);assert.equal(ring.normals.length,96);
      ring.points.forEach((point,i)=>{
        const theta=2*Math.PI*i/96,torus=G.torusRadius(profile.seamX,theta);
        nearVector(point,[ring.x,torus.r*Math.cos(theta),torus.r*Math.sin(theta)],1e-11);
      });
    }
  }
});

test('every moving ring is an exact section of the final surface with symmetric fronts',()=>{
  for(const profile of G.profiles){
    let previous=profile.seamX;
    for(const progress of [.01,.2,.5,.83,.99]){
      const frame=A.sample(profile,progress,{count:128});
      assert.ok(frame.left>previous);assert.ok(frame.left<frame.right);near(frame.left+frame.right,profile.spacing);
      assert.equal(frame.joined,false);assert.equal(frame.rings.length,2);previous=frame.left;
      frame.rings.forEach(ring=>ring.points.forEach((point,i)=>{
        const exact=G.evaluate(profile,ring.x,2*Math.PI*i/128);
        assert.deepEqual(point,exact.point);assert.deepEqual(ring.normals[i],exact.normal);
        near(Math.hypot(...ring.normals[i]),1,1e-12);
        if(profile.kind==='height')assert.ok(Math.abs(point[2])<=H.heightCertificate(profile).bound+2e-12);
      }));
      frame.rings[0].points.forEach((point,i)=>{
        nearVector(frame.rings[1].points[i],[profile.spacing-point[0],point[1],point[2]],1e-10);
        const normal=frame.rings[0].normals[i];
        nearVector(frame.rings[1].normals[i],[-normal[0],normal[1],normal[2]],1e-9);
      });
    }
  }
});

test('the fronts meet continuously in one section without a duplicate joined ring',()=>{
  for(const profile of G.profiles){
    const before=A.sample(profile,1-1e-7),joined=A.sample(profile,1);
    assert.equal(joined.joined,true);assert.equal(joined.left,profile.spacing/2);assert.equal(joined.right,joined.left);
    assert.equal(joined.rings.length,1);
    for(const ring of before.rings)ring.points.forEach((point,i)=>{
      nearVector(point,joined.rings[0].points[i],1e-6);
      nearVector(ring.normals[i],joined.rings[0].normals[i],1e-6);
    });
    if(profile.kind==='height')joined.rings[0].points.forEach((point,i)=>{
      const theta=2*Math.PI*i/96,target=H.targetRadius(profile,theta);
      nearVector(point,[profile.spacing/2,target.r*Math.cos(theta),target.r*Math.sin(theta)],1e-12);
      assert.ok(Math.abs(point[2])<=profile.heightBound+2e-12);
    });
  }
});

test('scrubbing is deterministic and does not mutate profiles or retained ring packets',()=>{
  const profile=H.createProfile({id:'assembly-height-safe',seamX:1.2,collarEnd:2.4,spacing:5,halfWidth:.8,sourceAdvance:.35});
  const half=A.sample(profile,.5),snapshot=structuredClone(half),settings=JSON.stringify(profile);
  for(const progress of [1,0,.9,.1])A.sample(profile,progress);
  assert.deepEqual(A.sample(profile,.5),snapshot);assert.deepEqual(half,snapshot);assert.equal(JSON.stringify(profile),settings);
  assert.deepEqual(A.sample(G.profiles[0].id,.3),A.sample(G.profiles[0],.3));
});

test('invalid construction inputs fail explicitly and the helper supports classic local scripts',()=>{
  for(const progress of [NaN,Infinity,-.1,1.1])assert.throws(()=>A.sample(G.profiles[0],progress),/progress/);
  for(const count of [2,513,1.5,NaN])assert.throws(()=>A.sample(G.profiles[0],.5,{count}),/section/);
  assert.throws(()=>A.sample(null,.5),/profile/);assert.throws(()=>A.sample('missing',.5),/profile/);
  const context={GeodesicNeckGeometry:G};vm.runInNewContext(fs.readFileSync(require.resolve('./assembly.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicNeckAssembly.sample,'function');
  assert.equal(context.GeodesicNeckAssembly.sample(G.profiles[0],1).rings.length,1);
});
