const test=require('node:test'),assert=require('node:assert/strict'),F=require('../forecast-signals.js');
const step=300000,anchor=1700000000000;
function candles(priceFn,count=512){return Array.from({length:count},(_,i)=>({time:anchor+i*step,price:priceFn(i)}));}
test('signal forecasts use only closed past market candles',()=>{
 const data=candles(i=>65000+25*i+35*Math.sin(i/7));
 const origin=anchor+450*step;
 const f=F.forecast({candles:data,asOf:origin,createdAt:origin,horizon:1,stepMs:step,steps:12});
 assert.ok(f.usedCandles>=120);assert.equal(f.asOf,origin);assert.equal(f.points[0].time,origin+step);
 const changed=data.map((p,i)=>i>449?{...p,price:1000000}:p);
 const again=F.forecast({candles:changed,asOf:origin,createdAt:origin,horizon:1,stepMs:step,steps:12});
 assert.deepEqual(f.points,again.points);assert.deepEqual(f.backtest,again.backtest);
});
test('momentum responds to evidence of rising and falling trends',()=>{
 const up=candles(i=>60000*Math.exp(.00018*i));const down=candles(i=>60000*Math.exp(-.00018*i));
 const a=F.forecast({candles:up,asOf:anchor+512*step,stepMs:step,steps:12,horizon:1});
 const b=F.forecast({candles:down,asOf:anchor+512*step,stepMs:step,steps:12,horizon:1});
 assert.ok(a.points[4].momentum>a.anchor);assert.ok(b.points[4].momentum<b.anchor);
 assert.ok(a.points[4].analog>0&&b.points[4].analog>0);
});
test('historical analog forecast can represent alternating price changes',()=>{
 const data=candles(i=>75000+650*Math.sin(i/9)+150*Math.cos(i/4));
 const out=F.forecast({candles:data,asOf:anchor+512*step,stepMs:step,steps:12,horizon:1});
 assert.ok(out.analogMatches>=3);const a=out.points.map(p=>p.nearest);
 assert.ok(Math.max(...a)-Math.min(...a)>20,'nearest historical continuation should show a meaningful path, not a fake flat line');
});
test('walk-forward validation is past-only, and may select flat baseline',()=>{
 const data=candles(i=>70000+40*Math.sin(i/11));
 const result=F.forecast({candles:data,asOf:anchor+512*step,stepMs:step,steps:12,horizon:1});
 assert.ok(result.backtest.origins>=6);assert.ok(['flat','momentum','analog'].includes(result.selected));
 for(const x of result.points)assert.ok(x.q10<=x.q90&&Number.isFinite(x.validated));
});
test('low-data inputs are rejected rather than using synthetic prices',()=>{
 assert.throws(()=>F.forecast({candles:candles(i=>70000+i,80),asOf:anchor+80*step,stepMs:step,steps:12,horizon:1}),/Not enough/);
});