'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
  crypto=require('node:crypto'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),{generate}=require('./prepare-offline.cjs');
const root=__dirname,base=new URL('https://offline.invalid/morse-geodesics-lab/'),read=file=>fs.readFileSync(path.join(root,file)),
  hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const context={self:{}};vm.runInNewContext(read('offline-assets.js').toString(),context);
const manifest=JSON.parse(JSON.stringify(context.self.GeodesicOfflineAssets)),urls=manifest.assets.flatMap(asset=>asset.urls),
  absolute=new Set(urls.map(url=>new URL(url,base).href)),html=read('index.html').toString();
function localFile(url){
  const parsed=new URL(url,base);assert.equal(parsed.origin,base.origin);assert.ok(parsed.pathname.startsWith(base.pathname),url+' leaves the app scope');
  assert.equal(parsed.hash,'');const file=path.resolve(root,decodeURIComponent(parsed.pathname.slice(base.pathname.length)));
  assert.ok(file.startsWith(root+path.sep),url+' escapes the app directory');return file;
}
function included(url){assert.ok(absolute.has(new URL(url,base).href),'Offline bundle is missing '+url);}

test('the checked-in offline release is current, deterministic, and check mode never writes files',()=>{
  const tracked=['index.html','service-worker.js','offline-assets.js'],before=tracked.map(file=>hash(read(file))),
    first=generate({write:false}),second=generate({write:false});
  assert.equal(first.stale,false,'Run node prepare-offline.cjs after editing app files');
  assert.deepEqual(first.manifest,manifest);assert.deepEqual(second,first);
  const checked=spawnSync(process.execPath,[path.join(root,'prepare-offline.cjs'),'--check'],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);
  assert.deepEqual(tracked.map(file=>hash(read(file))),before);
  assert.match(manifest.version,/^[a-f0-9]{20}$/);
  assert.equal(html.match(/<meta\s+name="offline-release"\s+content="([^"]+)"/)?.[1],manifest.version);
  assert.equal(read('service-worker.js').toString().match(/const RELEASE = '([^']+)'/)?.[1],manifest.version);
});

test('every offline URL resolves to the exact checked-in bytes and covers current page dependencies',()=>{
  assert.equal(absolute.size,urls.length,'Duplicate URL in the offline bundle');let total=0;
  for(const asset of manifest.assets){
    assert.ok(asset.urls.length);const filename=localFile(asset.urls[0]),bytes=fs.readFileSync(filename);
    for(const url of asset.urls)assert.equal(localFile(url),filename,'Aliases must refer to the same file');
    assert.equal(asset.size,bytes.length,filename);assert.equal(asset.sha256,hash(bytes),filename);total+=bytes.length;
  }
  assert.equal(manifest.totalBytes,total);included('./index.html');
  // Inspect resource tags independently of the generator's ./-only extraction.
  for(const tag of html.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)){
    for(const attr of tag[0].matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)){
      const url=attr[1]??attr[2]??attr[3];if(!url||/^(?:#|data:|blob:)/i.test(url))continue;included(url);
    }
  }
});

test('both worker entries, their query-specific imports, and all six catalogue presets are available offline',()=>{
  const owners=read('app.js').toString()+'\n'+read('search-worker-factory.js').toString(),
    workers=[...owners.matchAll(/['"](\.\/[^'"]*(?:solver-worker|surgery-preparation-worker)\.js\?[^'"]+)['"]/g)].map(match=>match[1]);
  assert.equal(new Set(workers).size,2);
  for(const worker of workers){
    included(worker);const source=fs.readFileSync(localFile(worker),'utf8');
    const imports=[...source.matchAll(/['"](\.\/[^'"]+\.js(?:\?[^'"]*)?)['"]/g)].map(match=>match[1]);
    assert.equal(imports.length,3,'Each numerical worker must retain its three dependencies');
    for(const dependency of imports)included(new URL(dependency,new URL(worker,base)).href);
  }
  const catalogueVersion=read('catalogue-loader.js').toString().match(/\bversion\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.ok(catalogueVersion);
  const expected=[];for(const surface of ['torus','double','triple'])for(const endpoints of ['default','alternate']){
    const url='./catalogues/'+surface+'-'+endpoints+'.json?v='+encodeURIComponent(catalogueVersion);included(url);expected.push(new URL(url,base).pathname);
  }
  const actual=urls.map(url=>new URL(url,base).pathname).filter(name=>name.includes('/catalogues/')&&name.endsWith('.json'));
  assert.deepEqual(actual.sort(),expected.sort());
});

test('installation metadata and correctly sized Home Screen icons belong to the offline app',()=>{
  const app=JSON.parse(read('manifest.webmanifest'));
  for(const property of ['id','start_url','scope'])assert.equal(app[property],'./',property);
  assert.equal(app.display,'standalone');assert.equal(app.orientation,undefined);
  assert.equal(app.theme_color,'#f6f3ec');assert.equal(app.background_color,'#f6f3ec');included('./manifest.webmanifest');
  const icons=[...app.icons,{src:'./icons/apple-touch-icon.png',sizes:'180x180',type:'image/png'}];
  assert.deepEqual(app.icons.map(icon=>icon.sizes).sort(),['192x192','512x512']);
  for(const icon of icons){
    included(icon.src);assert.equal(icon.type,'image/png');const bytes=fs.readFileSync(localFile(icon.src)),[width,height]=icon.sizes.split('x').map(Number);
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);
  }
  assert.match(html,/<link\s+rel="apple-touch-icon"[^>]*href="\.\/icons\/apple-touch-icon\.png"/);
});

test('the bundle avoids obsolete catalogue copies and development-only files',()=>{
  const names=urls.map(url=>new URL(url,base).pathname.slice(base.pathname.length));
  assert.ok(!names.includes('catalogue-data.js'),'The legacy monolith duplicates the complete catalogue bundle');
  assert.ok(!names.some(name=>/^catalogues\/.*\.js$/.test(name)),'JSON fallback wrappers duplicate catalogue bytes');
  assert.ok(!names.some(name=>/\.test\.cjs$|^prepare-/.test(name)),'Development helpers are not runtime dependencies');
});
