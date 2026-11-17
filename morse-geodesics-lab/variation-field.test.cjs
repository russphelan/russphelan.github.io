'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Field=require('./variation-field.js');
const dot=(a,b)=>a.reduce((sum,x,k)=>sum+x*b[k],0),sub=(a,b)=>a.map((x,k)=>x-b[k]);
const norm=p=>Math.hypot(...p),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);
function samples(mode=1,amplitude=.12,count=400){
  return Array.from({length:count+1},(_,i)=>{
    const s=4*i/count,y=i===0||i===count?0:amplitude*Math.sin(mode*Math.PI*i/count);
    return {s,original:[s,0,0],point:[s,y,0]};
  });
}

test('the display field has visible triangle arrows distributed by arclength with exact displacement tips',()=>{
  const data=samples(),snapshot=structuredClone(data),mesh=Field.build({samples:data,T:4});
  assert.equal(mesh.guides.length,20);assert.equal(mesh.positions.length,20*8*6*3*3);
  assert.equal(mesh.positions.length,mesh.normals.length);
  assert.ok(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  for(const guide of mesh.guides){
    const sample=data.find(p=>p.s===guide.s);
    assert.deepEqual(guide.original,sample.original);assert.deepEqual(guide.point,sample.point);
    near(guide.length,norm(sub(sample.point,sample.original)),1e-14);
    assert.ok(Array.from({length:mesh.positions.length/3},(_,i)=>Array.from(mesh.positions.slice(i*3,i*3+3)))
      .some(p=>norm(sub(p,guide.point))<1e-7),'Each arrow reaches its supplied pushed path point.');
  }
  assert.deepEqual(data,snapshot);
});

test('signed surface modes and either independent hidden direction retain both alternating field lobes',()=>{
  for(const axis of [1,2]){
    const data=samples(2).map(p=>({...p,point:axis===1?p.point:[p.point[0],0,p.point[1]]}));
    const mesh=Field.build({samples:data,T:4});
    assert.ok(mesh.guides.some(g=>g.point[axis]>0));assert.ok(mesh.guides.some(g=>g.point[axis]<0));
    for(const guide of mesh.guides){
      assert.notEqual(guide.s,0);assert.notEqual(guide.s,4);
      near(guide.point[axis],.12*Math.sin(2*Math.PI*guide.s/4),1e-14);
    }
  }
  const mode=samples(20,.05,1000),mesh=Field.build({samples:mode,T:4,count:20});
  assert.equal(mesh.guides.length,20,'Nodes at evenly spaced guide stations do not erase the field.');
  assert.ok(mesh.guides.every(g=>g.length>.049));
});

test('all arrow surfaces face outward with finite unit normals, including axial and tiny displacements',()=>{
  for(const direction of [[1,0,0],[0,1,0],[0,0,1],[-1,2,-3]])for(const size of [.12,.001,1e-9]){
    const d=direction.map(x=>x/norm(direction)*size),data=[{s:0,original:[0,0,0],point:[0,0,0]},
      {s:.5,original:[0,0,0],point:d},{s:1,original:[0,0,0],point:[0,0,0]}];
    const mesh=Field.build({samples:data,T:1,count:1});assert.equal(mesh.guides.length,1);
    for(let i=0;i<mesh.normals.length;i+=3)near(norm(Array.from(mesh.normals.slice(i,i+3))),1,1e-6);
    for(let i=0;i<mesh.positions.length;i+=9){
      const a=Array.from(mesh.positions.slice(i,i+3)),b=Array.from(mesh.positions.slice(i+3,i+6)),c=Array.from(mesh.positions.slice(i+6,i+9));
      const n=Array.from(mesh.normals.slice(i,i+3)).map((x,k)=>x+mesh.normals[i+3+k]+mesh.normals[i+6+k]);
      assert.ok(dot(cross(sub(b,a),sub(c,a)),n)>0,'Arrow triangle winding follows outward normals.');
    }
    const projection=[];
    for(let i=0;i<mesh.positions.length;i+=3)projection.push(dot(Array.from(mesh.positions.slice(i,i+3)),direction)/norm(direction));
    assert.ok(Math.min(...projection)>=-1e-7*size);assert.ok(Math.max(...projection)<=size*(1+1e-6),'Arrowheads never overshoot the supplied displacement.');
  }
});

test('a vanishing field yields no manufactured arrows and frozen samples remain unchanged',()=>{
  const zero=Field.build({samples:samples(1,0),T:4});
  assert.deepEqual(zero.guides,[]);assert.equal(zero.positions.length,0);assert.equal(zero.normals.length,0);
  assert.equal(zero.band.positions.length,0);assert.equal(zero.band.normals.length,0);
  const data=samples();for(const p of data){Object.freeze(p.original);Object.freeze(p.point);Object.freeze(p);}Object.freeze(data);
  assert.ok(Field.build({samples:data,T:4}).positions.length>0);
});

test('the ruled band retains every sample on both display curves and pinches at fixed endpoints',()=>{
  const data=samples(1,.12,1600),snapshot=structuredClone(data),mesh=Field.build({samples:data,T:4}),{positions,normals}=mesh.band;
  assert.equal(positions.length,(1600*2-2)*9,'Only the two zero-area endpoint triangles are omitted.');
  assert.equal(normals.length,positions.length);assert.ok(positions.every(Number.isFinite)&&normals.every(Number.isFinite));
  const vertexKeys=new Set();
  for(let i=0;i<positions.length;i+=3)vertexKeys.add(Array.from(positions.slice(i,i+3)).join(','));
  for(const sample of data)for(const p of [sample.original,sample.point])
    assert.ok(vertexKeys.has(Array.from(new Float32Array(p)).join(',')),'Every adaptive knot reaches the band unchanged.');
  for(let i=0;i<positions.length;i+=9){
    const a=Array.from(positions.slice(i,i+3)),b=Array.from(positions.slice(i+3,i+6)),c=Array.from(positions.slice(i+6,i+9));
    const normal=Array.from(normals.slice(i,i+3));near(norm(normal),1,1e-6);
    assert.ok(dot(cross(sub(b,a),sub(c,a)),normal)>0,'Band winding agrees with its face normal.');
  }
  assert.deepEqual(data,snapshot,'Band generation cannot move or alter the supplied paths.');
});

test('the band keeps signed lobes and ignores degenerate collinear or zero-width intervals',()=>{
  const {band}=Field.build({samples:samples(2),T:4});
  assert.ok(band.positions.some((x,i)=>i%3===1&&x>.1));assert.ok(band.positions.some((x,i)=>i%3===1&&x<-.1));
  const data=[{s:0,original:[0,0,0],point:[0,0,0]},{s:.25,original:[.25,0,0],point:[.25,0,0]},
    {s:.5,original:[.5,0,0],point:[.6,0,0]},{s:.75,original:[.75,0,0],point:[.85,0,0]},
    {s:1,original:[1,0,0],point:[1,0,0]}];
  const mesh=Field.build({samples:data,T:1});
  assert.ok(mesh.positions.length>0,'Collinear nonzero displacement still has an arrow.');
  assert.equal(mesh.band.positions.length,0,'Collinear strips have no manufactured area.');
});

test('invalid samples and budgets are rejected and the helper exposes a standalone browser API',()=>{
  for(const input of [{},{samples:[],T:1},{samples:samples(),T:0}])assert.throws(()=>Field.build(input),/sampled variation/);
  for(const config of [{count:0},{count:129},{count:1.5},{sides:2},{sides:33},{stemRadius:0},{headRadius:Infinity}])
    assert.throws(()=>Field.build({samples:samples(),T:4,...config}),/arrow radii/);
  const invalid=samples();invalid[3].s=0;assert.throws(()=>Field.build({samples:invalid,T:4}),/Ordered finite/);
  const bad=samples();bad[4].point=[NaN,0,0];assert.throws(()=>Field.build({samples:bad,T:4}),/Ordered finite/);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./variation-field.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicVariationField.build,'function');
});
