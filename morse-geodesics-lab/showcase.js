/* Resolve presentation bookmarks against the selected path's freshly prepared
 * Jacobi events. A bookmark never invents a zero or snaps the numerical field.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicShowcase=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function findPick(data,id){
    if(typeof id!=='string'||!Array.isArray(data?.picks)||!Array.isArray(data?.curves))return null;
    const pick=data.picks.find(p=>p?.id===id);
    if(!pick||!Number.isFinite(pick.surfaceEventS)||pick.surfaceEventS<=0||
      !Number.isFinite(pick.hiddenEventS)||pick.hiddenEventS<=0)return null;
    const curve=data.curves.find(c=>c?.id===pick.curveId);
    return curve&&Number.isFinite(curve.length)&&curve.length>Math.max(pick.surfaceEventS,pick.hiddenEventS)?pick:null;
  }
  function resolveEvent(fields,pick,type){
    if(!fields||!pick||!Array.isArray(fields.interiorEvents)||!['surface','hidden'].includes(type))return null;
    const s=pick[type==='surface'?'surfaceEventS':'hiddenEventS'];
    if(!Number.isFinite(s)||s<=0)return null;
    return fields.interiorEvents.find(event=>!event.endpoint&&event[type]&&
      event.multiplicity===(type==='surface'?1:2)&&Number.isFinite(event.s)&&Math.abs(event.s-s)<=1e-6)||null;
  }
  function beforePosition(fields,pick,type){
    if(!Number.isFinite(fields?.length)||fields.length<=0)return null;
    const event=resolveEvent(fields,pick,type);
    return event?Math.max(0,event.s-.4)/fields.length:null;
  }
  return Object.freeze({findPick,resolveEvent,beforePosition});
});
