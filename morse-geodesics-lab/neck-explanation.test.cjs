'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const View=require('./neck-explanation.js'),MathModel=require('./neck-explanation-math.js');
function fixture({linked}={}){
 const nodes={},notifications=[],inspections=[],drawing={};let draws=0,scheduled=0,observed=0,disconnected=0;
 function element(){return {textContent:'',value:'',hidden:false,checked:false,disabled:false,dataset:{},handlers:{},attributes:{},
  classList:{add(){}},addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];},
  setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},getBoundingClientRect(){return {width:340,height:170};}};}
 function painter(key){
  const commands=drawing[key]=[];let path=[],dash=[];
  return {setTransform(){},clearRect(){draws++;commands.length=0;},fillRect(){},beginPath(){path=[];},
   moveTo(...v){path.push(['move',...v]);},lineTo(...v){path.push(['line',...v]);},arc(...v){path.push(['arc',...v]);},
   fill(){commands.push(['fill',this.fillStyle,path.slice(),this.globalAlpha??1]);},stroke(){commands.push(['stroke',this.strokeStyle,this.lineWidth,path.slice(),dash.slice(),this.globalAlpha??1]);},
   setLineDash(value){dash=value;},fillText(...v){commands.push(['text',this.fillStyle,...v]);}};
 }
 const win={devicePixelRatio:1,requestAnimationFrame(){scheduled++;throw Error('The neck explanation must not start its own clock.');},
  ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){observed++;}disconnect(){disconnected++;}}};
 const doc={...element(),defaultView:win,hidden:false};
 const root={...element(),id:'neck-test',ownerDocument:doc,querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];
  if(!nodes[key]){nodes[key]=element();let c;nodes[key].getContext=()=>c||(c=painter(key));}return nodes[key];}};
 const view=View.create(root,{onChange:s=>notifications.push(s),onInspect:s=>inspections.push(s)});
 if(linked!==undefined&&view.snapshot().linked!==linked){nodes['link-toggle'].handlers.click();notifications.length=0;inspections.length=0;}
 return {view,root,nodes,doc,drawing,notifications,inspections,draws:()=>draws,scheduled:()=>scheduled,observed:()=>observed,disconnected:()=>disconnected,
  set(next){view.setContext({active:true,ready:true,geometry:.72,joinProgress:.5,phase:'construct',paused:true,fromCount:1,constructionId:1,...next});}};
}
const goldStroke=v=>v.drawing.canvas.find(c=>c[0]==='stroke'&&c[1]==='#f4c56c'&&c[2]===2);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} versus ${b}`);

test('both optional canvases stop while closed or hidden and never schedule their own animation clock',()=>{
 const v=fixture({linked:false});assert.equal(v.root.hidden,true);assert.equal(v.draws(),0);
 v.view.setContext({geometry:.4,ready:true});assert.equal(v.draws(),0);
 v.set({});assert.equal(v.root.hidden,false);assert.equal(v.draws(),2);assert.equal(v.scheduled(),0);assert.equal(v.observed(),2);
 const count=v.draws();v.view.setContext({geometry:.72});assert.equal(v.draws(),count,'An unchanged context does not repaint.');
 v.view.setContext({active:false});v.view.render();assert.equal(v.draws(),count);
 v.view.destroy();assert.equal(v.disconnected(),1);
});

test('the scanner follows actual joined fronts rather than inferring them from animation time',()=>{
 const v=fixture({linked:false});v.set({geometry:.72,joinProgress:.1});
 assert.equal(v.view.selection().side,'old');near(v.view.selection().theta,Math.PI/4);near(v.view.selection().station,.05);
 assert.match(v.nodes.message.textContent,/around the loop/);assert.match(v.nodes.surface.textContent,/annulus/);
 v.view.setContext({joinProgress:.8});near(v.view.selection().station,.4);
 v.view.setContext({geometry:.94,joinProgress:.2});near(v.view.selection().station,.1);
 assert.equal(v.notifications.length,0,'Synchronizing construction state never calls back into the main timeline.');
 v.view.setContext({geometry:1,joinProgress:1,completed:true});near(v.view.selection().station,.5);
 assert.match(v.nodes.stage.textContent,/completed neck/);assert.match(v.nodes.ambient.textContent,/4D neck/);
 for(const n of [0,25,50,75,100])assert.equal(v.nodes['station-'+n].disabled,false);
 v.view.destroy();
});

test('choosing either joining edge updates inspection and preserves the construction position and pause',()=>{
 const v=fixture({linked:false});v.set({});const before=v.view.snapshot();
 v.nodes.new.handlers.click();assert.equal(v.view.selection().side,'new');near(v.view.selection().station,.75);
 assert.equal(v.nodes.new.attributes['aria-pressed'],'true');assert.equal(v.notifications.length,1);assert.equal(v.inspections.length,1);
 assert.equal(v.view.snapshot().geometry,before.geometry);assert.equal(v.view.snapshot().paused,before.paused);
 v.nodes.old.handlers.click();near(v.view.selection().station,.25);assert.equal(v.view.snapshot().geometry,before.geometry);
 v.view.destroy();
});

test('manual scan and station buttons inspect built material only, and Follow join resumes the chosen edge',()=>{
 const v=fixture({linked:false});v.set({joinProgress:.4});
 assert.equal(v.nodes['station-25'].disabled,true);assert.equal(v.nodes['station-50'].disabled,true);
 assert.equal(v.nodes['station-0'].disabled,false);assert.equal(v.nodes['station-100'].disabled,false);
 v.nodes.scan.value='60';v.nodes.scan.handlers.input();near(v.view.selection().station,.8);
 assert.equal(v.view.selection().following,false);assert.equal(v.view.selection().side,'old','Follow preference is distinct from actual resolved station.');
 assert.equal(v.nodes.scan.value,80);assert.equal(v.nodes.follow.checked,false);
 v.nodes.scan.value='10';v.nodes.scan.handlers.input();near(v.view.selection().station,.1);
 v.view.setContext({joinProgress:.8});near(v.view.selection().station,.1);
 v.nodes.follow.checked=true;v.nodes.follow.handlers.change();near(v.view.selection().station,.4);assert.equal(v.view.selection().following,true);
 v.nodes['station-100'].handlers.click();near(v.view.selection().station,1);assert.equal(v.view.selection().following,false);
 const count=v.notifications.length;v.nodes['station-50'].handlers.click();assert.equal(v.notifications.length,count,'A future section cannot be selected.');
 v.nodes.follow.checked=true;v.nodes.follow.handlers.change();v.view.setContext({joinProgress:.99});
 assert.equal(v.nodes['station-50'].disabled,true);assert.equal(v.nodes['station-50'].attributes['aria-pressed'],'false','An unavailable section must not appear selected even when the scanner is nearby.');
 assert.equal(v.view.snapshot().geometry,.72);v.view.destroy();
});

test('a new construction resets manual scanning while completion of the same construction preserves it',()=>{
 const v=fixture({linked:false});v.set({joinProgress:1,geometry:.96});v.nodes.scan.value='75';v.nodes.scan.handlers.input();
 near(v.view.selection().station,.75);assert.equal(v.view.selection().following,false);
 const notices=v.notifications.length;v.view.setContext({completed:true,phase:'complete',geometry:1,constructionId:1});near(v.view.selection().station,.75);
 v.view.setContext({constructionId:2,geometry:0,joinProgress:0,fromCount:2,completed:false});
 near(v.view.selection().station,0);assert.equal(v.view.selection().following,true);assert.equal(v.notifications.length,notices);
 assert.equal(v.nodes.follow.checked,true);v.view.destroy();
});

test('populated neighborhoods build around the gold surface, guides close, and the larger scan exposes a normal disc',()=>{
 const v=fixture({linked:false});v.set({joinProgress:0,geometry:.5});
 const guideCount=v.drawing.overview.filter(c=>c[0]==='stroke'&&c[4].length>0).length;
 assert.ok(guideCount>5,'Distinct off-surface landmarks have matching guides across the opening.');
 const before=v.drawing.overview.filter(c=>c[0]==='fill').length;
 assert.ok(v.drawing.canvas.filter(c=>c[0]==='fill').length>150,'The scanner displays a populated volume, not a lone curve.');
 assert.match(v.nodes.canvas.attributes['aria-label'],/normal discs keep their extent/i);
 v.view.setContext({joinProgress:1,geometry:1});
 assert.ok(v.drawing.overview.filter(c=>c[0]==='fill').length>before+100,'Joining builds the gold surface and surrounding material.');
 assert.equal(v.drawing.overview.filter(c=>c[0]==='stroke'&&c[4].length>0).length,0,'There is no unjoined gap or dangling guide at completion.');
 assert.match(v.nodes.overview.attributes['aria-label'],/100 percent of the neck joined/);
 assert.ok(goldStroke(v));v.view.destroy();
});

test('incoming neighborhood and landmark guides visibly align with deterministic reverse scrubbing',()=>{
 const v=fixture({linked:false});v.set({geometry:.36,joinProgress:0});
 const guides=()=>v.drawing.overview.filter(c=>c[0]==='stroke'&&c[4].length>0);
 const before=JSON.stringify(guides()),first=guides()[0][3];
 v.view.setContext({geometry:.60});const aligned=guides()[0][3];
 assert.deepEqual(first[0],aligned[0],'Existing neighborhood stays fixed during alignment.');
 assert.notDeepEqual(first[1],aligned[1],'Matching incoming landmarks approach their aligned positions.');
 assert.equal(v.view.selection().station,0);assert.equal(v.view.snapshot().joinProgress,0);
 v.view.setContext({geometry:.36});assert.equal(JSON.stringify(guides()),before,'Scrubbing back restores the exact same landmarks and guides.');
 assert.equal(v.scheduled(),0);v.view.destroy();
});

test('optional symmetry turns the populated surroundings while the gold core and scanner station stay fixed',()=>{
 const v=fixture({linked:false});v.set({});v.nodes.scan.value='25';v.nodes.scan.handlers.input();const gold=JSON.stringify(goldStroke(v)),station=v.view.selection().station;
 assert.equal(v.nodes['symmetry-panel'].hidden,true);v.nodes.symmetry.handlers.click();
 assert.equal(v.nodes['symmetry-panel'].hidden,false);assert.equal(v.nodes.symmetry.attributes['aria-expanded'],'true');
 const center=command=>command[2][0].slice(1,3);
 const blueStart=v.drawing.canvas.find(c=>c[0]==='fill'&&c[1]==='#83c7ef');
 const violetStart=v.drawing.canvas.find(c=>c[0]==='fill'&&c[1]==='#c6adff');
 assert.ok(blueStart&&violetStart,'The entire population includes highlighted opposite landmarks.');
 v.nodes.reversal.value='100';v.nodes.reversal.handlers.input();
 const blueEnd=v.drawing.canvas.find(c=>c[0]==='fill'&&c[1]==='#83c7ef');
 const violetEnd=v.drawing.canvas.find(c=>c[0]==='fill'&&c[1]==='#c6adff');
 const same=(a,b)=>assert.ok(Math.hypot(...center(a).map((x,i)=>x-center(b)[i]))<1e-10);
 same(blueEnd,violetStart);same(violetEnd,blueStart);
 assert.equal(JSON.stringify(goldStroke(v)),gold);assert.equal(v.view.selection().station,station);
 assert.equal(v.view.snapshot().geometry,.72);assert.equal(v.scheduled(),0);v.view.destroy();
});

test('hidden documents, closure and destruction cannot create stale drawing or inspection callbacks',()=>{
 const v=fixture({linked:false});v.set({});v.doc.hidden=true;const count=v.draws();v.view.setContext({joinProgress:.8});v.view.render();assert.equal(v.draws(),count);
 v.doc.hidden=false;v.doc.handlers.visibilitychange();assert.equal(v.draws(),count+2);
 v.view.setContext({active:false});const stopped=v.draws();v.doc.handlers.visibilitychange();assert.equal(v.draws(),stopped);
 v.view.destroy();v.view.setContext({active:true});v.view.render();assert.equal(v.draws(),stopped);assert.equal(v.root.hidden,true);
 assert.equal(Object.keys(v.nodes.scan.handlers).length,0);assert.equal(Object.keys(v.nodes.follow.handlers).length,0);assert.equal(Object.keys(v.doc.handlers).length,0);
 assert.equal(v.notifications.length,0);v.view.destroy();assert.equal(v.disconnected(),1);
});

test('pre-cut material is labeled preview and explanations distinguish the local neighborhood from the entire neck',()=>{
 const v=fixture({linked:false});v.set({geometry:0,joinProgress:0});
 assert.match(v.nodes['coordinate-label'].textContent,/Preview/);assert.match(v.nodes.message.textContent,/planned cut boundaries/);
 v.view.setContext({geometry:.4});assert.match(v.nodes['coordinate-label'].textContent,/Whole D² × S¹ neighborhoods/);
 v.nodes.scan.value='0';v.nodes.scan.handlers.input();assert.match(v.nodes['coordinate-label'].textContent,/3D neighborhood.*one normal disc highlighted/);
 assert.match(v.root.innerHTML,/S¹ × I ⊂ S³ × I/);assert.match(v.root.innerHTML,/not the entire four-dimensional neck/);
 assert.match(v.root.innerHTML,/not Jacobi fields/);assert.match(v.root.innerHTML,/One combination of the two hidden coordinates is omitted/);
 v.view.setContext({ready:false,phase:'idle',geometry:0});assert.match(v.nodes.message.textContent,/Choose Add/);
 assert.equal(v.nodes.scan.disabled,true);assert.equal(v.nodes.follow.disabled,true);
 const count=v.notifications.length;v.nodes.scan.value='80';v.nodes.scan.handlers.input();v.nodes.new.handlers.click();assert.equal(v.notifications.length,count);
 const context={GeodesicNeckMath:MathModel};vm.runInNewContext(fs.readFileSync(require.resolve('./neck-explanation.js'),'utf8'),context);
 assert.equal(typeof context.GeodesicNeckExplanation.create,'function');v.view.destroy();
});


test('the active close-up aligns two populated neighborhoods and joins matching patches without contracting them',()=>{
 const v=fixture({linked:false}),cores=()=>v.drawing.canvas.filter(c=>c[0]==='stroke'&&c[1]==='#f4c56c'&&c[2]===2);
 const dimensions=command=>{
  const points=command[3].filter(p=>p[0]==='move'||p[0]==='line');
  return [Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[2]))-Math.min(...points.map(p=>p[2]))];
 };
 v.set({geometry:.36,joinProgress:0});
 assert.equal(v.view.selection().mode,'join');assert.equal(v.root.dataset.mode,'join');assert.equal(cores().length,2);
 const initial=JSON.stringify(v.drawing.canvas),beforeRight=cores()[1][3][0],size=dimensions(cores()[0]);
 assert.match(v.nodes.canvas.attributes['aria-label'],/both|existing and new joining fronts/);
 for(const label of ['1','2','3','4','5','6'])assert.equal(v.drawing.canvas.filter(c=>c[0]==='text'&&c[2]===label).length,2,'Each normal-disc sample has one counterpart around the loop.');
 v.view.setContext({geometry:.60});assert.notDeepEqual(cores()[1][3][0],beforeRight,'The incoming neighborhood visibly aligns.');
 v.view.setContext({geometry:.9,joinProgress:.9});
 dimensions(cores()[0]).forEach((n,i)=>near(n,size[i]));dimensions(cores()[1]).forEach((n,i)=>near(n,size[i]));
 assert.ok(v.drawing.canvas.some(c=>c[0]==='stroke'&&c[4].length>0),'Matched patches retain correspondence guides until meeting.');
 v.view.setContext({geometry:.94,joinProgress:1});assert.equal(cores().length,1,'Two copies identify into one instead of retaining a duplicate.');
 dimensions(cores()[0]).forEach((n,i)=>near(n,size[i]));
 assert.equal(v.view.selection().mode,'handoff');assert.match(v.nodes.canvas.attributes['aria-label'],/identified into one/);
 assert.equal(v.drawing.canvas.some(c=>c[0]==='stroke'&&c[4].length>0),false,'No correspondence line crosses an unjoined gap after identification.');
 v.view.setContext({geometry:.36,joinProgress:0});assert.equal(JSON.stringify(v.drawing.canvas),initial,'Reverse scrubbing restores the exact two neighborhoods.');
 assert.equal(v.scheduled(),0);assert.equal(v.notifications.length,0);v.view.destroy();
});

test('the joined close-up magnifies smoothly into the scanner and manual inspection bypasses that handoff',()=>{
 const v=fixture({linked:false});v.set({geometry:.94,joinProgress:1});assert.equal(v.view.selection().scannerBlend,0);
 const first=()=>goldStroke(v)[3][0].slice(1);
 v.view.setContext({geometry:.965});const before=first(),middle=v.view.selection().scannerBlend;
 assert.ok(middle>0&&middle<1);assert.equal(v.root.dataset.mode,'handoff');
 v.view.setContext({geometry:.965001});assert.ok(Math.hypot(...first().map((n,i)=>n-before[i]))<.02,'The scanner camera has no position jump.');
 v.view.setContext({geometry:1,completed:true});assert.equal(v.view.selection().mode,'scanner');assert.equal(v.view.selection().scannerBlend,1);
 assert.match(v.nodes.canvas.attributes['aria-label'],/Three-dimensional scanner/);
 v.view.setContext({geometry:.72,joinProgress:.5,completed:false});assert.equal(v.view.selection().mode,'join');
 v.nodes.scan.value='25';v.nodes.scan.handlers.input();assert.equal(v.view.selection().mode,'scanner');assert.equal(v.view.selection().scannerBlend,1);
 const progress=v.view.snapshot().geometry,station=v.view.selection().station;
 v.nodes.follow.checked=true;v.nodes.follow.handlers.change();assert.equal(v.view.selection().mode,'join');
 assert.equal(v.view.snapshot().geometry,progress);near(v.view.selection().station,station);
 v.view.setContext({geometry:.98,joinProgress:.8});assert.equal(v.view.selection().mode,'join','A late animation coordinate cannot invent an already-joined section.');
 v.nodes.symmetry.handlers.click();assert.equal(v.view.selection().mode,'scanner','The optional symmetry study explicitly selects manual scanning.');
 assert.equal(v.view.selection().following,false);assert.equal(v.view.snapshot().geometry,.98);
 v.nodes.reversal.value='100';v.nodes.reversal.handlers.input();
 v.nodes.follow.checked=true;v.nodes.follow.handlers.change();assert.equal(v.view.snapshot().symmetry,false,'Resuming the close-up clears the optional rotation so the scanner handoff cannot jump.');
 v.view.setContext({geometry:1,joinProgress:1,completed:true});assert.doesNotMatch(v.nodes.canvas.attributes['aria-label'],/Symmetry reversal/);
 v.nodes.symmetry.handlers.click();v.nodes.new.handlers.click();assert.equal(v.view.snapshot().symmetry,false,'Choosing a joining edge resumes an unrotated close-up.');
 v.view.destroy();
});


test('matching fills normal-disc interiors all around both loops and keeps their longitudinal connections whole',()=>{
 const v=fixture({linked:false});v.set({geometry:.5,joinProgress:0});
 const discs=v.drawing.canvas.filter(c=>c[0]==='fill'&&c[1]==='rgba(153,178,229,.055)');
 assert.equal(discs.length,12,'Six equally emphasized transverse discs appear in each neighborhood.');
 assert.ok(discs.every(c=>c[3]===1),'No sampled disc receives a local spotlight.');
 assert.equal(v.drawing.canvas.filter(c=>c[0]==='fill'&&/244,197,108|131,199,239,.25|198,173,255,.25/.test(c[1])).length,0,'The joining view has no isolated bright inspection disc.');
 const cores=v.drawing.canvas.filter(c=>c[0]==='fill'&&c[1]==='#f4c56c');
 assert.equal(cores.length,12);
 const positions=cores.slice(0,6).map(c=>c[2][0].slice(1,3));
 assert.ok(Math.max(...positions.map(p=>p[0]))-Math.min(...positions.map(p=>p[0]))>50);
 assert.ok(Math.max(...positions.map(p=>p[1]))-Math.min(...positions.map(p=>p[1]))>20,'The matched samples cover near and far sides of each loop.');
 const guides=v.drawing.canvas.filter(c=>c[0]==='stroke'&&c[4].length>0);
 assert.equal(guides.length,12,'Interior and boundary correspondences occur at every sampled azimuth.');
 for(const guide of guides){
  const origin=guide[3][0].slice(1,3);
  assert.ok(Math.min(...positions.map(p=>Math.hypot(p[0]-origin[0],p[1]-origin[1])))>1,'Ambient matching also occurs away from the gold core.');
 }
 const loops=v.drawing.canvas.filter(c=>c[0]==='stroke'&&c[1]==='rgba(131,199,239,.20)');
 assert.equal(loops.length,24);
 for(const loop of loops)assert.deepEqual(loop[3][0].slice(1),loop[3].at(-1).slice(1),'Full longitudinal loops have no residual scanner wedge seam.');
 assert.match(v.nodes.canvas.attributes['aria-label'],/interior and boundary landmarks throughout D2 times S1/i);
 assert.match(v.root.innerHTML,/different from the discs removed from the tori/);
 v.view.destroy();
});

test('whole-neighborhood matching does not select a gluing disc and fades continuously into one-disc scanner inspection',()=>{
 const withoutSurfaceMarker=commands=>{
  const paths=new Set(commands.filter(c=>c[0]==='fill'&&c[1]==='#42e3c0').map(c=>JSON.stringify(c[2])));
  return commands.filter(c=>!(c[0]==='fill'&&c[1]==='#42e3c0')&&!(c[0]==='stroke'&&c[1]==='#e4f5ec'&&paths.has(JSON.stringify(c[3]))));
 };
 const v=fixture({linked:false});v.set({geometry:.5,joinProgress:0,theta:0});const whole=JSON.stringify(withoutSurfaceMarker(v.drawing.canvas));
 v.view.setContext({theta:1.25});assert.equal(JSON.stringify(withoutSurfaceMarker(v.drawing.canvas)),whole,'Only the green surface point moves; changing inspection angle cannot privilege one joining disc.');
 v.view.setContext({geometry:.94,joinProgress:1});
 const family=()=>v.drawing.canvas.filter(c=>c[0]==='fill'&&c[1]==='rgba(153,178,229,.055)');
 const local=()=>v.drawing.canvas.filter(c=>c[0]==='fill'&&['rgba(131,199,239,.25)','rgba(198,173,255,.25)'].includes(c[1]));
 assert.equal(family().length,6,'Both entire neighborhoods identify together.');assert.equal(local().length,0);
 v.view.setContext({geometry:.97});const blend=v.view.selection().scannerBlend;
 assert.equal(family().length,6);for(const command of family())near(command[3],1-blend);
 assert.equal(local().length,32);for(const command of local())near(command[3],blend);
 v.view.setContext({geometry:.999999});assert.ok(family().every(c=>c[3]<1e-8),'Distributed discs fade before the role switches.');
 assert.ok(local().every(c=>c[3]>1-1e-8));
 v.view.setContext({geometry:1,completed:true});assert.equal(family().length,0);assert.equal(local().length,32);
 assert.match(v.nodes.canvas.attributes['aria-label'],/one normal disc highlighted within the whole three-dimensional neighborhood/);
 assert.match(v.nodes['coordinate-label'].textContent,/one normal disc highlighted/);
 for(const label of ['u','v'])assert.ok(v.drawing.canvas.some(c=>c[0]==='text'&&c[2]===label),'Scanner normal coordinates are distinct from the numbered fiber IDs.');
 assert.equal(v.scheduled(),0);v.view.destroy();
});

test('one green surface point remains visible through joining and scanner handoff while coral landmarks stay off surface',()=>{
 const v=fixture({linked:false}),green=key=>v.drawing[key].filter(c=>c[0]==='fill'&&c[1]==='#42e3c0');
 const frames=[{geometry:.5,joinProgress:0},{geometry:.8,joinProgress:.65},{geometry:.94,joinProgress:1},
  {geometry:.97,joinProgress:1},{geometry:.999999,joinProgress:1},{geometry:1,joinProgress:1,completed:true}];
 const snapshots=[];
 for(const frame of frames){
  v.set({...frame,theta:.7});
  for(const key of ['canvas','overview']){
   assert.equal(green(key).length,1,`${key} has exactly one green surface point.`);
   assert.equal(green(key)[0][3],1,'The surface point does not fade with reference discs or inspection cutaways.');
  }
  const marker=green('canvas')[0],lastFill=v.drawing.canvas.filter(c=>c[0]==='fill').at(-1);
  assert.equal(lastFill,marker,'The surface point paints above guides and nearby landmarks.');
  const coral=v.drawing.canvas.filter(c=>c[0]==='stroke'&&c[1]==='#ff9b85');
  const expected=frame.geometry<.94?12:frame.geometry<1?6:0;
  assert.equal(coral.length,expected,'Six numbered off-surface landmarks per visible neighborhood fade away at scanner handoff.');
  if(frame.geometry===.5){
   const cores=v.drawing.canvas.filter(c=>c[0]==='fill'&&c[1]==='#f4c56c').map(c=>c[2][0].slice(1,3));
   for(let i=0;i<coral.length;i++){
    const p=coral[i][3][0];assert.ok(Math.hypot(p[1]-cores[i][0],p[2]-cores[i][1])>1,'Coral markers lie off their normal-disc centers on the gold surface.');
   }
   assert.equal(v.drawing.canvas.filter(c=>c[0]==='fill'&&c[1]==='#ff9b85').length,6,'Existing references are filled; incoming references remain outlined.');
  }
  snapshots.push(JSON.stringify(v.drawing.canvas));
 }
 for(let i=frames.length-1;i>=0;i--){v.set({...frames[i],theta:.7,completed:!!frames[i].completed});assert.equal(JSON.stringify(v.drawing.canvas),snapshots[i],'Reverse scrubbing restores the same point, guides and marker colors.');}
 v.set({geometry:.5,joinProgress:0,completed:false,theta:.7});const old=green('canvas')[0][2][0].slice(1,3);
 v.nodes.new.handlers.click();const incoming=green('canvas')[0][2][0].slice(1,3);
 assert.ok(incoming[0]>old[0]+20,'Choosing the new side moves the single surface point to the matching incoming loop.');
 v.view.setContext({theta:1.4});assert.notDeepEqual(green('canvas')[0][2][0].slice(1,3),incoming,'Changing theta moves the green point around its surface circle.');
 assert.equal(green('canvas').length,1);assert.equal(green('canvas')[0][3],1);
 assert.match(v.root.innerHTML,/Green: same surface point/);assert.match(v.root.innerHTML,/Coral 1–6: off-surface references/);
 v.view.destroy();
});

const linkedColors=['#83c7ef','#c6adff'];
const linkedLabels=commands=>commands.filter(c=>c[0]==='text'&&['A','B'].includes(c[2]));
const linkedDots=(commands,radius)=>commands.filter(c=>c[0]==='stroke'&&linkedColors.includes(c[1])&&c[2]===1.4&&c[3][0]?.[0]==='arc'&&Math.abs(c[3][0][3]-radius)<1e-10);
const pointOf=command=>command[3][0].slice(1,3);
const nearPoint=(a,b)=>a.forEach((value,i)=>assert.ok(Math.abs(value-b[i])<1e-9,`${a} versus ${b}`));

test('linking starts enabled, preserves construction state, and can be hidden and restored',()=>{
 const v=fixture();v.set({geometry:.6,joinProgress:0});const baseline=JSON.stringify(v.drawing),before=v.view.snapshot();
 assert.equal(before.linked,true);assert.equal(v.root.dataset.linked,'true');assert.equal(v.nodes['link-toggle'].attributes['aria-pressed'],'true');
 for(const key of ['overview','canvas']){
  assert.deepEqual(linkedLabels(v.drawing[key]).map(c=>c[2]),['A','B','A','B']);
  assert.equal(v.drawing[key].filter(c=>c[0]==='fill'&&c[1]==='#42e3c0').length,1,'The shared green surface point remains unique.');
 }
 v.nodes['link-toggle'].handlers.click();
 assert.equal(v.view.snapshot().linked,false);assert.equal(v.root.dataset.linked,'false');assert.equal(v.nodes['link-toggle'].attributes['aria-pressed'],'false');
 for(const property of ['geometry','joinProgress','paused','following','side','station'])assert.equal(v.view.snapshot()[property],before[property]);
 for(const key of ['overview','canvas'])assert.equal(linkedLabels(v.drawing[key]).length,0,'The explanation remains optional.');
 v.nodes['link-toggle'].handlers.click();
 assert.equal(JSON.stringify(v.drawing),baseline,'Restoring the default explanation restores the same landmarks and drawing state.');
 assert.match(v.nodes.overview.attributes['aria-label'],/same off-surface points/);assert.match(v.nodes.canvas.attributes['aria-label'],/identical off-surface points above/);
 assert.match(v.root.innerHTML,/Upper view compresses one hidden direction/);
 assert.equal(v.scheduled(),0);v.view.destroy();assert.equal(v.nodes['link-toggle'].handlers.click,undefined);
});

test('A and B use the identical ambient coordinates in the longitudinal and enlarged views',()=>{
 const v=fixture({linked:false});v.set({geometry:.6,joinProgress:0,theta:.9});v.nodes['link-toggle'].handlers.click();
 const samples=MathModel.linkedLandmarks(.9).featured;
 const upper=v.drawing.overview,lower=v.drawing.canvas;
 const upperDots=linkedDots(upper,3.5),lowerDots=linkedDots(lower,4.2);
 assert.equal(upperDots.length,4);assert.equal(lowerDots.length,4);
 const upperScreen=p=>[170+340/5.65*(1.45*p[0]+.30*p[1]),170*.55+170/3.45*(.16*p[0]+.25*p[1]-.85*p[2])];
 const cy=Math.cos(.42),sy=Math.sin(.42),sp=Math.sin(.68),cp=Math.cos(.68),scale=Math.min(340*.15,170*.31);
 const lowerScreen=(p,side)=>[170+side*340*.27+scale*(cy*p[0]-sy*p[1]),170*.56-scale*(sp*(sy*p[0]+cy*p[1])+cp*p[2])];
 for(let copy=0;copy<2;copy++)for(let i=0;i<samples.length;i++){
  const p=samples[i],index=copy*2+i,ink=linkedColors[i];
  assert.equal(upperDots[index][1],ink);assert.equal(lowerDots[index][1],ink);
  nearPoint(pointOf(upperDots[index]),upperScreen(MathModel.materialSlice(p.theta,p.u,p.v,copy,.55)));
  nearPoint(pointOf(lowerDots[index]),lowerScreen(MathModel.project(p.point),copy?1:-1));
  for(const [commands,dot]of [[upper,upperDots[index]],[lower,lowerDots[index]]]){
   const fill=commands.find(c=>c[0]==='fill'&&JSON.stringify(c[2])===JSON.stringify(dot[3]));
   assert.equal(fill[1],copy?'#102d39':ink,'Existing landmarks are filled; counterparts stay outlined.');
   assert.equal(dot[5],1,'Identities are not faded out before they identify.');
  }
 }
 // Different projections give different screen positions, while using the
 // same nonzero hidden coordinates rather than points on the green/gold core.
 assert.ok(samples.every(p=>Math.hypot(p.u,p.v)>0));
 assert.notDeepEqual(pointOf(upperDots[0]),pointOf(lowerDots[0]));
 v.view.destroy();
});

test('linked surrounding points expand with actual joining and counterparts identify together only at the join',()=>{
 const v=fixture({linked:false});v.set({geometry:.6,joinProgress:0});v.nodes['link-toggle'].handlers.click();
 for(const key of ['overview','canvas'])assert.equal(linkedDots(v.drawing[key],key==='overview'?1.8:2.5).length,0,'A/B are introduced before the wider population.');
 const records=[];
 for(const [geometry,joinProgress]of [[.7,.3],[.8,.6],[1,.99],[.94,1],[.97,1],[1,1]]){
  v.view.setContext({geometry,joinProgress});
  const expansion=MathModel.linkProgress(geometry,joinProgress).expansion;
  for(const key of ['overview','canvas']){
   const copies=joinProgress===1?1:2,radius=key==='overview'?1.8:2.5;
   assert.equal(linkedLabels(v.drawing[key]).length,2*copies,'Each matched identity has two counterparts until actual identification.');
   const surroundings=linkedDots(v.drawing[key],radius);assert.equal(surroundings.length,24*copies);
   assert.ok(surroundings.every(c=>Math.abs(c[5]-expansion)<1e-12),'Both hidden directions brighten on the supplied joining timeline.');
  }
  if(joinProgress===1)assert.match(v.nodes['link-status'].textContent,/Every point has matched/);
  else assert.doesNotMatch(v.nodes['link-status'].textContent,/has matched/,'Late geometry alone cannot announce identification.');
  records.push({geometry,joinProgress,drawing:JSON.stringify(v.drawing)});
 }
 for(const record of records.reverse()){
  v.view.setContext({geometry:record.geometry,joinProgress:record.joinProgress});assert.equal(JSON.stringify(v.drawing),record.drawing,'Reverse scrubbing restores identical correspondence and expansion.');
 }
 assert.equal(v.scheduled(),0);v.view.destroy();
});

test('magnification callout tracks the chosen neighborhood through side changes, resizing and manual scanning',()=>{
 const v=fixture({linked:false}),rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
 v.root.getBoundingClientRect=()=>rect(10,20,340,600);
 v.nodes.overview.getBoundingClientRect=()=>rect(10,60,340,170);
 v.nodes.canvas.getBoundingClientRect=()=>rect(10,280,340,170);
 v.set({geometry:.72,joinProgress:.5});v.nodes['link-toggle'].handlers.click();
 const frame=v.nodes['link-frames'].attributes.d,connectors=v.nodes['link-connectors'].attributes.d;
 assert.equal(v.nodes['link-callout'].attributes.viewBox,'0 0 340 600');
 assert.doesNotMatch(frame+connectors,/NaN|undefined|Infinity/);assert.equal((connectors.match(/M/g)||[]).length,2);
 const frameCopy=frame.match(/M([^Z]+)Z M([^Z]+)Z/);assert.ok(frameCopy,'Both the upper inspected section and enlarged lower region receive a frame.');
 assert.match(v.drawing.canvas.find(c=>c[0]==='text'&&c[2]==='Same neighborhood, enlarged')?.[2]||'',/Same neighborhood/);
 v.nodes.new.handlers.click();assert.notEqual(v.nodes['link-frames'].attributes.d,frame);assert.notEqual(v.nodes['link-connectors'].attributes.d,connectors);
 assert.equal(v.view.snapshot().linked,true);
 const chosen=v.nodes['link-connectors'].attributes.d;
 v.nodes.canvas.getBoundingClientRect=()=>rect(10,330,340,200);v.view.render();assert.notEqual(v.nodes['link-connectors'].attributes.d,chosen,'Callout follows resized canvas bounds.');
 v.nodes.scan.value='90';v.nodes.scan.handlers.input();assert.equal(v.view.selection().mode,'scanner');assert.equal(v.view.snapshot().linked,true);
 for(const key of ['overview','canvas'])assert.deepEqual(linkedLabels(v.drawing[key]).map(c=>c[2]),['A','B'],'Manual scan compares a single resolved material section in both views.');
 v.view.setContext({constructionId:2,geometry:0,joinProgress:0,completed:false});assert.equal(v.view.snapshot().linked,true,'An optional explanation stays enabled for the next construction.');
 assert.equal(v.view.selection().following,true);assert.equal(v.scheduled(),0);v.view.destroy();
});

test('linked symmetry rotates the same hidden coordinates in both views without duplicating A/B or moving the surface point',()=>{
 const v=fixture({linked:false});v.set({geometry:.72,joinProgress:.5,theta:.9});v.nodes['link-toggle'].handlers.click();
 v.nodes.scan.value='20';v.nodes.scan.handlers.input();v.nodes.symmetry.handlers.click();
 const points=key=>linkedDots(v.drawing[key],key==='overview'?3.5:4.2).map(pointOf);
 const green=key=>v.drawing[key].find(c=>c[0]==='fill'&&c[1]==='#42e3c0')[2];
 const initial={upper:points('overview'),lower:points('canvas'),greenUpper:JSON.stringify(green('overview')),greenLower:JSON.stringify(green('canvas'))};
 v.nodes.reversal.value='100';v.nodes.reversal.handlers.input();
 const samples=MathModel.linkedLandmarks(.9).featured;
 const cy=Math.cos(.42),sy=Math.sin(.42),sp=Math.sin(.68),cp=Math.cos(.68),scale=Math.min(340*.29,170*.41);
 for(const [i,p]of samples.entries()){
  const upper=MathModel.materialSlice(p.theta,-p.u,-p.v,.2,.55),lower=MathModel.project(MathModel.point(p.theta,-p.u,-p.v));
  nearPoint(points('overview')[i],[170+340/5.65*(1.45*upper[0]+.30*upper[1]),170*.55+170/3.45*(.16*upper[0]+.25*upper[1]-.85*upper[2])]);
  nearPoint(points('canvas')[i],[170+scale*(cy*lower[0]-sy*lower[1]),170*.56-scale*(sp*(sy*lower[0]+cy*lower[1])+cp*lower[2])]);
 }
 for(const key of ['overview','canvas'])assert.deepEqual(linkedLabels(v.drawing[key]).map(c=>c[2]),['A','B'],'The symmetry study must not introduce a second unrelated pair of A/B labels.');
 assert.notDeepEqual(points('overview'),initial.upper);assert.notDeepEqual(points('canvas'),initial.lower);
 assert.equal(JSON.stringify(green('overview')),initial.greenUpper);assert.equal(JSON.stringify(green('canvas')),initial.greenLower);
 assert.equal(v.view.selection().station,.2);assert.equal(v.view.snapshot().geometry,.72);assert.equal(v.scheduled(),0);v.view.destroy();
});


test('upper neighborhood uses three visibly separated blue and purple guide pairs',()=>{
 const v=fixture({linked:false});v.set({geometry:.94,joinProgress:1});
 const guides=prefix=>v.drawing.overview.filter(c=>c[0]==='stroke'&&c[1].startsWith(prefix)&&c[2]>=1.4&&c[3].length===2&&c[4].length===0);
 const blue=guides('rgba(85,186,255,'),purple=guides('rgba(184,122,255,');
 assert.equal(blue.length,6);assert.equal(purple.length,6,'Three representative azimuth pairs retain both colored families from each end without crowding the upper projection.');
 for(let i=0;i<3;i++)for(let side=0;side<2;side++){
  const a=blue[2*i+side],b=purple[2*i+side];
  const p=a[3][0].slice(1),q=b[3][0].slice(1);
  assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])>6,'Projected blue and purple counterparts should not blend into one line at the compact 340-pixel overview width.');
  assert.equal(a[5],1);assert.equal(b[5],1,'Neighborhood strands retain their color rather than fading with the linked-view background.');
 }
 v.view.destroy();
});
