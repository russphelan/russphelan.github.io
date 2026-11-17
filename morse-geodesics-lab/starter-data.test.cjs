'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const data=require('./starter-data.js'),S=require('./surface.js'),G=require('./solver.js'),Store=require('./search-store.js');
const {buildStarterData}=require('./prepare-catalogues.cjs');
const catalogues=Object.fromEntries(['torus','double','triple'].flatMap(surface=>['default','alternate'].map(preset=>{
  const key=surface+':'+preset;
  return [key,JSON.parse(fs.readFileSync(path.join(__dirname,'catalogues',surface+'-'+preset+'.json'),'utf8'))];
})));

test('the compact startup bank contains the two shortest validated full-precision curves for every exploration configuration',()=>{
  assert.equal(data.schemaVersion,1);assert.deepEqual(Object.keys(data.catalogues),Object.keys(catalogues));
  for(const [key,entry]of Object.entries(data.catalogues)){
    const [surface,preset]=key.split(':'),source=catalogues[key],model=S.getModel(surface);
    const config={surface,endpointPreset:preset,geometryVersion:model.geometryVersion,
      solverVersion:G.solverVersion,normalCurvature:.36,endpoints:model.endpoints[preset]};
    const shortest=source.curves.filter(curve=>Store.validateCurve(curve,config)).slice()
      .sort((a,b)=>a.length-b.length||a.theta-b.theta).slice(0,2);
    assert.equal(entry.curves.length,2,key);
    assert.deepEqual(entry.curves,shortest,key+' must keep all original coordinates, Jacobi samples and diagnostics');
    for(const curve of entry.curves)assert.equal(Store.validateCurve(curve,config),true,key);
    assert.deepEqual(entry.endpoints,source.endpoints);assert.deepEqual(entry.searchOptions,source.searchOptions);
    assert.equal(entry.geometryVersion,source.geometryVersion);assert.equal(entry.normalCurvature,source.normalCurvature);
  }
});

test('the startup bank regenerates deterministically without mutating the source catalogue or rounding samples',()=>{
  const before=JSON.stringify(catalogues),built=buildStarterData(catalogues);
  assert.deepEqual(built,data);assert.equal(JSON.stringify(catalogues),before);
  assert.ok(fs.statSync(require.resolve('./starter-data.js')).size<1024*1024,'The startup bank stays below one megabyte.');
});

test('the browser startup bank loads without fetch, workers, storage or application initialization',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./starter-data.js'),'utf8'),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.GeodesicStarterData)),data);
});

test('the startup builder rejects missing, stale or insufficiently verified catalogue data',()=>{
  assert.throws(()=>buildStarterData({}),/Missing current starter catalogue/);
  const copy=structuredClone(catalogues);copy['torus:default'].geometryVersion='obsolete';
  assert.throws(()=>buildStarterData(copy),/Missing current starter catalogue/);
  copy['torus:default']=structuredClone(catalogues['torus:default']);
  copy['torus:default'].curves=copy['torus:default'].curves.slice(0,1);
  assert.throws(()=>buildStarterData(copy),/Two validated starter paths/);
});
