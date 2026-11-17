/* Optional fixed-endpoint length study. Numerical profiles come from downhill.js;
 * this component owns no geodesic data and no continuously running animation. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicDownhillControls=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function eventChoices(data){
    if(!data)return [];
    const events=(data.interiorEvents||data.events||[]).filter(e=>!e.endpoint&&Number.isFinite(e.s)&&e.s>0&&e.s<data.length).slice().sort((a,b)=>a.s-b.s);
    const counts={surface:0,hidden:0},result=[];
    for(const event of events)for(const type of ['hidden','surface'])if(event[type]){
      const mode=++counts[type];
      result.push({key:type+':'+mode,type,mode,s:event.s,event,
        previousS:events.filter(e=>e.s<event.s).at(-1)?.s??0,
        nextS:events.find(e=>e.s>event.s)?.s??data.length,
        label:(type==='hidden'?'Hidden Hessian mode ':'Surface Hessian mode ')+mode+' · '+(type==='hidden'?'+2':'+1')+' at '+event.s.toFixed(3)});
    }
    return result;
  }
  function bookmark(choice,where,length){
    if(!choice||!Number.isFinite(choice.s)||!Number.isFinite(length)||length<=0)return null;
    if(where==='at')return choice.s;
    // Stay on the same finite geodesic and never cross its original endpoints.
    const gap=where==='before'?choice.s-(choice.previousS??0):(choice.nextS??length)-choice.s;
    const distance=Math.min(.2,choice.s*.25,(length-choice.s)*.4,gap*.4);
    if(where!=='before'&&where!=='after')return null;
    return choice.s+(where==='before'?-distance:distance);
  }
  function radialClamp(a,b,maximum=1){
    if(![a,b,maximum].every(Number.isFinite)||maximum<0)throw RangeError('Finite displacement and nonnegative radius required.');
    const radius=Math.hypot(a,b),scale=radius>maximum&&radius>0?maximum/radius:1;
    return [a*scale,b*scale];
  }
  function lengthDescription(energy,amplitude){
    if(!energy)return 'Length comparison is being prepared.';
    if(!amplitude.some(v=>v!==0))return 'Same endpoints. Move the push control to compare a nearby curve.';
    if(energy.verified&&energy.delta< -Math.abs(energy.error||0))return 'Shorter path with the same endpoints.';
    if(Math.abs(energy.delta)<=Math.abs(energy.error||0)||!energy.verified)return 'The length change is below numerical resolution; try a larger permitted push.';
    return 'Longer path with the same endpoints.';
  }
  function create(root,options={}){
    if(!root||typeof root.querySelector!=='function')throw TypeError('A downhill controls container is required.');
    const doc=root.ownerDocument,win=doc.defaultView,prefix=(root.id||'downhill')+'-';
    root.classList.add('downhill-controls');
    root.innerHTML=`
      <details data-downhill="details"><summary>Push the path · length study <span>Optional · before, at, and after a focus</span></summary>
        <div class="downhill-study-kind"><button type="button" data-downhill="compare" aria-pressed="false">Compare surface modes 1 &amp; 2</button><span>Hessian push patterns · Jacobi ribbon stays separate</span></div>
        <div data-downhill="mode-comparison" hidden></div>
        <div class="downhill-body" data-downhill="single-study">
          <div class="downhill-toolbar"><label for="${prefix}event">Push pattern <select id="${prefix}event" data-downhill="event" aria-label="Choose a conjugate event for the length study"></select></label><div class="downhill-bookmarks" role="group" aria-label="Move the segment endpoint around the chosen focus"><button type="button" data-downhill="before">Before</button><button type="button" data-downhill="at">At focus</button><button type="button" data-downhill="after">After</button></div><button type="button" data-downhill="dock" aria-label="Show hidden view beside torus" title="Show hidden view beside torus">Hidden view ↗</button><button type="button" data-downhill="reset">Reset push</button></div>
          <p class="downhill-segment" data-downhill="segment">Select a geodesic to study a fixed-endpoint segment.</p>
          <div class="downhill-grid">
            <div class="downhill-push">
              <label class="downhill-surface" data-downhill="surface-panel" for="${prefix}surface">One sideways direction <output data-downhill="surface-value">0.000</output><input id="${prefix}surface" data-downhill="surface" type="range" min="-100" max="100" step="1" value="0" aria-label="Surface deformation amplitude"><small>Horizontal axis: signed sideways push, negative left and positive right. Both signs are sides of one direction. Below the original-length line means shorter.</small></label>
              <div class="downhill-hidden" data-downhill="hidden-panel" hidden><div class="downhill-hidden-directions" role="group" aria-label="Choose one hidden push direction"><button type="button" data-downhill="hidden-direction-1" aria-pressed="true">Hidden direction 1</button><button type="button" data-downhill="hidden-direction-2" aria-pressed="false">Hidden direction 2</button></div><label for="${prefix}hidden-size">Push size <output data-downhill="hidden-size-value">0.000</output><input id="${prefix}hidden-size" data-downhill="hidden-size" type="range" min="0" max="100" step="1" value="0" aria-label="Hidden push size"></label><small>One hidden direction at a time. Both share the same eigenvalue and length response. Hidden push shown schematically in 3D; length uses the manifold metric.</small><details class="downhill-display-scale"><summary>Display scale &amp; directions <output data-downhill="magnification-value">3.0×</output></summary><label for="${prefix}projection">3D drawing directions<select id="${prefix}projection" data-downhill="projection" aria-label="Hidden push drawing directions"><option value="surface">Follow surface</option><option value="fixed">Stable illustration</option></select></label><label for="${prefix}magnification">3D displacement scale<input id="${prefix}magnification" data-downhill="magnification" type="range" min="1" max="6" step="0.1" value="3" aria-label="Hidden push display magnification"></label><small>Follow surface turns the drawing directions with the torus and may reduce scale near tight bends. Stable illustration keeps two fixed 3D directions as you traverse; these represent the hidden coordinates schematically. One scale along the whole path preserves relative sizes and zeros. Physical push size and measured length stay fixed.</small></details></div>
              <small data-downhill="radius-note">Horizontal axis: hidden push size, starting at 0. Switching hidden direction keeps the same physical size and length. Below the original-length line means shorter.</small>
            </div>
            <div class="downhill-energy" aria-label="Measured length comparison"><div data-downhill="landscape"></div><div class="downhill-energy-values"><span>Original <output>100%</output></span><span>Pushed <output data-downhill="energy">100%</output></span><span class="downhill-change">Change <output data-downhill="change">0%</output></span></div><small data-downhill="energy-error">Est. numerical error ±0%</small></div>
            <div class="downhill-guidance"><p data-downhill="status" role="status" aria-live="polite">Open this study after choosing a geodesic.</p><details class="downhill-numerics"><summary>Metric and numerical check</summary><p data-downhill="numerics"></p><p>These are nearby curves with the segment endpoints held fixed. The green surface ribbon shows the Jacobi field along the original geodesic; the coral surface curve is the finite push. The original destination y is a dimmed reference. Hidden displacement is drawn along two schematic directions in the main 3D view, one at a time. The separate hidden view is optional; length uses the manifold metric.</p></details></div>
          </div>
        </div>
      </details>`;
    const $=name=>root.querySelector('[data-downhill="'+name+'"]');
    const landscape=win.GeodesicEnergyLandscape.create($('landscape'));
    let context={data:null,model:null,position:0,playing:false,surgery:false},choices=[],choiceKey='',profile=null,result=null,amplitude=[0,0],pushLimit=0,preparing=false,error='',destroyed=false,timer=0,token=0;
    let referenceCurves=null,profileSamples=null,profileSampler=null,landscapePending=false,landscapeTimer=0,landscapeError='';
    let comparison=false,comparisonStudy=null,modeComparison=null,hiddenDirection=1,displayMagnification=3,displayProjection='surface';
    // A user-selected endpoint means the maximum of each verified range.
    // Numerical clamping must not turn that setting into a smaller request.
    let surfaceMaximum=0,surfaceMaximumReference=.12;
    const emptyCurves=[];
    const cache=new WeakMap(),referenceCache=new WeakMap(),listeners=[],preparation=options.preparation;
    const idleReferences=typeof win.requestIdleCallback==='function'&&typeof win.cancelIdleCallback==='function';
    const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
    const open=()=>!destroyed&&$('details').open;
    const usable=()=>open()&&!context.surgery&&!doc.hidden&&!!context.data&&!!context.model;
    const choice=()=>choices.find(c=>c.key===choiceKey)||null;
    const canPush=()=>usable()&&!preparing&&!error&&profile?.maxAmplitude>0;
    // The two hidden axes share one verified radial length calculation. A
    // direction change at the same radius does not require an unchecked push.
    const canChooseHiddenDirection=()=>canPush()||usable()&&!preparing&&!error&&choice()?.type==='hidden'&&profile?.currentVerified&&profile.rangePending&&Number.isFinite(profile.currentRadius);
    const T=()=>context.data?clamp(Number(context.position)||0,0,context.data.length):0;
    const pause=()=>options.onPause?.();
    function cancel(){token++;if(timer)win.clearTimeout(timer);if(landscapeTimer){if(idleReferences)win.cancelIdleCallback(landscapeTimer);else win.clearTimeout(landscapeTimer);}timer=landscapeTimer=0;preparing=false;landscapePending=false;}
    function scheduleReference(step){
      // These optional comparison profiles must yield to the selected curve and active input.
      landscapeTimer=idleReferences?win.requestIdleCallback(step,{timeout:1000}):win.setTimeout(step,32);
    }
    function emit(){
      if(comparison){options.onUpdate?.(comparisonStudy);return;}
      const selected=choice();
      const study=usable()&&selected&&T()>0?{active:true,data:context.data,type:selected.type,T:T(),profile,result,
        amplitude:amplitude.slice(),hiddenDirection,displayMagnification,displayProjection,eventS:selected.s,mode:selected.mode,status:preparing?'preparing':error?'error':profile?.status||'unavailable'}:null;
      options.onUpdate?.(study);
    }
    function refresh(){
      $('compare').disabled=!usable();$('compare').setAttribute('aria-pressed',String(comparison));
      $('compare').textContent=comparison?'Return to focus study':'Compare surface modes 1 & 2';
      $('single-study').hidden=comparison;$('mode-comparison').hidden=!comparison;
      if(comparison){root.dataset.open=String(open());root.dataset.type='surface';syncComparison();return;}
      const selected=choice(),ready=usable()&&!!selected;
      $('event').disabled=!ready;
      for(const name of ['before','at','after'])$(name).disabled=!ready||preparing;
      $('reset').disabled=!ready||!amplitude.some(Boolean)&&!(selected?.type==='surface'&&surfaceMaximum)||!!profile?.rangePending;
      $('dock').hidden=selected?.type!=='hidden';$('dock').disabled=!ready;
      $('surface-panel').hidden=selected?.type!=='surface';$('hidden-panel').hidden=selected?.type!=='hidden';
      $('radius-note').hidden=selected?.type!=='hidden';
      for(const name of ['surface','hidden-size'])$(name).disabled=!canPush();
      for(const name of ['hidden-direction-1','hidden-direction-2'])$(name).disabled=!canChooseHiddenDirection();
      $('magnification').disabled=!ready;$('projection').disabled=!ready;$('projection').value=displayProjection;
      const maximum=profile?.rangePending?pushLimit:profile?.maxAmplitude??pushLimit,size=Math.hypot(...amplitude),normalized=maximum>0?amplitude[0]/maximum:0;
      $('surface').value=selected?.type==='surface'&&surfaceMaximum?surfaceMaximum*100:Math.round(normalized*100);$('surface-value').textContent=amplitude[0].toFixed(4);
      $('surface').setAttribute('aria-valuetext',amplitude[0].toFixed(4)+(profile?.rangePending?' metric units; slider range is being verified':' metric units; maximum magnitude '+maximum.toFixed(4))+(selected?.type==='surface'&&surfaceMaximum?'; maximum requested':''));
      $('hidden-size').value=Math.round(maximum>0?size/maximum*100:0);$('hidden-size-value').textContent=size.toFixed(4);
      $('hidden-size').setAttribute('aria-valuetext',size.toFixed(4)+' metric units in hidden direction '+hiddenDirection+'; maximum '+maximum.toFixed(4));
      for(const direction of [1,2])$('hidden-direction-'+direction).setAttribute('aria-pressed',String(hiddenDirection===direction));
      $('magnification').value=displayMagnification;$('magnification-value').textContent=displayMagnification.toFixed(1)+'× requested';
      $('magnification').setAttribute('aria-valuetext',displayMagnification.toFixed(1)+' times requested visual magnification; applied scale is labelled on the 3D view; length unchanged');
      const energy=result?.length;
      const exponent=Math.floor(Math.log10(Math.abs(100*(energy?.relativeChange||1))));
      const digits=Math.max(6,Math.min(10,2-exponent));
      $('energy').textContent=energy?((1+energy.relativeChange)*100).toFixed(digits)+'%':'100%';
      $('change').textContent=energy&&energy.delta!==0?(energy.delta>0?'+':'−')+Math.abs(100*energy.relativeChange).toPrecision(4)+'%':'0%';
      $('energy-error').textContent=energy?'Est. numerical error ±'+(energy.error===0?'0':Math.abs(100*energy.error/energy.baseline).toPrecision(2))+'%':'Estimating numerical error…';
      root.classList.toggle('has-lower-energy',!!energy&&energy.verified&&energy.delta< -Math.abs(energy.error||0));
      root.classList.toggle('has-higher-energy',!!energy&&energy.verified&&energy.delta>Math.abs(energy.error||0));
      const stage=['before','at','after'].find(where=>Math.abs((bookmark(selected,where,context.data?.length)??-1)-T())<1e-7)||'current';
      for(const name of ['before','at','after'])$(name).setAttribute('aria-pressed',String(stage===name));
      landscape.setContext({curves:referenceCurves||emptyCurves,activeKey:referenceCurves?stage:'current',axisMode:selected?.type==='hidden'?'radius':'signed',maxAmplitude:Math.max(.12,maximum),pending:preparing||landscapePending||!!profile?.rangePending,
        current:energy?{amplitude:selected?.type==='hidden'?Math.hypot(...amplitude):amplitude[0],relativeChange:energy.relativeChange,error:energy.error/energy.baseline,verified:energy.verified,samples:profileSamples,sampleAt:profileSampler,maxAmplitude:maximum}:null});
      let message;
      if(context.surgery)message='The length study pauses during the connected sum.';
      else if(!context.data)message='Choose a geodesic to study its fixed-endpoint length.';
      else if(!selected)message='This path has no interior conjugate events to demonstrate.';
      else if(preparing)message='Checking the fixed-endpoint mode and finite-curve length…';
      else if(error)message='Length study unavailable: '+error;
      else if(profile?.rangePending)message='Current push verified; checking the slider range. '+lengthDescription(energy,amplitude);
      else if(profile&&!maximum)message='A reliable finite push range was not found for this segment.';
      else if(profile){
        const interpretation=profile.status==='uphill'?'Before the focus, this mode resists small pushes.':profile.status==='neutral'?'At the focus, this mode is flat to second order; finite pushes can still change length.':profile.status==='uncertain'?'The second-order sign is too close to zero to resolve; the finite length is measured separately.':selected.type==='hidden'?'After the focus, two independent hidden directions are downhill (+2 index).':'After the focus, one surface direction is downhill (+1 index); its two signs count as one.';
        message=interpretation+' '+(amplitude.some(Boolean)?lengthDescription(energy,amplitude):'Push, then switch Before / At focus / After to compare this mode.');
      }else message=lengthDescription(energy,amplitude);
      if($('status').textContent!==message)$('status').textContent=message;
      const segmentIndex=context.data?.countBefore?context.data.countBefore(T()):0;
      $('segment').textContent=context.data?`Study x → p · distance ${T().toFixed(3)} · index ${segmentIndex}. Push holds both ends fixed; Before / At / After moves p and keeps your push.`:'Select a geodesic to study a fixed-endpoint segment.';
      $('numerics').textContent=profile?`Mode ${selected?.mode}: eigenvalue ${profile.eigenvalue.toExponential(4)}; estimated eigenvalue error ${Number(profile.eigenError||0).toExponential(2)}. Length L = ∫|velocity| ds on [0, ${T().toFixed(4)}]. Original L = ${T().toPrecision(6)}. ${energy?'Estimated length error '+Number(energy.error||0).toExponential(2)+'. ':''}${profile.rangePending?'Only the current push has completed verification; the slider range is still being checked.':'Maximum physical push '+maximum.toPrecision(4)}${selected?.type==='hidden'?'; valid tube radius '+profile.tubeRadius:''}. ${landscapeError}`:'The length comparison is prepared only while this optional study is open.';
      root.dataset.open=String(open());root.dataset.type=selected?.type||'';root.dataset.status=preparing?'preparing':profile?.status||'';
      root.dataset.hiddenDirection=String(hiddenDirection);root.dataset.displayMagnification=String(displayMagnification);root.dataset.displayProjection=displayProjection;
      root.dataset.T=String(T());root.dataset.amplitude=JSON.stringify(amplitude);root.dataset.delta=String(energy?.delta??0);root.dataset.verified=String(!!energy?.verified);
    }
    function evaluate(){
      if(!profile||!usable())return;
      try{result=profile.sample(...amplitude);error='';}catch(e){result=null;error=e.message;}
      refresh();emit();
    }
    const profileOptions=(data,model,selected,position)=>({data,model,T:position,type:selected.type,mode:selected.mode,eventS:selected.s});
    function cachedProfile(data,model,selected,position){return cache.get(data)?.get(model)?.get(selected?.key+':'+position)||
      (selected?preparation?.peek(profileOptions(data,model,selected,position)):null)||null;}
    function rememberProfile(data,model,selected,position,prepared){
      let models=cache.get(data);if(!models){models=new WeakMap();cache.set(data,models);}
      let profiles=models.get(model);if(!profiles){profiles=new Map();models.set(model,profiles);}
      const key=selected.key+':'+position;
      profiles.set(key,prepared);if(profiles.size>16)profiles.delete(profiles.keys().next().value);return prepared;
    }
    function getProfile(data,model,selected,position){
      return cachedProfile(data,model,selected,position)||rememberProfile(data,model,selected,position,
        win.GeodesicDownhill.prepare(profileOptions(data,model,selected,position)));
    }
    function requestProfile(data,model,selected,position,priority){
      const cached=cachedProfile(data,model,selected,position);
      if(cached)return Promise.resolve(cached);
      return preparation.request(profileOptions(data,model,selected,position),{priority}).then(prepared=>
        rememberProfile(data,model,selected,position,prepared));
    }
    function scanProfile(prepared){
      if(!prepared?.maxAmplitude)return [];
      return Array.from({length:25},(_,i)=>{
        const a=prepared.type==='hidden'?prepared.maxAmplitude*i/24:prepared.maxAmplitude*(i-12)/12;
        return measureSample(prepared,a);
      });
    }
    function measureSample(prepared,a){
      if(!Number.isFinite(a)||prepared.type==='hidden'&&a<0||Math.abs(a)>prepared.maxAmplitude+1e-12)return null;
      const e=prepared.length(a);
      return {amplitude:a,relativeChange:e.relativeChange,error:e.error/e.baseline};
    }
    function cachedReferences(data,model,selected){return referenceCache.get(data)?.get(model)?.get(selected?.key)||null;}
    function prepareReferences(serial,data,model,selected){
      if(referenceCurves||!usable())return;
      const curves=[],stages=[['before','Before'],['at','At focus'],['after','After']];
      async function step(){
        if(serial!==token||!usable()||context.data!==data)return;landscapeTimer=0;
        try{
          const [key,label]=stages[curves.length],position=bookmark(selected,key,data.length);
          const prepared=preparation?await requestProfile(data,model,selected,position,'reference'):getProfile(data,model,selected,position);
          if(serial!==token||!usable()||context.data!==data)return;
          curves.push({key,label,samples:scanProfile(prepared),maxAmplitude:prepared.maxAmplitude,sampleAt:a=>measureSample(prepared,a)});
          if(curves.length<stages.length){scheduleReference(step);return;}
          let models=referenceCache.get(data);if(!models){models=new WeakMap();referenceCache.set(data,models);}
          let references=models.get(model);if(!references){references=new Map();models.set(model,references);}
          references.set(selected.key,curves);referenceCurves=curves;landscapePending=false;refresh();
        }catch(e){if(serial!==token||!usable()||context.data!==data)return;landscapePending=false;landscapeError='Comparison curves unavailable: '+e.message;refresh();}
      }
      scheduleReference(step);
    }
    function prepare({keepPush=false}={}){
      if(comparison){cancel();syncComparison();return;}
      cancel();profile=null;result=null;profileSamples=null;profileSampler=null;if(!keepPush){amplitude=[0,0];pushLimit=0;surfaceMaximum=0;surfaceMaximumReference=.12;}error='';landscapeError='';
      const selected=choice();
      referenceCurves=cachedReferences(context.data,context.model,selected);
      if(!usable()||!selected||T()<=0){refresh();emit();return;}
      preparing=true;landscapePending=!referenceCurves;
      const serial=token,data=context.data,model=context.model,position=T(),cached=cachedProfile(data,model,selected,position);
      const current=()=>serial===token&&usable()&&context.data===data&&context.model===model&&T()===position;
      const apply=preparedProfile=>{
        if(!current())return;
        profile=preparedProfile;
        if(profile.rangePending){
          pushLimit=pushLimit||profile.displayReferenceAmplitude;
          amplitude=selected.type==='hidden'?hiddenAmplitude(profile.currentRadius,profile.displayReferenceAmplitude):[profile.currentAmplitude,0];profileSampler=null;profileSamples=null;
          preparing=false;evaluate();return;
        }
        pushLimit=profile.maxAmplitude;
        if(selected.type==='surface'&&pushLimit>0)surfaceMaximumReference=pushLimit;
        const prepared=profile;profileSampler=a=>measureSample(prepared,a);
        amplitude=selected.type==='hidden'?hiddenAmplitude(Math.hypot(...amplitude),profile.maxAmplitude):[surfaceMaximum?(profile.maxAmplitude>0?surfaceMaximum*profile.maxAmplitude:0):clamp(amplitude[0],-profile.maxAmplitude,profile.maxAmplitude),0];
        profileSamples=scanProfile(profile);preparing=false;evaluate();prepareReferences(serial,data,model,selected);
      };
      const complete=async()=>{
        timer=0;if(serial!==token||!usable()||context.data!==data)return;
        try{
          let preparedProfile=cached;
          if(!preparedProfile&&preparation?.requestCurrent){
            preparation.setContext?.({data,model,position,active:true,playing:false,surgery:false});
            const currentAmplitude=selected.type==='surface'&&surfaceMaximum&&amplitude[0]===0?surfaceMaximum*surfaceMaximumReference:amplitude[0];
            try{preparedProfile=await preparation.requestCurrent(profileOptions(data,model,selected,position),currentAmplitude,{B:selected.type==='hidden'?amplitude[1]:0,referenceAmplitude:Math.max(pushLimit||.12,Math.abs(currentAmplitude))});}
            catch(e){if(!current()||e.name==='AbortError')return;preparedProfile=await requestProfile(data,model,selected,position,'demand');}
          }
          preparedProfile=preparedProfile||(preparation?await requestProfile(data,model,selected,position,'demand'):getProfile(data,model,selected,position));
          if(serial!==token||!usable()||context.data!==data)return;
          apply(preparedProfile);
          if(preparedProfile.rangePending)requestProfile(data,model,selected,position,'reference').then(apply,e=>{
            if(!current())return;landscapeError='Slider range unavailable: '+e.message;refresh();
          });
        }catch(e){if(serial!==token||!usable()||context.data!==data)return;preparing=false;landscapePending=false;profile=null;result=null;error=e.message;refresh();emit();}
      };
      // A verified profile needs no debounce or blank preparation frame when revisited.
      if(cached)complete();else{refresh();emit();if(preparation?.requestCurrent)complete();else timer=win.setTimeout(complete,80);}
    }
    function hiddenAmplitude(size,maximum=profile?.maxAmplitude||0){
      const value=clamp(Number.isFinite(size)?size:0,0,maximum);
      return hiddenDirection===1?[value,0]:[0,value];
    }
    function setAmplitude(value){
      if(!canPush())return;
      pause();surfaceMaximum=choice().type==='surface'&&Math.abs(value)===profile.maxAmplitude?Math.sign(value):0;
      amplitude=choice().type==='hidden'?hiddenAmplitude(value):[clamp(value,-profile.maxAmplitude,profile.maxAmplitude),0];evaluate();
    }
    function move(where){
      const s=bookmark(choice(),where,context.data?.length);if(s===null||!usable())return;
      pause();context={...context,position:s};prepare({keepPush:true});options.onSeek?.(s);
    }
    function populate(){
      choices=eventChoices(context.data);
      const tolerance=context.data?.eventTolerance||1e-7;
      const current=choices.find(c=>Math.abs(c.s-T())<=tolerance),hidden=choices.filter(c=>c.type==='hidden');
      const nearest=(hidden.length?hidden:choices).slice().sort((a,b)=>Math.abs(a.s-T())-Math.abs(b.s-T()))[0];
      choiceKey=(current||nearest)?.key||'';
      const nodes=choices.map(c=>{const option=doc.createElement('option');option.value=c.key;option.textContent=c.label;return option;});
      if(!nodes.length){const option=doc.createElement('option');option.value='';option.textContent='No interior conjugate events';nodes.push(option);}
      $('event').replaceChildren(...nodes);$('event').value=choiceKey;
    }
    function syncComparison(){
      modeComparison?.setContext({active:comparison&&usable(),data:context.data,model:context.model,position:T(),surgery:context.surgery});
    }
    listen($('compare'),'click',()=>{
      if(!usable())return;pause();cancel();comparison=!comparison;comparisonStudy=null;
      if(comparison&&!modeComparison)modeComparison=win.GeodesicSurfaceModeComparison.create($('mode-comparison'),{
        preparation,
        onPause:pause,onSeek:s=>{context={...context,position:s};options.onSeek?.(s);syncComparison();},
        onUpdate:study=>{
          if(!comparison)return;comparisonStudy=study;
          root.dataset.mode=String(study?.mode||1);root.dataset.hiddenDirection=String(hiddenDirection);root.dataset.displayMagnification=String(displayMagnification);root.dataset.displayProjection=displayProjection;
      root.dataset.T=String(T());root.dataset.amplitude=JSON.stringify(study?.amplitude||[0,0]);
          root.dataset.status=study?.status||'';emit();
        }
      });
      refresh();syncComparison();if(!comparison)prepare();else{emit();options.onOpen?.();}
    });
    listen($('details'),'toggle',()=>{
      if(open()){pause();populate();prepare();refresh();options.onOpen?.();}else{cancel();comparisonStudy=null;syncComparison();profile=null;result=null;profileSamples=null;referenceCurves=null;amplitude=[0,0];surfaceMaximum=0;surfaceMaximumReference=.12;refresh();emit();}
    });
    listen($('event'),'change',()=>{pause();choiceKey=$('event').value;prepare({keepPush:true});});
    for(const where of ['before','at','after'])listen($(where),'click',()=>move(where));
    listen($('reset'),'click',()=>{pause();surfaceMaximum=0;amplitude=[0,0];if(preparing)prepare({keepPush:true});else if(profile)evaluate();else{refresh();emit();}});
    listen($('dock'),'click',()=>{pause();options.onDock?.();});
    listen($('surface'),'input',()=>setAmplitude(Number($('surface').value)/100*(profile?.maxAmplitude||0)));
    listen($('hidden-size'),'input',()=>setAmplitude(Number($('hidden-size').value)/100*(profile?.maxAmplitude||0)));
    for(const direction of [1,2])listen($('hidden-direction-'+direction),'click',()=>{
      if(!canChooseHiddenDirection()||choice()?.type!=='hidden')return;
      pause();const size=Math.hypot(...amplitude);hiddenDirection=direction;amplitude=hiddenAmplitude(size,profile.rangePending?profile.currentRadius:profile.maxAmplitude);evaluate();
    });
    listen($('magnification'),'input',()=>{
      const value=Number($('magnification').value);if(!usable()||choice()?.type!=='hidden'||!Number.isFinite(value))return;
      displayMagnification=clamp(value,1,6);refresh();emit();
    });
    listen($('projection'),'change',()=>{
      const value=$('projection').value;if(!usable()||choice()?.type!=='hidden'||!['fixed','surface'].includes(value))return;
      displayProjection=value;refresh();emit();
    });
    listen(doc,'visibilitychange',()=>{if(doc.hidden){cancel();comparisonStudy=null;syncComparison();profile=null;result=null;amplitude=[0,0];surfaceMaximum=0;surfaceMaximumReference=.12;refresh();emit();}else if(open())prepare();});
    refresh();
    return Object.freeze({
      setContext(next={}){
        if(destroyed)return;
        const previous=context;context={...context,...next};
        // Keep the same established interval through traversal's T/length roundtrip.
        if(previous.data===context.data&&previous.model===context.model&&Math.abs(previous.position-context.position)<=1e-10)
          context.position=previous.position;
        const changed=previous.data!==context.data||previous.model!==context.model||Math.abs(previous.position-context.position)>1e-10||previous.surgery!==context.surgery;
        if(previous.data!==context.data)populate();
        if(open()&&context.playing&&!previous.playing)pause();
        if(comparison){refresh();return;}
        if(changed){
          if(open())prepare({keepPush:previous.data===context.data&&previous.model===context.model&&!context.surgery});
          else if(previous.data!==context.data||previous.model!==context.model||previous.surgery!==context.surgery){cancel();profile=null;result=null;amplitude=[0,0];surfaceMaximum=0;surfaceMaximumReference=.12;refresh();}
        }
      },
      selectEvent(event){
        if(!open()||!event)return false;
        if(comparison){context={...context,position:event.s};pause();syncComparison();return true;}
        const current=choice(),matching=choices.filter(c=>Math.abs(c.s-event.s)<=Math.max(1e-6,context.data?.eventTolerance||0)&&event[c.type]);
        const selected=matching.find(c=>c.type===current?.type)||matching[0];if(!selected)return false;
        choiceKey=selected.key;$('event').value=choiceKey;context={...context,position:event.s};pause();prepare({keepPush:true});return true;
      },
      snapshot(){return comparison?{...modeComparison?.snapshot(),open:open(),comparison:true,T:T()}: {open:open(),comparison:false,preparing,error,type:choice()?.type||null,mode:choice()?.mode||null,T:T(),eventS:choice()?.s??null,amplitude:amplitude.slice(),hiddenDirection,displayMagnification,displayProjection,maxAmplitude:profile?.maxAmplitude||0,status:profile?.status||null,length:result?.length||null};},
      destroy(){cancel();destroyed=true;modeComparison?.destroy();landscape.destroy();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);options.onUpdate?.(null);}
    });
  }
  return Object.freeze({create,eventChoices,bookmark,radialClamp,lengthDescription,energyDescription:lengthDescription});
});
