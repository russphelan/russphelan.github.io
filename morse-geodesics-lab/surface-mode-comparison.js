/* Two surface Hessian eigenfunctions on one fixed-endpoint segment.
 * Drawing ordinates are the computed coefficient functions, never model sines. */
(function(root,factory){
  'use strict';const api=factory(()=>typeof module==='object'&&module.exports?require('./downhill-controls.js'):root?.GeodesicDownhillControls);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSurfaceModeComparison=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(focusControls){
  'use strict';
  const COLORS=['#c8794d','#8c6c1d'],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const number=x=>Number(x).toExponential(3),percent=x=>x===0?'0%':(x>0?'+':'−')+Math.abs(100*x).toPrecision(3)+'%';
  function surfaceFocus(data,mode){
    return focusControls()?.eventChoices(data).find(choice=>choice.type==='surface'&&choice.mode===mode)||null;
  }
  function focusBookmark(data,mode,where){
    return focusControls()?.bookmark(surfaceFocus(data,mode),where,data?.length)??null;
  }
  function secondSurfaceEnd(data){
    const events=(data?.events||[]).filter(e=>e.surface&&!e.endpoint&&Number.isFinite(e.s)&&e.s>0&&e.s<data.length).sort((a,b)=>a.s-b.s);
    if(events.length<2)return null;
    const s=events[1].s,next=(data.events||[]).filter(e=>e.s>s).reduce((v,e)=>Math.min(v,e.s),data.length);
    return s+Math.min(.2,(next-s)*.4,(data.length-s)*.4);
  }
  function shapeSamples(profile,count=160){
    return Array.from({length:count+1},(_,i)=>{const s=profile.T*i/count;return {s,f:profile.coefficient(s)};});
  }
  function create(root,options={}){
    if(!root||typeof root.querySelector!=='function')throw TypeError('A surface mode comparison container is required.');
    const doc=root.ownerDocument,win=doc.defaultView,prefix=(root.id||'surface-mode-comparison')+'-';
    root.classList.add('surface-mode-comparison');
    root.innerHTML=`<div class="mode-comparison-toolbar"><strong>Surface Hessian modes · same fixed segment</strong><button type="button" data-mode="past-second">Past second +1</button></div>
      <p class="mode-comparison-explanation">Green ribbon: Jacobi field. Colored push patterns: Hessian modes. Switching modes keeps both endpoints fixed.</p>
      <p class="mode-comparison-segment">Torus drawing: 3× push magnification requested for both modes. Length uses the physical push below.</p>
      <p class="mode-comparison-segment" data-mode="segment"></p>
      <div class="mode-comparison-grid"><div class="mode-comparison-patterns"><div class="mode-comparison-navigation"><div class="mode-comparison-buttons" role="group" aria-label="Surface Hessian mode shown on the torus"><button type="button" data-mode="one" style="--mode-color:${COLORS[0]}">Mode 1</button><button type="button" data-mode="two" style="--mode-color:${COLORS[1]}">Mode 2</button></div><div class="mode-comparison-focus"><span data-mode="focus-label"></span><div class="mode-comparison-bookmarks" role="group" aria-label="Move the segment endpoint around the selected surface focus"><button type="button" data-mode="before">Before</button><button type="button" data-mode="at">At focus</button><button type="button" data-mode="after">After</button></div></div></div>
      <div data-mode="shapes" class="mode-comparison-shapes"></div><p class="mode-comparison-shape-key">Actual modes f₁(s), f₂(s) · same position axis · max |f| = 1</p>
      <label for="${prefix}push">Same maximum push · signed <output data-mode="amplitude">0.0000</output><input type="range" id="${prefix}push" data-mode="push" min="-100" max="100" step="1" value="0" aria-label="Surface Hessian mode push amplitude"></label>
      <div class="mode-comparison-results"><p data-mode="result-one"></p><p data-mode="result-two"></p></div></div><div data-mode="landscape"></div></div>
      <p class="mode-comparison-status" data-mode="status" role="status" aria-live="polite"></p>
      <details class="mode-comparison-math"><summary>How these patterns relate to Jacobi fields</summary><p>These are two ways to push the whole segment sideways, rather than pushes localized at a conjugate point. Switching modes preserves the same maximum push. On this same interval [0,T], −f″ − K(s)f = λf, with f(0)=f(T)=0. Distinct modes are orthogonal in the integral inner product. The push patterns are Jacobi fields only when their eigenvalue is zero. Negative λ means length curves downward at zero push; the graph measures actual finite lengths separately. Both signs of one mode are one direction.</p></details>`;
    const $=name=>root.querySelector('[data-mode="'+name+'"]'),chart=win.GeodesicEnergyLandscape.create($('landscape'));
    const listeners=[],listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push([node,type,fn]);};
    let context={active:false,data:null,model:null,position:0,surgery:false},profiles=[],curves=[],results=[],mode=1,amplitude=0,cap=0,pushLimit=0,maxSign=0,lastNonzeroSafeMagnitude=0,currentDisplayCap=0,pending=false,rangePending=false,error='',timer=0,token=0,destroyed=false;
    const cache=new WeakMap(),empty=[];
    const usable=()=>context.active&&!context.surgery&&!doc.hidden&&!destroyed&&!!context.data&&!!context.model&&T()>0;
    const T=()=>context.data?clamp(Number(context.position)||0,0,context.data.length):0;
    function cancel(){token++;if(timer)win.clearTimeout(timer);timer=0;pending=false;}
    function getProfile(rank){
      let models=cache.get(context.data);if(!models){models=new WeakMap();cache.set(context.data,models);}
      let entries=models.get(context.model);if(!entries){entries=new Map();models.set(context.model,entries);}
      const key=T()+':'+rank;
      if(!entries.has(key)){
        entries.set(key,win.GeodesicDownhill.prepare({data:context.data,model:context.model,T:T(),type:'surface',mode:rank}));
        if(entries.size>16)entries.delete(entries.keys().next().value);
      }
      return entries.get(key);
    }
    function emit(){
      const profile=profiles[mode-1],result=results[mode-1]||null;
      options.onUpdate?.(usable()?{active:true,comparison:true,data:context.data,type:'surface',T:T(),mode,profile,result,
        amplitude:[amplitude,0],displayMagnification:3,displayProfiles:profiles,displayMaxAmplitude:rangePending?currentDisplayCap:cap,
        rangePending,status:pending?'preparing':error?'error':profile?.status||'unavailable'}:null);
    }
    function shapeMarkup(){
      if(profiles.length!==2)return '<p>Preparing both surface patterns…</p>';
      const width=560,height=90,left=12,right=548,mid=44;
      const paths=profiles.map((p,i)=>{
        const points=shapeSamples(p),d=points.map((row,j)=>(j?'L':'M')+(left+(right-left)*row.s/T()).toFixed(3)+' '+(mid-30*row.f).toFixed(3)).join(' ');
        return `<path d="${d}" fill="none" stroke="${COLORS[i]}" stroke-width="${mode===i+1?3:2}" opacity="${mode===i+1?1:.65}"/>`;
      }).join('');
      return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Computed surface Hessian modes 1 and 2 on the same fixed segment. Orange: mode 1; gold: mode 2. Vertical height is signed sideways displacement per unit push."><path d="M${left} ${mid}H${right}" stroke="#b4c5b0" stroke-dasharray="3 3"/>${paths}<text x="${left}" y="86">x · 0</text><text x="${right}" y="86" text-anchor="end">p · T=${T().toFixed(3)}</text></svg>`;
    }
    function refresh(){
      const ready=usable()&&!pending&&!rangePending&&!error&&profiles.length===2&&cap>0;
      $('past-second').disabled=!usable()||secondSurfaceEnd(context.data)===null;
      for(const [i,name]of ['one','two'].entries()){$(name).disabled=!usable();$(name).setAttribute('aria-pressed',String(mode===i+1));}
      const focus=surfaceFocus(context.data,mode),label=focus?`Mode ${mode} · +1 focus at ${focus.s.toFixed(3)}`:`Mode ${mode} · no interior +1 focus on this path`;
      if($('focus-label').textContent!==label)$('focus-label').textContent=label;
      // Both profiles stay on the same segment. Only these explicit shortcuts
      // move its endpoint; choosing another mode merely changes which focus
      // the shortcuts refer to. Nearest matching bookmark avoids ambiguous
      // highlights when conjugate events are extremely close together.
      const bookmarks=['before','at','after'].map(where=>({where,s:focusBookmark(context.data,mode,where)}));
      const nearest=bookmarks.filter(row=>row.s!==null).sort((a,b)=>Math.abs(a.s-T())-Math.abs(b.s-T()))[0];
      const stage=nearest&&Math.abs(nearest.s-T())<1e-7?nearest.where:null;
      for(const {where}of bookmarks){$(where).disabled=!usable()||!focus;$(where).setAttribute('aria-pressed',String(stage===where));}
      const sliderLimit=cap||pushLimit;
      $('push').disabled=!ready;$('push').value=maxSign?maxSign*100:sliderLimit?Math.round(100*amplitude/sliderLimit):0;
      $('push').setAttribute('aria-valuetext',amplitude.toFixed(4)+' metric units; same physical amplitude for either mode'+(maxSign?'; maximum requested':''));
      $('amplitude').textContent=amplitude.toFixed(4);$('shapes').innerHTML=shapeMarkup();
      $('segment').textContent=context.data?`Same fixed segment x → p · T = original length = ${T().toFixed(3)}`:'Choose a geodesic to compare its surface modes.';
      for(const [i,name]of ['result-one','result-two'].entries()){
        const p=profiles[i],r=results[i]?.length,sign=p?.status==='downhill'?'downhill':p?.status==='uphill'?'uphill':p?.status==='neutral'?'zero to second order':'sign unresolved';
        $(name).textContent=p?`Mode ${i+1}: ${sign} · λ = ${number(p.eigenvalue)}${r?' · length change '+percent(r.relativeChange)+(r.verified?'':' (unresolved)'):''}`:`Mode ${i+1}: preparing…`;
        $(name).style.color=COLORS[i];
      }
      const r=results[mode-1]?.length,p=profiles[mode-1];
      chart.setContext({comparisonKind:'modes',heading:'Length vs signed surface push',comparisonLabel:'Same fixed segment · both Hessian modes',
        curves:curves.length===2?curves:empty,activeKey:'mode-'+mode,axisMode:'signed',maxAmplitude:cap||pushLimit||.12,pending:pending||rangePending,
        current:r?{amplitude,relativeChange:r.relativeChange,error:r.error/r.baseline,verified:r.verified,samples:curves[mode-1]?.samples,sampleAt:curves[mode-1]?.sampleAt,maxAmplitude:cap}:null});
      let message=!context.active?'':context.surgery?'Comparison pauses during the connected sum.':!context.data?'Choose a geodesic first.':T()<=0?'Move the traversal slider beyond the start to choose a segment.':pending?'Computing both Hessian modes on the same fixed segment…':error?'Mode comparison unavailable: '+error:rangePending?'Current push verified; checking slider range…':!cap?'No common verified finite push range is available.':`Torus: finite push of Hessian mode ${mode}. Length curves: both modes on this same segment.`;
      if(!pending&&!rangePending&&p?.status==='downhill'&&profiles.every(row=>row.status==='downhill'))message=`Torus: finite push of Hessian mode ${mode}. Both independent surface modes are downhill here.`;
      if($('status').textContent!==message)$('status').textContent=message;
      root.dataset.active=String(context.active);root.dataset.mode=String(mode);root.dataset.T=String(T());root.dataset.amplitude=String(amplitude);root.dataset.pending=String(pending);root.dataset.rangePending=String(rangePending);root.dataset.cap=String(cap);
    }
    function evaluate(){
      if(!usable()||profiles.length!==2||pending)return;
      try{results=profiles.map(p=>p.sample(amplitude));if(amplitude!==0)lastNonzeroSafeMagnitude=Math.abs(amplitude);error='';}catch(e){results=[];error=e.message;}
      refresh();emit();
    }
    function applyVerifiedCap(value){
      cap=value;pushLimit=cap;
      // An explicitly selected endpoint means "use the available maximum".
      // Interior settings continue to retain their physical displacement.
      amplitude=maxSign?maxSign*cap:clamp(amplitude,-cap,cap);
    }
    function prepare({keepPush=false}={}){
      cancel();profiles=[];curves=[];results=[];cap=0;rangePending=false;currentDisplayCap=0;if(!keepPush){amplitude=0;pushLimit=0;maxSign=0;lastNonzeroSafeMagnitude=0;}error='';
      if(!usable()){refresh();emit();return;}
      const serial=token,data=context.data,model=context.model,position=T();
      const current=()=>serial===token&&usable()&&context.data===data&&context.model===model&&T()===position;
      function fail(e){if(!current())return;pending=false;error=e.message;profiles=[];curves=[];results=[];refresh();emit();}
      function addCurve(){
        const rank=curves.length+1,p=profiles[rank-1],limit=cap;
        const sampleAt=a=>{if(!Number.isFinite(a)||Math.abs(a)>limit+1e-12)return null;const r=p.length(a);return {amplitude:a,relativeChange:r.relativeChange,error:r.error/r.baseline};};
        curves.push({key:'mode-'+rank,label:'Surface Hessian mode '+rank,color:COLORS[rank-1],maxAmplitude:cap,sampleAt,
          samples:Array.from({length:25},(_,i)=>sampleAt(cap*(i-12)/12))});
      }
      if(options.preparation){
        // Endpoint shortcuts update this component before the next app frame.
        // Establish that same segment before demanding its shared jobs, so the
        // following frame cannot cancel them as work from an obsolete interval.
        options.preparation.setContext?.({data,model,position,active:true,playing:false,surgery:context.surgery});
        const requests=[1,2].map(rank=>({data,model,T:position,type:'surface',mode:rank}));
        const ready=requests.map(request=>options.preparation.peek(request));
        function complete(prepared){
          if(!current())return;
          try{profiles=prepared;curves=[];applyVerifiedCap(Math.min(...profiles.map(p=>p.maxAmplitude)));rangePending=false;error='';if(cap>0){addCurve();addCurve();}pending=false;evaluate();}catch(e){fail(e);}
        }
        if(ready.every(Boolean)){complete(ready);return;}
        pending=true;refresh();emit();
        if(typeof options.preparation.requestCurrent==='function'){
          const knownCaps=ready.filter(Boolean).map(p=>p.maxAmplitude),knownCap=knownCaps.length?Math.min(...knownCaps):Infinity;
          const retainedReference=maxSign?Math.max(pushLimit,lastNonzeroSafeMagnitude):pushLimit;
          const referenceAmplitude=Math.min(retainedReference||.12,knownCap),candidate=maxSign?maxSign*(Math.abs(amplitude)||lastNonzeroSafeMagnitude||referenceAmplitude):amplitude;
          const requestedAmplitude=clamp(candidate,-referenceAmplitude,referenceAmplitude);
          if(!(referenceAmplitude>0)){
            Promise.all(requests.map((request,i)=>ready[i]||options.preparation.request(request,{priority:'reference'}))).then(complete,fail);return;
          }
          amplitude=requestedAmplitude;currentDisplayCap=referenceAmplitude;
          const full=Promise.all(requests.map((request,i)=>ready[i]||options.preparation.requestCurrent(request,requestedAmplitude,{referenceAmplitude})));
          let fullyReady=false;
          full.then(prepared=>{
            if(!current()||fullyReady)return;
            try{
              if(prepared.every(p=>!p.rangePending)){fullyReady=true;complete(prepared);return;}
              profiles=prepared;curves=[];results=[];cap=0;rangePending=true;pending=false;error='';evaluate();
            }catch(e){fail(e);}
          },()=>{if(current()&&!fullyReady){pending=true;refresh();emit();}});
          // The range checks use the same basis, but cannot delay this exact
          // current push or run as foreground work during a traversal hold.
          Promise.all(requests.map((request,i)=>ready[i]||options.preparation.request(request,{priority:'reference'}))).then(prepared=>{fullyReady=true;complete(prepared);},fail);
          return;
        }
        // Promote the shared background jobs instead of repeating verification
        // on the interaction thread or restarting work already in progress.
        try{Promise.all(requests.map((request,i)=>ready[i]||options.preparation.request(request,{priority:'demand'}))).then(complete,fail);}catch(e){fail(e);}
        return;
      }
      pending=true;refresh();emit();
      function step(){
        timer=0;if(!current())return;
        try{
          if(profiles.length<2){profiles.push(getProfile(profiles.length+1));timer=win.setTimeout(step,0);return;}
          applyVerifiedCap(Math.min(...profiles.map(p=>p.maxAmplitude)));
          if(curves.length<2&&cap>0){
            addCurve();
            timer=win.setTimeout(step,0);return;
          }
          pending=false;evaluate();
        }catch(e){fail(e);}
      }
      timer=win.setTimeout(step,80);
    }
    for(const [i,name]of ['one','two'].entries())listen($(name),'click',()=>{options.onPause?.();mode=i+1;evaluate();if(pending){refresh();emit();}});
    listen($('push'),'input',()=>{if(!usable()||pending||!cap)return;options.onPause?.();const fraction=clamp(Number($('push').value)/100,-1,1);maxSign=Math.abs(fraction)===1?Math.sign(fraction):0;amplitude=fraction*cap;evaluate();});
    listen($('past-second'),'click',()=>{const end=secondSurfaceEnd(context.data);if(end===null||!usable())return;options.onPause?.();context={...context,position:end};prepare({keepPush:true});options.onSeek?.(end);});
    for(const where of ['before','at','after'])listen($(where),'click',()=>{
      const end=focusBookmark(context.data,mode,where);if(end===null||!usable())return;
      options.onPause?.();context={...context,position:end};prepare({keepPush:true});options.onSeek?.(end);
    });
    listen(doc,'visibilitychange',()=>{if(doc.hidden){cancel();profiles=[];curves=[];results=[];cap=0;pushLimit=0;maxSign=0;lastNonzeroSafeMagnitude=0;rangePending=false;amplitude=0;refresh();emit();}else if(context.active)prepare();});
    refresh();
    return Object.freeze({setContext(next={}){
      if(destroyed)return;const previous=context;context={...context,...next};
      // Traversal stores T/length and reconstructs T on the next draw. Keep
      // the prepared interval canonical when that roundtrip differs only by
      // floating-point noise; otherwise the exact async guard would abandon
      // its job without starting a replacement.
      if(previous.data===context.data&&previous.model===context.model&&Math.abs(previous.position-context.position)<=1e-10)
        context.position=previous.position;
      if(previous.data!==context.data||previous.model!==context.model)mode=1;
      if(previous.active!==context.active||previous.data!==context.data||previous.model!==context.model||previous.surgery!==context.surgery||Math.abs(previous.position-context.position)>1e-10)
        prepare({keepPush:previous.active&&context.active&&previous.data===context.data&&previous.model===context.model&&!previous.surgery&&!context.surgery});
    },snapshot(){return {active:context.active,mode,T:T(),amplitude,maxAmplitude:cap,pending,rangePending,error,statuses:profiles.map(p=>p.status),eigenvalues:profiles.map(p=>p.eigenvalue)};},destroy(){cancel();destroyed=true;chart.destroy();for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);options.onUpdate?.(null);}});
  }
  return Object.freeze({create,secondSurfaceEnd,shapeSamples,surfaceFocus,focusBookmark});
});
