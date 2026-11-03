const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('published HTML is not corrupted with JavaScript visible after closing html',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal((html.match(/<\/html>/gi)||[]).length,1);
 assert.equal(html.trim().endsWith('</html>'),true);
 assert.ok(html.includes('forecast-engine.js'));
 assert.ok(html.includes('forecast-ui.js'));
 assert.ok(!html.includes('Configure your Worker endpoint'));
 const inline=html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(inline&&inline.includes('function renderUsage'));
 assert.doesNotThrow(()=>new vm.Script(inline));
});
test('all client-side scripts parse and on-device Timestral inference is bundled',()=>{
 for(const file of ['core.js','deepseek.js','forecast-engine.js','forecast-ui.js','comparison-engine.js','comparison-ui.js','timestral-prep.js','timestral-worker.js']){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  assert.doesNotThrow(()=>new vm.Script(code),file);
 }
 const worker=fs.readFileSync(path.join(root,'timestral-worker.js'),'utf8');
 assert.match(worker,/onnxruntime-web/);
 assert.match(worker,/importScripts\(['"]\.\/timestral-prep\.js['"]\)/);
 const forecast=fs.readFileSync(path.join(root,'forecast-ui.js'),'utf8');
 assert.match(forecast,/new Worker\(['"]\.\/timestral-worker\.js['"]\)/);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/comparison-engine\.js/);
 assert.match(html,/comparison-ui\.js/);
});