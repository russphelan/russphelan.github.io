'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('./neck-explanation-math.js');
const near=(a,b,tolerance=1e-12)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${i}: ${v} versus ${b[i]}`));};
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);

test('the local circle/normal model lies on S3 and its fixed circle projects to the same unit circle',()=>{
 for(const theta of [0,.2,1.7,Math.PI,6.1])for(const [u,v]of [[0,0],[.1,.2],[-.3,.4],[.5,-.6]]){
  const p=M.point(theta,u,v);assert.ok(Math.abs(dot(p,p)-1)<1e-14);
  assert.deepEqual(p.slice(2),[u,v]);
  if(u===0&&v===0)near(M.project(p),M.circle(theta));
 }
});

test('normal reversal fixes exactly the circle in the model and is an involution without mutating its input',()=>{
 const original=M.point(.7,.17,-.22),before=original.slice(),reflected=M.symmetry(original);
 near(M.symmetry(reflected),original);assert.deepEqual(original,before);
 assert.deepEqual(reflected.slice(0,2),original.slice(0,2));assert.deepEqual(reflected.slice(2),[-.17,.22]);
 assert.notDeepEqual(reflected,original);
 near(M.symmetry(M.point(.7)),M.point(.7));
});

test('the two hidden directions are independent in the projected cross-section, not two signs of one arrow',()=>{
 const epsilon=1e-6;
 for(const theta of [0,.3,Math.PI/2,Math.PI,4.1]){
  const a=M.normalAxes(theta);
  assert.ok(Math.abs(dot(a.tangent,a.hidden1))<1e-14);
  assert.ok(Math.abs(dot(a.tangent,a.hidden2))<1e-14);
  assert.ok(Math.abs(dot(a.hidden1,a.hidden2))<1e-14);
  for(const v of [a.tangent,a.hidden1,a.hidden2])assert.ok(Math.abs(dot(v,v)-1)<1e-14);
  const derivative=(u,v)=>{
   const plus=M.project(M.point(theta,u,v)),minus=M.project(M.point(theta,-u,-v));
   return plus.map((value,i)=>(value-minus[i])/(2*epsilon));
  };
  near(derivative(epsilon,0),a.hidden1,1e-8);
  near(derivative(0,epsilon),a.hidden2,1e-8);
 }
});

test('the symmetry demonstration follows genuine S3 points and a half-turn exchanges paired points',()=>{
 for(const theta of [0,.5,2.7])for(const r of [.05,.22,.4])for(const angle of [0,.3,2.8]){
  const initial=M.pair(theta,r,angle),swapped=M.pair(theta,r,angle+Math.PI);
  near(initial.second,M.symmetry(initial.first));near(swapped.first,initial.second);near(swapped.second,initial.first);
  for(let i=0;i<=20;i++){
   const pair=M.pair(theta,r,angle+Math.PI*i/20);
   for(const p of [pair.first,pair.second]){
    assert.ok(Math.abs(dot(p,p)-1)<1e-14);
    assert.ok(M.project(p).every(Number.isFinite));
   }
  }
 }
});

test('the displayed wire neighborhood uses closed projected curves around the distinguished circle',()=>{
 const circle=M.sampleCircle(64),tube=M.sampleNeighborhood(.2,24,12);
 assert.equal(circle.length,65);assert.deepEqual(circle[0],circle.at(-1));
 assert.equal(tube.circles.length,12);assert.equal(tube.fibers.length,24);assert.equal(tube.radius,.2);
 for(const curve of [...tube.circles,...tube.fibers]){
  assert.deepEqual(curve[0],curve.at(-1));assert.ok(curve.every(p=>p.length===3&&p.every(Number.isFinite)));
 }
 const first=tube.circles[0][0];near(first,M.project(M.point(0,.2,0)));
});

test('the coordinate view rejects invalid domains, off-sphere points and its omitted pole',()=>{
 for(const call of [()=>M.point(NaN),()=>M.point(0,1,0),()=>M.point(0,.8,.8),()=>M.point(0,Infinity,0),
  ()=>M.project([0,0,0,0]),()=>M.project([0,0,0,1]),()=>M.project([0,0,NaN,1]),()=>M.symmetry([1,0]),
  ()=>M.pair(0,-.1),()=>M.pair(0,1),()=>M.pair(0,.1,Infinity),()=>M.sampleCircle(2),()=>M.sampleNeighborhood(.2,513,12)])assert.throws(call);
});

test('the explanation coordinates work in a browser without geometry, storage or a numerical worker',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./neck-explanation-math.js'),'utf8'),context);
 const p=context.GeodesicNeckMath.point(.3,.2,-.1);
 near(Array.from(context.GeodesicNeckMath.project(p)),M.project(M.point(.3,.2,-.1)));
});

test('the material landmarks populate genuine S3 neighborhoods with stable identities and two normal directions',()=>{
 const material=M.sampleMaterial(),again=M.sampleMaterial();assert.deepEqual(material,again);
 assert.equal(material.length,24*(1+2*8));assert.equal(new Set(material.map(p=>p.id)).size,material.length);
 assert.equal(material.filter(p=>p.kind==='surface').length,24);
 assert.equal(material.filter(p=>p.kind==='ambient').length,24*2*8);
 for(const record of material){
  assert.ok(Math.abs(dot(record.point,record.point)-1)<1e-14);near(record.point,M.point(record.theta,record.u,record.v));
  near(record.projected,M.project(record.point));assert.ok(record.projected.every(Number.isFinite));
  if(record.kind==='surface'){assert.equal(record.u,0);assert.equal(record.v,0);near(record.projected,M.circle(record.theta));}
  else assert.ok(record.u*record.u+record.v*record.v>0);
 }
 const normalDisc=material.filter(p=>p.theta===0&&p.kind==='ambient');
 assert.ok(normalDisc.some(p=>Math.abs(p.u)>.3&&Math.abs(p.v)<1e-12));
 assert.ok(normalDisc.some(p=>Math.abs(p.v)>.3&&Math.abs(p.u)<1e-12));
 const counterpart=normalDisc.find(p=>p.id==='ambient-0-2-4');near(counterpart.point,M.symmetry(normalDisc.find(p=>p.id==='ambient-0-2-0').point));
 const maximum=M.sampleMaterial(.4,64,16);assert.equal(maximum.length,64*33);
});

test('scanner coordinates follow real joining fronts and never enter the unbuilt gap',()=>{
 for(const join of [0,.2,.56,.99,1]){
  const old=M.scanState(join),incoming=M.scanState(join,{side:'new'});
  assert.equal(old.oldFront,join*.5);assert.equal(old.newFront,1-join*.5);
  assert.equal(old.station,old.oldFront);assert.equal(incoming.station,incoming.newFront);assert.equal(old.complete,join===1);
  for(let j=0;j<=100;j++){
   const requested=j/100,result=M.scanState(join,{station:requested});
   assert.ok(result.station<=result.oldFront||result.station>=result.newFront);
   if(requested<=result.oldFront||requested>=result.newFront)assert.equal(result.station,requested);
  }
 }
 assert.equal(M.scanState(.4,{station:.5}).station,.2);
 assert.equal(M.scanState(.4,{station:.5,side:'new'}).station,.8);
 assert.equal(M.scanState(.4,{station:.7}).station,.8);
 assert.equal(M.scanState(.4,{station:.3}).station,.2);
 assert.equal(M.scanState(1,{station:.5}).station,.5);
 assert.equal(M.scanState(0,{station:-2}).station,0);assert.equal(M.scanState(0,{station:2}).station,1);
 assert.equal(M.scanState(-2).join,0);assert.equal(M.scanState(2).join,1);
});

test('the longitudinal view joins matching landmark identities with a continuous core and explicit normal projection',()=>{
 for(const theta of [0,.4,2,Math.PI*2]){
  const start=M.materialSlice(theta,0,0,0),finish=M.materialSlice(theta,0,0,1);
  near(start,[-1.5,Math.cos(theta),Math.sin(theta)]);near(finish,[1.5,Math.cos(theta),Math.sin(theta)]);
  near(M.materialSlice(theta,0,0,.5,1.3),[0,Math.cos(theta),Math.sin(theta)]);
  near(M.materialSlice(theta,.2,0,.5),[0,1.2*Math.cos(theta),1.2*Math.sin(theta)]);
  near(M.materialSlice(theta,0,.2,.5,Math.PI/2),[0,1.2*Math.cos(theta),1.2*Math.sin(theta)]);
 }
 near(M.materialSlice(0,.2,.1,.5),M.materialSlice(Math.PI*2,.2,.1,.5));
 // One normal combination is deliberately invisible in the overview. The
 // stereographic scanner is what distinguishes those underlying S³ points.
 near(M.materialSlice(.6,0,.2,.3,0),M.materialSlice(.6,0,0,.3,0));
 assert.notDeepEqual(M.project(M.point(.6,0,.2)),M.project(M.point(.6,0,0)));
 const same=M.sampleMaterial(.38,8,4)[3];
 const left=M.materialSlice(same.theta,same.u,same.v,.5),right=M.materialSlice(same.theta,same.u,same.v,.5);
 near(left,right);
});

test('material and scanner models reject invalid values and excessive sampling',()=>{
 for(const call of [()=>M.scanState(NaN),()=>M.scanState(.5,{side:'both'}),()=>M.scanState(.5,{station:Infinity}),
  ()=>M.sampleMaterial(0),()=>M.sampleMaterial(1),()=>M.sampleMaterial(.3,65,8),()=>M.sampleMaterial(.3,24,17),
  ()=>M.sampleMaterial(.3,2,8),()=>M.sampleMaterial(.3,24,2),()=>M.materialSlice(0,0,0,-.1),
  ()=>M.materialSlice(0,0,0,1.1),()=>M.materialSlice(0,.9,.9,.5),()=>M.materialSlice(0,0,0,.5,NaN),
  ()=>M.materialSlice(0,0,Infinity,.5),()=>M.materialSlice(NaN,0,0,.5)])assert.throws(call);
});

test('joining close-up weights align, meet, and hand off to the scanner on the supplied timeline',()=>{
 const preview=M.joiningView(0,0,{ready:false});assert.equal(preview.mode,'preview');assert.equal(preview.separation,.92);
 assert.equal(preview.guideOpacity,0);assert.equal(preview.meeting,false);
 const start=M.joiningView(.36,0),aligned=M.joiningView(.60,0);
 assert.equal(start.mode,'join');assert.equal(start.alignment,0);assert.equal(start.misalignment,1);
 assert.equal(aligned.alignment,1);assert.equal(aligned.misalignment,0);assert.equal(aligned.separation,start.separation);
 assert.equal(start.scannerBlend,0);assert.equal(aligned.scannerBlend,0);
 const midway=M.joiningView(.77,.5);assert.equal(midway.separation,.46);assert.equal(midway.meeting,false);
 const meeting=M.joiningView(.94,1);assert.equal(meeting.mode,'handoff');assert.equal(meeting.separation,0);
 assert.equal(meeting.meeting,true);assert.equal(meeting.rightOpacity,0);assert.equal(meeting.guideProgress,0);
 assert.equal(meeting.guideOpacity,1);assert.equal(meeting.scannerBlend,0);
 const handoff=M.joiningView(.97,1);assert.equal(handoff.mode,'handoff');assert.ok(handoff.guideProgress>0);
 assert.ok(handoff.scannerBlend>0&&handoff.scannerBlend<1);assert.ok(handoff.guideOpacity>0&&handoff.guideOpacity<1);
 const scan=M.joiningView(1,1);assert.equal(scan.mode,'scanner');assert.equal(scan.scannerBlend,1);
 assert.equal(scan.separation,0);assert.equal(scan.guideProgress,1);assert.equal(scan.guideOpacity,0);
});

test('actual joining gates the handoff, while manual inspection and completed ownership select the scanner',()=>{
 const lateButUnjoined=M.joiningView(1,.7);assert.equal(lateButUnjoined.mode,'join');assert.equal(lateButUnjoined.scannerBlend,0);
 assert.equal(lateButUnjoined.meeting,false);assert.equal(lateButUnjoined.guideProgress,0);assert.ok(lateButUnjoined.separation>0);
 const manual=M.joiningView(.5,0,{following:false});assert.equal(manual.mode,'scanner');assert.equal(manual.scannerBlend,1);
 assert.equal(manual.meeting,false);assert.equal(manual.guideOpacity,0);
 const complete=M.joiningView(.3,.1,{completed:true});assert.equal(complete.mode,'scanner');assert.equal(complete.meeting,true);
 assert.equal(complete.alignment,1);assert.equal(complete.separation,0);assert.equal(complete.scannerBlend,1);
 assert.deepEqual(M.joiningView(-2,-3),M.joiningView(0,0));assert.deepEqual(M.joiningView(2,2),M.joiningView(1,1));
});

test('close-up motion is deterministic, bounded, continuous at phase boundaries, and does not mutate the neighborhood',()=>{
 const material=M.sampleMaterial(.3,8,4),before=JSON.stringify(material),options={following:true,completed:false,ready:true};
 const samples=[];
 for(let i=0;i<=200;i++){
  const g=i/200,j=g<=.6?0:g>=.94?1:(g-.6)/.34,result=M.joiningView(g,j,options);samples.push(result);
  assert.equal(Object.isFrozen(result),true);
  for(const [name,value]of Object.entries(result))if(typeof value==='number')assert.ok(value>=0&&value<=1,name+' remains a bounded display weight');
 }
 for(let i=200;i>=0;i--){const g=i/200,j=g<=.6?0:g>=.94?1:(g-.6)/.34;assert.deepEqual(M.joiningView(g,j,options),samples[i]);}
 assert.equal(JSON.stringify(material),before);assert.deepEqual(options,{following:true,completed:false,ready:true});
 for(const edge of [.36,.60,.94,1]){
  const epsilon=1e-8,joinAt=g=>g<=.6?0:g>=.94?1:(g-.6)/.34;
  const left=M.joiningView(edge-epsilon,joinAt(edge-epsilon)),right=M.joiningView(edge+epsilon,joinAt(edge+epsilon));
  for(const key of ['alignment','misalignment','separation','scannerBlend','rightOpacity','guideOpacity'])assert.ok(Math.abs(left[key]-right[key])<1e-5,key+' changes continuously at '+edge);
 }
});

test('joining timeline rejects non-finite positions and invalid option flags',()=>{
 for(const call of [()=>M.joiningView(NaN,0),()=>M.joiningView(0,Infinity),()=>M.joiningView(-Infinity,0),
  ()=>M.joiningView(0,0,{following:'yes'}),()=>M.joiningView(0,0,{completed:1}),()=>M.joiningView(0,0,{ready:null})])assert.throws(call);
});

test('matching sections sample equal-status normal discs around the whole circle with genuine interior S3 points',()=>{
 const sections=M.matchingSections(),ids=new Set();
 assert.equal(sections.length,8);assert.deepEqual(sections,M.matchingSections());
 const corePositions=sections.map(section=>section.core);
 assert.ok(corePositions.some(p=>p[0]>.9)&&corePositions.some(p=>p[0]<-.9));
 assert.ok(corePositions.some(p=>p[1]>.9)&&corePositions.some(p=>p[1]<-.9));
 sections.forEach((section,i)=>{
  near([section.theta],[2*Math.PI*i/8]);assert.equal(section.index,i);assert.equal(section.id,'section-'+i);
  near(section.core,M.circle(section.theta));near(section.corePoint,M.point(section.theta));
  assert.equal(section.landmarks.length,17);assert.equal(section.spokes.length,8);
  assert.deepEqual(section.disc[0],section.disc.at(-1));assert.equal(section.disc.length,33);
  assert.equal(section.landmarks.filter(p=>p.kind==='surface').length,1);
  assert.equal(section.landmarks.filter(p=>p.kind==='interior').length,8);
  assert.equal(section.landmarks.filter(p=>p.kind==='boundary').length,8);
  for(const landmark of section.landmarks){
   assert.equal(ids.has(landmark.id),false);ids.add(landmark.id);
   assert.ok(Math.abs(dot(landmark.point,landmark.point)-1)<1e-14);
   near(landmark.point,M.point(section.theta,landmark.u,landmark.v));near(landmark.projected,M.project(landmark.point));
   assert.ok(landmark.projected.every(Number.isFinite));
   if(landmark.kind==='surface'){near(landmark.projected,section.core);assert.equal(Math.hypot(landmark.u,landmark.v),0);}
   else{
    assert.ok(Math.hypot(landmark.u,landmark.v)>0);
    assert.notDeepEqual(landmark.projected,section.core,'A nonzero normal displacement is not a surface point.');
    near([Math.hypot(landmark.u,landmark.v)],[landmark.kind==='interior'?.19:.38]);
   }
  }
  for(let j=0;j<8;j++){
   near(section.spokes[j][0],section.core);
   near(section.spokes[j][1],section.landmarks.find(p=>p.radialIndex===1&&p.normalIndex===j).projected);
   near(section.spokes[j].at(-1),section.landmarks.find(p=>p.radialIndex===2&&p.normalIndex===j).projected);
  }
 });
 assert.equal(ids.size,8*17);
});

test('distributed matching is immutable and gives identical counterparts without changing normal-disc extent',()=>{
 const left=M.matchingSections(.3,6,3,8),right=M.matchingSections(.3,6,3,8),before=JSON.stringify(left);
 assert.deepEqual(left,right);assert.notEqual(left,right);
 assert.equal(Object.isFrozen(left),true);
 for(const section of left){
  for(const value of [section,section.core,section.corePoint,section.disc,section.spokes,section.landmarks])assert.equal(Object.isFrozen(value),true);
  for(const p of section.landmarks){assert.equal(Object.isFrozen(p),true);assert.equal(Object.isFrozen(p.point),true);assert.equal(Object.isFrozen(p.projected),true);}
  assert.throws(()=>{section.core[0]=100;},TypeError);
  assert.throws(()=>section.landmarks.push({}),TypeError);
 }
 for(let step=0;step<=100;step++)M.joiningView(step/100,step/100);
 assert.equal(JSON.stringify(left),before);
 near([left[0].landmarks.find(p=>p.radialIndex===2&&p.normalIndex===0).u],[.2]);
 near([left[0].landmarks.find(p=>p.radialIndex===3&&p.normalIndex===0).u],[.3]);
});

test('matching-section sampling is bounded and keeps its classic browser API',()=>{
 for(const call of [()=>M.matchingSections(0),()=>M.matchingSections(1),()=>M.matchingSections(NaN),
  ()=>M.matchingSections(.3,2),()=>M.matchingSections(.3,25),()=>M.matchingSections(.3,8,0),
  ()=>M.matchingSections(.3,8,5),()=>M.matchingSections(.3,8,1.5),()=>M.matchingSections(.3,8,2,2),
  ()=>M.matchingSections(.3,8,2,17),()=>M.matchingSections(.3,Infinity)])assert.throws(call);
 const upper=M.matchingSections(.3,24,4,16);
 assert.equal(upper.length,24);assert.equal(upper[0].landmarks.length,65);assert.equal(upper[0].disc.length,65);
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./neck-explanation-math.js'),'utf8'),context);
 assert.equal(typeof context.GeodesicNeckMath.matchingSections,'function');
 near(Array.from(context.GeodesicNeckMath.matchingSections()[3].core),M.matchingSections()[3].core);
});

test('linked landmarks preserve ambient point identities in both view projections and independent normal directions',()=>{
 const theta=.73,size=.38,links=M.linkedLandmarks(theta,size),[a,b]=links.featured;
 assert.deepEqual(links.featured.map(p=>p.label),['A','B']);
 assert.deepEqual(links.featured.map(p=>p.color),['blue','violet']);
 near([a.theta,a.u,a.v],[theta,.19,0]);near([b.theta,b.u,b.v],[theta,0,-.19]);
 assert.notEqual(a.u*b.v-a.v*b.u,0,'A and B use independent hidden coordinates.');
 assert.equal(links.surrounding.length,24);
 assert.equal(new Set(links.surrounding.map(p=>p.theta)).size,6);
 const points=[...links.featured,...links.surrounding],ids=new Set(),positions=new Set();
 for(const p of points){
  assert.equal(ids.has(p.id),false);ids.add(p.id);
  const position=JSON.stringify([p.theta,p.u,p.v]);assert.equal(positions.has(position),false);positions.add(position);
  near(p.point,M.point(p.theta,p.u,p.v));near(p.projected,M.project(p.point));
  assert.ok(Math.abs(dot(p.point,p.point)-1)<1e-14);
  assert.ok(Math.hypot(p.u,p.v)>0);assert.notDeepEqual(p.projected,M.circle(p.theta));
  assert.equal(p.kind,Math.hypot(p.u,p.v)<size?'interior':'boundary');
  // The overview keeps the same u/v and circle angle even though it omits one
  // normal combination; scanner stereographic coordinates retain both.
  const station=.31,upper=M.materialSlice(p.theta,p.u,p.v,station,.55);
  near([upper[0]],[3*(station-.5)]);
  near([upper[1],upper[2]],[(1+p.u*Math.cos(.55)+p.v*Math.sin(.55))*Math.cos(p.theta),
   (1+p.u*Math.cos(.55)+p.v*Math.sin(.55))*Math.sin(p.theta)]);
  for(const value of [p,p.point,p.projected])assert.equal(Object.isFrozen(value),true);
 }
 for(const value of [links,links.featured,links.surrounding])assert.equal(Object.isFrozen(value),true);
 assert.throws(()=>{a.point[0]=99;},TypeError);assert.throws(()=>links.surrounding.push(a),TypeError);
 assert.deepEqual(M.linkedLandmarks(theta,size),links,'Repeated calls regenerate identical matching identities.');
 const turned=M.linkedLandmarks(theta+.5,size);
 assert.deepEqual(turned.surrounding.map(p=>p.id),links.surrounding.map(p=>p.id));
 assert.notDeepEqual(turned.featured[0].projected,a.projected);
});

test('linked expansion follows actual joining with continuous bounded reversible progress and no geometry-only identification',()=>{
 const values=[];
 for(let i=0;i<=100;i++){
  const progress=M.linkProgress(i/100,i/100);values.push(progress);
  assert.equal(Object.isFrozen(progress),true);assert.ok(progress.expansion>=0&&progress.expansion<=1);
  if(i)assert.ok(progress.expansion>=values[i-1].expansion);
  assert.equal(progress.identified,i===100);
 }
 for(let i=100;i>=0;i--)assert.deepEqual(M.linkProgress(i/100,i/100),values[i]);
 assert.deepEqual(M.linkProgress(1,0),{expansion:0,identified:false});
 assert.deepEqual(M.linkProgress(0,1),{expansion:1,identified:true});
 assert.deepEqual(M.linkProgress(0,0,{completed:true}),{expansion:1,identified:true});
 assert.deepEqual(M.linkProgress(1,-5),{expansion:0,identified:false});
 assert.deepEqual(M.linkProgress(1,5),{expansion:1,identified:true});
 for(const boundary of [.2,.75]){
  assert.ok(Math.abs(M.linkProgress(1,boundary-1e-7).expansion-M.linkProgress(1,boundary+1e-7).expansion)<1e-10);
 }
 for(const call of [()=>M.linkedLandmarks(NaN),()=>M.linkedLandmarks(0,0),()=>M.linkedLandmarks(0,1),
  ()=>M.linkProgress(NaN,0),()=>M.linkProgress(0,Infinity),()=>M.linkProgress(0,.5,{completed:1})])assert.throws(call);
 const browser={};vm.runInNewContext(fs.readFileSync(require.resolve('./neck-explanation-math.js'),'utf8'),browser);
 assert.equal(typeof browser.GeodesicNeckMath.linkedLandmarks,'function');
 assert.equal(typeof browser.GeodesicNeckMath.linkProgress,'function');
 near(Array.from(browser.GeodesicNeckMath.linkedLandmarks().featured[0].point),M.linkedLandmarks().featured[0].point);
});
