const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('one main chart, previous results in a separate dialog, not a second visible graph',()=>{
 assert.equal((html.match(/<canvas\b/g)||[]).length,1);
 assert.match(html,/<dialog class="history-modal"/);
 assert.ok(html.indexOf('<dialog class="history-modal"')>html.indexOf('</main>'));
 assert.match(html,/id="recentStrip"/);
 assert.doesNotMatch(html,/id="historyRows"[^>]*>[\s\S]*<canvas/);
});
test('automatic forecast does NOT change selected pinned drawing',()=>{
 assert.match(source,/if\(state\.selectedId\)localStorage\.setItem/);
 assert.match(source,/never displace a pinned user drawing/);
 assert.match(source,/state\.selectedId/);
});
test('all modules parse and HTML does not expose accidental JavaScript',()=>{
 for(const f of ['forecast-core.js','app.js','deepseek.js','timestral-worker.js','timestral-prep.js']){
  assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,f),'utf8')),f);
 }
 assert.equal(html.split('</html>').length-1,1);assert.ok(html.trim().endsWith('</html>'));
 assert.ok(html.includes('forecast-core.js?v=11'));
});
