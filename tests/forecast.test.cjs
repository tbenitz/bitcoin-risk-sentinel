const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../forecast-engine.js');

test('Coinbase candles are ordered and only fully closed candles count',()=>{
 const now=1700000000000;
 const raw=[[Math.floor((now-300000)/1000),0,0,0,100],[Math.floor((now-600000)/1000),0,0,0,102],[Math.floor((now-600000)/1000),0,0,0,103],[Math.floor(now/1000),0,0,0,999]];
 const x=F.parseCandles(raw,300,now);
 assert.equal(x.length,1);assert.equal(x[0].price,103);
});
test('rejects bogus model and shape outputs instead of fabricating a forecast',()=>{
 assert.throws(()=>F.validateForecast({median:[1],q10:[0],q90:[2]},12),/invalid quantile dimensions/);
 assert.throws(()=>F.validateForecast({median:Array(12).fill(100),q10:Array(12).fill(120),q90:Array(12).fill(150)},12),/invalid price quantiles/);
});
test('every predicted point is only scored once the corresponding BTC candle closes',()=>{
 const anchor=100,time=1700000000000,config=F.HORIZONS['1h'];
 const values={median:Array(12).fill(101),q10:Array(12).fill(95),q90:Array(12).fill(110)};
 const forecast=F.forecastRecord({horizon:'1h',asOf:time,anchor,values,createdAt:time});
 const close=forecast.points[0].time;
 const bar={time:close-config.seconds*1000,price:102};
 assert.equal(F.settle([forecast],[bar],close-1),0);
 assert.equal(F.settle([forecast],[bar],close),1);
 assert.equal(F.settle([forecast],[bar],close+1000),0);
 const stats=F.measure([forecast],'1h');assert.equal(stats.count,1);assert.ok(stats.mae>0);
 assert.equal(stats.direction,100);assert.equal(stats.coverage,100);
});
test('adaptive calibrator needs historical verified outcomes and preserves original predictions',()=>{
 const model=Array(12).fill(null).map(()=>({median:110,q10:105,q90:115}));
 const r=F.calibrate(model,[],'1h',100);
 assert.equal(r.weight,1);assert.equal(r.samples,0);
 const historical=[{horizon:'1h',anchor:100,asOf:0,points:Array(25).fill(null).map((_,i)=>({time:i,original:110,adapted:110,lo:105,hi:115,actual:101}))}];
 const learned=F.calibrate(model,historical,'1h',100);
 assert.ok(learned.weight<1);assert.ok(learned.weight>=0.2);
 assert.equal(learned.samples,25);assert.equal(learned.points.length,12);
 assert.equal(learned.points[0].original,110);
});
