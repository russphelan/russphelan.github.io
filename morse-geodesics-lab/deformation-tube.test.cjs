'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Tube=require('./deformation-tube.js');
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),near=(a,b,tolerance=2e-12)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);
const unit=a=>a.map(x=>x/norm(a));
function checkFrames(mesh){
  for(let i=0;i<mesh.centers.length;i++){
    const t=mesh.tangents[i],{normal:n,binormal:b}=mesh.frames[i];
    assert.ok([...t,...n,...b].every(Number.isFinite));
    near(norm(t),1);near(norm(n),1);near(norm(b),1);
    near(dot(t,n),0);near(dot(t,b),0);near(dot(n,b),0);
    cross(t,n).forEach((x,k)=>near(x,b[k]));
  }
  assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.normals.every(Number.isFinite));
}

test('hidden tube centers never inherit the rapidly rotating surface-normal lift or ring roll',()=>{
  const points=Array.from({length:101},(_,i)=>[i*.01,0,0]);
  const liftNormals=points.map((p,i)=>[0,Math.sin(1.7*i),Math.cos(1.7*i)]);
  const mesh=Tube.build(points,{liftNormals,lift:0});checkFrames(mesh);
  assert.deepEqual(mesh.centers,points,'A hidden drawing centerline stays exact, including pinned endpoints.');
  for(const {normal,binormal}of mesh.frames){assert.deepEqual(normal,[0,0,1]);assert.deepEqual(binormal,[0,-1,0]);}
  const noGuides=Tube.build(points,{initialNormal:[0,0,1]});
  assert.deepEqual(mesh.positions,noGuides.positions,'Later surface normals cannot rotate rings or move centers.');
});

test('surface clearance is applied before frame construction and separately from ring orientation',()=>{
  const points=Array.from({length:61},(_,i)=>{const t=i*.017;return [Math.cos(t),Math.sin(t),.2*t];});
  const liftNormals=points.map((p,i)=>{const t=i*.017;return [Math.cos(t),Math.sin(t),0];});
  const mesh=Tube.build(points,{liftNormals,lift:.007});checkFrames(mesh);
  for(let i=0;i<points.length;i++){
    sub(mesh.centers[i],points[i]).forEach((x,k)=>near(x,.007*liftNormals[i][k]));
    if(i&&i<points.length-1){
      const before=unit(sub(mesh.centers[i],mesh.centers[i-1])),after=unit(sub(mesh.centers[i+1],mesh.centers[i]));
      const expected=unit(before.map((x,k)=>x+after[k]));expected.forEach((x,k)=>near(x,mesh.tangents[i][k]));
    }
  }
});

test('curved tubes transport radial frames by the shortest tangent rotation with no additional roll',()=>{
  const points=Array.from({length:421},(_,i)=>{const t=4*Math.PI*(i/420)**1.3;return [Math.cos(t),Math.sin(t),.15*t];});
  const mesh=Tube.build(points,{initialNormal:[0,0,1]});checkFrames(mesh);
  for(let i=1;i<points.length;i++){
    const a=mesh.tangents[i-1],b=mesh.tangents[i],n=mesh.frames[i-1].normal,v=cross(a,b),c=dot(a,b);
    const first=cross(v,n),second=cross(v,first);
    const transported=n.map((x,k)=>x+first[k]+second[k]/(1+c));
    near(dot(transported,mesh.frames[i].normal),1,4e-12);
  }
  for(let i=0;i<mesh.positions.length;i+=9){
    const a=Array.from(mesh.positions.slice(i,i+3)),b=Array.from(mesh.positions.slice(i+3,i+6)),c=Array.from(mesh.positions.slice(i+6,i+9));
    const mean=Array.from(mesh.normals.slice(i,i+3)).map((x,k)=>x+mesh.normals[i+3+k]+mesh.normals[i+6+k]);
    assert.ok(dot(cross(sub(b,a),sub(c,a)),mean)>0,'Triangle winding agrees with its outward normals.');
  }
});

test('repeated knots and near antipodal tangents have finite deterministic frames',()=>{
  for(const epsilon of [0,1e-10,1e-6]){
    const points=[[0,0,0],[0,0,0],[1,0,0],[1,0,0],[0,epsilon,0],[-1,0,0],[-1,0,0]];
    const first=Tube.build(points,{initialNormal:[1,0,0]}),second=Tube.build(points,{initialNormal:[1,0,0]});
    checkFrames(first);assert.deepEqual(first,second);
  }
  assert.throws(()=>Tube.build([[1,2,3],[1,2,3],[1,2,3]]),/distinct/);
});

test('adaptive vertices are retained without uniform thinning and frozen input is not modified',()=>{
  const points=Array.from({length:1601},(_,i)=>Object.freeze([i/1600,.04*Math.sin(i*.03),.02*Math.cos(i*.03)]));
  const original=JSON.stringify(points);Object.freeze(points);
  const mesh=Tube.build(points);checkFrames(mesh);
  assert.equal(mesh.centers.length,1601);assert.equal(mesh.positions.length,1600*10*6*3);
  assert.equal(mesh.normals.length,mesh.positions.length);assert.equal(JSON.stringify(points),original);
  for(let i=0;i<points.length;i++)assert.deepEqual(mesh.centers[i],points[i]);
});

test('invalid geometry is rejected and the helper supports the classic browser API',()=>{
  const points=[[0,0,0],[1,0,0]];
  for(const invalid of [[],[[0,0,0]],[[0,0,0],[NaN,0,0]]])assert.throws(()=>Tube.build(invalid),/finite curve/);
  for(const options of [{radius:0},{radius:NaN},{lift:Infinity},{sides:2},{sides:3.5},{sides:65}])assert.throws(()=>Tube.build(points,options),/Invalid/);
  assert.throws(()=>Tube.build(points,{lift:.007}),/independent lift normals/);
  assert.throws(()=>Tube.build(points,{liftNormals:[[0,0,1]]}),/match/);
  assert.throws(()=>Tube.build(points,{liftNormals:[[0,0,1],[0,0,0]]}),/match/);
  assert.throws(()=>Tube.build(points,{initialNormal:[0,NaN,0]}),/initial tube/);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./deformation-tube.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicDeformationTube.build,'function');
});
