/* Magnified surface Hessian pushes for drawing only. The physical coefficients,
 * accepted finite curves, and metric length calculations remain in downhill.js.
 * One cached gain is shared by both comparison modes and both push signs. */
(function(root,factory){
  'use strict';const downhill=typeof module==='object'&&module.exports?require('./downhill.js'):root?.GeodesicDownhill,api=factory(downhill);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GeodesicSurfacePushDisplay=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(downhill){
  'use strict';
  const gainCache=new WeakMap();
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>Math.hypot(...v),finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  function unit(v){const length=norm(v);if(!(length>1e-12))throw RangeError('A regular surface variation frame is required.');return v.map(x=>x/length);}
  const owns=(profile,model)=>downhill?.displayProfileModel?.(profile)===model;
  function baselineSample(sample,model,reuseNormal=false){
    const original=sample.original||sample.point;
    if(!finite(original)||!finite(sample.tangent)||!Number.isFinite(sample.f))
      throw TypeError('The surface display needs exact finite baseline samples.');
    const sourceNormal=reuseNormal&&finite(sample.normal)?sample.normal:model.normal(original),normal=unit(sourceNormal),direction=unit(cross(normal,sample.tangent));
    return {s:sample.s,original:original.slice(),normal,sourceNormal,direction,f:sample.f};
  }
  function baseline(profile,model,s){
    return baselineSample(profile.displaySampleAt(0,0,s),model,owns(profile,model));
  }
  function projected(row,model,amplitude,gain){
    if(row.f===0||amplitude===0)return row.original.slice();
    const offset=gain*amplitude*row.f;
    const point=model.project(row.original.map((x,i)=>x+offset*row.direction[i]));
    if(!finite(point))throw RangeError('The displayed surface push must remain finite.');
    return point.slice();
  }
  function cacheFor(first,second,model){
    first=owns(first,model)?first.coefficient:first;second=owns(second,model)?second.coefficient:second;
    let pairs=gainCache.get(first);if(!pairs){pairs=new WeakMap();gainCache.set(first,pairs);}
    let models=pairs.get(second);if(!models){models=new WeakMap();pairs.set(second,models);}
    let entries=models.get(model);if(!entries){entries=new Map();models.set(model,entries);}
    return entries;
  }
  function chooseGain(profiles,model,T,referenceAmplitude,requested){
    const entries=cacheFor(profiles[0],profiles[1]||profiles[0],model),key=T+':'+referenceAmplitude+':'+requested;
    if(entries.has(key))return entries.get(key);
    const count=Math.max(96,Math.ceil(T/.04),32*Math.max(...profiles.map(p=>p.mode||1)));
    const rows=profiles.map(profile=>Array.from({length:count+1},(_,i)=>baseline(profile,model,i===count?T:T*i/count)));
    function valid(gain){
      try{
        for(const path of rows)for(const sign of [-1,1]){
          let previous=null;
          for(const row of path){
            const point=projected(row,model,sign*referenceAmplitude,gain),offset=Math.abs(gain*referenceAmplitude*row.f);
            // Reject jumps to another sheet and large normal reversals. The
            // finite projection is inspected, not presumed safe from a tangent
            // curvature bound. These are drawing checks, not metric estimates.
            if(norm(sub(point,row.original))>1.25*offset+1e-7||
              dot(row.normal,unit(model.normal(point)))<.25||
              typeof model.value==='function'&&Math.abs(model.value(point))>1e-7)return false;
            if(previous){
              const original=sub(row.original,previous.original),squared=dot(original,original);
              if(squared>1e-20&&dot(sub(point,previous.point),original)<.1*squared)return false;
            }
            previous={point,original:row.original};
          }
        }
        return true;
      }catch(_){return false;}
    }
    let gain=requested;
    for(let attempt=0;attempt<12;attempt++){
      if(valid(gain)){
        const result=Object.freeze({magnification:requested,effectiveMagnification:gain,limited:gain<requested*(1-1e-10),referenceAmplitude,projection:'surface'});
        entries.set(key,result);if(entries.size>12)entries.delete(entries.keys().next().value);return result;
      }
      gain*=.75;
    }
    throw RangeError('No regular magnified surface drawing was resolved.');
  }
  function createMap(study,model,{magnification=3}={}){
    if(study?.type!=='surface'||!Number.isFinite(study.T)||study.T<=0||!study.profile||
      typeof study.profile.displaySampleAt!=='function'||!Array.isArray(study.amplitude)||
      !Number.isFinite(study.amplitude[0])||study.amplitude[1]!==0)
      throw TypeError('A prepared surface deformation and physical push are required.');
    if(!model||typeof model.normal!=='function'||typeof model.project!=='function')throw TypeError('A regular surface model is required.');
    if(!Number.isFinite(magnification)||magnification<=0)throw RangeError('Display magnification must be finite and positive.');
    const profiles=Array.isArray(study.displayProfiles)&&study.displayProfiles.length?study.displayProfiles:[study.profile];
    if(profiles.length>2||profiles.some(p=>!p||typeof p.displaySampleAt!=='function'||!Number.isFinite(p.T)||!Number.isFinite(p.maxAmplitude)||p.maxAmplitude<0||Math.abs(p.T-study.T)>1e-9)||!profiles.includes(study.profile))
      throw TypeError('Surface display profiles must share the same fixed segment.');
    const pendingRange=profiles.some(p=>p.rangePending===true);
    const limits=profiles.map(p=>{
      if(p.rangePending!==true)return p.maxAmplitude;
      // A current-only profile verifies this physical push, not a whole slider
      // range. Its reference is solely the unchanged drawing preflight scale.
      if(p.currentVerified!==true||p.maxAmplitude!==0||!Object.is(p.currentAmplitude,study.amplitude[0])||
        !Number.isFinite(p.displayReferenceAmplitude)||p.displayReferenceAmplitude<Math.abs(study.amplitude[0]))
        throw RangeError('The current surface push must be verified before it is displayed.');
      return p.displayReferenceAmplitude;
    });
    const maximumReference=Math.min(...limits),referenceAmplitude=pendingRange?maximumReference:study.displayMaxAmplitude??maximumReference;
    if(!Number.isFinite(referenceAmplitude)||referenceAmplitude<0||referenceAmplitude>maximumReference+1e-10||Math.abs(study.amplitude[0])>referenceAmplitude+1e-10)
      throw RangeError('A positive common physical push range is required.');
    const metadata=referenceAmplitude===0?Object.freeze({magnification,effectiveMagnification:magnification,limited:false,referenceAmplitude,projection:'surface'}):chooseGain(profiles,model,study.T,referenceAmplitude,magnification),amplitude=study.amplitude[0];
    const rows=new WeakMap(),exactFrame=owns(study.profile,model);
    function rowAt(sample){
      if(rows.has(sample))return rows.get(sample);
      const original=sample.original||sample.point;
      // The adaptive renderer supplies the exact zero-push frame. Keep the
      // legacy evaluator for callers without this module's model binding.
      const row=exactFrame?baselineSample(sample,model,finite(sample.point)&&sample.point.every((x,i)=>Object.is(x,original[i]))):baseline(study.profile,model,sample.s);
      rows.set(sample,row);return row;
    }
    function mapSample(sample){
      if(!sample||!Number.isFinite(sample.s)||sample.s<0||sample.s>study.T)throw RangeError('Surface drawing samples must lie on the fixed segment.');
      const original=sample.original||sample.point;
      if(!finite(original))throw TypeError('Finite original surface points are required.');
      if(sample.s===0||sample.s===study.T||amplitude===0)return original.slice();
      const row=rowAt(sample);
      // Re-evaluate the exact mode/frame. Adaptive vertices must not amplify
      // interpolated physical drawing chords or deform the measured curve.
      return projected(row,model,amplitude,metadata.effectiveMagnification);
    }
    return Object.freeze({...metadata,mapSample,originalNormalSample:sample=>rowAt(sample).sourceNormal});
  }
  return Object.freeze({createMap});
});
