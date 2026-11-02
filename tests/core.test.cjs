const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateCost, calculateRisk, projectUsage, validSentiment } = require('../core.js');
test('cost estimation accounts for cached tokens and paid search separately',()=>{
  const value=estimateCost({input:10000,cached:5000,output:2000,searches:2,mode:'flash',pricing:'off'});
  const expected=(5000*0.15+5000*0.003+2000*0.60)/1e6+2*.00075;
  assert.ok(Math.abs(value-expected)<1e-12);
});
test('projected session totals use actual tokens plus remaining planned checks',()=>{
  const p=projectUsage({intervalMinutes:30,hours:6,inputTokens:2500,outputTokens:500,completed:2,actual:{input:5000,output:1000,cost:.01}});
  assert.equal(p.totalCalls,12);assert.equal(p.remainingCalls,10);assert.equal(p.actualTokens,6000);assert.equal(p.projectedTokens,36000);
});
test('price drawdown and entry-based stop loss trigger high risk',()=>{
  const r=calculateRisk({price:90000,reference24h:100000,high24h:103000,low24h:89000,settings:{drop24hPct:4,drawdownPct:6,rangePct:8,stopLossPct:5,entryPrice:100000,quantity:.1,priceFloor:0,maxAllocationPct:20,portfolioUSD:100000,sketchLossPct:7,bearishScore:35}});
  assert.equal(r.status,'high');assert.ok(r.triggers.some(x=>x.label==='Entry-based stop-loss level'));assert.equal(r.pnl,-1000);
});
test('missing price produces no fabricated risk result',()=>{
  const r=calculateRisk({price:null,settings:{}});assert.equal(r.status,'unavailable');assert.equal(r.change24h,null);
});
test('sentiment rejects invalid scores and normalizes safe fields',()=>{
  assert.throws(()=>validSentiment({summary:'hello'}));const s=validSentiment({score:150,label:'Bullish',factors:['x',43]});assert.equal(s.score,100);assert.deepEqual(s.factors,['x']);
});
