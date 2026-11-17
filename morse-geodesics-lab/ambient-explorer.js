/* Optional coordinate/topology explanation. Sphere pairs represent points of
 * S² × S²; equator pairs form the marked torus. The contraction is a homotopy,
 * not the geodesic flow of the app's chosen metric or an energy deformation.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicAmbientExplorer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=2*Math.PI,HALF_PI=Math.PI/2;
  const COLORS={surface:'#67e5c3',a:'#f4ba71',b:'#c4abff',text:'#d7e9e4',muted:'#9ebbc1'};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const wrap=x=>((x%TAU)+TAU)%TAU;
  function finite(...values){if(!values.every(Number.isFinite))throw new RangeError('Finite product coordinates required.');}
  function spherePoint(longitude,latitude=0){
    finite(longitude,latitude);
    if(Math.abs(Math.abs(latitude)-HALF_PI)<1e-14)return [0,0,Math.sign(latitude)];
    const r=Math.cos(latitude);return [r*Math.cos(longitude),r*Math.sin(longitude),Math.sin(latitude)];
  }
  function productPoint(u,v,latitudeA=0,latitudeB=0){return [spherePoint(u,latitudeA),spherePoint(v,latitudeB)];}
  function torusPoint(u,v,R=1.35,r=.45){
    finite(u,v,R,r);const q=R+r*Math.cos(v);return [q*Math.cos(u),q*Math.sin(u),r*Math.sin(v)];
  }
  function torusCoordinates(point,R=1.35){
    if(!Array.isArray(point)||point.length!==3)throw new TypeError('A three-dimensional torus point is required.');
    finite(...point,R);return {u:wrap(Math.atan2(point[1],point[0])),v:wrap(Math.atan2(point[2],Math.hypot(point[0],point[1])-R))};
  }
  function loopPair(angle,progress,cycle='a',fixedAngle=0){
    finite(angle,progress,fixedAngle);
    if(cycle!=='a'&&cycle!=='b')throw new RangeError('Choose the first or second sphere.');
    const latitude=clamp(progress,0,1)*HALF_PI;
    return cycle==='a'?productPoint(angle,fixedAngle,latitude,0):productPoint(fixedAngle,angle,0,latitude);
  }
  function advance(progress,elapsed,duration=6500){
    finite(progress,elapsed,duration);if(!(duration>0))throw new RangeError('Positive animation duration required.');
    return clamp(progress+clamp(elapsed,0,50)/duration,0,1);
  }
  // Coordinates of the explanatory reference grids never depend on traversal,
  // contraction, or the camera. Build them only when the diagram is first drawn.
  let diagramGeometry=null;
  function staticGeometry(){
    if(diagramGeometry)return diagramGeometry;
    const torusFaces=[];
    for(let u=0;u<40;u++)for(let v=0;v<16;v++)torusFaces.push({
      points:[[u,v],[u+1,v],[u+1,v+1],[u,v+1]].map(([a,b])=>torusPoint(TAU*a/40,TAU*b/16)),
      shade:.32+.17*Math.cos(TAU*v/16)
    });
    diagramGeometry={torusFaces,
      torusGuides:Array.from({length:4},(_,v)=>Array.from({length:101},(_,i)=>torusPoint(TAU*i/100,TAU*v/4))),
      latitudes:[-Math.PI/3,-Math.PI/6,Math.PI/6,Math.PI/3].map(latitude=>Array.from({length:81},(_,i)=>spherePoint(TAU*i/80,latitude))),
      longitudes:[0,Math.PI/3,2*Math.PI/3].map(longitude=>Array.from({length:81},(_,i)=>[Math.cos(TAU*i/80)*Math.cos(longitude),Math.cos(TAU*i/80)*Math.sin(longitude),Math.sin(TAU*i/80)])),
      equator:Array.from({length:121},(_,i)=>spherePoint(TAU*i/120))};
    return diagramGeometry;
  }
  function create(root,options={}){
    if(!root||typeof root.querySelector!=='function')throw new TypeError('An explorer container is required.');
    const doc=root.ownerDocument,win=doc.defaultView;
    const prefix=(root.id||'ambient-explorer')+'-';
    root.classList.add('ambient-explorer');
    root.innerHTML=`
      <div class="ambient-topline"><div><h3>Two spheres, one point in each</h3><p>Both positions on their equators give a point on the torus. Let either position leave its equator to explore more of the surrounding space.</p></div><div class="ambient-tabs" role="group" aria-label="Choose an explanation"><button type="button" data-ambient="mode-points" aria-pressed="true">Explore a point</button><button type="button" data-ambient="mode-loop" aria-pressed="false">Shrink a loop</button></div></div>
      <p class="ambient-scope" data-ambient="scope"></p>
      <div class="ambient-visual"><canvas class="ambient-product-canvas" data-ambient="canvas" width="1050" height="300" tabindex="0" role="img" aria-label="A torus point corresponds to one point on each of two sphere equators. Drag or use arrow keys to rotate this diagram."></canvas></div>
      <div class="ambient-dimension-key"><span><i class="ambient-surface-color"></i>Equator × equator: 1 + 1 = <strong>2 dimensions</strong></span><span><i class="ambient-a-color"></i><i class="ambient-b-color"></i>Sphere × sphere: 2 + 2 = <strong>4 dimensions</strong></span></div>
      <div class="ambient-coordinate-controls" data-ambient="points-panel">
        <div class="ambient-controls"><label for="${prefix}u">First equator <output data-ambient="u-value"></output><input id="${prefix}u" type="range" min="0" max="360" step="1" value="220" data-ambient="u"></label><label for="${prefix}v">Second equator <output data-ambient="v-value"></output><input id="${prefix}v" type="range" min="0" max="360" step="1" value="35" data-ambient="v"></label><button type="button" data-ambient="follow" aria-pressed="false">Follow selected geodesic</button></div>
        <details class="ambient-latitude-settings"><summary>Leave the equators: two extra directions</summary><div class="ambient-controls"><label for="${prefix}latitude-a">Off the first equator <output data-ambient="latitude-a-value"></output><input id="${prefix}latitude-a" type="range" min="-75" max="75" step="1" value="0" data-ambient="latitude-a"></label><label for="${prefix}latitude-b">Off the second equator <output data-ambient="latitude-b-value"></output><input id="${prefix}latitude-b" type="range" min="-75" max="75" step="1" value="0" data-ambient="latitude-b"></label><button type="button" data-ambient="return">Return to torus</button></div><p>These latitude controls locate points outside the marked torus; they do not launch a geodesic.</p></details>
      </div>
      <div class="ambient-loop-controls" data-ambient="loop-panel" hidden>
        <div class="ambient-controls"><label for="${prefix}cycle">Loop around <select id="${prefix}cycle" data-ambient="cycle"><option value="a">First equator</option><option value="b">Second equator</option></select></label><button type="button" data-ambient="play" aria-pressed="false">Play contraction</button><button type="button" data-ambient="restart">Return to original loop</button><label class="ambient-contraction-control" for="${prefix}contraction">Contraction <output data-ambient="contraction-value">0%</output><input id="${prefix}contraction" type="range" min="0" max="1000" step="1" value="0" data-ambient="contraction"></label></div>
        <p>The loop lifts through latitude circles in one sphere and shrinks to its north pole. The position on the other sphere stays fixed.</p>
      </div>
      <p class="ambient-status" data-ambient="status" role="status" aria-live="polite"></p>
      <p class="ambient-note">This is a coordinate and topology picture of S² × S², not a drawing of all four dimensions in ordinary space. The app uses a chosen ambient metric; this contraction is not a geodesic or a claim that energy decreases.</p>
      <p class="ambient-motion-note" data-ambient="motion-note" hidden>Reduced motion is enabled. Scrub the contraction, or choose Play to animate it.</p>`;
    const $=name=>root.querySelector('[data-ambient="'+name+'"]');
    const canvas=$('canvas'),c=canvas.getContext('2d');
    const state={mode:'points',u:220*Math.PI/180,v:35*Math.PI/180,latitudeA:0,latitudeB:0,contraction:0,cycle:'a',following:false,playing:false};
    let context={surface:'torus',point:null,selected:false,active:false},yaw=.48,pitch=.56,dragging=null,frame=0,lastTime=0,destroyed=false;
    const listeners=[],listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
    const reduced=!!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    $('motion-note').hidden=!reduced;
    const active=()=>context.active&&!doc.hidden&&!destroyed;
    const canFollow=()=>context.surface==='torus'&&context.selected&&Array.isArray(context.point)&&context.point.length===3&&context.point.every(Number.isFinite);
    const onTorus=()=>state.mode==='loop'?state.contraction===0:state.latitudeA===0&&state.latitudeB===0;
    const getState=()=>({...state,surface:context.surface,active:active()});
    function stop(){state.playing=false;lastTime=0;if(frame){win.cancelAnimationFrame(frame);frame=0;}}
    function status(){
      if(state.mode==='points')return onTorus()?'Both markers are on their equators: the pair lies on the visible torus.':'The pair is still a point of S² × S², but it is outside the visible torus.';
      if(state.contraction===0)return 'This loop wraps around the torus. To shrink it to a point, we will leave the torus and use a hemisphere in the larger space.';
      if(state.contraction>=1)return 'The loop has become one point in the larger space. It could not shrink to a point while staying on the torus.';
      return 'The loop has left the torus. It is shrinking through a hemisphere in the '+(state.cycle==='a'?'first':'second')+' sphere.';
    }
    function refresh(){
      for(const mode of ['points','loop'])$('mode-'+mode).setAttribute('aria-pressed',String(state.mode===mode));
      $('points-panel').hidden=state.mode!=='points';$('loop-panel').hidden=state.mode!=='loop';
      for(const [name,value]of [['u',state.u*180/Math.PI],['v',state.v*180/Math.PI],['latitude-a',state.latitudeA*180/Math.PI],['latitude-b',state.latitudeB*180/Math.PI]]){
        $(name).value=value;$(name+'-value').textContent=Math.round(value)+'°';
      }
      $('follow').disabled=!canFollow();$('follow').setAttribute('aria-pressed',String(state.following));
      $('follow').textContent=state.following?'Following selected geodesic':'Follow selected geodesic';
      $('follow').title=canFollow()?'Use the main traversal slider to move both equator markers.':'Available for a selected geodesic in the one-summand view.';
      $('cycle').value=state.cycle;$('contraction').value=Math.round(state.contraction*1000);$('contraction-value').textContent=Math.round(state.contraction*100)+'%';
      $('contraction').setAttribute('aria-valuetext',Math.round(state.contraction*100)+' percent; '+(state.contraction===0?'loop on torus':state.contraction>=1?'one point':'loop outside torus'));
      $('play').textContent=state.playing?'Pause contraction':state.contraction>=1?'Replay contraction':'Play contraction';$('play').setAttribute('aria-pressed',String(state.playing));
      $('scope').textContent=context.surface==='torus'?'One summand: the marked torus is equator × equator inside S² × S².':'This diagram explains one S² × S² summand. The connected-sum joins do not have a single global sphere-pair coordinate chart.';
      const message=status();if($('status').textContent!==message)$('status').textContent=message;
      canvas.setAttribute('aria-label',(state.mode==='points'?'Two sphere positions, first longitude '+Math.round(state.u*180/Math.PI)+' degrees and latitude '+Math.round(state.latitudeA*180/Math.PI)+' degrees; second longitude '+Math.round(state.v*180/Math.PI)+' degrees and latitude '+Math.round(state.latitudeB*180/Math.PI)+' degrees. ':'Contraction through the '+(state.cycle==='a'?'first':'second')+' sphere, '+Math.round(state.contraction*100)+' percent complete. ')+message+' Drag or use arrow keys to rotate the coordinate diagram.');
      root.dataset.mode=state.mode;root.dataset.onTorus=String(onTorus());root.dataset.contraction=String(state.contraction);
    }
    function changed(){refresh();draw();options.onChange?.(getState());}
    function projection(center,radius){
      const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
      return p=>{const x=cy*p[0]+sy*p[1],y=-sy*p[0]+cy*p[1];return {x:center[0]+radius*x,y:center[1]-radius*(cp*p[2]-sp*y),z:cp*y+sp*p[2]};};
    }
    function path(points,project,color,width=1,dashed=false){
      c.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dashed?[3,4]:[]);c.stroke();c.setLineDash([]);
    }
    function marker(point,project,color,hollow=false){
      const p=project(point);c.beginPath();c.arc(p.x,p.y,hollow?4:5,0,TAU);c.fillStyle=hollow?'#102d3a':color;c.fill();c.lineWidth=1.5;c.strokeStyle=hollow?color:'#effff5';c.stroke();
    }
    function text(value,x,y,color=COLORS.text,size=11){c.fillStyle=color;c.font=size+'px system-ui, sans-serif';c.textAlign='center';c.fillText(value,x,y);}
    function drawSphere(center,radius,which){
      const project=projection(center,radius),color=which==='a'?COLORS.a:COLORS.b,index=which==='a'?0:1;
      const background=c.createRadialGradient(center[0]-radius*.3,center[1]-radius*.35,0,center[0],center[1],radius);
      background.addColorStop(0,'#285360');background.addColorStop(1,'#102b38');c.fillStyle=background;c.beginPath();c.arc(...center,radius,0,TAU);c.fill();c.strokeStyle='#8ab7b84d';c.lineWidth=1;c.stroke();
      const geometry=staticGeometry();
      for(const points of geometry.latitudes)path(points,project,'#91adb629',.8);
      for(const points of geometry.longitudes)path(points,project,'#91adb629',.8);
      path(geometry.equator,project,COLORS.surface+'a0',1.5,true);
      if(state.mode==='loop'){
        if(state.cycle===which){
          if(state.contraction<1)path(Array.from({length:121},(_,i)=>loopPair(TAU*i/120,state.contraction,state.cycle,which==='a'?state.v:state.u)[index]),project,color,3);
          marker(spherePoint(which==='a'?state.u:state.v,state.contraction*HALF_PI),project,color);
        }else marker(spherePoint(which==='a'?state.u:state.v),project,color);
      }else{
        const longitude=which==='a'?state.u:state.v,latitude=which==='a'?state.latitudeA:state.latitudeB;
        if(latitude!==0)path(Array.from({length:61},(_,i)=>spherePoint(longitude,latitude*i/60)),project,color+'a0',2);
        marker(spherePoint(longitude,latitude),project,color);
      }
      text(which==='a'?'First sphere':'Second sphere',center[0],center[1]-radius-18,color,12);
      text(state.mode==='loop'?(state.cycle===which?(state.contraction>=1?'Loop → one point':'Loop shrinks off the equator'):'The other position stays fixed'):(which==='a'?'First choice':'Second choice'),center[0],center[1]+radius+22,COLORS.muted,10);
    }
    function drawTorus(center,radius){
      const project=projection(center,radius/1.8),geometry=staticGeometry();
      const faces=geometry.torusFaces.map(face=>{const p=face.points.map(project);return {p,z:p.reduce((s,q)=>s+q.z,0)/4,shade:face.shade};});
      faces.sort((a,b)=>a.z-b.z);
      for(const face of faces){c.beginPath();face.p.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=`rgba(82,168,153,${face.shade})`;c.fill();}
      for(const points of geometry.torusGuides)path(points,project,'#92e3c72b',.7);
      if(state.mode==='points')marker(torusPoint(state.u,state.v),project,COLORS.surface,!onTorus());
      else{
        const curve=Array.from({length:121},(_,i)=>state.cycle==='a'?torusPoint(TAU*i/120,state.v):torusPoint(state.u,TAU*i/120));
        path(curve,project,onTorus()?(state.cycle==='a'?COLORS.a:COLORS.b):'#b5d4c85c',onTorus()?3:1.5,!onTorus());
      }
      text('The visible torus',center[0],center[1]-radius-18,COLORS.surface,12);
      text(onTorus()?(state.mode==='loop'?'Original loop on the torus':'One point = two equator positions'):(state.mode==='loop'?'Dashed: original loop only':'Hollow: equator reference only'),center[0],center[1]+radius+22,COLORS.muted,10);
    }
    function draw(){
      if(!c||!active())return;
      const box=canvas.getBoundingClientRect(),w=Math.max(1,box.width),h=Math.max(1,box.height),ratio=Math.min(win.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
      c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
      const background=c.createLinearGradient(0,0,w,h);background.addColorStop(0,'#0b2432');background.addColorStop(1,'#123a45');c.fillStyle=background;c.fillRect(0,0,w,h);
      if(w>=650){
        const radius=Math.max(20,Math.min(w/9.2,(h-96)/2)),y=h*.5;
        drawTorus([w*.18,y],radius);drawSphere([w*.52,y],radius,'a');drawSphere([w*.83,y],radius,'b');
        text('↔',w*.355,y,COLORS.muted,23);text('×',w*.675,y,COLORS.muted,21);
      }else{
        const radius=Math.max(20,Math.min(w*.205,(h-116)/4)),top=h*.235,bottom=h*.70;
        drawTorus([w*.5,top],radius*.95);drawSphere([w*.26,bottom],radius,'a');drawSphere([w*.74,bottom],radius,'b');
        text('×',w*.5,bottom,COLORS.muted,20);
      }
      text('Drag to turn this diagram · arrow keys · Home resets',w/2,h-9,'#9ebbc1',9);
    }
    function tick(now){
      frame=0;if(!state.playing||!active()){lastTime=0;return;}
      const elapsed=lastTime?now-lastTime:0;lastTime=now;state.contraction=advance(state.contraction,elapsed);
      if(state.contraction>=1)state.playing=false;
      changed();if(state.playing)frame=win.requestAnimationFrame(tick);else lastTime=0;
    }
    function stopDrag(event){if(event?.pointerId!==undefined&&dragging?.id!==event.pointerId)return;dragging=null;}
    for(const mode of ['points','loop'])listen($('mode-'+mode),'click',()=>{stop();state.mode=mode;state.following=false;changed();});
    for(const [name,key]of [['u','u'],['v','v'],['latitude-a','latitudeA'],['latitude-b','latitudeB']])listen($(name),'input',()=>{state.following=false;state[key]=Number($(name).value)*Math.PI/180;changed();});
    listen($('return'),'click',()=>{state.latitudeA=0;state.latitudeB=0;changed();});
    listen($('follow'),'click',()=>{
      if(!canFollow())return;state.following=!state.following;
      if(state.following){Object.assign(state,torusCoordinates(context.point),{latitudeA:0,latitudeB:0});}
      changed();
    });
    listen($('cycle'),'change',()=>{stop();state.cycle=$('cycle').value;state.contraction=0;changed();});
    listen($('contraction'),'input',()=>{stop();state.contraction=Number($('contraction').value)/1000;changed();});
    listen($('restart'),'click',()=>{stop();state.contraction=0;changed();});
    listen($('play'),'click',()=>{
      if(state.playing)stop();else if(active()){if(state.contraction>=1)state.contraction=0;state.playing=true;lastTime=0;frame=win.requestAnimationFrame(tick);}
      changed();
    });
    canvas.style.touchAction='none';
    listen(canvas,'pointerdown',event=>{if(!active()||dragging||event.isPrimary===false||event.button!==0)return;dragging={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});});
    listen(canvas,'pointermove',event=>{if(!dragging||dragging.id!==event.pointerId)return;if(!active()||event.buttons===0){stopDrag();return;}yaw+=(event.clientX-dragging.x)*.009;pitch=clamp(pitch+(event.clientY-dragging.y)*.009,-1.3,1.3);dragging.x=event.clientX;dragging.y=event.clientY;draw();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,stopDrag);
    for(const type of ['blur','pagehide'])listen(win,type,()=>stopDrag());
    listen(canvas,'keydown',event=>{
      if(event.key==='ArrowLeft')yaw-=.15;else if(event.key==='ArrowRight')yaw+=.15;else if(event.key==='ArrowUp')pitch=clamp(pitch-.15,-1.3,1.3);else if(event.key==='ArrowDown')pitch=clamp(pitch+.15,-1.3,1.3);else if(event.key==='Home'){yaw=.48;pitch=.56;}else return;
      event.preventDefault();draw();
    });
    listen(doc,'visibilitychange',()=>{if(doc.hidden){stopDrag();stop();}refresh();if(!doc.hidden)draw();});
    const observer=win.ResizeObserver?new win.ResizeObserver(draw):null;observer?.observe(canvas);
    refresh();
    return {getState,setContext(next={}){
      if(destroyed)return;
      const oldActive=context.active,oldSurface=context.surface,oldSelected=context.selected,wasFollowing=state.following,wasPlaying=state.playing,wasAvailable=canFollow();context={...context,...next};
      if(!active()){stopDrag();stop();}
      if(!canFollow())state.following=false;
      let changedPosition=false;
      if(state.following&&active()){
        const coordinates=torusCoordinates(context.point);changedPosition=coordinates.u!==state.u||coordinates.v!==state.v;Object.assign(state,coordinates,{latitudeA:0,latitudeB:0});
      }
      const changedContext=oldActive!==context.active||oldSurface!==context.surface||oldSelected!==context.selected||wasFollowing!==state.following||wasPlaying!==state.playing||wasAvailable!==canFollow();
      if(changedContext||changedPosition){refresh();if(active())draw();}
    },destroy(){destroyed=true;stop();observer?.disconnect();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);}};
  }
  return {create,spherePoint,productPoint,torusPoint,torusCoordinates,loopPair,advance};
});
