const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('one chart only; prediction, actual and sketch all share it',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal((html.match(/<canvas\b/g)||[]).length,1);
 assert.equal((html.match(/<\/html>/gi)||[]).length,1);
 assert.ok(html.trim().endsWith('</html>'));
 for(const id of ['chart','historyRows','checkpointRows','shareButton','drawButton','btcPrice','settingsDialog'])assert.ok(html.includes(`id="${id}"`),id);
 for(const script of ['forecast-core.js','app.js','deepseek.js'])assert.ok(html.includes(`src="./${script}?v=10"`),script);
 assert.doesNotMatch(html,/id="btcForecastCanvas"|id="comparisonPick"/);
});
test('live UI scripts parse and use actual model worker for optional on-device Timestral',()=>{
 for(const name of ['forecast-core.js','app.js','deepseek.js','timestral-worker.js','timestral-prep.js']){
  assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,name),'utf8')),{message:name});
 }
 const src=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(src,/new Worker\('\.\/timestral-worker\.js'\)/);
 assert.match(src,/async function historyRefresh/);
 assert.match(src,/async function backfill/);
 assert.match(src,/function pointerEnd/);
 assert.match(src,/function legacyImport/);
 assert.match(src,/function compressedLink/);
 assert.match(src,/btc-lab-history-v3/);
 assert.match(src,/state\.follow=true/);
});