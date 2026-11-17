/* Coordinate/topology picture, not an isometric embedding or Jacobi-field plot.
 * In S^3 subset R^4, the involution (x1,x2,u,v)->(x1,x2,-u,-v)
 * fixes the distinguished circle. Stereographic coordinates omit (0,0,0,1).
 * A small tube around that circle is only a neighborhood inside S^3. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicNeckMath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=2*Math.PI;
  function finite(value,name){if(!Number.isFinite(value))throw new TypeError(name+' must be finite.');return value;}
  function radius(value){finite(value,'Neighborhood radius');if(value<0||value>=1)throw new RangeError('The neighborhood radius must lie in [0,1).');return value;}
  function count(value,name){if(!Number.isSafeInteger(value)||value<3||value>512)throw new RangeError(name+' must be an integer between 3 and 512.');return value;}
  function spherePoint(value){
    if(!value||value.length!==4||!Array.from(value).every(Number.isFinite))throw new TypeError('A finite four-coordinate point is required.');
    const normSquared=Array.from(value).reduce((sum,v)=>sum+v*v,0);
    if(Math.abs(normSquared-1)>1e-9)throw new RangeError('The coordinate point must lie on the unit three-sphere.');
    return value;
  }
  function point(theta,u=0,v=0){
    finite(theta,'Circle angle');finite(u,'First hidden coordinate');finite(v,'Second hidden coordinate');
    const normalSquared=u*u+v*v;
    if(!(normalSquared<1))throw new RangeError('Hidden coordinates must satisfy u² + v² < 1.');
    const size=Math.sqrt(1-normalSquared);
    return [size*Math.cos(theta),size*Math.sin(theta),u,v];
  }
  function project(value){
    spherePoint(value);const denominator=1-value[3];
    if(!(denominator>1e-12))throw new RangeError('The stereographic pole is outside this coordinate view.');
    return [value[0]/denominator,value[1]/denominator,value[2]/denominator];
  }
  function symmetry(value){spherePoint(value);return [value[0],value[1],-value[2],-value[3]];}
  function pair(theta,size,angle=0){
    radius(size);finite(angle,'Symmetry angle');
    const first=point(theta,size*Math.cos(angle),size*Math.sin(angle));
    return {first,second:symmetry(first)};
  }
  function circle(theta){finite(theta,'Circle angle');return [Math.cos(theta),Math.sin(theta),0];}
  function normalAxes(theta){
    const origin=circle(theta);
    return {origin,tangent:[-origin[1],origin[0],0],hidden1:[0,0,1],hidden2:[origin[0],origin[1],0]};
  }
  function sampleCircle(samples=96){
    count(samples,'Circle samples');
    return Array.from({length:samples+1},(_,i)=>circle(TAU*(i%samples)/samples));
  }
  function sampleNeighborhood(size=.22,around=64,across=12){
    radius(size);count(around,'Circle samples');count(across,'Normal samples');
    const at=(theta,angle)=>project(point(theta,size*Math.cos(angle),size*Math.sin(angle)));
    const circles=Array.from({length:across},(_,j)=>Array.from({length:around+1},(_,i)=>at(TAU*(i%around)/around,TAU*j/across)));
    const fibers=Array.from({length:around},(_,i)=>Array.from({length:across+1},(_,j)=>at(TAU*i/around,TAU*(j%across)/across)));
    return {radius:size,circles,fibers};
  }
  function scanState(joinProgress,{side='old',station=null}={}){
    finite(joinProgress,'Joining progress');
    if(side!=='old'&&side!=='new')throw new RangeError('Scanner side must be old or new.');
    const join=Math.max(0,Math.min(1,joinProgress)),oldFront=.5*join,newFront=1-oldFront;
    let selected=station===null?(side==='old'?oldFront:newFront):Math.max(0,Math.min(1,finite(station,'Scanner station')));
    // The central gap has no material to inspect yet. Do not manufacture a
    // cross-section there: the nearest existing joining edge is the scan limit.
    if(selected>oldFront&&selected<newFront){
      const oldDistance=selected-oldFront,newDistance=newFront-selected;
      selected=Math.abs(oldDistance-newDistance)<=1e-12?(side==='old'?oldFront:newFront):oldDistance<newDistance?oldFront:newFront;
    }
    return {join,oldFront,newFront,station:selected,complete:join===1};
  }
  function joiningView(geometry,joinProgress,{following=true,completed=false,ready=true}={}){
    finite(geometry,'Construction geometry');finite(joinProgress,'Joining progress');
    for(const [name,value]of [['Following',following],['Completed',completed],['Ready',ready]]){
      if(typeof value!=='boolean')throw new TypeError(name+' must be boolean.');
    }
    const clamp01=value=>Math.max(0,Math.min(1,value));
    const smooth=(value,start=0,end=1)=>{const t=clamp01((value-start)/(end-start));return t*t*(3-2*t);};
    // These are exploded-view translation/opacity weights, never a change in
    // the S³ coordinates, a metric distance, or compression of a normal disc.
    // A single supplied construction position determines every weight; reverse
    // scrubbing restores exactly the same matching neighborhoods and guides.
    if(!ready)return Object.freeze({mode:'preview',alignment:0,misalignment:1,separation:.92,
      scannerBlend:0,meeting:false,guideProgress:0,leftOpacity:1,rightOpacity:1,guideOpacity:0});
    const g=completed?1:clamp01(geometry),join=completed?1:clamp01(joinProgress);
    const alignment=completed?1:smooth(g,.36,.60),meeting=join===1;
    // Actual joining progress is authoritative: a late geometry value alone
    // must not identify unjoined sections or hand them to the completed scan.
    const scannerBlend=!following||completed?1:meeting?smooth(g,.94,1):0;
    const mode=scannerBlend===1?'scanner':meeting?'handoff':'join';
    return Object.freeze({mode,alignment,misalignment:1-alignment,separation:.92*(1-smooth(join)),
      scannerBlend,meeting,guideProgress:meeting?smooth(g,.94,.975):0,
      leftOpacity:1,rightOpacity:1-smooth(join,.85,1),guideOpacity:smooth(join,.92,1)*(1-scannerBlend)});
  }
  function sampleMaterial(size=.38,around=24,across=8){
    radius(size);count(around,'Material circle samples');count(across,'Material normal samples');
    if(size===0)throw new RangeError('A material neighborhood must have positive radius.');
    if(around>64||across>16)throw new RangeError('Material sampling is bounded by 64 circle and 16 normal samples.');
    const samples=[];
    function add(id,theta,u,v,kind){
      const coordinates=point(theta,u,v);
      samples.push({id,theta,u,v,point:coordinates,projected:project(coordinates),kind});
    }
    for(let i=0;i<around;i++){
      const theta=TAU*i/around;add('core-'+i,theta,0,0,'surface');
      for(let layer=1;layer<=2;layer++)for(let j=0;j<across;j++){
        const angle=TAU*j/across,r=size*layer/2;
        add('ambient-'+i+'-'+layer+'-'+j,theta,r*Math.cos(angle),r*Math.sin(angle),'ambient');
      }
    }
    return samples;
  }
  function matchingSections(size=.38,around=8,radial=2,normal=8){
    radius(size);count(around,'Matching circle sections');count(normal,'Matching normal samples');
    if(size===0)throw new RangeError('Matching sections require a positive normal-disc radius.');
    if(around>24||normal>16||!Number.isSafeInteger(radial)||radial<1||radial>4)throw new RangeError('Matching samples are bounded by 24 sections, 4 radial layers and 16 normal directions.');
    const freezePoint=value=>Object.freeze(value);
    const at=(theta,r,angle)=>project(point(theta,r*Math.cos(angle),r*Math.sin(angle)));
    const outlineCount=Math.max(24,normal*4);
    // Equal-status normal discs sample the entire S¹ factor. Their interiors,
    // not only their boundary circles, participate in the matching. Both copies
    // use these same immutable coordinates; animation only translates the view.
    return Object.freeze(Array.from({length:around},(_,index)=>{
      const theta=TAU*index/around,id='section-'+index,corePoint=freezePoint(point(theta)),core=freezePoint(project(corePoint));
      const landmarks=[Object.freeze({id:id+'-core',theta,u:0,v:0,point:corePoint,projected:core,kind:'surface',radialIndex:0,normalIndex:null})];
      for(let layer=1;layer<=radial;layer++)for(let j=0;j<normal;j++){
        const angle=TAU*j/normal,r=size*layer/radial,u=r*Math.cos(angle),v=r*Math.sin(angle),coordinates=freezePoint(point(theta,u,v));
        landmarks.push(Object.freeze({id:id+'-r'+layer+'-n'+j,theta,u,v,point:coordinates,projected:freezePoint(project(coordinates)),
          kind:layer===radial?'boundary':'interior',radialIndex:layer,normalIndex:j}));
      }
      const disc=Object.freeze(Array.from({length:outlineCount+1},(_,j)=>freezePoint(at(theta,size,TAU*(j%outlineCount)/outlineCount))));
      const spokes=Object.freeze(Array.from({length:normal},(_,j)=>Object.freeze(Array.from({length:radial+1},(_,layer)=>
        layer===0?core:freezePoint(at(theta,size*layer/radial,TAU*j/normal))))));
      return Object.freeze({id,index,theta,core,corePoint,disc,spokes,landmarks:Object.freeze(landmarks)});
    }));
  }
  // Shared identities in two different displays: neither projection changes
  // which ambient point is being followed or brings it onto the surface core.
  function linkedLandmarks(theta=Math.PI/4,size=.38){
    finite(theta,'Linked circle angle');radius(size);
    if(size===0)throw new RangeError('Linked landmarks require a positive neighborhood radius.');
    const make=(id,t,u,v,kind,label='')=>{
      const coordinates=Object.freeze(point(t,u,v));
      return Object.freeze({id,label,color:Math.abs(u)>=Math.abs(v)?'blue':'violet',theta:t,u,v,kind,
        point:coordinates,projected:Object.freeze(project(coordinates))});
    };
    const featured=Object.freeze([
      make('linked-A',theta,size/2,0,'interior','A'),
      make('linked-B',theta,0,-size/2,'interior','B')
    ]);
    const surrounding=[];
    for(let i=0;i<6;i++){
      const t=theta+Math.PI/6+TAU*i/6;
      for(const [j,u,v,kind]of [[0,size/2,0,'interior'],[1,-size,0,'boundary'],
        [2,0,size,'boundary'],[3,0,-size/2,'interior']]){
        surrounding.push(make('linked-around-'+i+'-'+j,t,u,v,kind));
      }
    }
    return Object.freeze({featured,surrounding:Object.freeze(surrounding)});
  }
  function linkProgress(geometry,joinProgress,{completed=false}={}){
    finite(geometry,'Construction geometry');finite(joinProgress,'Joining progress');
    if(typeof completed!=='boolean')throw new TypeError('Completed must be boolean.');
    const join=completed?1:Math.max(0,Math.min(1,joinProgress));
    const t=Math.max(0,Math.min(1,(join-.20)/.55));
    return Object.freeze({expansion:t*t*(3-2*t),identified:join===1});
  }
  function materialSlice(theta,u,v,station,normalAngle=0){
    finite(theta,'Circle angle');finite(u,'First hidden coordinate');finite(v,'Second hidden coordinate');
    finite(station,'Longitudinal station');finite(normalAngle,'Normal projection angle');
    if(!(u*u+v*v<1))throw new RangeError('Hidden coordinates must satisfy u² + v² < 1.');
    if(station<0||station>1)throw new RangeError('Longitudinal station must lie in [0,1].');
    // This longitudinal coordinate projection retains I, the circle angle, and
    // one normal combination. It omits the other normal combination and hence
    // is not an embedding of the four-dimensional neighborhood. The scanner
    // separately shows both normal coordinates in an actual S³ chart.
    const r=1+u*Math.cos(normalAngle)+v*Math.sin(normalAngle);
    return [3*(station-.5),r*Math.cos(theta),r*Math.sin(theta)];
  }
  return Object.freeze({point,project,symmetry,pair,circle,normalAxes,sampleCircle,sampleNeighborhood,scanState,joiningView,sampleMaterial,matchingSections,linkedLandmarks,linkProgress,materialSlice});
});
