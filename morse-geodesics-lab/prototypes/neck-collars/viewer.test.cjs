'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');

test('the standalone page loads its local classic geometry, diagnostics, and audit without fetch or modules',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\s+defer\s+src="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(scripts.length>=8);assert.doesNotMatch(html,/type=["']module["']/);
  const context={};context.window=context;vm.createContext(context);
  for(const src of scripts){
    assert.ok(src.startsWith('.'),'The prototype must not depend on remote assets.');
    const file=path.resolve(__dirname,src.split('?')[0]);assert.ok(fs.existsSync(file),src);
    const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/\bfetch\s*\(/);
    if(!src.includes('viewer.js'))vm.runInContext(source,context,{filename:file});
  }
  const G=context.GeodesicNeckGeometry,D=context.GeodesicNeckDiagnostics;
  assert.equal(G.profiles.length,4);assert.equal(context.GeodesicNeckAudit.profiles.length,G.profiles.length);
  for(const profile of G.profiles){
    const probe=D.sampleProbe(G,profile,{count:32});
    assert.ok(probe.points.every(p=>p.point.every(Number.isFinite)));
    assert.equal(context.GeodesicNeckAudit.profiles.find(p=>p.id===profile.id).spacing,profile.spacing);
  }
});

test('the displayed audit matches the exact current geometry and diagnostic sources',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'results.json'),'utf8'));
  assert.ok(report.sourceFiles.length>=4);
  for(const source of report.sourceFiles){
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,source.path))).digest('hex');
    assert.equal(digest,source.sha256,`Refresh audit.cjs after changing ${source.path}`);
  }
});

test('all selectable candidates meet the height constraint and audited field targets',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'results.json'),'utf8'));
  for(const id of ['height-optimal','height-compact','height-waisted']){
    const row=report.profiles.find(p=>p.id===id);assert.ok(row&&row.kind==='height'&&row.smoothing>0);
    assert.equal(row.heightCertificate.bound,.45);
    assert.ok(row.curvature.maxHeight<=.45+1e-12);
    assert.ok(row.curvature.maxPrincipal<(id==='height-waisted'?2.81:2.49));
    assert.ok(row.curvature.denseJoinScan.maxPrincipal<2.81,'Dense transition checks cannot hide a curvature spike.');
    assert.ok(row.probes.some(p=>p.probeKind==='oblique'));
    assert.ok(row.probes.every(p=>p.raw.minForward>0),'Both directions remain forward at raw 3× in all audited probes.');
  }
});
