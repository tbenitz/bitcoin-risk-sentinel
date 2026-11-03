const test=require('node:test'),assert=require('node:assert/strict'),C=require('../comparison-engine.js');
const at=1730754300000;
test('User sketch is anchored to the first BTC quote and timestamp, not the later live price',()=>{
 const r=C.create({at,anchor:100000,horizon:1});C.append(r,.5,99000);C.append(r,1,102000);
 const before=JSON.stringify(r);const laterLivePrice=150000;
 assert.equal(C.atFraction(r.sketch,.5),99000);assert.equal(r.anchor,100000);assert.equal(r.at,at);assert.equal(JSON.stringify(r),before);assert.notEqual(r.sketch.at(-1).price,laterLivePrice);
});
test('closed Coinbase candles score only once their actual timestamps exist',()=>{
 const r=C.create({at,anchor:100,horizon:1});C.append(r,1,112);
 const barClose=at+300000;const market=[[Math.ceil(barClose/300000)*300-300,0,0,0,103]];
 const actual=C.normalizeActual(market,300000,barClose+2000);r.actuals=actual;
 assert.equal(C.score(r,null,at+1000).resolved,0);assert.equal(C.score(r,null,barClose+300001).resolved,1);
 assert.equal(C.score(r,null,barClose+300001).possible,12);
});
test('model is drawn by real absolute timestamps, not reprojected to current live now',()=>{
 const model={horizon:'1h',asOf:at,createdAt:at,anchor:100,points:[{time:at+300000,adapted:110,lo:105,hi:115},{time:at+600000,adapted:120,lo:110,hi:130}]};
 assert.equal(C.modelAt(model,at+450000).price,115);assert.equal(C.modelAt(model,at+450000).lo,107.5);
 assert.equal(C.modelAt(model,at-1),null);
});
test('models created after a forecast checkpoint cannot be evaluated as if known earlier',()=>{
 const r=C.create({at,anchor:100,horizon:1});C.append(r,1,112);
 r.actuals=[{time:at+300000,price:105,source:'closed candle'}];
 const model={horizon:'1h',createdAt:at+360000,asOf:at,anchor:100,points:Array.from({length:12},(_,i)=>({time:at+(i+1)*300000,adapted:104,lo:90,hi:120}))};
 const s=C.score(r,model,at+400000);assert.equal(s.userResolved,1);assert.equal(s.modelResolved,0);assert.equal(s.resolved,1);
});
test('future prices are never invented or counted as accuracy',()=>{
 const r=C.create({at,anchor:100,horizon:6});C.append(r,1,105);
 const s=C.score(r,null,at+5000);assert.equal(s.resolved,0);assert.equal(s.userMae,null);assert.equal(s.modelMae,null);
});
test('only closed candle data passes real-market normalization; duplicates not scored twice',()=>{
 const t=Math.ceil(at/300000)*300000;const raws=[[t/1000,0,0,0,105],[t/1000,0,0,0,106],[(t+300000)/1000,0,0,0,107]];
 const p=C.normalizeActual(raws,300000,t+300000+2000);assert.equal(p.length,1);assert.equal(p[0].price,106);
});
test('rendered dashboard imports comparison scripts and keeps existing model inference',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../comparison-ui.js'),'utf8');
 const model=fs.readFileSync(path.join(__dirname,'../forecast-ui.js'),'utf8');
 assert.match(html,/comparison-engine\.js/);assert.match(html,/comparison-ui\.js/);assert.match(html,/BtcCompare\.draw/);
 assert.match(ui,/localStorage/);assert.match(ui,/modelId/);assert.match(ui,/normalizeActual/);assert.match(model,/BtcForecastTracker/);
});
test('HTML has one final closing tag and its inline scripts parse as JavaScript',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.equal(html.split('</html>').length-1,1);
 assert.ok(html.trim().endsWith('</html>'),'unexpected script or markup after closing html tag');
 const blocks=html.split('<script>').slice(1).map(x=>x.split('</script>')[0]).filter(x=>x.trim());
 assert.ok(blocks.length>0);
 for(const block of blocks)assert.doesNotThrow(()=>new vm.Script(block));
});

test('forecast zoom expands legitimate small moves without changing forecast values',()=>{
 const anchor=77100;
 const detail=C.viewRange({anchor,horizon:1,rangePct:5,mode:'detail',sketch:[77100,74000,80000],predictions:[77100,77112,77075,77090],actuals:[77101,77088]});
 const full=C.viewRange({anchor,horizon:1,rangePct:5,mode:'full',sketch:[77100,74000,80000],predictions:[77100,77112,77075,77090]});
 assert.equal(detail.mode,'detail');
 assert.ok(detail.min<=77075&&detail.max>=77112);
 assert.ok(full.min<=74000&&full.max>=80000);
 assert.ok(detail.max-detail.min<full.max-full.min/20,'detail must not be flattened by the sketch');
 assert.ok(detail.zoomFactor>20);
 const again=C.viewRange({anchor,horizon:1,rangePct:5,mode:'detail',sketch:[200000,1],predictions:[77100,77112,77075,77090],actuals:[77101,77088]});
 assert.deepEqual({min:detail.min,max:detail.max},{min:again.min,max:again.max},'changing the sketch must not alter forecast zoom');
});
test('chart contains selectable full and zoom ranges and explicitly displays real forecast changes',()=>{
 const fs=require('node:fs'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../comparison-ui.js'),'utf8');
 assert.match(source,/Forecast zoom · reveal moves/);
 assert.match(source,/Full range · include sketch/);
 assert.match(source,/E\.viewRange/);
 assert.match(source,/Forecast values are unchanged/);
 assert.match(source,/sketchInView/);
 assert.match(source,/g\.range\.mode==='full'/);
 assert.match(source,/toFixed\(3\)/);
});