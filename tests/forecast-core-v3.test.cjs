const test=require('node:test'),assert=require('node:assert/strict'),F=require('../forecast-core.js');
const CFG=F.CONFIG['1h'], STEP=CFG.seconds*1000;
const base=Math.floor(Date.now()/STEP)*STEP-539*STEP;
const input=Array.from({length:540},(_,i)=>({time:base+i*STEP,price:75000+1000*Math.sin(i/20)+250*Math.sin(i/4)+i*.6,source:'Coinbase'}));
test('Only fully closed genuine Coinbase candles become evidence',()=>{
 const now=Date.now(),bar=Math.floor(now/STEP)*STEP-STEP;
 const raw=[[Math.floor(bar/1000),1,2,3,75500],[Math.floor((now-2000)/1000),1,2,3,99999]];
 const a=F.parseCoinbase(raw,300,now);assert.equal(a.length,1);assert.equal(a[0].time,bar+STEP);
});
test('Forecast stores real timestamp, immutable method paths and a nonzero trend when prices trend',()=>{
 const row=F.createPrediction({candles:input,horizon:'1h',now:Date.now(),prior:[]});
 assert.equal(row.points.length,12);assert.equal(row.points[0].time,input.at(-1).time+STEP);assert.equal(row.usedCandles,512);
 assert.ok(Number.isFinite(row.points[0].forecast));assert.ok(row.methods.momentum.some(x=>x!==row.anchor));
 assert.ok(row.points.every(p=>p.actual===null));assert.equal(row.mode,undefined);
});
test('Future market data is scored only AFTER its specific candle closes',()=>{
 const now=Date.now(),row=F.createPrediction({candles:input,horizon:'1h',now,prior:[]});
 const t=row.points[0].time;const b={time:t,price:row.anchor*1.003,source:'Coinbase'};
 assert.equal(F.settle(row,[b],t-2),0);assert.equal(F.settle(row,[b],t+2000),1);assert.equal(F.settle(row,[b],t+5000),0);
 const score=F.scoreRecord(row);assert.equal(score.scored,1);assert.ok(score.forecastMae>=0);
});
test('Model must have been produced before it can influence forecast and all 12 point values are valid',()=>{
 const now=Date.now(),path=Array.from({length:32},(_,i)=>75000+(i+1)*10);
 const invalid=F.createPrediction({candles:input,horizon:'1h',now,model:{median:path},modelMadeAt:now+5000});
 assert.equal(invalid.methods.timestral,undefined);
 const valid=F.createPrediction({candles:input,horizon:'1h',now,model:{median:path,q10:path.map(x=>x-100),q90:path.map(x=>x+100)},modelMadeAt:now-1000});
 assert.equal(valid.methods.timestral.length,12);assert.ok(valid.weights.timestral>0);
});
test('Scoring a historic prediction does not change its frozen forecast',()=>{
 const row=F.createPrediction({candles:input,horizon:'1h',now:Date.now()});const original=row.points.map(p=>p.forecast);
 F.settle(row,row.points.map((p,i)=>({time:p.time,price:row.anchor*(1+i*.001)})),row.points.at(-1).time+2500);
 assert.deepEqual(row.points.map(p=>p.forecast),original);
});
test('Adaptation needs eight independent completely resolved historical records before changing weights',()=>{
 const now=Date.now(),horizon='1h',records=[];
 for(let i=0;i<8;i++){
  const at=now-2e7+i*1e6;
  records.push({horizon,madeAt:at,asOf:at-STEP,anchor:75000,methods:{analog:Array(12).fill(74990),momentum:Array(12).fill(75050),flat:Array(12).fill(75000)},modelMadeAt:{analog:at,momentum:at,flat:at},points:Array.from({length:12},(_,j)=>({time:at+(j+1)*STEP,actual:75045,forecast:75000,baseline:75000}))});
 }
 const e=F.evidence(records,horizon,now);assert.equal(e.n,8);const weights=F.weightsFromHistory(records,horizon,['analog','momentum'],now);assert.equal(weights.trained,true);assert.ok(weights.weights.momentum>weights.weights.analog);
});
test('User sketch interpolation remains anchored to original fixed start',()=>{
 const start=Date.now();const points=[{f:0,price:70000},{f:.5,price:71000},{f:1,price:69000}];
 assert.equal(F.sketchAt(points,start,start+30*60000,70000,60*60000),71000);
 assert.equal(F.sketchAt(points,start,start+60*60000,70000,60*60000),69000);
});
test('No fabricated forecast without enough contiguous observed data',()=>{
 assert.throws(()=>F.createPrediction({candles:input.slice(0,12),horizon:'1h'}),/Not enough continuous/);
 const broken=input.slice(-150);broken[70]={...broken[70],time:broken[20].time+10*STEP};
 assert.throws(()=>F.createPrediction({candles:broken,horizon:'1h'}),/Not enough continuous/);
});