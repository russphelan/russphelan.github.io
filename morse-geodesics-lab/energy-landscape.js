/* A measured length landscape. The historical API name stays compatible with
 * the host; every curve and uncertainty comes from finite arc-length evaluation. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicEnergyLandscape=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const COLORS={before:'#bd613e',at:'#8d72ae',after:'#247d69',current:'#315b67'};
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=v=>typeof v==='number'&&Number.isFinite(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function validateAxisMode(mode){
    if(mode!=='signed'&&mode!=='radius')throw RangeError('A signed surface axis or hidden radius axis is required.');
    return mode;
  }
  function percent(value,digits=3){
    if(!finite(value))return '—';if(value===0)return '0%';
    const amount=Math.abs(value*100);
    return (value<0?'−':'+')+(amount<.0001?amount.toExponential(1):Number(amount.toPrecision(digits)).toString())+'%';
  }
  function energyState(current){
    if(!current||!finite(current.relativeChange))return 'unavailable';
    if(current.amplitude===0&&current.relativeChange===0)return 'original';
    if(current.verified===false||Math.abs(current.relativeChange)<=Math.abs(current.error||0))return 'unresolved';
    return current.relativeChange>0?'higher':'lower';
  }
  function validateCurves(curves){
    if(!Array.isArray(curves))throw TypeError('Measured length curves are required.');
    return curves.map(curve=>{
      if(!curve||typeof curve.key!=='string'||!Array.isArray(curve.samples))throw TypeError('A named sampled length curve is required.');
      let previous=-Infinity;
      const samples=curve.samples.map(s=>{
        if(!s||!finite(s.amplitude)||!finite(s.relativeChange)||!finite(s.error??0)||(s.error??0)<0||s.amplitude<=previous)
          throw RangeError('Ordered finite length samples with nonnegative relative uncertainty are required.');
        previous=s.amplitude;return {amplitude:s.amplitude,relativeChange:s.relativeChange,error:s.error??0};
      });
      const domain=curve.maxAmplitude??Math.max(0,...samples.map(p=>Math.abs(p.amplitude)));
      if(!finite(domain)||domain<0)throw RangeError('Finite nonnegative physical push range required.');
      if(curve.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(curve.color))throw RangeError('A six-digit hex curve color is required.');
      return {key:curve.key,label:curve.label||curve.key,color:curve.color,samples,source:curve.samples,sampleAt:typeof curve.sampleAt==='function'?curve.sampleAt:null,maxAmplitude:domain};
    });
  }
  function extent(curves,current=null){
    let maximum=0;
    for(const curve of curves)for(const s of curve.samples)maximum=Math.max(maximum,Math.abs(s.relativeChange)+s.error);
    if(current&&finite(current.relativeChange))maximum=Math.max(maximum,Math.abs(current.relativeChange)+Math.abs(current.error||0));
    return maximum>0?maximum*1.12:1e-6;
  }
  function coordinates(amplitude,relativeChange,maximum,vertical,width=360,height=128,axisMode='signed'){
    validateAxisMode(axisMode);
    if(![amplitude,relativeChange,maximum,vertical,width,height].every(finite)||maximum<=0||vertical<=0)throw RangeError('Finite positive chart scales required.');
    const left=72,right=width-18,top=20,bottom=height-24,mid=(top+bottom)/2;
    const fraction=axisMode==='radius'?amplitude/maximum:(amplitude/maximum+1)/2;
    return {x:left+fraction*(right-left),y:mid-(bottom-top)/2*relativeChange/vertical};
  }
  function path(samples,maximum,vertical,width=360,height=128,axisMode='signed'){
    return samples.map((s,i)=>{const p=coordinates(s.amplitude,s.relativeChange,maximum,vertical,width,height,axisMode);return (i?'L':'M')+p.x.toFixed(3)+' '+p.y.toFixed(3);}).join(' ');
  }
  function visibleSamples(curve,range,cache,axisMode='signed'){
    validateAxisMode(axisMode);
    const domain=Math.min(range,curve.maxAmplitude);
    if(!(domain>0))return [];
    if(range>=curve.maxAmplitude)return axisMode==='radius'?curve.samples.filter(s=>s.amplitude>=0):curve.samples;
    if(curve.sampleAt){
      let values=cache?.get(curve.source);if(!values&&cache){values=new Map();cache.set(curve.source,values);}
      const key=axisMode+':'+domain.toPrecision(14);if(values?.has(key))return values.get(key);
      const samples=Array.from({length:33},(_,i)=>{
        const amplitude=axisMode==='radius'?domain*i/32:domain*(i-16)/16,result=curve.sampleAt(amplitude);
        if(!result||!finite(result.relativeChange)||!finite(result.error??0)||(result.error??0)<0)throw RangeError('Finite measured length and uncertainty required.');
        return {amplitude,relativeChange:result.relativeChange,error:result.error??0};
      });
      values?.set(key,samples);if(values?.size>12)values.delete(values.keys().next().value);
      return samples;
    }
    // Supplied measurements stay measurements: no invented interpolation when
    // zoom exposes a region that lacks sufficiently dense evaluated samples.
    return curve.samples.filter(s=>Math.abs(s.amplitude)<=domain+1e-14&&(axisMode!=='radius'||s.amplitude>=0));
  }
  function resolvedShape(curve){return !!curve?.samples.some(s=>Math.abs(s.relativeChange)>s.error);}
  function create(root){
    if(!root||typeof root.querySelector!=='function')throw TypeError('A length landscape container is required.');
    root.classList.add('energy-landscape');
    const id='length-landscape-'+Math.random().toString(36).slice(2),win=root.ownerDocument?.defaultView;
    root.innerHTML=`<div class="energy-landscape-heading"><span data-length="heading">Length vs surface push</span><strong data-length="state"></strong></div><div data-length="plot"></div><p data-length="axis-label" class="length-axis-label"></p><div data-length="legend" class="energy-landscape-legend"></div><div class="length-scale-controls"><div class="length-fit-buttons" role="group" aria-label="Length graph scale"><button type="button" data-length="selected">Fit selected</button><button type="button" data-length="comparison">Compare all</button></div><label>Vertical zoom <output data-length="vertical-value">1×</output><input data-length="vertical" type="range" min="0" max="3" step="0.05" value="0" aria-label="Length graph vertical zoom"></label><label><span data-length="horizontal-label">Signed range</span> <output data-length="horizontal-value">±0.12</output><input data-length="horizontal" type="range" min="0" max="2" step="0.05" value="0" aria-label="Length graph horizontal zoom"></label></div><p data-length="caption" class="energy-landscape-caption"></p>`;
    const $=name=>root.querySelector('[data-length="'+name+'"]');
    let context={curves:[],activeKey:'',current:null,maxAmplitude:.12,pending:false,axisMode:'signed'},referenceSource=null,referenceCurrentSource=null,referenceAxis='signed',comparisonExtent=0,destroyed=false,mode='auto',verticalZoom=1,horizontalZoom=1,timer=0,resizeObserver=null;
    const sampleCache=new WeakMap(),listeners=[];
    const listen=(name,type,fn)=>{const node=$(name);node.addEventListener(type,fn);listeners.push([node,type,fn]);};
    function render(){
      if(destroyed)return;
      const {activeKey,current,maxAmplitude,pending}=context,axisMode=validateAxisMode(context.axisMode);
      if(axisMode==='radius'&&current?.amplitude<0)throw RangeError('Hidden push radius cannot be negative.');
      if(!finite(maxAmplitude)||maxAmplitude<=0)throw RangeError('Positive physical amplitude scale required.');
      let curves=validateCurves(context.curves);
      const currentSource=activeKey==='current'?current?.samples??null:null;
      if(currentSource)curves.push(...validateCurves([{key:'current',label:'Current segment',samples:currentSource,sampleAt:current.sampleAt,maxAmplitude:current.maxAmplitude??maxAmplitude}]));
      const range=maxAmplitude/horizontalZoom;
      curves=curves.map(c=>({...c,samples:visibleSamples(c,range,sampleCache,axisMode)}));
      const active=curves.find(c=>c.key===activeKey),within=current&&Math.abs(current.amplitude)<=range+1e-14?current:null;
      // A manually chosen segment can add a curve beside the cached bookmarks.
      // Its scale must leave with that curve, even when the bookmark array is reused.
      if(context.curves!==referenceSource||currentSource!==referenceCurrentSource||axisMode!==referenceAxis){
        referenceSource=context.curves;referenceCurrentSource=currentSource;referenceAxis=axisMode;comparisonExtent=extent(curves,within);
      }
      comparisonExtent=Math.max(comparisonExtent,extent(curves,within));
      const selected=mode==='selected'||mode==='auto'&&activeKey==='at';
      const selectedCurves=active?[active]:[];
      const base=selected?extent(selectedCurves,within):comparisonExtent,vertical=base/verticalZoom;
      const state=pending?'pending':energyState(current),names={higher:'Longer path',lower:'Shorter path',original:'Original length',unresolved:'Change unresolved',unavailable:'Choose a push',pending:'Measuring length…'};
      const shapeResolved=resolvedShape(active),showActive=!(selected&&active&&!shapeResolved);
      const w=Math.max(280,root.getBoundingClientRect?.().width||360),h=132,left=72,right=w-18,top=20,bottom=h-24,mid=(top+bottom)/2;
      const radius=axisMode==='radius',zeroX=radius?left:(left+right)/2;
      const horizontalDescription=radius?'hidden push size, starting at zero':'signed surface push a; negative and positive values are opposite sides';
      const rangeDescription=radius?'radius from zero to '+range.toPrecision(3):'signed push from minus '+range.toPrecision(3)+' to plus '+range.toPrecision(3);
      const modes=context.comparisonKind==='modes';
      const description=`Horizontal axis: ${horizontalDescription}. Vertical axis: length change relative to the original segment; below zero means shorter. ${selected?'Selected curve fitted independently.':modes?'Both Hessian modes share the same fixed segment and comparison scale.':'Before, at, and after share one comparison scale.'} ${names[state]}${current?' '+percent(current.relativeChange):''}. Displayed ${rangeDescription}; vertical zoom ${verticalZoom.toPrecision(3)}.`;
      const curvePaths=curves.map(c=>{
        if(c===active&&!showActive)return '';
        return `<path d="${path(c.samples,range,vertical,w,h,axisMode)}" fill="none" stroke="${c.color||COLORS[c.key]||COLORS.current}" stroke-width="${c===active?3.2:1.2}" opacity="${c===active?1:modes?.65:.25}"${c.key==='at'?' stroke-dasharray="4 3"':''}/>`;
      }).join('');
      let fill='',uncertainty='',marker='';
      if(active?.samples.length&&showActive){
        const first=coordinates(active.samples[0].amplitude,0,range,vertical,w,h,axisMode),last=coordinates(active.samples.at(-1).amplitude,0,range,vertical,w,h,axisMode),d=path(active.samples,range,vertical,w,h,axisMode)+` L${last.x} ${mid} L${first.x} ${mid} Z`;
        fill=`<path d="${d}" fill="#d5774b" opacity=".16" clip-path="url(#${id}-above)"/><path d="${d}" fill="#329578" opacity=".18" clip-path="url(#${id}-below)"/>`;
      }
      if(active?.samples.length){
        const upper=active.samples.map(s=>({...s,relativeChange:s.relativeChange+s.error})),lower=active.samples.slice().reverse().map(s=>({...s,relativeChange:s.relativeChange-s.error}));
        uncertainty=`<path d="${path(upper,range,vertical,w,h,axisMode)} ${path(lower,range,vertical,w,h,axisMode).replace(/^M/,'L')} Z" fill="#8b7f9a" opacity=".16"/>`;
      }
      if(current&&finite(current.relativeChange)&&finite(current.amplitude)){
        const p=coordinates(current.amplitude,current.relativeChange,range,vertical,w,h,axisMode),color=state==='higher'?COLORS.before:state==='lower'?COLORS.after:'#7d8180',err=(bottom-top)/2*Math.abs(current.error||0)/vertical;
        marker=`<line x1="${p.x}" x2="${p.x}" y1="${mid}" y2="${p.y}" stroke="${color}" stroke-width="3" opacity=".65"/><circle cx="${p.x}" cy="${mid}" r="2.3" fill="#8c9d91"/><line x1="${p.x}" x2="${p.x}" y1="${p.y-err}" y2="${p.y+err}" stroke="${color}" stroke-width="5" opacity=".35"/><circle cx="${p.x}" cy="${p.y}" r="5.2" fill="${state==='unresolved'?'#fffdf5':color}" stroke="#fffdf5" stroke-width="2"/>`;
      }
      const missing=active&&active.samples.length<3,clipped=curves.some(c=>c.samples.some(p=>Math.abs(p.relativeChange)+p.error>vertical))||current&&(Math.abs(current.amplitude)>range||Math.abs(current.relativeChange)+Math.abs(current.error||0)>vertical);
      const overlay=selected&&active&&!shapeResolved?'Shape below numerical resolution':missing?'More samples needed at this push range':'';
      $('state').textContent=names[state];$('state').className='energy-state-'+state;
      $('plot').innerHTML=`<svg class="energy-landscape-plot" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(description)}"><defs><clipPath id="${id}-plot"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/></clipPath><clipPath id="${id}-above"><rect x="${left}" y="${top}" width="${right-left}" height="${mid-top}"/></clipPath><clipPath id="${id}-below"><rect x="${left}" y="${mid}" width="${right-left}" height="${bottom-mid}"/></clipPath></defs><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="6" fill="#fafbf5"/><path d="M${left} ${top}H${right}M${left} ${bottom}H${right}" stroke="#dce5d8" stroke-width=".6"/><text x="${left-6}" y="${top+3}" text-anchor="end">${percent(vertical)}</text><text x="${left-6}" y="${bottom+3}" text-anchor="end">${percent(-vertical)}</text><text x="${left-6}" y="${mid-3}" text-anchor="end" class="energy-zero-label">Original</text><text x="${left-6}" y="${mid+8}" text-anchor="end">0% change</text><path d="M${left} ${mid}H${right}" stroke="#9bad9f" stroke-dasharray="4 4"/><path d="M${zeroX} ${top}V${bottom}" stroke="#dbe3d6" stroke-dasharray="2 4"/><g clip-path="url(#${id}-plot)">${fill}${uncertainty}${curvePaths}${marker}</g>${overlay?`<text x="${(left+right)/2}" y="${top+14}" text-anchor="middle" class="length-unresolved-label">${overlay}</text>`:''}<text x="${left}" y="${h-7}" text-anchor="start">${radius?'0 · no push':'−'+Number(range.toPrecision(3))}</text><text x="${(left+right)/2}" y="${h-7}" text-anchor="middle">${radius?Number((range/2).toPrecision(3)):'0 · no push'}</text><text x="${right}" y="${h-7}" text-anchor="end">${radius?'':'+'}${Number(range.toPrecision(3))}</text></svg>`;
      const legend=modes?curves:['before','at','after'].map(key=>({key,label:key==='at'?'At focus':key[0].toUpperCase()+key.slice(1),color:COLORS[key]}));
      $('legend').innerHTML=legend.map(c=>`<span class="${c.key===activeKey?'is-active':''}" style="--energy-color:${c.color||COLORS[c.key]||COLORS.current}"><i></i>${escape(c.label)}</span>`).join('');
      $('selected').setAttribute('aria-pressed',String(selected));$('comparison').setAttribute('aria-pressed',String(!selected));
      $('vertical').value=Math.log10(verticalZoom);$('horizontal').value=Math.log10(horizontalZoom);
      $('heading').textContent=context.heading||(radius?'Length vs hidden push size':'Length vs surface push');
      $('axis-label').textContent=radius?'Hidden push size · 0 means no push':'Signed surface push a · − and + are opposite sides';
      $('horizontal-label').textContent=radius?'Radius range':'Signed range';
      $('vertical-value').textContent=Number(verticalZoom.toPrecision(3))+'×';$('horizontal-value').textContent=(radius?'0–':'±')+Number(range.toPrecision(3));
      $('vertical').setAttribute('aria-valuetext',Number(verticalZoom.toPrecision(3))+' times vertical zoom');$('horizontal').setAttribute('aria-valuetext',(radius?'Hidden radius from zero to ':'Surface push range plus or minus ')+Number(range.toPrecision(3))+' metric units');
      $('caption').textContent=(selected?'Selected curve scale':'Shared comparison scale')+' · '+(context.comparisonLabel||'each segment versus its own original')+(clipped?' · outside curves clipped':'')+(current&&Math.abs(current.amplitude)>range?' · current push outside range':'');
      root.dataset.energyState=state;root.dataset.energyExtent=String(vertical);root.dataset.activeCurve=activeKey;root.dataset.scaleMode=selected?'selected':'comparison';root.dataset.pushRange=String(range);root.dataset.verticalZoom=String(verticalZoom);root.dataset.shapeResolved=String(shapeResolved);root.dataset.axisMode=axisMode;
    }
    function setScale(next={}){
      // A fit/reset action supersedes any slider change still waiting in the
      // debounce queue; otherwise that old zoom would undo the user's click.
      if(timer&&win)win.clearTimeout(timer);timer=0;
      if(next.mode!==undefined){if(!['auto','selected','comparison'].includes(next.mode))throw RangeError('Known graph fit mode required.');mode=next.mode;}
      if(next.verticalZoom!==undefined){if(!finite(next.verticalZoom))throw RangeError('Finite zoom required.');verticalZoom=clamp(next.verticalZoom,1,1000);}
      if(next.horizontalZoom!==undefined){if(!finite(next.horizontalZoom))throw RangeError('Finite zoom required.');horizontalZoom=clamp(next.horizontalZoom,1,100);comparisonExtent=0;}
      render();
    }
    const delayedZoom=()=>{
      if(timer&&win)win.clearTimeout(timer);
      const requested={verticalZoom:10**Number($('vertical').value),horizontalZoom:10**Number($('horizontal').value)};
      if(win)timer=win.setTimeout(()=>{timer=0;setScale(requested);},90);else setScale(requested);
    };
    listen('vertical','input',delayedZoom);listen('horizontal','input',delayedZoom);
    for(const name of ['selected','comparison'])listen(name,'click',()=>setScale({mode:name,verticalZoom:1,horizontalZoom:1}));
    if(typeof win?.ResizeObserver==='function'){resizeObserver=new win.ResizeObserver(()=>render());resizeObserver.observe(root);}
    function setContext(next={}){
      if(timer&&win&&(next.curves!==undefined&&next.curves!==context.curves||next.axisMode!==undefined&&next.axisMode!==context.axisMode||next.pending===true||next.current===null)){win.clearTimeout(timer);timer=0;}
      context={...context,...next};render();
    }
    setContext();
    return Object.freeze({setContext,setScale,snapshot(){return {mode,verticalZoom,horizontalZoom,extent:Number(root.dataset.energyExtent)};},destroy(){destroyed=true;if(timer&&win)win.clearTimeout(timer);resizeObserver?.disconnect();for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);root.replaceChildren();}});
  }
  return Object.freeze({create,percent,energyState,validateCurves,extent,coordinates,path,visibleSamples,resolvedShape});
});
