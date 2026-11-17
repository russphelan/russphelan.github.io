/* A populated coordinate neighborhood of the annulus and its moving 3D scan.
 * The main construction supplies every frame; there is no independent clock.
 * The longitudinal view is a projection of S1 x D2 x I, not a 4D embedding. */
(function(root,factory){
  'use strict';
  const math=typeof module==='object'&&module.exports?require('./neck-explanation-math.js'):root.GeodesicNeckMath;
  const api=factory(math);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicNeckExplanation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const TAU=2*Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const C={gold:'#f4c56c',teal:'#6ce5c7',surface:'#42e3c0',reference:'#ff9b85',blue:'#83c7ef',violet:'#c6adff',ink:'#102d39',muted:'#a4bdc6'};
  const distance=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  function describe(context){
    if(!context.ready&&context.phase==='idle')return {stage:'Join the surrounding space',message:'Choose Add. Watch matching neighborhoods join around the gold surface, then scan through the neck.',surface:'Gold: the torus surface',ambient:'Blue and violet: its surroundings'};
    if(!context.ready)return {stage:'Preparing the neighborhoods',message:'Both views follow the same construction slider as the torus.',surface:'The joining surface',ambient:'Its surrounding neighborhood'};
    if(context.geometry<.14)return {stage:'Preview the neighborhoods at the cuts',message:'The colored neighborhoods preview the planned cut boundaries. The construction first removes the marked discs inside their four-dimensional balls.',surface:'The planned surface boundary',ambient:'A preview of the surrounding boundary'};
    if(context.geometry<.36)return {stage:'Expose the two neighborhoods',message:'The gold boundary belongs to the surface. The colored landmarks mark nearby points in the surrounding space.',surface:'A circle left by the removed disc',ambient:'A neighborhood inside the 3D boundary'};
    if(context.geometry<.60)return {stage:'Match all around the loop',message:'Corresponding points match throughout each D² disc and around the entire S¹ loop. Gold marks the centers of these normal discs.',surface:'Matching surface boundaries',ambient:'Matching ambient neighborhoods'};
    if(context.joinProgress<1)return {stage:'The whole neighborhoods join',message:'All the numbered normal discs match together around the loop, including their interiors. Their gold centers form the surface loop inside this three-dimensional neighborhood.',surface:'Loops build the joining annulus',ambient:'3D sections build the 4D neck'};
    return {stage:'Scan the completed neck',message:'Move the scan position to inspect the bridge. Each gold circle lies inside a populated 3D section of the surrounding neck.',surface:'Annulus joining the tori',ambient:'Neighborhood of that annulus in the 4D neck'};
  }
  function create(root,{onChange=()=>{},onInspect=()=>{}}={}){
    if(!root||typeof root.querySelector!=='function'||!M)throw new TypeError('A neck explanation container and coordinate model are required.');
    const doc=root.ownerDocument,win=doc.defaultView,prefix=(root.id||'neck-explanation')+'-';
    root.classList.add('neck-explanation');
    root.innerHTML=`
      <div class="neck-topline"><h2>Gluing the surrounding space</h2><button type="button" class="neck-link-toggle" data-neck="link-toggle" aria-pressed="true" aria-controls="${prefix}linked-help">Link the views</button></div>
      <p class="neck-phase" data-neck="stage"></p>
      <div class="neck-canvas-wrap neck-overview-wrap"><canvas data-neck="overview" width="600" height="170" role="img" aria-label="Matching populated neighborhoods join around the gold surface."></canvas></div>
      <div class="neck-scan-strip" role="group" aria-label="Sections along the neck">${[0,25,50,75,100].map(n=>`<button type="button" data-neck="station-${n}" aria-label="Scan ${n} percent along the neck" title="Scan ${n}%"><i aria-hidden="true"></i><span>${n}%</span></button>`).join('')}</div>
      <div class="neck-canvas-wrap neck-scanner-wrap"><canvas data-neck="canvas" width="600" height="300" role="img" aria-label="A populated three-dimensional neighborhood around the gold surface circle."></canvas><div class="neck-coordinate-label"><span data-neck="coordinate-label">3D scan · neighborhood inside S³</span><span class="neck-marker-key"><span><i class="neck-surface-swatch" aria-hidden="true"></i>Green: same surface point</span><span class="neck-reference-key"><i class="neck-reference-swatch" aria-hidden="true"></i>Coral 1–6: off-surface references</span></span><span class="neck-link-explanation" id="${prefix}linked-help" data-neck="link-caption"><strong data-neck="link-status"></strong><span>Upper view compresses one hidden direction.</span></span></div></div>
      <div class="neck-scan-controls"><div class="neck-scan-label"><label for="${prefix}scan">Scan position</label><output data-neck="scan-value" for="${prefix}scan">0%</output><label class="neck-follow" for="${prefix}follow"><input id="${prefix}follow" data-neck="follow" type="checkbox" checked> Follow join</label></div><input id="${prefix}scan" data-neck="scan" type="range" min="0" max="100" step="0.1" value="0" aria-describedby="${prefix}scan-help"></div>
      <div class="neck-side-controls" role="group" aria-label="Choose the joining edge to follow"><span>Follow from</span><button type="button" data-neck="old" aria-pressed="true">Existing</button><button type="button" data-neck="new" aria-pressed="false">New summand</button><span class="neck-scan-help" id="${prefix}scan-help" data-neck="scan-help"></span></div>
      <p class="neck-message" data-neck="message" role="status" aria-live="polite"></p>
      <details class="neck-math"><summary>How to read this neighborhood</summary><dl class="neck-dimension-pair"><div><dt>Visible surface</dt><dd data-neck="surface"></dd></div><div><dt>Surrounding space</dt><dd data-neck="ambient"></dd></div></dl><p>Gold is the visible surface. The single green point lies on it and matches the green point in the torus and upper view. The six coral numbered markers lie off the surface, on the rims of sampled normal discs; they are reference points, not copies of the green point. Blue and violet mark two independent off-surface coordinates. These landmarks are coordinate guides, not Jacobi fields.</p><p>The upper view projects a small neighborhood S¹ × D² × I of the annulus. One combination of the two hidden coordinates is omitted by this projection. With Follow join enabled, the lower close-up shows the two current joining fronts in an exploded coordinate view. Matching filled and outlined landmarks identify throughout the D² × S¹ neighborhoods. Numbered normal discs sample equally spaced positions around the entire loop; the surrounding lattice and interior threads connect them into one neighborhood. Their normal discs retain their extent; the separation is a display convention, not metric distance or Jacobi focusing. Once joined, the camera magnifies smoothly into the scanner, which shows the full three-dimensional neighborhood S¹ × D² at the teal section, with a wedge opened to reveal its interior.</p><p>Each small transverse disc is D² × {θ}; its center belongs to {0} × S¹. Every point of every normal disc matches, for every θ around the loop. These normal discs extend off the surface. They are different from the discs removed from the tori, which lie within the surface and leave the gold boundary circles.</p><p>The neighborhood sits inside the ambient neck: S¹ × I ⊂ S³ × I. It is not the entire four-dimensional neck. Each section belongs to S³; its coordinate picture is a stereographic view with one point omitted. The round gold loop is a normalized coordinate picture of the actual collar section, whose shape is shown in the main torus view. Sizes here are illustrative, not the metric used for the Jacobi fields.</p><p>The construction slider drives every part of the close-up, including alignment, identification and the return to scanning. The short highlighted paths are coordinate guides illustrating continuity, not computed geodesics. Moving Scan position selects manual inspection immediately; Follow join returns to the construction close-up. An unfinished gap cannot yet be scanned.</p><p>Opening the optional symmetry study selects manual section inspection.</p><button type="button" data-neck="symmetry" aria-expanded="false">Show the symmetry</button><div class="neck-symmetry-controls" data-neck="symmetry-panel" hidden><label for="${prefix}reversal">Reverse both hidden directions <output data-neck="reversal-value">0%</output></label><input id="${prefix}reversal" data-neck="reversal" type="range" min="0" max="100" step="1" value="0"><p>The colored neighborhood turns while the gold surface stays fixed. We choose the metric to respect this symmetry, so a geodesic initially tangent to the fixed surface stays on it.</p></div></details>
      <svg class="neck-link-callout" data-neck="link-callout" aria-hidden="true" focusable="false"><path data-neck="link-frames" class="neck-link-frames"/><path data-neck="link-connectors" class="neck-link-connectors"/></svg>`;
    const $=name=>root.querySelector('[data-neck="'+name+'"]');
    const canvas=$('canvas'),overview=$('overview'),contexts={canvas:canvas.getContext('2d'),overview:overview.getContext('2d')};
    const material=M.sampleMaterial(.38,24,8),circle=M.sampleCircle(96),tube=M.sampleNeighborhood(.38,32,12);
    const neighborhoodOutline=tube.circles.flat();
    // Equal samples around S¹, with interior as well as boundary points in D².
    // These are immutable coordinate guides; construction never changes them.
    const sections=M.matchingSections(.38,6,2,8);
    const strands=sections.flatMap(section=>[
      section.landmarks.find(p=>p.kind==='interior'&&p.normalIndex===0),
      // Opposite normal offsets stay visibly separate in the upper projection.
      section.landmarks.find(p=>p.kind==='boundary'&&p.normalIndex===6)
    ]);
    const overviewStrands=strands.filter((_,i)=>Math.floor(i/2)%2===0);
    const innerThreads=[[.19,0],[0,.19],[-.19,0],[0,-.19]].map(([u,v])=>({u,v,
      curve:Array.from({length:65},(_,i)=>M.project(M.point(TAU*(i%64)/64,u,v)))}));
    let context={active:false,ready:false,geometry:0,joinProgress:0,phase:'preparing',paused:true,fromCount:1,constructionId:null};
    const state={side:'old',following:true,station:null,symmetry:false,reversal:0,linked:true};
    let linkedCache=null,linkedKey=null;
    let destroyed=false,signature='',scannerCache=null,scannerAngle=null;const listeners=[];
    const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
    const active=()=>!destroyed&&context.active&&!doc.hidden;
    const theta=()=>Number.isFinite(context.theta)?context.theta:Math.PI/4;
    const linkedSamples=()=>{
      const angle=state.symmetry?Math.PI*state.reversal/100:0,key=theta()+':'+angle;
      if(linkedKey!==key){
        linkedKey=key;const samples=M.linkedLandmarks(theta()),ca=Math.cos(angle),sa=Math.sin(angle);
        const rotate=p=>{const u=p.u*ca-p.v*sa,v=p.u*sa+p.v*ca,point=M.point(p.theta,u,v);return {...p,u,v,point,projected:M.project(point)};};
        linkedCache=angle?{featured:samples.featured.map(rotate),surrounding:samples.surrounding.map(rotate)}:samples;
      }
      return linkedCache;
    };
    const linkProgress=()=>M.linkProgress(context.geometry,context.joinProgress,{completed:!!context.completed});
    const frame=()=>M.scanState(context.joinProgress,{side:state.side,station:state.following?null:state.station});
    const joining=()=>M.joiningView(context.geometry,context.joinProgress,{following:state.following,completed:!!context.completed,ready:context.ready});
    const selection=()=>({side:state.side,theta:((theta()%TAU)+TAU)%TAU,station:frame().station,following:state.following,mode:joining().mode,scannerBlend:joining().scannerBlend});
    const update=(name,value)=>{if($(name).textContent!==value)$(name).textContent=value;};
    function prepare(target,key){
      const c=contexts[key];if(!c)return null;
      const box=target.getBoundingClientRect(),width=Math.max(1,box.width||300),height=Math.max(1,box.height||(key==='overview'?110:170));
      const ratio=Math.min(win?.devicePixelRatio||1,2),w=Math.round(width*ratio),h=Math.round(height*ratio);
      if(target.width!==w||target.height!==h){target.width=w;target.height=h;}
      c.setTransform(ratio,0,0,ratio,0,0);c.globalAlpha=1;c.clearRect(0,0,width,height);c.fillStyle=C.ink;c.fillRect(0,0,width,height);
      return {c,width,height};
    }
    function brushes(c,screen,labelSize=9){
      function path(points){c.beginPath();points.forEach((point,i)=>{const p=screen(point);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});}
      return {
        line(points,color,weight=1,dashed=false){if(points.length<2)return;path(points);c.strokeStyle=color;c.lineWidth=weight;c.setLineDash(dashed?[3,4]:[]);c.stroke();c.setLineDash([]);},
        polygon(points,color){if(points.length<3)return;path([...points,points[0]]);c.fillStyle=color;c.fill();},
        dot(point,color,radius=2.5,border=false){const p=screen(point);c.beginPath();c.arc(p.x,p.y,radius,0,TAU);c.fillStyle=color;c.fill();if(border){c.lineWidth=.8;c.strokeStyle='#e4f5ec';c.stroke();}},
        label(point,text,color,dx=4,dy=-4){const p=screen(point);c.font=labelSize+'px system-ui';c.textAlign='left';c.fillStyle=color;c.fillText(text,p.x+dx,p.y+dy);}
      };
    }
    const color=(p,alpha=1)=>Math.abs(p.u)>=Math.abs(p.v)?`rgba(131,199,239,${alpha})`:`rgba(198,173,255,${alpha})`;
    const upperColor=(p,alpha=1)=>Math.abs(p.u)>=Math.abs(p.v)?`rgba(85,186,255,${alpha})`:`rgba(184,122,255,${alpha})`;
    function drawOverview(f){
      const prepared=prepare(overview,'overview');if(!prepared)return;
      const {c,width,height}=prepared,sx=width/5.65,sy=height/3.45;
      const screen=p=>({x:width*.5+sx*(1.45*p[0]+.30*p[1]),y:height*.55+sy*(.16*p[0]+.25*p[1]-.85*p[2]),depth:.18*p[0]+.9*p[1]+.3*p[2]});
      const alignment=clamp((context.geometry-.36)/.24,0,1),offset=1-alignment*alignment*(3-2*alignment);
      const b=brushes(c,screen),at=(t,u,v,s)=>{
        const p=M.materialSlice(t,u,v,s,.55);
        // Match the incoming piece's alignment stage: this is a modest display
        // translation, not a deformation of the ambient coordinate model.
        if(f.join===0&&s>=.5){p[0]+=.07*offset;p[2]+=.43*offset;}
        return p;
      },sections=[[0,f.oldFront],[f.newFront,1]],polygons=[];
      for(const [start,end]of sections){
        if(end<=start)continue;
        for(let j=0;j<4;j++)for(let i=0;i<24;i++){
          const a=TAU*i/24,z=TAU*(i+1)/24,s=start+(end-start)*j/4,t=start+(end-start)*(j+1)/4;
          const gold=[at(a,0,0,s),at(a,0,0,t),at(z,0,0,t),at(z,0,0,s)];
          polygons.push({points:gold,color:`rgba(244,197,108,${.35+.22*Math.max(0,Math.sin(a))})`});
          // An open upper wedge exposes the gold surface within the material.
          if(a>Math.PI*.15&&a<Math.PI*.82)continue;
          for(const radius of [-.38,.38]){
            const points=[at(a,radius,0,s),at(a,radius,0,t),at(z,radius,0,t),at(z,radius,0,s)];
            polygons.push({points,color:radius>0?'rgba(85,164,197,.23)':'rgba(144,112,199,.20)'});
          }
        }
      }
      polygons.sort((a,b)=>a.points.reduce((n,p)=>n+screen(p).depth,0)-b.points.reduce((n,p)=>n+screen(p).depth,0));
      opacity(c,state.linked ? .42+.58*linkProgress().expansion : 1,()=>{
      for(const polygon of polygons)b.polygon(polygon.points,polygon.color);
      for(const station of [0,f.oldFront,f.newFront,1]){
        const ring=(radius=0)=>Array.from({length:49},(_,i)=>at(TAU*i/48,radius,0,station));
        b.line(ring(-.38),'rgba(198,173,255,.38)',.8);b.line(ring(.38),'rgba(131,199,239,.45)',.8);
        b.line(ring(),C.gold,1.5);
      }
      });
      // Three well-spaced pairs keep each blue/purple strand legible even in
      // a short overview. The full populations remain visible in both views.
      for(const p of overviewStrands){
        const old=at(p.theta,p.u,p.v,f.oldFront),next=at(p.theta,p.u,p.v,f.newFront);
        for(const [start,end]of sections)b.line([at(p.theta,p.u,p.v,start),at(p.theta,p.u,p.v,end)],upperColor(p,.95),1.6);
        if(!f.complete)b.line([old,next],upperColor(p,.38),.8,true);
        b.dot(old,upperColor(p),2.3,true);if(!f.complete)b.dot(next,upperColor(p),2.3,true);
      }
      const ring=(station,radius=0)=>Array.from({length:49},(_,i)=>at(TAU*i/48,radius,0,station));
      // A ring marks the inspected 3D section; a filled spanning disc could be
      // mistaken for the locus of gluing.
      const plane=ring(f.station,.56);b.line(plane,C.teal,1.6);
      if(state.linked){
        const progress=linkProgress(),samples=linkedSamples(),scanning=joining().mode==='scanner';
        // A/B retain their own traces; surrounding points expand without
        // adding another dense fan of parallel lines to this projection.
        if(!scanning)for(const p of samples.featured){
          opacity(c,.9,()=>{
            for(const [start,end]of sections)b.line([at(p.theta,p.u,p.v,start),at(p.theta,p.u,p.v,end)],upperColor(p),1.7);
            if(!progress.identified)b.line([at(p.theta,p.u,p.v,f.oldFront),at(p.theta,p.u,p.v,f.newFront)],upperColor(p),1,true);
          });
        }
        if(scanning)drawLinkedPoints(c,p=>screen(at(p.theta,p.u,p.v,f.station)),{small:true});
        else{
          drawLinkedPoints(c,p=>screen(at(p.theta,p.u,p.v,f.oldFront)),{small:true});
          if(!progress.identified)drawLinkedPoints(c,p=>screen(at(p.theta,p.u,p.v,f.newFront)),{small:true,incoming:true});
        }
      }
      b.dot(at(theta(),0,0,f.station),C.surface,4,true);
      c.font=(width>=400?11:9)+'px system-ui';c.textAlign='left';c.fillStyle='#d8eae7';c.fillText(width<230?'Match all around':'Matching throughout D² × S¹',8,13,width*.63-12);
      c.fillStyle=C.teal;c.textAlign='right';c.fillText(width<230?'Scan':'3D scan',width-8,13,width*.30-8);
      c.font=(width>=400?10:8)+'px system-ui';c.fillStyle=C.muted;c.textAlign='left';c.fillText('Existing',8,height-6,width*.3);c.textAlign='right';c.fillText('New summand',width-8,height-6,width*.35);
      overview.setAttribute('aria-label',`${!context.ready||context.geometry<.14?'Preview of the planned cut neighborhoods. ':''}Projected neighborhood of the joining annulus. Gold surface inside blue and violet surrounding material. Interior and boundary landmarks match at six positions around the whole loop from both ends. ${Math.round(f.join*100)} percent of the neck joined. Teal scanner at ${Math.round(f.station*100)} percent along the neck. Its green surface point matches the torus and lower view. This is a local neighborhood, not the whole four-dimensional neck.`);
      if(state.linked){
        overview.setAttribute('aria-label',overview.getAttribute('aria-label')+' Linked blue A and purple B are the same off-surface points as in the enlarged lower view. Filled and outlined counterparts identify only when the neighborhoods meet. One hidden direction is compressed in this upper projection.');
        const points=ring(f.station,.42).map(screen);
        return {x:Math.min(...points.map(p=>p.x))-5,y:Math.min(...points.map(p=>p.y))-5,
          right:Math.max(...points.map(p=>p.x))+5,bottom:Math.max(...points.map(p=>p.y))+5};
      }
    }
    function scannerPoints(angle){
      if(scannerCache&&scannerAngle===angle)return scannerCache;
      const ca=Math.cos(angle),sa=Math.sin(angle);
      scannerCache=material.map(p=>({...p,projected:angle===0?p.projected:M.project(M.point(p.theta,p.u*ca-p.v*sa,p.u*sa+p.v*ca))}));scannerAngle=angle;return scannerCache;
    }
    function opacity(c,value,draw){
      if(value<=0)return;
      const previous=c.globalAlpha??1;c.globalAlpha=previous*value;
      try{draw();}finally{c.globalAlpha=previous;}
    }
    function drawLinkedPoints(c,screen,{incoming=false,small=false}={}){
      const samples=linkedSamples(),progress=linkProgress();
      const dot=(p,featured)=>{
        const q=screen(p),ink=C[p.color],radius=featured?(small?3.5:4.2):(small?1.8:2.5);
        if(featured)opacity(c,.35,()=>{c.beginPath();c.arc(q.x,q.y,radius+3.3,0,TAU);c.strokeStyle=ink;c.lineWidth=2;c.stroke();});
        c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.fillStyle=incoming?C.ink:ink;c.fill();c.strokeStyle=ink;c.lineWidth=1.4;c.stroke();
        if(featured){
          const dx=p.label==='A'?7:-12,dy=(p.label==='A')!==incoming?-8:15;
          c.font='600 '+(small?10:12)+'px system-ui';c.textAlign='left';c.fillStyle=C.ink;c.fillRect(q.x+dx-2,q.y+dy-10,12,13);
          c.fillStyle=ink;c.fillText(p.label,q.x+dx,q.y+dy);
        }
      };
      opacity(c,progress.expansion,()=>{for(const p of samples.surrounding)dot(p,false);});
      for(const p of samples.featured)dot(p,true);
    }
    function drawPopulation(c,screen,{alpha=1,inspecting=false,axes=0,labelSize=9,whole=0}={}){
      opacity(c,alpha,()=>{
        const b=brushes(c,screen,labelSize),rotation=inspecting&&state.symmetry?Math.PI*state.reversal/100:0,points=scannerPoints(rotation);
        // Joining keeps the complete near and far sides. The scanner cutaway
        // appears only as a local inspection aid during the final handoff.
        for(const source of tube.circles){
          if(whole===1){b.line(source,'rgba(131,199,239,.20)',.8);continue;}
          let run=[source[0]],lastLocal=null;
          for(let i=1;i<source.length;i++){
            const t=TAU*(i-.5)/(source.length-1),local=Math.abs(distance(t,theta()))<.40;
            if(lastLocal!==null&&local!==lastLocal){
              opacity(c,lastLocal?whole:1,()=>b.line(run,'rgba(131,199,239,.20)',.8));run=[source[i-1]];
            }
            run.push(source[i]);lastLocal=local;
          }
          opacity(c,lastLocal?whole:1,()=>b.line(run,'rgba(131,199,239,.20)',.8));
        }
        for(let i=0;i<tube.fibers.length;i++){
          const t=TAU*i/tube.fibers.length,local=Math.abs(distance(t,theta()))<.42;
          opacity(c,local?whole:1,()=>b.line(tube.fibers[i],'rgba(153,174,224,.18)',.7));
        }
        opacity(c,whole,()=>{for(const thread of innerThreads)b.line(thread.curve,color(thread,.28),.9);});
        const dots=points.filter(p=>p.kind==='ambient').sort((a,b)=>screen(a.projected).depth-screen(b.projected).depth);
        for(const p of dots){
          const local=Math.abs(distance(p.theta,theta()))<=.38,depth=clamp((screen(p.projected).depth+1.4)/2.8,0,1);
          opacity(c,local?whole:1,()=>b.dot(p.projected,color(p,.35+.6*depth),1.25+1.0*depth));
        }
        b.line(circle,'rgba(244,197,108,.28)',4);b.line(circle,C.gold,2);
        opacity(c,1-whole,()=>{
          const disc=Array.from({length:33},(_,i)=>M.project(M.point(theta(),.38*Math.cos(TAU*i/32),.38*Math.sin(TAU*i/32))));
          const core=M.circle(theta());
          for(let i=0;i<32;i++)b.polygon([core,disc[i],disc[i+1]],i<16?'rgba(131,199,239,.25)':'rgba(198,173,255,.25)');
          b.line(disc,'rgba(223,240,245,.66)',1.1);
          for(const p of points.filter(p=>p.kind==='ambient'&&Math.abs(distance(p.theta,theta()))<.01))b.dot(p.projected,color(p),2.6,true);
          opacity(c,axes,()=>{
            for(const [u,v,ink,label]of [[.47,0,C.blue,'u'],[0,.47,C.violet,'v']]){
              const tip=M.project(M.point(theta(),u,v)),a=screen(core),z=screen(tip),angle=Math.atan2(z.y-a.y,z.x-a.x);
              b.line([core,tip],ink,2);c.beginPath();c.moveTo(z.x,z.y);c.lineTo(z.x-5*Math.cos(angle-.5),z.y-5*Math.sin(angle-.5));c.moveTo(z.x,z.y);c.lineTo(z.x-5*Math.cos(angle+.5),z.y-5*Math.sin(angle+.5));c.strokeStyle=ink;c.stroke();b.label(tip,label,ink);
            }
          });
        });
        if(inspecting&&state.symmetry&&!state.linked){
          const featured=points.filter(p=>p.id==='ambient-3-2-0'||p.id==='ambient-3-2-4');
          featured.forEach((p,i)=>{b.dot(p.projected,i?C.violet:C.blue,4,true);b.label(p.projected,i?'B':'A',i?C.violet:C.blue);});
        }
      });
    }
    function drawNormalSections(c,screen,{alpha=1,incoming=false,labelSize=9,compact=false}={}){
      opacity(c,alpha,()=>{
        const b=brushes(c,screen,labelSize),center=screen([0,0,0]);
        // All six normal discs have equal visual weight. The joining is global;
        // no spotlight chooses a particular disc as an attachment locus.
        for(const section of sections){
          b.polygon(section.disc,'rgba(153,178,229,.055)');
          b.line(section.disc,'rgba(191,214,237,.48)',.9);
          for(let i=0;i<section.spokes.length;i++)b.line(section.spokes[i],i%2?'rgba(198,173,255,.24)':'rgba(131,199,239,.24)',.7);
          for(const p of section.landmarks){
            if(p.kind==='surface')continue;
            b.dot(p.projected,color(p,.8),p.kind==='interior'?1.55:1.8);
          }
          const marker=section.landmarks.find(p=>p.kind==='boundary'&&p.normalIndex===2),q=screen(marker.projected);
          c.beginPath();c.arc(q.x,q.y,compact?2.5:3.3,0,TAU);c.lineWidth=1.1;c.strokeStyle=C.reference;
          c.fillStyle=incoming?C.ink:C.reference;c.fill();c.stroke();
          const dx=q.x-center.x,dy=q.y-center.y,n=Math.hypot(dx,dy)||1;
          b.label(marker.projected,String(section.index+1),C.reference,7*dx/n-2,7*dy/n+3);
          b.dot(section.core,C.gold,2.1);
        }
      });
    }
    function drawSection(f,j){
      const prepared=prepare(canvas,'canvas');if(!prepared)return;
      const {c,width,height}=prepared,blend=j.scannerBlend,labelSize=width>=400?11:9;
      // Local coordinates and normal-disc radii stay fixed. Only the exploded
      // positions and the post-identification camera magnification change.
      const pairScale=Math.min(width*.15,height*.31),scanScale=Math.min(width*.29,height*.41);
      const scale=pairScale+(scanScale-pairScale)*blend,center=[width*.5,height*.56];
      const spread=width*.27*j.separation/.92*(1-blend),lift=height*.10*j.misalignment*(1-blend);
      const cy=Math.cos(.42),sy=Math.sin(.42),sp=Math.sin(.68),cp=Math.cos(.68);
      const project=(p,side=0)=>({x:center[0]+side*spread+scale*(cy*p[0]-sy*p[1]),y:center[1]-(side===1?lift:0)-scale*(sp*(sy*p[0]+cy*p[1])+cp*p[2]),depth:cp*(sy*p[0]+cy*p[1])-sp*p[2]});
      const left=p=>project(p,-1),right=p=>project(p,1),single=p=>project(p,0),scanning=j.mode==='scanner';
      if(scanning){drawPopulation(c,single,{inspecting:true,axes:1,labelSize});}
      else{
        // Interior and boundary correspondences at every sampled azimuth. All
        // are matched simultaneously; sparse guides prevent a solid line web.
        opacity(c,(1-blend)*(1-j.meeting),()=>{
          const b=brushes(c,p=>({x:p[0],y:p[1]}));
          for(const p of strands){const a=left(p.projected),z=right(p.projected);b.line([[a.x,a.y],[z.x,z.y]],color(p,.42),.65,true);}
        });
        opacity(c,state.linked ? .42+.58*linkProgress().expansion : 1,()=>{
          drawPopulation(c,left,{axes:blend,labelSize,whole:1-blend});
          drawPopulation(c,right,{alpha:j.rightOpacity,labelSize,whole:1-blend});
          drawNormalSections(c,left,{alpha:1-blend,labelSize,compact:width<400});
          drawNormalSections(c,right,{alpha:j.rightOpacity*(1-blend),incoming:true,labelSize,compact:width<400});
        });
        // Guide continuations sample every azimuth, both on and off the core.
        // They share the construction coordinate and are not geodesic data.
        opacity(c,j.guideOpacity,()=>{
          for(const section of sections)for(const [u,v,ink]of [[0,0,C.gold],[.19,0,C.blue],[0,.19,C.violet]]){
            const path=Array.from({length:17},(_,i)=>M.project(M.point(section.theta+.40*(i/16-.5),u,v)));
            brushes(c,left).line(path.slice(0,9),ink,1.3);brushes(c,right).line(path.slice(8),ink,1.3);
            if(j.meeting){const point=M.project(M.point(section.theta+.40*(j.guideProgress-.5),u,v));brushes(c,single).dot(point,ink,2.4,true);}
          }
        });
      }
      if(state.linked){
        if(scanning)drawLinkedPoints(c,p=>single(p.projected));
        else{
          if(!j.meeting){
            const b=brushes(c,p=>({x:p[0],y:p[1]}));
            for(const p of linkedSamples().featured){const a=left(p.projected),z=right(p.projected);b.line([[a.x,a.y],[z.x,z.y]],C[p.color],1,true);}
          }
          drawLinkedPoints(c,p=>left(p.projected));
          if(!j.meeting)drawLinkedPoints(c,p=>right(p.projected),{incoming:true});
        }
      }
      // One point on the gold core matches the main torus and upper view.
      // Keep it fully visible as the numbered ambient discs fade into scanning.
      brushes(c,scanning?single:state.side==='new'?right:left).dot(M.circle(theta()),C.surface,4.5,true);
      const title=scanning?`3D section · ${Math.round(f.station*100)}% along the neck`:j.mode==='preview'?'Preview: matching all around the loop':j.meeting?'Whole D² × S¹ neighborhoods identify':'Matching all around the loop';
      c.font=labelSize+'px system-ui';c.textAlign='left';c.fillStyle=C.teal;c.fillText(state.linked?'Same neighborhood, enlarged':title,8,14,width-16);
      c.font=(width>=400?10:8)+'px system-ui';
      if(scanning){c.fillStyle=C.gold;c.fillText('Gold: surface',8,height-8,width*.38);c.textAlign='right';c.fillStyle=C.muted;c.fillText('u, v: off surface',width-8,height-8,width*.58);}
      else if(j.meeting){c.fillStyle=C.muted;c.fillText(blend>.5?'Inspect one normal disc in the joined neighborhood':'Every numbered disc and its interior has matched',8,height-8,width-16);}
      else{
        c.fillStyle=C.muted;c.textAlign='left';c.fillText(width<230?'Filled: existing':'Filled markers: existing side',8,height-8,width*.47-10);
        c.textAlign='right';c.fillText(width<230?'Rings: new':'Outlined markers: new side',width-8,height-8,width*.47-10);
      }
      canvas.setAttribute('aria-label',scanning?`${!context.ready||context.geometry<.14?'Preview of a planned boundary neighborhood. ':''}Three-dimensional scanner at ${Math.round(f.station*100)} percent along the neck. A gold surface circle runs through a populated blue and violet neighborhood in the three-dimensional boundary S3. An opened wedge exposes the interior normal disc and its two independent off-surface coordinates. This is one normal disc highlighted within the whole three-dimensional neighborhood; matching occurred around the entire loop. The disc meets the gold circle at its center and is different from a disc removed from the torus. One green surface point matches the torus and upper view.${state.symmetry?' Symmetry reversal '+Math.round(state.reversal)+' percent turns the surrounding population while the gold surface stays fixed.':''}`:
        `${j.mode==='preview'||context.geometry<.14?'Preview. ':''}${j.meeting?'The two current joining fronts have identified into one populated three-dimensional neighborhood. All six normal discs and their interiors around the loop identify simultaneously; coordinate guide paths continue at every sampled position. The view smoothly magnifies into the scanner.':'Two populated three-dimensional neighborhoods at the existing and new joining fronts. Six equally emphasized normal discs, numbered 1 to 6, sample the entire circle. Matching interior and boundary landmarks throughout D2 times S1 align and approach together, including near and far sides. Filled and outlined markers distinguish corresponding points on the two copies. Their normal discs keep their extent while the exploded-view separation closes.'} One green point on the gold surface matches the torus and upper view. Coral numbered markers 1 to 6 lie off the surface on the normal-disc rims. Each normal disc is a transverse slice, not the locus of gluing. These are local coordinate neighborhoods inside S3, not the whole four-dimensional neck or Jacobi fields.`);
      if(state.linked){
        canvas.setAttribute('aria-label',canvas.getAttribute('aria-label')+' Linked blue A and purple B match the identical off-surface points above. The callout enlarges the selected upper section. Surrounding landmarks brighten together as joining progresses; they stay off the gold surface.');
        const projectSelected=scanning?single:state.side==='new'?right:left,points=neighborhoodOutline.map(projectSelected);
        return {x:Math.max(8,Math.min(...points.map(p=>p.x))-5),y:Math.max(22,Math.min(...points.map(p=>p.y))-5),
          right:Math.min(width-8,Math.max(...points.map(p=>p.x))+5),bottom:Math.min(height-22,Math.max(...points.map(p=>p.y))+5)};
      }
    }
    function drawCallout(upper,lower){
      if(!state.linked||!upper||!lower)return;
      const rootBox=root.getBoundingClientRect(),a=overview.getBoundingClientRect(),b=canvas.getBoundingClientRect();
      const local=(bounds,box)=>{const dx=(box.left||0)-(rootBox.left||0),dy=(box.top||0)-(rootBox.top||0);return {x:bounds.x+dx,y:bounds.y+dy,right:bounds.right+dx,bottom:bounds.bottom+dy};};
      const u=local(upper,a),l=local(lower,b),rect=r=>`M${r.x},${r.y}H${r.right}V${r.bottom}H${r.x}Z`;
      $('link-callout').setAttribute('viewBox',`0 0 ${Math.max(1,rootBox.width)} ${Math.max(1,rootBox.height)}`);
      $('link-frames').setAttribute('d',rect(u)+' '+rect(l));
      $('link-connectors').setAttribute('d',`M${u.x},${u.bottom}L${l.x},${l.y} M${u.right},${u.bottom}L${l.right},${l.y}`);
    }
    function draw(){if(!active())return;const f=frame(),upper=drawOverview(f),lower=drawSection(f,joining());drawCallout(upper,lower);}
    function refresh(notify=false){
      if(destroyed)return;
      const f=frame(),j=joining(),description=j.mode==='handoff'?{stage:'Whole neighborhoods identified',message:'Every normal disc and all its interior points have matched around the loop. The view now returns to inspecting one normal disc inside the joined neighborhood.',surface:'Annulus joining the tori',ambient:'One surrounding neighborhood across the join'}:describe(context);
      root.hidden=!context.active;root.dataset.active=String(context.active);root.dataset.ready=String(context.ready);root.dataset.phase=context.phase;root.dataset.side=state.side;root.dataset.station=String(f.station);root.dataset.following=String(state.following);root.dataset.mode=j.mode;root.dataset.scannerBlend=String(j.scannerBlend);root.dataset.linked=String(state.linked);
      $('link-toggle').setAttribute('aria-pressed',String(state.linked));
      const linked=linkProgress();
      update('link-status',linked.identified?'Every point has matched—not just A and B.':j.mode==='scanner'?'A and B: the same off-surface points in both views.':linked.expansion>.5?'The surrounding points match too, all around the loop.':'Find blue A and purple B in both views. Filled and outlined markers are counterparts.');
      update('stage',description.stage);update('message',description.message);update('surface',description.surface);update('ambient',description.ambient);
      update('coordinate-label',!context.ready||context.geometry<.14?'Preview · planned joining neighborhoods':j.mode==='scanner'?'3D neighborhood · one normal disc highlighted':j.meeting?'Whole neighborhood matched → scanner':'Whole D² × S¹ neighborhoods · matching around the loop');update('scan-value',Math.round(f.station*100)+'%');
      $('scan').value=f.station*100;$('scan').disabled=!context.ready;$('follow').checked=state.following;$('follow').disabled=!context.ready;
      $('scan').setAttribute('aria-valuetext',`${Math.round(f.station*100)} percent along the neck${state.following?', following the joining edge':''}`);
      update('scan-help',j.mode==='join'||j.mode==='handoff'?'Move range to inspect a section':f.complete?'Whole neck available':'Scan joined sections');
      for(const side of ['old','new']){$(side).setAttribute('aria-pressed',String(state.side===side));$(side).disabled=!context.ready;}
      for(const n of [0,25,50,75,100]){
        const s=n/100,built=s<=f.oldFront||s>=f.newFront,node=$('station-'+n);
        node.disabled=!context.ready||!built;node.dataset.built=String(built);node.setAttribute('aria-pressed',String(context.ready&&built&&Math.abs(f.station-s)<.06));node.title=built?'Scan '+n+'%':'This section has not joined yet';
      }
      $('symmetry').disabled=!context.ready;$('symmetry').setAttribute('aria-expanded',String(state.symmetry));
      update('symmetry',state.symmetry?'Hide the symmetry':'Show the symmetry');$('symmetry-panel').hidden=!state.symmetry;
      $('reversal').value=state.reversal;update('reversal-value',Math.round(state.reversal)+'%');
      draw();if(notify){onInspect(selection());onChange(selection());}
    }
    listen($('link-toggle'),'click',()=>{state.linked=!state.linked;refresh(true);});
    for(const side of ['old','new'])listen($(side),'click',()=>{if(!context.ready)return;state.side=side;state.following=true;state.station=null;state.symmetry=false;refresh(true);});
    listen($('scan'),'input',()=>{if(!context.ready)return;state.station=clamp(Number($('scan').value)||0,0,100)/100;state.following=false;refresh(true);});
    listen($('follow'),'change',()=>{if(!context.ready)return;const position=frame().station;state.following=$('follow').checked;state.station=state.following?null:position;if(state.following)state.symmetry=false;refresh(true);});
    for(const n of [0,25,50,75,100])listen($('station-'+n),'click',()=>{if(!context.ready||$('station-'+n).disabled)return;state.following=false;state.station=n/100;refresh(true);});
    listen($('symmetry'),'click',()=>{if(!context.ready)return;const station=frame().station;state.symmetry=!state.symmetry;if(state.symmetry){state.following=false;state.station=station;}refresh(true);});
    listen($('reversal'),'input',()=>{if(!context.ready)return;state.reversal=clamp(Number($('reversal').value)||0,0,100);refresh(true);});
    listen(doc,'visibilitychange',()=>{if(active())draw();});
    const observer=win?.ResizeObserver?new win.ResizeObserver(()=>{if(active())draw();}):null;observer?.observe(canvas);observer?.observe(overview);root.hidden=true;
    return Object.freeze({
      selection,snapshot:()=>({...state,...context,selection:selection()}),render:draw,
      setContext(next={}){
        if(destroyed)return;
        const normalized={...context,...next};normalized.geometry=Number.isFinite(normalized.geometry)?clamp(normalized.geometry,0,1):0;
        normalized.joinProgress=Number.isFinite(normalized.joinProgress)?clamp(normalized.joinProgress,0,1):0;normalized.active=!!normalized.active;normalized.ready=!!normalized.ready;
        if(normalized.constructionId!=null&&normalized.constructionId!==context.constructionId){state.following=true;state.station=null;state.symmetry=false;state.reversal=0;}
        const nextSignature=JSON.stringify([normalized.active,normalized.ready,normalized.geometry,normalized.joinProgress,normalized.phase,normalized.paused,normalized.fromCount,normalized.completed,normalized.theta,normalized.constructionId]);
        context=normalized;if(nextSignature===signature)return;signature=nextSignature;refresh();
      },
      destroy(){if(destroyed)return;destroyed=true;observer?.disconnect();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);root.hidden=true;scannerCache=null;}
    });
  }
  return Object.freeze({create,describe});
});
