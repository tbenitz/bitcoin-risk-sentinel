const test=require('node:test'),assert=require('node:assert/strict'),F=require('../forecast-core.js');
const candle=(time,price,source='Coinbase')=>({time,price,source});
const at=1730000000000;
const cfg=F.CONFIG['1h'],ms=cfg.seconds*1000;
const series=Array.from({length:200},(_,i)=>candle(at+(i-199)*ms,70000+i*2+70*Math.sin(i/10)));
const build=()=>F.createPrediction({candles:series,horizon:'1h',now:at+1000,prior:[]});
test('fresh forecast is frozen from actual closed candles only',()=>{
 const r=build();
 assert.equal(r.asOf,at);assert.ok(r.madeAt>at);
 assert.equal(r.points.length,12);
 assert.ok(r.points.every(x=>x.actual===null&&x.time>at));
 assert.ok(Number.isFinite(r.points[0].forecast));
 assert.ok(!r.sketch);
});
test('a human drawing is ATTACHED to the same frozen model prediction, not a second record',()=>{
 const r=build(),old=JSON.stringify(r.points.map(p=>p.forecast));
 const targetAt=at+2*60*1000; // before first 5m candle closes
 F.attachDrawing(r,{at:targetAt,anchor:r.anchor+5,points:[{f:0,price:r.anchor+5},{f:.5,price:r.anchor+300},{f:1,price:r.anchor-100}]});
 assert.equal(JSON.stringify(r.points.map(p=>p.forecast)),old);
 assert.equal(r.sketchAt,targetAt);assert.equal(r.points[0].time,at+ms);
 assert.ok(r.points.slice(0,8).some(p=>Number.isFinite(p.user)));
 assert.ok(r.sketch);
 assert.throws(()=>F.attachDrawing(r,{at:targetAt+1000,anchor:r.anchor,points:[{f:0,price:r.anchor},{f:1,price:r.anchor}]}),/already saved/);
});
test('late user sketches are never scored retroactively on earlier observed candles',()=>{
 const r=build();const drawAt=at+7*60*1000;
 F.attachDrawing(r,{at:drawAt,anchor:r.anchor,points:[{f:0,price:r.anchor},{f:1,price:r.anchor+800}]});
 assert.equal(r.points[0].user,null);
 assert.ok(Number.isFinite(r.points[2].user));
});
test('closed candles settle only at exact future timestamps, never before they occur',()=>{
 const r=build(),first=r.points[0].time;
 assert.equal(F.settle(r,[candle(first,r.anchor+100)],first-2000),0);
 assert.equal(F.settle(r,[candle(first+ms,r.anchor+100)],first+10000),0);
 assert.equal(F.settle(r,[candle(first,r.anchor+100)],first+2000),1);
 assert.equal(F.settle(r,[candle(first,r.anchor+100)],first+4000),0);
 const score=F.scoreRecord(r);
 assert.equal(score.scored,1);assert.ok(score.forecastMae>=0);
});
test('different exchange data never silently verifies a prior Coinbase forecast',()=>{
 const r=build();const first=r.points[0].time;
 assert.equal(F.settle(r,[candle(first,r.anchor,'Kraken')],first+2000),0);
});
test('calibration requires completed verified predictions, not guesses or projected outcomes',()=>{
 const r=build();
 const w=F.weightsFromHistory([r],'1h',['analog','momentum'],at+20000);
 assert.equal(w.trained,false);assert.equal(w.evidence.n,0);
});
