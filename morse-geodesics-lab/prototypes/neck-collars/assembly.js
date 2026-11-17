/* Isolated construction preview. The two fronts reveal sections of the final
 * comparison surface; no temporary neck or production geometry is morphed. */
(function(root,factory){
  'use strict';
  const geometry=typeof module==='object'&&module.exports?require('./geometry.js'):root.GeodesicNeckGeometry;
  const api=factory(geometry);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GeodesicNeckAssembly=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const TAU=2*Math.PI;
  function sample(profile,progress,{count=96}={}){
    if(typeof profile==='string')profile=G.profiles.find(p=>p.id===profile);
    if(!profile||![profile.seamX,profile.spacing].every(Number.isFinite)||profile.seamX<=0||profile.spacing<=2*profile.seamX)
      throw TypeError('A regular collar profile and its attachment planes are required.');
    if(!Number.isFinite(progress)||progress<0||progress>1)
      throw RangeError('Construction progress must lie in [0,1].');
    if(!Number.isSafeInteger(count)||count<3||count>512)
      throw RangeError('A construction section needs between 3 and 512 samples.');
    const center=profile.spacing/2,joined=progress===1;
    const left=joined?center:progress===0?profile.seamX:profile.seamX+progress*(center-profile.seamX);
    const right=joined?center:profile.spacing-left;
    const rings=(joined?[left]:[left,right]).map(x=>{
      const points=[],normals=[];
      for(let i=0;i<count;i++){
        const p=G.evaluate(profile,x,TAU*i/count);
        if(!p.point?.every(Number.isFinite)||!p.normal?.every(Number.isFinite))
          throw RangeError('A construction section must have finite points and normals.');
        points.push(p.point.slice());normals.push(p.normal.slice());
      }
      return {x,points,normals,closed:true};
    });
    return {progress,left,right,joined,rings};
  }
  return Object.freeze({sample});
});
