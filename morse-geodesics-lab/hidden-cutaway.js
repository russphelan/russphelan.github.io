/* A local coordinate cutaway along a geodesic, including repeated visits to
 * the same surface point. Coordinates are (s, y1, y2), with the sideways surface
 * direction omitted. Colored curves are fixed-launch, magnified first-order
 * Jacobi separations. An optional finite deformation uses actual normal
 * coordinates at a separately labelled display magnification.
 */
(function(root,factory){
  'use strict';
  const jacobi=typeof module==='object'&&module.exports?require('./jacobi.js'):root.GeodesicJacobi;
  const api=factory(jacobi);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicHiddenCutaway=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Jacobi){
  'use strict';
  const TAU=2*Math.PI,COLORS={a:'#f4ba71',b:'#c4abff',surface:'#67e5c3',deformed:'#6de8ff',direction1:'#4db8ff',direction2:'#b86eff',text:'#daeee7',muted:'#9bb9bd'};
  const finiteColor=study=>study?.hiddenDirection===1?COLORS.direction1:study?.hiddenDirection===2?COLORS.direction2:COLORS.deformed;
  const DEFAULT_SPIN=-.75,DEFAULT_TILT=.66,STUDY_SPIN=.8;
  // Allocate the finite study's frame using one fixed physical reference push.
  // It never depends on the current amplitude or silently cancels gain changes.
  const FINITE_MAGNIFICATION=30,FINITE_RADIUS=.12;
  const FRAME_TRANSITION_MS=800;
  const GLOBAL_TRANSITION_MS=120;
  const DEFAULT_NOTE='This is a local coordinate view along the path, also when the path revisits a surface point. Forward motion and two off-surface directions are included; sideways surface motion is shown separately by the ribbon on the surface. Colored curves are magnified first-order separations, not exact neighboring geodesics or a literal Euclidean tube.';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a);
  const unit=a=>{const n=norm(a)||1;return a.map(x=>x/n);};
  function validate(data){
    if(!data||!(data.length>0)||!Number.isFinite(data.length)||!Number.isFinite(data.curvature))throw new RangeError('A positive-length curve and finite normal curvature are required.');
  }
  function eventsOf(data){
    validate(data);
    return (data.events||[]).filter(e=>e.hidden&&Number.isFinite(e.s)&&e.s>0&&e.s<=data.length).map(e=>({...e,endpoint:!!e.endpoint||e.s===data.length})).sort((a,b)=>a.s-b.s);
  }
  function rounding(data){return 16*Number.EPSILON*Math.max(1,data.length);}
  function prepareStudy(data,input){
    if(input==null)return null;
    validate(data);
    if(input.type!=='hidden'&&input.type!=='surface')throw new RangeError('A hidden or surface deformation is required.');
    const guard=Math.max(1e-10,rounding(data)),T=input.T;
    if(!Number.isFinite(T)||T<=0||T>data.length+guard)throw new RangeError('The studied segment must end on the selected geodesic.');
    const end=Math.min(T,data.length),magnification=input.magnification??FINITE_MAGNIFICATION;
    if(!Number.isFinite(magnification)||magnification<=0)throw new RangeError('Positive finite deformation magnification required.');
    if(input.hiddenDirection!==undefined&&input.hiddenDirection!==1&&input.hiddenDirection!==2)
      throw new RangeError('Hidden direction must be 1 or 2.');
    return {type:input.type,T:end,magnification,...(input.hiddenDirection===undefined?{}:{hiddenDirection:input.hiddenDirection})};
  }
  function prepareDeformation(data,input){
    const study=prepareStudy(data,input);if(!study)return null;
    const {T:end,magnification}=study,guard=Math.max(1e-10,rounding(data));
    if(input.type==='surface')return {...study,samples:[],maxRadius:0};
    if(!Array.isArray(input.samples)||input.samples.length<2)throw new RangeError('A sampled finite hidden curve is required.');
    const samples=input.samples.map((p,i)=>{
      if(!p||!Number.isFinite(p.s)||p.s< -guard||p.s>end+guard||
        !Array.isArray(p.y)||p.y.length!==2||!p.y.every(Number.isFinite)||
        i&&p.s<=input.samples[i-1].s)throw new RangeError('Ordered arclengths and two finite normal coordinates are required.');
      return {s:p.s,y:p.y.slice()};
    });
    const first=samples[0],last=samples[samples.length-1];
    if(Math.abs(first.s)>guard||Math.abs(last.s-end)>guard||norm(first.y)>1e-9||norm(last.y)>1e-9)
      throw new RangeError('The finite hidden curve must have both endpoints pinned to the centerline.');
    first.s=0;first.y=[0,0];last.s=end;last.y=[0,0];
    const maxRadius=Math.max(...samples.map(p=>norm(p.y)));
    if(!Number.isFinite(maxRadius*magnification))throw new RangeError('Finite displayed deformation scale required.');
    return {...study,samples,maxRadius};
  }
  function fieldState(data,position){
    validate(data);if(!Number.isFinite(position))throw new RangeError('Finite arclength required.');
    const s=clamp(position,0,data.length),events=eventsOf(data),guard=rounding(data);
    const event=events.find(e=>Math.abs(e.s-s)<=guard)||null;
    const h=s===0||event?0:Jacobi.hiddenValue(s,data.curvature);
    if(!Number.isFinite(h))throw new RangeError('The hidden Jacobi field exceeds the display range.');
    return {s,h,event,zero:s===0||!!event,coefficients:[h,h],
      vectors:[[h,0],[0,h]],radius:Math.abs(h)};
  }
  function contributionBefore(data,position){
    validate(data);if(!Number.isFinite(position))throw new RangeError('Finite arclength required.');
    const s=clamp(position,0,data.length),guard=rounding(data);
    return 2*eventsOf(data).filter(e=>!e.endpoint&&e.s<s-guard).length;
  }
  function surfaceEventLabel(event,length){return event.endpoint||event.s===length?'surface nullity 1':'+1 surface';}
  function describePosition(data,position){
    const state=fieldState(data,position),s=state.s;
    const surfaceEvent=(data.events||[]).find(e=>e.surface&&Math.abs(e.s-s)<=Math.max(data.eventTolerance||0,rounding(data)));
    let message;
    if(s===0)message='At x: both fields start at zero. This shared starting zero adds nothing to the index.';
    else if(state.event){
      if(state.event.endpoint)message='At y: both off-surface fields vanish. Hidden nullity is 2; this endpoint is not counted in the index.'+(state.event.surface?' The surface field also vanishes, giving total endpoint nullity 3.':'');
      else message='Both off-surface fields vanish here. Passing this focus adds 2 to the index.'+(state.event.surface?' The surface field also vanishes, adding 1 more in the main view.':' The surface field remains nonzero here.');
    }else if(surfaceEvent)message=surfaceEvent.endpoint||surfaceEvent.s===data.length?
      'At y: the surface field vanishes (surface nullity 1). Both off-surface fields remain nonzero, so this cutaway stays open. This endpoint contributes no index.':
      'The surface field refocuses here; the two off-surface fields remain nonzero, so this cutaway stays open.';
    else message='Both off-surface fields are nonzero here. Their signed sizes agree, but their directions are independent.';
    return {state,surfaceEvent,message};
  }
  function prepareProfile(data){
    validate(data);
    const events=eventsOf(data),times=[0,data.length,...events.map(e=>e.s)];
    const frequency=Math.sqrt(Math.abs(data.curvature));
    const count=Math.min(2400,Math.max(240,Math.ceil(data.length*frequency*24/Math.PI)));
    for(let i=1;i<count;i++)times.push(data.length*i/count);
    // Exact root rows stay in the mesh even when an ordinary sample straddles
    // a focus. Surface-only events never change a hidden-field value.
    times.sort((a,b)=>a-b);
    const unique=[];
    for(const s of times){
      const last=unique[unique.length-1];
      if(last!==undefined&&s-last<=rounding(data)){
        if(events.some(e=>e.s===s))unique[unique.length-1]=s;
      }else unique.push(s);
    }
    let maximum;
    if(data.curvature>0&&data.length>=Math.PI/(2*Math.sqrt(data.curvature)))maximum=1/Math.sqrt(data.curvature);
    else maximum=Math.abs(Jacobi.hiddenValue(data.length,data.curvature));
    if(!(maximum>0)||!Number.isFinite(maximum))throw new RangeError('Finite nonzero whole-path field scale required.');
    return {length:data.length,events,maximum,samples:unique.map(s=>({s,...fieldState(data,s)})),
      hiddenIndex:2*events.filter(e=>!e.endpoint).length,hiddenNullity:2*events.filter(e=>e.endpoint).length};
  }
  function create(root,options={}){
    if(!root||typeof root.querySelector!=='function')throw new TypeError('A cutaway container is required.');
    const doc=root.ownerDocument,win=doc.defaultView,prefix=(root.id||'hidden-cutaway')+'-';
    root.classList.add('hidden-cutaway');
    root.innerHTML=`
      <div class="cutaway-topline"><h3>Two ways off the surface</h3><p>The selected geodesic is straightened into the centerline. Amber and purple separations spread out in two independent directions and return to that line at a hidden focus.</p></div>
      <div class="cutaway-visual"><canvas class="cutaway-canvas" data-cutaway="canvas" width="1100" height="330" tabindex="0" role="img" aria-label="Select a geodesic to reveal its hidden-neighborhood cutaway."></canvas></div>
      <div class="cutaway-legend"><span class="cutaway-a">Off surface A · J₁</span><span class="cutaway-b">Off surface B · J₂</span><span class="cutaway-center">Centerline · selected geodesic</span><span>Two independent fields; extra fan strands are combinations, dashed strands are opposite signs.</span><span>Bright: passed · faint: ahead.</span><span>Faint discs and dashed rings are fixed coordinate guides.<span data-cutaway="field-ring-legend"> The colored field ring collapses at a hidden focus.</span></span></div>
      <div class="cutaway-controls"><button type="button" data-cutaway="play" aria-pressed="false">Play traversal</button><label class="cutaway-position-control" for="${prefix}position">Position along the selected geodesic <output data-cutaway="position-value">—</output><input id="${prefix}position" data-cutaway="position" type="range" min="0" max="100000" step="1" value="0"></label><label class="cutaway-gain-control" for="${prefix}gain">Magnification <output data-cutaway="gain-value">1.00×</output><input id="${prefix}gain" data-cutaway="gain" type="range" min="40" max="200" step="5" value="100"></label><button type="button" data-cutaway="reset">Reset cutaway view</button></div>
      <div class="cutaway-events" data-cutaway="events" role="group" aria-label="Inspect an off-surface conjugate point"></div>
      <p class="cutaway-readout" data-cutaway="readout" role="status" aria-live="polite">Select a geodesic in the picker above.</p>
      <p class="cutaway-scale" data-cutaway="scale"></p>
      <p class="cutaway-note" data-cutaway="note">${DEFAULT_NOTE}</p>`;
    const $=name=>root.querySelector('[data-cutaway="'+name+'"]'),canvas=$('canvas'),c=canvas.getContext('2d');
    let context={active:false,data:null,position:0,playing:false,error:'',deformation:null,study:null},profile=null,profileData=null;
    let deformation=null,deformationSource=null,deformationData=null,study=null;
    let gain=1,spin=DEFAULT_SPIN,tilt=DEFAULT_TILT,dragging=null,destroyed=false,cameraTouched=false,viewFraming=null;
    // Presentation coordinates only: the measured fields, endpoints, and
    // finite curves never interpolate. Retain the outgoing study while zooming out.
    let view={inverseEnd:1,local:0,hidden:0},viewTarget=null,transition=null,animationFrame=0;
    let frameStudy=null,frameDeformation=null;
    const motionPreference=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    const listeners=[],listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
    const active=()=>context.active&&!doc.hidden&&!destroyed;
    const now=()=>win.performance?.now()??Date.now();
    const interpolate=(a,b,t)=>a+(b-a)*t;
    function stopAnimation(){if(animationFrame)win.cancelAnimationFrame?.(animationFrame);animationFrame=0;}
    function advanceTransition(time=now()){
      if(!transition)return;
      const t=clamp((time-transition.start)/transition.duration,0,1),ease=t*t*(3-2*t);
      for(const key of ['inverseEnd','local','hidden'])view[key]=interpolate(transition.from[key],viewTarget[key],ease);
      if(t===1){view={...viewTarget};transition=null;if(!view.local){frameStudy=null;frameDeformation=null;}}
    }
    function queueAnimation(){
      if(!transition||animationFrame||!active())return;
      animationFrame=win.requestAnimationFrame(time=>{animationFrame=0;advanceTransition(time);draw();queueAnimation();});
    }
    function settleView(){
      stopAnimation();transition=null;if(viewTarget)view={...viewTarget};
      if(!view.local){frameStudy=null;frameDeformation=null;}
    }
    function updateView(previous){
      advanceTransition();
      const target={inverseEnd:1/(study?.T??context.data?.length??1),local:study?1:0,hidden:study?.type==='hidden'?1:0};
      const changed=!viewTarget||Object.keys(target).some(key=>target[key]!==viewTarget[key]);
      if(study){frameStudy=study;frameDeformation=deformation;}
      viewTarget=target;
      if(!active()||!previous.active||previous.data!==context.data||motionPreference?.matches||!win.requestAnimationFrame){settleView();return;}
      // Respond promptly to a press, then give the audience time to follow
      // the whole path into the local segment when the pointer is released.
      if(changed){transition={from:{...view},start:now(),duration:target.local?FRAME_TRANSITION_MS:GLOBAL_TRANSITION_MS};queueAnimation();}
    }
    const getState=()=>({active:active(),position:context.position,playing:context.playing,gain,
      length:context.data?.length||0,field:context.data?fieldState(context.data,context.position):null,
      deformation:deformation?{type:deformation.type,T:deformation.T,magnification:gain*deformation.magnification,maxRadius:deformation.maxRadius}:null,
      framing:viewFraming?{...viewFraming}:null});
    function updateEvents(){
      $('events').replaceChildren();
      if(!profile)return;
      for(const [i,event]of profile.events.entries()){
        const button=doc.createElement('button');button.type='button';button.dataset.cutawayEvent=i;
        button.textContent=event.endpoint?'Endpoint · nullity 2':'+2 at '+event.s.toFixed(2);
        button.title=event.endpoint?'Both hidden fields vanish at the destination: hidden nullity two, not an index contribution.':'Both hidden fields vanish here. Passing adds two to the index.'+(event.surface?' The surface field also vanishes, contributing one more in the main view.':'');
        button.setAttribute('aria-label',button.title+' Distance '+event.s.toFixed(3)+'.');
        $('events').append(button);
      }
    }
    function refresh(){
      const data=context.data;
      $('position').disabled=!data;$('play').disabled=!data||!!study||(!options.onPlay&&!options.onPause);
      $('play').title=study?'Close the length study to animate traversal; the studied endpoints stay pinned while pushing.':'';
      $('field-ring-legend').hidden=!!study;
      $('gain-value').textContent=(study?.type==='hidden'?gain*study.magnification:gain).toFixed(2)+'×';
      $('play').textContent=context.playing?'Pause traversal':data&&context.position>=data.length?'Replay traversal':'Play traversal';
      $('play').setAttribute('aria-pressed',String(!!context.playing));
      let message=context.error?'Field data unavailable: '+context.error:'Select a geodesic in the picker above.';
      if(data&&profile){
        const description=describePosition(data,context.position),state=description.state,s=state.s,percent=Math.round(100*s/data.length),passed=contributionBefore(data,s);
        const requested=Number.isFinite(context.requestedPosition)?clamp(context.requestedPosition,0,data.length):s;
        $('position').value=Math.round(100000*requested/data.length);$('position-value').textContent=percent+'% · distance '+s.toFixed(3);
        $('position').setAttribute('aria-valuetext',(requested!==s?'Requested '+Math.round(100*requested/data.length)+' percent; showing ':'')+percent+' percent; distance '+s.toFixed(3)+'; '+passed+' off-surface index contributions passed');
        const surfaceEvent=description.surfaceEvent;message=description.message;
        message+=' Off-surface contribution passed: '+passed+' / '+profile.hiddenIndex+'.';
        $('scale').textContent='h(s) = '+state.h.toPrecision(4)+' · magnified with one fixed whole-path scale. Both fields satisfy h″ + '+data.curvature+' h = 0, h(0) = 0, h′(0) = 1. Longitudinal and transverse drawing scales differ.';
        for(const button of $('events').querySelectorAll('button')){
          const e=profile.events[Number(button.dataset.cutawayEvent)];
          button.classList.toggle('passed',!e.endpoint&&e.s<s-rounding(data));
          button.classList.toggle('at-event',!!state.event&&Math.abs(e.s-state.event.s)<=rounding(data));
          button.setAttribute('aria-pressed',String(!!state.event&&Math.abs(e.s-state.event.s)<=rounding(data)));
        }
        root.dataset.position=String(s);root.dataset.hidden=String(state.h);root.dataset.hiddenPassed=String(passed);
        root.dataset.focus=state.event?state.event.endpoint?'endpoint':'hidden':surfaceEvent?'surface':'none';
        canvas.setAttribute('aria-label','Local straightened cutaway at '+percent+' percent. '+message+' Drag or use arrow keys to rotate.');
      }else{
        $('position-value').textContent='—';$('scale').textContent='Choose a path above; this position control will then follow the main traversal slider.';
        canvas.setAttribute('aria-label',message);
        root.dataset.position='0';root.dataset.hidden='';root.dataset.hiddenPassed='0';root.dataset.focus='none';
      }
      root.dataset.deformation=deformation?.type||'';
      root.dataset.study=study?.type||'';
      root.dataset.studyEnd=study?String(study.T):'';
      root.dataset.deformationMagnification=deformation?.type==='hidden'?String(gain*deformation.magnification):'';
      root.dataset.hiddenDirection=study?.hiddenDirection?String(study.hiddenDirection):'';
      if(data&&study){
        const end=study.T===data.length?'y':'p(T)';
        message=study.type==='hidden'?
          `Finite off-surface push${study.hiddenDirection?' in hidden direction '+study.hiddenDirection:''} from x to ${end}; both endpoints are pinned. Hidden displacement is shown ×${(gain*study.magnification).toFixed(1)}. Arrows and the shaded band show the push field; faint strands are Jacobi-field context.`:
          `The segment from x to ${end} has both endpoints pinned. Its surface deformation is shown on the torus; this cutaway marks the studied segment.`;
        if(study.type==='hidden'&&!deformation)message=`The segment from x to ${end} has both endpoints pinned. The finite hidden push${study.hiddenDirection?' in direction '+study.hiddenDirection:''} is not yet available; faint strands show the Jacobi fields.`;
        $('scale').textContent=study.type==='hidden'?
          'The bright curve uses actual normal coordinates (y₁, y₂), with the labelled drawing magnification. Its ambient length is measured in the chosen tube metric, not from the length of this straightened picture.':
          'Forward motion and two off-surface coordinates are shown here. The sideways surface push appears in the main surface view.';
        canvas.setAttribute('aria-label',message+' Drag or use arrow keys to rotate.');
      }
      $('note').textContent=study?
        'The bright finite push and its length measurement belong to the local metric neighborhood. Faint amber and purple strands show infinitesimal Jacobi fields for context. The coordinates straighten the original path and magnify transverse motion; drawing lengths are not manifold lengths.':DEFAULT_NOTE;
      // Only announce meaningful descriptions, not a repeated identical event.
      if($('readout').textContent!==message)$('readout').textContent=message;
    }
    function frame(w,h){
      // The longitudinal axis starts horizontal. Rotating the two normal axes
      // around it exposes their plane without making forward motion ambiguous.
      // The default study angle separates A and B without making A=B almost
      // edge-on. A camera that the audience has turned is always preserved.
      const displaySpin=cameraTouched?spin:interpolate(spin,STUDY_SPIN,view.local);
      const back=unit([Math.sin(tilt),-Math.cos(tilt)*Math.cos(displaySpin),Math.cos(tilt)*Math.sin(displaySpin)]);
      const right=unit([1-back[0]*back[0],-back[0]*back[1],-back[0]*back[2]]),up=cross(back,right);
      // The active x→p segment occupies the pane, instead of reserving most of
      // it for the unused original tail. Drawing scales are not metric lengths.
      // Fit the complete, normalized whole-path envelope, including its guide
      // discs. The old width cap made tall panes retain a tiny field drawing.
      // This coordinate illustration already uses separate longitudinal and
      // transverse scales: fitting the projected x/y extents independently
      // lets either pane dimension grow without changing field values, their
      // signs, or the audience's camera angle. Fit at unit gain so the manual
      // magnification control continues to enlarge the fields afterward.
      const guideRadius=1.1,globalScaleX=Math.max(1,w-100)/
        (9*right[0]+2*guideRadius*Math.hypot(right[1],right[2])),
        globalScaleY=Math.max(1,h-78)/(2*guideRadius*Math.hypot(up[1],up[2]));
      const localCy=(34+h-28)/2,cx=w*.5,cy=interpolate((40+h-38)/2,localCy,view.local);
      const longitudinal=interpolate(globalScaleX,Math.max(1,(w-100)/(9*right[0])),view.local);
      const finiteRadius=FINITE_RADIUS*FINITE_MAGNIFICATION;
      const contextRadial=Math.max(8,Math.min((w-70)/10,(h-95)/5)),
        finiteRadial=Math.max(1,Math.min((w-70)/10,Math.max(1,Math.min(localCy-34,h-28-localCy))/finiteRadius));
      // Blend screen transforms, not field data. These coefficients depend on
      // the fixed whole-path envelope, never the traveler or incoming finite
      // result, so pressing/releasing or reversing a transition cannot jump.
      const radialX=(1-view.local)*globalScaleX+view.local*contextRadial+view.hidden*(finiteRadial-contextRadial),
        radialY=(1-view.local)*globalScaleY+view.local*contextRadial+view.hidden*(finiteRadial-contextRadial);
      viewFraming={start:0,end:transition?1/view.inverseEnd:study?.T??context.data?.length??0,mode:transition?'transition':view.local?'study-segment':'whole-path',
        targetMode:viewTarget?.local?'study-segment':'whole-path',progress:view.local,pushClipped:false};
      return point=>({x:cx+longitudinal*point[0]*right[0]+radialX*(point[1]*right[1]+point[2]*right[2]),
        y:cy-radialY*(point[1]*up[1]+point[2]*up[2]),z:dot(point,back)});
    }
    function draw(){
      if(!c||!active())return;
      advanceTransition();
      const box=canvas.getBoundingClientRect(),w=Math.max(1,box.width),h=Math.max(1,box.height),ratio=Math.min(win.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
      c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
      const background=c.createLinearGradient(0,0,w,h);background.addColorStop(0,'#0a2331');background.addColorStop(1,'#153c47');c.fillStyle=background;c.fillRect(0,0,w,h);
      c.font='10px system-ui, sans-serif';c.fillStyle=COLORS.muted;c.textAlign='left';
      c.fillText(transition?(viewTarget.local?'ZOOMING TO PINNED SEGMENT · x → p(T)':'RETURNING TO WHOLE PATH'):
        study?.type==='hidden'?deformation?`FINITE HIDDEN PUSH${study.hiddenDirection?' · direction '+study.hiddenDirection:''} · transverse ×${(gain*study.magnification).toFixed(1)}`:'PINNED STUDY SEGMENT · hidden push pending':
        study?'PINNED STUDY SEGMENT · surface push in main view':'LOCAL COORDINATE CUTAWAY · (s, y₁, y₂)',12,20);
      if(!context.data||!profile){
        c.font='12px system-ui, sans-serif';c.textAlign='center';c.fillStyle=COLORS.text;
        c.fillText(context.error?'This cutaway is waiting for a geodesic.':'Select a geodesic above.',w/2,h/2-6);
        c.fillText(context.error?'See the message below.':'Its two off-surface fields will appear here.',w/2,h/2+14);return;
      }
      const data=context.data,current=fieldState(data,context.position),project=frame(w,h);
      const finite=frameDeformation?.type==='hidden'&&frameDeformation.T===frameStudy?.T?frameDeformation:null;
      const interval=viewFraming.end,displayEnd=Math.min(data.length,interval*1.12),local=view.local;
      const xAt=s=>9*(s/interval-.5);
      const point=(s,a,b)=>[xAt(s),a,b],displacement=h=>gain*h/profile.maximum;
      const line=(a,b,color,width=1,dashed=false)=>{
        const p=project(a),q=project(b);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dashed?[4,5]:[]);c.stroke();c.setLineDash([]);
      };
      const ring=(s,r,color,width=1,dashed=false,fill=false)=>{
        c.beginPath();for(let i=0;i<=64;i++){const a=TAU*i/64,p=project(point(s,r*Math.cos(a),r*Math.sin(a)));if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);}
        if(fill){c.fillStyle=color;c.fill();}else{c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dashed?[3,5]:[]);c.stroke();c.setLineDash([]);}
      };
      const text=(value,p,color=COLORS.text,align='center',dy=0,edge=false)=>{
        const q=project(p),width=c.measureText(value).width;
        // Tail annotations leave with their points instead of collecting at an edge.
        if(!edge&&(q.x<0||q.x>w))return;
        const left=align==='right'?12+width:align==='center'?12+width/2:12;
        const right=align==='left'?w-12-width:align==='center'?w-12-width/2:w-12;
        c.fillStyle=color;c.textAlign=align;c.fillText(value,clamp(q.x,left,right),clamp(q.y+dy,34,h-28));
      };
      // Faint coordinate guides are independent of the fields and stay open at
      // a focus; colored traces and the solid traveler ring carry field sizes.
      c.globalAlpha=1-.78*local;
      for(const fraction of [0,.25,.5,.75,1])ring(fraction*interval,gain,'#a9c8c61b',.8,true);
      line(point(0,0,0),point(displayEnd,0,0),'#a7d8cb70',1.2,true);
      line(point(0,0,0),point(current.s,0,0),'#dff9e9',2);
      const all=[...profile.samples.filter(p=>p.s<=displayEnd),fieldState(data,displayEnd),current].sort((a,b)=>a.s-b.s).filter((p,i,a)=>!i||p.s>a[i-1].s);
      // Fixed launch angles keep signed identity through a focus. In
      // particular the solid positive axes exchange sides with dashed negatives.
      for(const angle of [Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4])for(let i=1;i<all.length;i++){
        const a=all[i-1],b=all[i],ra=displacement(a.h),rb=displacement(b.h);
        line(point(a.s,ra*Math.cos(angle),ra*Math.sin(angle)),point(b.s,rb*Math.cos(angle),rb*Math.sin(angle)),b.s<=current.s?'#b2d9ce4a':'#a3c5c320',.8);
      }
      for(const [axis,color]of [[0,COLORS.a],[1,COLORS.b]])for(const sign of [-1,1])for(let i=1;i<all.length;i++){
        const a=all[i-1],b=all[i],ra=sign*displacement(a.h),rb=sign*displacement(b.h);
        line(point(a.s,axis===0?ra:0,axis===1?ra:0),point(b.s,axis===0?rb:0,axis===1?rb:0),color+(b.s<=current.s?'e6':'48'),sign===1?2.3:1.4,sign<0);
      }
      for(const e of profile.events){
        c.globalAlpha=(1-.78*local)*(frameStudy&&e.s>frameStudy.T+rounding(data)?1-local:1);
        if(!c.globalAlpha)continue;
        const p=project(point(e.s,0,0));c.beginPath();c.arc(p.x,p.y,3.5,0,TAU);c.fillStyle=COLORS.a;c.fill();
        text(e.endpoint?'nullity 2':'+2',point(e.s,0,0),e.endpoint?'#d6c3ff':COLORS.a,'center',23);
      }
      for(const e of data.events||[])if(e.surface&&!e.hidden){
        c.globalAlpha=(1-.78*local)*(frameStudy&&e.s>frameStudy.T+rounding(data)?1-local:1);
        if(c.globalAlpha)text(surfaceEventLabel(e,data.length),point(e.s,0,0),COLORS.surface,'center',38);
      }
      if(local<1){
        c.globalAlpha=1-local;
        const radial=displacement(current.h);
        ring(current.s,gain*1.1,'#d1e6de12',1,false,true);
        ring(current.s,Math.abs(radial),'#edf7e680',1.7);
        for(const [axis,color,label]of [[0,COLORS.a,'Off surface A'],[1,COLORS.b,'Off surface B']]){
          const tip=point(current.s,axis===0?radial:0,axis===1?radial:0),p=project(tip);
          line(point(current.s,0,0),tip,color,3);c.beginPath();c.arc(p.x,p.y,4,0,TAU);c.fillStyle=color;c.fill();
          const guide=point(current.s,axis===0?gain*1.32:0,axis===1?gain*1.32:0);
          text(label,guide,color,axis===0?'right':'left',axis===0?-9:14);
        }
        const traveler=project(point(current.s,0,0));c.beginPath();c.arc(traveler.x,traveler.y,current.zero?5.2:3.5,0,TAU);c.fillStyle=current.zero?'#fff7d4':'#edfff0';c.fill();
        text('x · 0',point(0,0,0),COLORS.muted,'left',-14);text('y · '+data.length.toFixed(2),point(data.length,0,0),COLORS.muted,'right',-14);
      }
      if(frameStudy&&local>0){
        c.globalAlpha=local;
        // The white dashed reference is the original prefix. The finite push
        // shares its two pinned endpoints; it is not another Jacobi strand.
        line(point(0,0,0),point(frameStudy.T,0,0),'#e1e9e19c',1.6,true);
        if(frameStudy.T<data.length)line(point(frameStudy.T,0,0),point(displayEnd,0,0),'#9db7b035',1.1,true);
        if(frameStudy.type==='hidden'){
          const scale=gain*frameStudy.magnification;
          // Fixed normal-coordinate axes remain independent as the finite
          // curve moves; a direction can look edge-on until the viewer turns.
          const axes=frameStudy.hiddenDirection?[[0,COLORS.direction1,'Direction 1'],[1,COLORS.direction2,'Direction 2']]:[[0,COLORS.a,'A axis'],[1,COLORS.b,'B axis']];
          for(const [axis,color,label]of axes){
            const radius=FINITE_RADIUS*scale,origin=point(frameStudy.T/2,0,0);
            const tip=point(frameStudy.T/2,axis===0?radius:0,axis===1?radius:0);
            line(point(frameStudy.T/2,axis===0?-radius:0,axis===1?-radius:0),tip,color+'70',1,true);
            text(label,tip,color,axis===0?'right':'left',axis===0?-7:13);
            line(origin,tip,color+'a0',1.3);
          }
          const samples=finite?.samples||[];
          if(finite?.maxRadius>1e-12){
            const color=finiteColor(finite);
            // The ruled band and transverse arrows show the finite Hessian
            // push, separately from the faint Jacobi strands. Use signed
            // coordinates so later mode lobes cross the baseline naturally.
            c.fillStyle=color+'28';
            for(let i=1;i<samples.length;i++){
              const a=samples[i-1],b=samples[i];
              if(norm(a.y)<=1e-12&&norm(b.y)<=1e-12)continue;
              const corners=[point(a.s,0,0),point(a.s,scale*a.y[0],scale*a.y[1]),
                point(b.s,scale*b.y[0],scale*b.y[1]),point(b.s,0,0)].map(project);
              c.beginPath();corners.forEach((p,j)=>{if(j)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});
              c.closePath();c.fill();
            }
            // Arclength bins keep a long collar from attracting all vectors
            // merely because the physical input has more samples there.
            for(let bin=0;bin<20;bin++){
              let selected=null,radius=1e-12;
              for(const p of samples)if(p.s>0&&p.s<frameStudy.T&&Math.min(19,Math.floor(20*p.s/frameStudy.T))===bin){
                const value=norm(p.y);if(value>radius){radius=value;selected=p;}
              }
              if(!selected)continue;
              const a=project(point(selected.s,0,0)),b=project(point(selected.s,scale*selected.y[0],scale*selected.y[1]));
              const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
              if(length<3)continue;
              const head=Math.min(7,.24*length),ux=dx/length,uy=dy/length;
              c.strokeStyle=color+'c0';c.lineWidth=1.7;c.setLineDash([]);
              c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
              c.beginPath();c.moveTo(b.x-head*ux-.5*head*uy,b.y-head*uy+.5*head*ux);
              c.lineTo(b.x,b.y);c.lineTo(b.x-head*ux+.5*head*uy,b.y-head*uy-.5*head*ux);c.stroke();
            }
          }
          for(let i=1;i<samples.length;i++){
            const a=samples[i-1],b=samples[i];
            line(point(a.s,scale*a.y[0],scale*a.y[1]),point(b.s,scale*b.y[0],scale*b.y[1]),finiteColor(finite||frameStudy),3);
          }
          viewFraming.pushClipped=samples.some(p=>{const q=project(point(p.s,scale*p.y[0],scale*p.y[1]));return q.x<12||q.x>w-12||q.y<30||q.y>h-23;});
          const largest=finite?.samples.reduce((a,b)=>norm(a.y)>=norm(b.y)?a:b);
          if(finite?.maxRadius>1e-12)text('Finite push'+(finite.hiddenDirection?' · direction '+finite.hiddenDirection:''),point(largest.s,scale*largest.y[0],scale*largest.y[1]),finiteColor(finite),'center',20);
        }
        for(const [s,color,label,align]of [[0,COLORS.surface,'x · pinned','left'],
          [frameStudy.T,'#ffe1a4',frameStudy.T===data.length?'y · pinned':'p(T) · pinned','right']]){
          const p=project(point(s,0,0));c.beginPath();c.arc(p.x,p.y,4.7,0,TAU);c.fillStyle=color;c.fill();
          c.strokeStyle='#fff7e1';c.lineWidth=1.2;c.stroke();text(label,point(s,0,0),color,align,-15);
        }
        if(data.length-frameStudy.T>data.length*.06)text('tail to y →',point(displayEnd,0,0),'#9bb9bd90','right',18,true);
      }
      root.dataset.framing=viewFraming.mode;root.dataset.displayEnd=String(viewFraming.end);root.dataset.pushClipped=String(viewFraming.pushClipped);
      root.dataset.transitionProgress=String(viewFraming.progress);root.dataset.targetFraming=viewFraming.targetMode;
      c.globalAlpha=1;
      c.fillStyle=viewFraming.pushClipped?COLORS.a:COLORS.muted;c.textAlign='center';c.font='9px system-ui, sans-serif';c.fillText(viewFraming.pushClipped?'Push exceeds frame · reduce magnification':w<650?'Drag to turn · faint discs are coordinate guides':'Drag to turn · arrow keys · forward direction s is straightened; transverse sizes are magnified',w/2,h-11);
    }
    function seek(s){
      if(!context.data)return;
      const requested=clamp(s,0,context.data.length);context.playing=false;
      // A coordinated study can keep its exact displayed endpoint while its
      // next requested mode is checked. The thumb still follows the pointer.
      if(options.onSeek?.(requested)===true)context.requestedPosition=requested;
      else{context.position=requested;context.requestedPosition=null;}
      refresh();draw();
    }
    function beginCameraMove(){
      advanceTransition();
      if(!cameraTouched)spin=interpolate(spin,STUDY_SPIN,view.local);
      cameraTouched=true;
    }
    function stopDrag(event){if(event?.pointerId!==undefined&&dragging?.id!==event.pointerId)return;dragging=null;}
    listen($('position'),'input',()=>seek(context.data?context.data.length*Number($('position').value)/100000:0));
    listen($('gain'),'input',()=>{gain=Number($('gain').value)/100;refresh();draw();});
    listen($('play'),'click',()=>{if(!context.data||study)return;if(context.playing)options.onPause?.();else options.onPlay?.();});
    listen($('reset'),'click',()=>{spin=DEFAULT_SPIN;tilt=DEFAULT_TILT;cameraTouched=false;gain=1;$('gain').value=100;refresh();draw();});
    listen($('events'),'click',event=>{const button=event.target.closest?.('button[data-cutaway-event]');if(button&&profile)seek(profile.events[Number(button.dataset.cutawayEvent)].s);});
    canvas.style.touchAction='none';
    listen(canvas,'pointerdown',event=>{if(!active()||dragging||event.isPrimary===false||event.button!==0)return;dragging={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});});
    listen(canvas,'pointermove',event=>{if(!dragging||dragging.id!==event.pointerId)return;if(!active()||event.buttons===0){stopDrag();return;}beginCameraMove();spin+=(event.clientX-dragging.x)*.01;tilt=clamp(tilt+(event.clientY-dragging.y)*.008,-1.05,1.05);dragging.x=event.clientX;dragging.y=event.clientY;draw();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,stopDrag);
    for(const type of ['blur','pagehide'])listen(win,type,()=>stopDrag());
    listen(canvas,'keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;if(event.key!=='Home')beginCameraMove();if(event.key==='ArrowLeft')spin-=.15;else if(event.key==='ArrowRight')spin+=.15;else if(event.key==='ArrowUp')tilt=clamp(tilt-.12,-1.05,1.05);else if(event.key==='ArrowDown')tilt=clamp(tilt+.12,-1.05,1.05);else{spin=DEFAULT_SPIN;tilt=DEFAULT_TILT;cameraTouched=false;}event.preventDefault();draw();});
    listen(doc,'visibilitychange',()=>{if(doc.hidden){stopDrag();settleView();}else draw();});
    if(motionPreference?.addEventListener)listen(motionPreference,'change',()=>{if(motionPreference.matches){settleView();draw();}});
    const observer=win.ResizeObserver?new win.ResizeObserver(draw):null;observer?.observe(canvas);
    refresh();
    return {getState,setContext(next={}){
      if(destroyed)return;
      const previous=context;context={...context,...next};
      if(!active()||previous.data!==context.data)stopDrag();
      if(previous.data!==context.data){
        if(!Object.prototype.hasOwnProperty.call(next,'requestedPosition'))context.requestedPosition=null;
        if(!Object.prototype.hasOwnProperty.call(next,'deformation'))context.deformation=null;
        if(!Object.prototype.hasOwnProperty.call(next,'study'))context.study=null;
      }
      if(context.data!==deformationData||context.deformation!==deformationSource){
        deformationData=context.data;deformationSource=context.deformation;
        deformation=context.data?prepareDeformation(context.data,context.deformation):null;
      }
      study=context.data?prepareStudy(context.data,context.study)||deformation:null;
      updateView(previous);
      if(active()&&context.data!==profileData){profileData=context.data;profile=context.data?prepareProfile(context.data):null;updateEvents();}
      if(active()&&(previous.active!==context.active||previous.data!==context.data||previous.position!==context.position||previous.playing!==context.playing||previous.error!==context.error||previous.deformation!==context.deformation||previous.study!==context.study)){refresh();draw();}
      else if(active()&&previous.requestedPosition!==context.requestedPosition)refresh();
    },destroy(){destroyed=true;stopAnimation();transition=null;observer?.disconnect();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);}};
  }
  return {create,fieldState,prepareProfile,prepareDeformation,contributionBefore,eventsOf,surfaceEventLabel,describePosition};
});
