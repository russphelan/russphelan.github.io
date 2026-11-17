'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Scale=require('./jacobi-graph-scale.js');

test('log slider positions set a bounded linear display gain',()=>{
  assert.equal(Scale.gain(-1),.1);
  assert.equal(Scale.gain(0),1);
  assert.equal(Scale.gain(6),1e6);
  assert.equal(Scale.gain(-3),.1);
  assert.equal(Scale.gain(9),1e6);
  assert.ok(Math.abs(Scale.gain(.5)-Math.sqrt(10))<1e-12);
});

test('zoom preserves signed linear field values and every zero',()=>{
  const values=[-12,-.003,0,.003,12];
  for(const gain of [.1,1,1e6]){
    const plotted=values.map(value=>Scale.scaled(value,12,gain));
    assert.equal(plotted[2],0);
    assert.equal(plotted[0],-plotted[4]);
    assert.equal(plotted[1],-plotted[3]);
    assert.ok(Math.abs(plotted[4]/plotted[3]-4000)<1e-10);
    assert.equal(Math.sign(plotted[1]),-1);
    assert.equal(Math.sign(plotted[3]),1);
  }
});

test('display reference is reciprocal to gain and independent for each field',()=>{
  const references=[1e6,2,2],gains=[1e6,10,.1];
  assert.deepEqual(references.map((ref,k)=>Scale.range(ref,gains[k])),[1,.2,20]);
  for(let k=0;k<3;k++)assert.equal(Scale.scaled(Scale.range(references[k],gains[k]),references[k],gains[k]),1);
  assert.deepEqual(references,[1e6,2,2]);
  assert.deepEqual(gains,[1e6,10,.1]);
});

test('invalid graph values are rejected rather than producing a broken plot',()=>{
  for(const invalid of [NaN,Infinity,-Infinity]){
    assert.throws(()=>Scale.gain(invalid),RangeError);
    assert.throws(()=>Scale.scaled(invalid,1),RangeError);
  }
  for(const invalid of [0,-1,NaN,Infinity]){
    assert.throws(()=>Scale.range(invalid),RangeError);
    assert.throws(()=>Scale.scaled(1,invalid),RangeError);
    assert.throws(()=>Scale.range(1,invalid),RangeError);
    assert.throws(()=>Scale.scaled(1,1,invalid),RangeError);
  }
});

// Execute the actual graph renderer against a canvas context that records its
// clipping state. Large linear peaks must remain confined to their own track,
// while field labels remain outside the plot clip and readable at every gain.
test('magnified curves and cursor dots are clipped to three separate graph rows',()=>{
  const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
  const renderer=source.slice(source.indexOf('  function drawJacobi('),source.indexOf('  function updateDetails('));
  const clips=[],dots=[],labels=[],stack=[];
  let clip=null,rect=null;
  const c={setTransform(){},clearRect(){},beginPath(){},fillRect(){},moveTo(){},lineTo(){},stroke(){},fill(){},setLineDash(){},
    save(){stack.push(clip);},restore(){clip=stack.pop();},
    rect(...bounds){rect=bounds;},clip(){clip=rect;clips.push(clip);},
    fillText(text){labels.push({text,clip});},arc(x,y,radius){if(radius===4)dots.push({x,y,clip});}};
  const node={width:540,height:240,getContext:()=>c,getBoundingClientRect:()=>({width:540,height:240}),setAttribute(){}};
  const data={length:10,curvature:1,maxSurfaceAmplitude:100,maxHiddenAmplitude:1,
    samples:[{s:0,j:0},{s:5,j:100},{s:10,j:-100}],sampleAt:()=>({j:40,hidden:1}),events:[],interiorEvents:[],index:0};
  vm.runInNewContext(renderer+'\ndrawJacobi({});',{
    $:()=>node,window:{GeodesicJacobiGraphScale:Scale},devicePixelRatio:1,
    updateGraphScaleControls(){},focusData:data,focusAt:()=>null,state:{travel:.4},
    graphZoom:[1e6,10,.1],Jacobi:{hiddenValue:s=>Math.sin(s)},TAU:Math.PI*2
  });
  assert.equal(clips.length,3);
  assert.equal(dots.length,3);
  for(let k=0;k<3;k++){
    assert.equal(dots[k].clip,clips[k]);
    assert.ok(clips[k][2]>0&&clips[k][3]>0);
    if(k)assert.ok(clips[k-1][1]+clips[k-1][3]<clips[k][1]);
  }
  assert.ok(dots[0].y<clips[0][1],'The exaggerated surface value tests actual clipping, not only in-range data.');
  assert.ok(dots[1].y<clips[1][1],'The hidden field has its own independent zoom and clip.');
  assert.ok(dots[2].y>=clips[2][1]&&dots[2].y<=clips[2][1]+clips[2][3]);
  assert.ok(labels.filter(item=>['Jₛ','J₁','J₂','Surface','Hidden 1','Hidden 2'].includes(item.text)).every(item=>item.clip===null));
  assert.equal(stack.length,0);
});
