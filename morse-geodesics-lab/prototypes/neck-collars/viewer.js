/* Isolated neck workbench. Rendering only; no production app state or catalogue
 * is imported or modified. Paths are meridian or oblique geometry probes. */
(function(){
  'use strict';
  const G=window.GeodesicNeckGeometry,D=window.GeodesicNeckDiagnostics,C=window.GeodesicCamera,
    Tube=window.GeodesicDeformationTube,Field=window.GeodesicVariationField,Assembly=window.GeodesicNeckAssembly;
  const $=id=>document.getElementById(id),TAU=2*Math.PI;
  const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),sub=(a,b)=>a.map((x,k)=>x-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a)||1;return a.map(x=>x/n);};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),meshCache=new Map();
  const neckHeight=.86,
    closeBounds=[[-1.75,-1.45,-neckHeight],[1.75,1.45,neckHeight]],halfExtent=Math.max(2,...(G?.profiles||[]).map(p=>p.spacing/2))+1.86,
    fullBounds=[[-halfExtent,-1.86,-neckHeight],[halfExtent,1.86,neckHeight]];
  let bounds=closeBounds;
  let camera={...C.defaultCamera(),yaw:.04,pitch:.72,zoom:.85},frame=0,destroyed=false,pending=false;
  const state={theta:-164*Math.PI/180,amplitude:.12,gain:3,safety:true,direction:1,heat:true,heightGuides:true,turn:0,candidate:null,assembly:false,assemblyProgress:.5};
  const colors=[[.17,.49,.53],[.47,.79,.71],[.85,.83,.54],[.94,.63,.33],[.74,.31,.28]];
  function heat(value){const t=clamp(value/10,0,1)*(colors.length-1),i=Math.min(colors.length-2,Math.floor(t)),a=t-i;return colors[i].map((x,k)=>x+(colors[i+1][k]-x)*a);}
  const shifted=(p,profile)=>[p[0]-profile.spacing/2,p[1],p[2]];
  const error=e=>{console.error(e);$('error').hidden=false;$('error').textContent='The comparison could not be drawn: '+e.message;};
  function geometry(profile){
    if(meshCache.has(profile.id))return meshCache.get(profile.id);
    const [a,b]=G.domain(profile),nx=180,nt=80,rows=[];let peak=0,maxHeight=0;
    for(let i=0;i<=nx;i++){
      const x=i===nx?b:a+(b-a)*i/nx,row=[];
      for(let j=0;j<=nt;j++){
        const p=G.evaluate(profile,x,TAU*(j%nt)/nt),k=Math.max(...p.principal.map(Math.abs));peak=Math.max(peak,k);maxHeight=Math.max(maxHeight,Math.abs(p.point[2]));
        row.push({p:shifted(p.point,profile),n:p.normal,c:heat(k)});
      }
      rows.push(row);
    }
    const positions=[],normals=[],vertexColors=[],wire=[],wireNormals=[];
    const triangle=(a,b,c)=>{for(const p of [a,b,c]){positions.push(...p.p);normals.push(...p.n);vertexColors.push(...p.c);}};
    const line=(a,b)=>{wire.push(...a.p,...b.p);wireNormals.push(...a.n,...b.n);};
    for(let i=1;i<=nx;i++)for(let j=1;j<=nt;j++){
      triangle(rows[i-1][j-1],rows[i][j],rows[i][j-1]);triangle(rows[i-1][j-1],rows[i-1][j],rows[i][j]);
      if(j%8===0)line(rows[i-1][j],rows[i][j]);
      if(i%8===0)line(rows[i][j-1],rows[i][j]);
    }
    // Actual round tori, cut at the same attachment planes as each patch.
    const context=[],contextNormals=[];
    function clip(poly,cut,keepLeft){
      const result=[];
      for(let i=0;i<poly.length;i++){
        const p=poly[i],q=poly[(i+1)%poly.length],inside=keepLeft?p.p[0]<=cut:p.p[0]>=cut,nextInside=keepLeft?q.p[0]<=cut:q.p[0]>=cut;
        if(inside)result.push(p);
        if(inside!==nextInside){const t=(cut-p.p[0])/(q.p[0]-p.p[0]);result.push({p:p.p.map((x,k)=>x+t*(q.p[k]-x)),n:unit(p.n.map((x,k)=>x+t*(q.n[k]-x)))});}
      }
      return result;
    }
    for(const body of [0,1]){
      const center=body*profile.spacing,cut=body?profile.spacing-profile.seamX:profile.seamX,nu=96,nv=40;
      const at=(i,j)=>{const u=TAU*i/nu,v=TAU*j/nv,cv=Math.cos(v),sv=Math.sin(v),cu=Math.cos(u),su=Math.sin(u);return {p:[center+(1.35+.45*cv)*cu,(1.35+.45*cv)*su,.45*sv],n:[cv*cu,cv*su,sv]};};
      for(let i=0;i<nu;i++)for(let j=0;j<nv;j++)for(const tri of [[at(i,j),at(i+1,j),at(i+1,j+1)],[at(i,j),at(i+1,j+1),at(i,j+1)]]){
        const poly=clip(tri,cut,!body);
        for(let k=1;k<poly.length-1;k++)for(const vertex of [poly[0],poly[k],poly[k+1]]){context.push(...shifted(vertex.p,profile));contextNormals.push(...vertex.n);}
      }
    }
    const result={positions:new Float32Array(positions),normals:new Float32Array(normals),colors:new Float32Array(vertexColors),
      wire:new Float32Array(wire),wireNormals:new Float32Array(wireNormals),context:new Float32Array(context),contextNormals:new Float32Array(contextNormals),peak,maxHeight,nx,nt};
    meshCache.set(profile.id,result);return result;
  }
  function makeRenderer(canvas){
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false});
    if(!gl)throw Error('WebGL is required for this isolated 3D comparison.');
    const shader=(type,source)=>{const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(item));return item;};
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uMatrix;uniform float uOffset;varying vec3 vNormal;varying vec3 vColor;varying float vX;void main(){vNormal=aNormal;vColor=aColor;vX=aPosition.x;gl_Position=uMatrix*vec4(aPosition+uOffset*aNormal,1.0);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 vNormal;varying vec3 vColor;varying float vX;uniform vec2 uGap;uniform vec3 uColor;uniform float uVertexColor;uniform float uAlpha;uniform float uLit;void main(){if(vX>uGap.x&&vX<uGap.y)discard;vec3 n=normalize(vNormal);float lighting=.43+.57*abs(dot(n,normalize(vec3(-.3,-.4,1.0))));vec3 base=mix(uColor,vColor,uVertexColor);gl_FragColor=vec4(base*mix(1.0,lighting,uLit),uAlpha);}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const locations={};for(const name of ['aPosition','aNormal','aColor'])locations[name]=gl.getAttribLocation(program,name);
    for(const name of ['uMatrix','uOffset','uColor','uVertexColor','uAlpha','uLit','uGap'])locations[name]=gl.getUniformLocation(program,name);
    let surface=null,wire=null,context=null,guides=null,reference=null,pushed=null,arrows=null,band=null,currentProfile=null,joining=null,joiningKey=null,joiningPart=null;
    const upload=(p,n,c=null)=>{
      const buffers=[];for(const values of [p,n,c||new Float32Array(p.length)]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);buffers.push(buffer);}
      return {buffers,count:p.length/3};
    };
    const dispose=item=>{if(item)for(const buffer of item.buffers)gl.deleteBuffer(buffer);};
    function load(profile,probe){
      if(currentProfile!==profile){
        for(const item of [surface,wire,context,guides])dispose(item);
        const g=geometry(profile);surface=upload(g.positions,g.normals,g.colors);wire=upload(g.wire,g.wireNormals);context=upload(g.context,g.contextNormals);currentProfile=profile;
        const [a,b]=G.domain(profile),positions=[],normals=[],w=Math.max(1.25,(profile.halfWidth||profile.neckRadius)+.1);
        const line=(p,q)=>{positions.push(...shifted(p,profile),...shifted(q,profile));normals.push(0,0,1,0,0,1);};
        for(const z of [-.45,.45]){
          line([a,-w,z],[b,-w,z]);line([a,w,z],[b,w,z]);
          line([a,-w,z],[a,w,z]);line([b,-w,z],[b,w,z]);
        }
        guides=upload(new Float32Array(positions),new Float32Array(normals));
      }
      for(const item of [reference,pushed,arrows,band])dispose(item);
      const samples=probe.points.map(p=>({...p,original:shifted(p.original,profile),point:shifted(p.point,profile)})),field=Field.build({samples,T:probe.length,count:20});
      const r=Tube.build(samples.map(p=>p.original),{radius:.009,lift:.012,liftNormals:samples.map(p=>p.normal)}),q=Tube.build(samples.map(p=>p.point),{radius:.011,initialNormal:samples[0].normal});
      reference=upload(r.positions,r.normals);pushed=upload(q.positions,q.normals);arrows=upload(field.positions,field.normals);band=upload(field.band.positions,field.band.normals);
    }
    function draw(item,type,color,alpha=1,vertexColor=false,lit=false,offset=0,gap=[1,-1]){
      if(!item||!item.count)return;
      for(const [i,name]of ['aPosition','aNormal','aColor'].entries()){
        gl.bindBuffer(gl.ARRAY_BUFFER,item.buffers[i]);gl.enableVertexAttribArray(locations[name]);gl.vertexAttribPointer(locations[name],3,gl.FLOAT,false,0,0);
      }
      gl.uniform3fv(locations.uColor,color);gl.uniform1f(locations.uAlpha,alpha);gl.uniform1f(locations.uVertexColor,vertexColor?1:0);gl.uniform1f(locations.uLit,lit?1:0);gl.uniform1f(locations.uOffset,offset);gl.uniform2fv(locations.uGap,gap);gl.drawArrays(type,0,item.count);
    }
    function render(){
      const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),width=Math.max(1,Math.round(box.width*dpr)),height=Math.max(1,Math.round(box.height*dpr));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,width,height);gl.clearColor(.035,.135,.17,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
      gl.uniformMatrix4fv(locations.uMatrix,false,C.frame(bounds,camera,width,height).m);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
      let gap=[1,-1];
      if(state.assembly&&currentProfile){
        const key=currentProfile.id+':'+state.assemblyProgress;
        if(joiningKey!==key){
          const part=Assembly.sample(currentProfile,state.assemblyProgress,{count:128});joiningPart=part;
          dispose(joining);const positions=[],normals=[];
          for(const ring of part.rings){
            const points=[...ring.points,ring.points[0]].map(p=>shifted(p,currentProfile)),liftNormals=[...ring.normals,ring.normals[0]];
            const mesh=Tube.build(points,{radius:.007,lift:.008,liftNormals});positions.push(...mesh.positions);normals.push(...mesh.normals);
          }
          joining=upload(new Float32Array(positions),new Float32Array(normals));joiningKey=key;
        }
        gap=[joiningPart.left-currentProfile.spacing/2,joiningPart.right-currentProfile.spacing/2];
      }
      gl.depthMask(false);draw(context,gl.TRIANGLES,[.32,.55,.57],state.assembly ? .32 : .16,false,true);gl.depthMask(true);
      draw(surface,gl.TRIANGLES,[.29,.57,.59],.94,state.heat,true,0,gap);
      gl.depthMask(false);draw(wire,gl.LINES,[.65,.85,.79],.15,false,false,.0015,gap);
      if(state.heightGuides)draw(guides,gl.LINES,[.98,.78,.38],.38);
      if(state.assembly){draw(joining,gl.TRIANGLES,[1,.79,.38],1);gl.depthMask(true);return;}
      const rgb=state.direction===2?[.72,.43,1]:[.30,.72,1];
      gl.disable(gl.DEPTH_TEST);draw(band,gl.TRIANGLES,rgb,.04);draw(arrows,gl.TRIANGLES,rgb,.09);draw(pushed,gl.TRIANGLES,rgb,.13);gl.enable(gl.DEPTH_TEST);
      draw(reference,gl.TRIANGLES,[.9,.96,.89],.85);draw(band,gl.TRIANGLES,rgb,.25);draw(arrows,gl.TRIANGLES,rgb,.97);draw(pushed,gl.TRIANGLES,rgb,1);
      gl.depthMask(true);
    }
    let drag=null;
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0||event.isPrimary===false||drag)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;if(event.buttons===0){drag=null;return;}camera=C.turn(camera,(event.clientX-drag.x)*.007,-(event.clientY-drag.y)*.007);drag.x=event.clientX;drag.y=event.clientY;requestDraw();});
    const stop=event=>{if(event?.pointerId!==undefined&&drag?.id!==event.pointerId)return;drag=null;};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,stop);window.addEventListener('blur',()=>stop());
    canvas.addEventListener('wheel',event=>{event.preventDefault();const box=canvas.getBoundingClientRect();camera=C.zoomAt({bounds,camera,width:box.width,height:box.height,x:event.clientX-box.left,y:event.clientY-box.top,factor:Math.exp(clamp(event.deltaY,-140,140)*.0018)});requestDraw();},{passive:false});
    canvas.addEventListener('keydown',event=>{const step=.12;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();camera=C.turn(camera,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0);requestDraw();}});
    return {load,render};
  }
  let left,right,leftProbe,rightProbe;
  function requestDraw(){if(!frame&&!destroyed)frame=requestAnimationFrame(()=>{frame=0;try{left?.render();right?.render();drawChart();}catch(e){error(e);}});}
  const number=x=>Number(x).toFixed(2);
  function audited(profile){return window.GeodesicNeckAudit?.profiles?.find(p=>p.id===profile.id);}
  function stats(prefix,profile,probe){
    const audit=audited(profile),g=geometry(profile),peak=audit?.curvature?.maxPrincipal??g.peak,m=probe.metrics;
    const maxHeight=audit?.curvature?.maxHeight??g.maxHeight;
    $(prefix+'-curvature').textContent=number(peak);$(prefix+'-height').textContent=maxHeight.toFixed(3);$(prefix+'-height').classList.toggle('warn',maxHeight>.45+1e-10);$(prefix+'-gain').textContent=number(m.appliedGain)+'×';
    $(prefix+'-height').title=profile.kind==='height'?'Analytically bounded by ±0.45 for the entire surface; this is not just a grid test.':'Sampled height of the unchanged current reference.';
    const label=$(prefix+'-regularity');label.textContent=m.minForward<0?'Turns back':'Forward';label.classList.toggle('warn',m.minForward<0);
    label.title='Minimum derivative component along the original probe: '+number(m.minForward)+'. A negative component indicates a local reversal in the drawing.';
    $(prefix+'-scale').textContent=(m.limited?'Limited: ':'Applied: ')+number(m.appliedGain)+'×'+(m.limited?' / '+number(state.gain)+'× requested':'');
    $(prefix+'-curvature').title=audit?'Largest found by '+audit.curvature.nx+' × '+audit.curvature.ntheta+' surface grid plus local peak refinement; not a certified global bound.':'Largest found on preview mesh: '+g.nx+' × '+g.nt+'; not a certified global bound.';
  }
  function redrawProbes(){
    try{
      const baseline=G.profiles.find(p=>p.kind==='current')||G.profiles[0],profile=G.profiles.find(p=>p.id===state.candidate),options={theta:state.theta,amplitude:state.amplitude,gain:state.gain,safety:state.safety,direction:state.direction,count:900,turn:state.turn};
      const sample=state.turn?D.sampleObliqueProbe:D.sampleProbe;
      leftProbe=sample(G,baseline,options);rightProbe=sample(G,profile,options);left.load(baseline,leftProbe);right.load(profile,rightProbe);
      stats('current',baseline,leftProbe);stats('candidate',profile,rightProbe);$('candidate-title').textContent=profile.label;
      $('candidate-smoothness').textContent='C∞ · height certified';
      const flare=profile.collarEnd-profile.seamX;
      $('candidate-description').textContent=profile.description+' Flare length '+number(flare)+' per side; center spacing '+number(profile.spacing)+'. Throat width '+number(2*profile.halfWidth)+', height '+number(2*profile.halfHeight)+'. The entire collar stays within the original height ±0.45.';
      const a=audited(baseline),b=audited(profile);
      $('numerical-note').textContent=a&&b?'Curvature audit: up to '+Math.max(a.curvature.nx,b.curvature.nx)+' × '+Math.max(a.curvature.ntheta,b.curvature.ntheta)+', local peak refinement, and dense join checks. Curvature values are sampled; the height bound is analytic.':'Surface peaks are sampled diagnostics; the candidate height bound is analytic.';
      $('comparison-note').textContent=state.safety?'Safety is on: compare the applied drawing gain at the same test coefficient.':'Safety is off: requested gain is identical; a local reversal reveals the offset-drawing artifact.';
      updateAssembly();requestDraw();
    }catch(e){error(e);}
  }
  function scheduleProbe(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;redrawProbes();});}
  function updateAssembly(){
    document.body.classList.toggle('assembly-active',state.assembly);
    $('assembly-value').textContent=Math.round(100*state.assemblyProgress)+'%';
    $('assembly-progress').setAttribute('aria-valuetext',Math.round(100*state.assemblyProgress)+' percent joined');
    $('comparison-note').textContent=state.assembly?'Assembly preview: gold rings follow the actual joining sections; field drawing is paused.':state.safety?'Safety is on: compare the applied drawing gain at the same test coefficient.':'Safety is off: requested gain is identical; a local reversal reveals the offset-drawing artifact.';
    if(state.assembly)for(const prefix of ['current','candidate'])$(prefix+'-scale').textContent=Math.round(100*state.assemblyProgress)+'% collar reveal · field paused';
    else if(leftProbe&&rightProbe){
      stats('current',G.profiles[0],leftProbe);stats('candidate',G.profiles.find(p=>p.id===state.candidate),rightProbe);
    }
  }
  function drawChart(){
    if(!leftProbe||!rightProbe)return;
    const canvas=$('curvature-chart'),box=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,box.width),h=Math.max(1,box.height);
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
    const left=32,right=w-12,top=12,bottom=h-25,maximum=Math.max(3,Math.ceil(Math.max(...leftProbe.points.map(p=>p.kappaMax),...rightProbe.points.map(p=>p.kappaMax))/2)*2);
    c.font='9px system-ui,sans-serif';c.lineWidth=1;
    for(let j=0;j<=4;j++){
      const y=bottom-(bottom-top)*j/4;c.strokeStyle='#e5eadd';c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.textAlign='right';c.fillStyle='#7a8876';c.fillText((maximum*j/4).toFixed(1),left-7,y+3);
    }
    c.textAlign='center';for(const t of [0,.25,.5,.75,1])c.fillText(String(t),left+(right-left)*t,h-8);
    const bodyCurvature=1/G.constants.minorRadius,referenceY=bottom-(bottom-top)*bodyCurvature/maximum;
    c.strokeStyle='#899a8b';c.setLineDash([4,4]);c.beginPath();c.moveTo(left,referenceY);c.lineTo(right,referenceY);c.stroke();c.setLineDash([]);
    c.textAlign='right';c.fillStyle='#6d8072';c.fillText('Unchanged torus: '+bodyCurvature.toFixed(2),right-4,referenceY-5);
    for(const [probe,color]of [[leftProbe,'#d3a049'],[rightProbe,'#238e84']]){
      c.beginPath();probe.points.forEach((p,i)=>{const x=left+(right-left)*p.s/probe.length,y=bottom-(bottom-top)*p.kappaMax/maximum;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.strokeStyle=color;c.lineWidth=2.1;c.stroke();
    }
  }
  function initialize(){
    if(!G||!D||!C||!Tube||!Field||!Assembly)throw Error('A local prototype script is missing. Open this page from its original folder.');
    const candidates=G.profiles.filter(p=>p.kind!=='current');if(!candidates.length)throw Error('No collar candidates are available.');
    for(const profile of candidates){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.label;$('candidate').append(option);}
    state.candidate=candidates.find(p=>p.id==='height-optimal')?.id||candidates[0].id;$('candidate').value=state.candidate;
    left=makeRenderer($('current-view'));right=makeRenderer($('candidate-view'));
    $('candidate').addEventListener('change',()=>{state.candidate=$('candidate').value;scheduleProbe();});
    for(const [name,key,scale,format]of [['angle','theta',Math.PI/180,x=>Math.round(x)+'°'],['push','amplitude',.001,x=>(x*.001).toFixed(3)],['gain','gain',.1,x=>(x*.1).toFixed(1)+'×']]){
      $(name).addEventListener('input',()=>{const value=Number($(name).value);state[key]=value*scale;$(name+'-value').textContent=format(value);scheduleProbe();});
    }
    $('direction').addEventListener('change',()=>{state.direction=Number($('direction').value);scheduleProbe();});
    $('probe-route').addEventListener('change',()=>{state.turn=Number($('probe-route').value)*Math.PI/2;scheduleProbe();});
    $('safety').addEventListener('change',()=>{state.safety=$('safety').checked;scheduleProbe();});
    $('heat').addEventListener('change',()=>{state.heat=$('heat').checked;requestDraw();});
    $('height-guides').addEventListener('change',()=>{state.heightGuides=$('height-guides').checked;requestDraw();});
    $('assembly-preview').addEventListener('toggle',()=>{state.assembly=$('assembly-preview').open;updateAssembly();requestDraw();});
    $('assembly-progress').addEventListener('input',()=>{state.assemblyProgress=Number($('assembly-progress').value)/1000;updateAssembly();requestDraw();});
    $('reset-view').addEventListener('click',()=>{bounds=closeBounds;camera={...C.defaultCamera(),yaw:.04,pitch:.72,zoom:.85};requestDraw();});
    $('whole-pair').addEventListener('click',()=>{bounds=fullBounds;camera={...camera,zoom:.9,targetOffset:[0,0,0]};requestDraw();});
    new ResizeObserver(requestDraw).observe(document.querySelector('.view-grid'));
    window.addEventListener('pagehide',()=>{destroyed=true;if(frame)cancelAnimationFrame(frame);});
    // Let the page paint before the current implicit surface is sampled.
    requestAnimationFrame(()=>setTimeout(redrawProbes,0));
  }
  try{initialize();}catch(e){error(e);}
})();
