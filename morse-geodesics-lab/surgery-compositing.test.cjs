'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const start=source.indexOf('  function surgeryFrame()'),end=source.indexOf('  function drawFallback(',start);
const renderer=source.slice(start,end),smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function piece(key,z,opacity,color,alpha=opacity){
 const positions=new Float32Array([-.1,-.1,z,.1,-.1,z,0,.1,z]);positions.key=key;
 return {key,opacity,alpha,color:[color,color,color],visible:opacity>0,translation:[0,0,0],mesh:{positions,normals:new Float32Array(9)}};
}
function fixture(pieces,{ringOpacity=0}={}){
 const current={depth:true,mask:true,func:'LESS',color:[true,true,true,true]},draws=[],uploads=[],sections=[],updates=[];
 let value=0,depth=1;
 const gl={DEPTH_TEST:1,LESS:'LESS',EQUAL:'EQUAL',TRIANGLES:2,ARRAY_BUFFER:3,DYNAMIC_DRAW:4,
  enable(){current.depth=true;},disable(){current.depth=false;},depthMask(v){current.mask=v;},depthFunc(v){current.func=v;},colorMask(...v){current.color=v;},
  bindBuffer(){},bufferData(_,data){updates.push(data);}};
 const frame={pieces,ringOpacity,gap:[1,3],joinProgress:0};
 const operation={progress:0,snapshot:{surfaceOpacity:.55},motion:{sample:()=>({phase:'construct',geometry:0})},
  plan:{sectionAt(x,count){sections.push({x,count});return {positions:new Float32Array([x,0,0,x,1,0,x,0,1])};}}};
 const context={gl,state:{surgery:operation,surfaceOpacity:.55},surgeryGPU:new Map(),smooth,mix,
  upload(positions,normals){const item={key:positions.key,positions,normals,a:{},b:{},count:positions.length/3};uploads.push(item);return item;},
  boundaryTube:boundary=>({positions:boundary.positions,normals:new Float32Array(boundary.positions.length)}),neckSection:(plan,x)=>plan.sectionAt(x,64),
  screenPoint:p=>({x:p[0],y:p[1],z:p[2]}),
  renderGPU(item,type,color,mode,offset,alpha,size,translation){
   draws.push({key:item.key,...current,color:[...current.color],alpha,translation});
   if(!item.key)return;
   const z=item.positions[2],passes=!current.depth||(current.func==='EQUAL'?z===depth:z<depth);
   if(!passes)return;
   if(current.color.every(Boolean))value=alpha*color[0]+(1-alpha)*value;
   if(current.mask)depth=z;
  },drawOperationLayersGL(){throw Error('Unexpected phase');}};
 vm.runInNewContext(renderer,context);context.surgeryFrame=()=>frame;
 return {context,frame,operation,draws,uploads,sections,updates,draw(){context.drawSurgeryGL();return {value,depth};}};
}

test('almost invisible incoming pieces cannot erase the retained shell behind them',()=>{
 const opacity=1e-6,v=fixture([piece('retained',.7,1,.4),piece('incoming',.3,opacity,1)]),result=v.draw();
 assert.ok(Math.abs(result.value-(.4*(1-opacity)+opacity))<1e-12);
 assert.deepEqual(v.draws.filter(draw=>draw.color.every(Boolean)).map(draw=>draw.key),['retained','incoming']);
 assert.ok(v.draws.findIndex(draw=>draw.key==='retained'&&draw.color.every(Boolean))<
  v.draws.findIndex(draw=>draw.key==='incoming'&&!draw.color.some(Boolean)),'Paint the stable shell before fading surfaces write depth.');
});

test('fading pieces composite back to front and cannot show through the nearer stable shell',()=>{
 const v=fixture([piece('retained',.7,1,.4),piece('near',.3,.5,1),piece('far',.6,.5,.2),piece('behind',.8,.5,1)]);
 assert.ok(Math.abs(v.draw().value-.65)<1e-12);
 assert.deepEqual(v.draws.filter(draw=>draw.color.every(Boolean)).map(draw=>draw.key),['retained','behind','far','near']);
});

test('promotion of a faded piece into the stable shell is visually continuous',()=>{
 const near=fixture([piece('retained',.7,1,.4),piece('incoming',.3,1-1e-8,1)]).draw().value;
 const complete=fixture([piece('retained',.7,1,.4),piece('incoming',.3,1,1)]).draw().value;
 assert.ok(Math.abs(complete-near)<1e-8);assert.equal(complete,1);
});

test('shell opacity, disc color, and ring visibility meet the ordinary view at both handoffs',()=>{
 const v=fixture([]),base=[.26,.55,.58];
 v.operation.plan.sample=()=>({pieces:[piece('retained',.7,1,.4),piece('removedOld',.6,1,.4)],joinProgress:0});
 // Restore the real surgeryFrame instead of the pixel fixture's descriptor.
 vm.runInNewContext(renderer,v.context);
 for(const [t,expected]of [[0,.55],[.12,1],[.94,1],[1,.55]]){
  v.operation.motion.sample=()=>({geometry:t});const frame=v.context.surgeryFrame();
  assert.ok(Math.abs(frame.pieces[0].alpha-expected)<1e-12);
  if(t===0){assert.deepEqual(Array.from(frame.pieces[1].color),base);assert.equal(frame.ringOpacity,0);}
 }
 v.operation.motion.sample=()=>({geometry:1e-6});const tiny=v.context.surgeryFrame();
 assert.ok(tiny.ringOpacity<1e-8);assert.ok(Math.abs(tiny.pieces[0].alpha-.55)<1e-8);
});

test('boundary rings retain their 64-point tessellation and GPU buffers when gluing begins',()=>{
 const v=fixture([piece('retained',.7,1,.4),piece('incoming',.8,1,.4)],{ringOpacity:.95});v.draw();
 assert.deepEqual(v.sections,[{x:1,count:64},{x:3,count:64}]);
 const first=[v.context.surgeryGPU.get('front-old'),v.context.surgeryGPU.get('front-new')];
 const allocationCount=v.uploads.length;
 v.frame.gap=[1.01,2.99];v.frame.joinProgress=.01;v.draw();
 assert.equal(v.uploads.length,allocationCount);assert.equal(v.context.surgeryGPU.get('front-old'),first[0]);
 assert.equal(v.context.surgeryGPU.get('front-new'),first[1]);assert.equal(v.updates.length,4);
 assert.ok(v.sections.every(section=>section.count===64));
});

test('Canvas collar clipping keeps exact continuous fronts rather than revealing whole triangles',()=>{
 const v=fixture([]),triangle=[[0,0,0],[2,0,0],[1,2,0]],clip=gap=>v.context.surgeryClippedPolygons(triangle,gap);
 const polygons=clip([.75,1.25]);assert.equal(polygons.length,2);
 assert.ok(polygons[0].every(p=>p[0]<=.75));assert.ok(polygons[1].every(p=>p[0]>=1.25));
 const area=polys=>polys.reduce((total,p)=>total+Math.abs(p.reduce((sum,a,i)=>{
  const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2,0);
 assert.equal(area(polygons),1.125);
 assert.ok(area(clip([.751,1.249]))>area(polygons));assert.ok(area(clip([.751,1.249]))-area(polygons)<.01);
 assert.equal(area(clip([1,1])),2);
});
