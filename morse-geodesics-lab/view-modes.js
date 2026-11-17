/* Rendering and selection policy for catalogue overview and path inspection. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicViews=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const modes=['all','focus','solo'];
  function layout(mode,curves,selectedId){
    if(!modes.includes(mode))throw RangeError('Unknown geodesic view mode.');
    const selected=mode==='all'?null:curves.find(c=>c.id===selectedId)||curves[0]||null;
    return {selected,paths:mode==='solo'?(selected?[selected]:[]):curves};
  }
  function style(mode,curve,selected){
    if(!modes.includes(mode))throw RangeError('Unknown geodesic view mode.');
    const emphasized=mode!=='all'&&!!selected&&curve.id===selected.id;
    return {emphasized,opacity:mode==='focus'&&selected&&!emphasized ? .3 : 1};
  }
  return {layout,style};
});
