const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {run}=require('../scripts/publish-forecasts.cjs'),F=require('../forecast-core.js');
const step=F.CONFIG['1h'].seconds*1000,base=1730000000000-baseOffset();
function baseOffset(){return 1730000000000%300000;}
const ticks=Array.from({length:650},(_,i)=>({time:base+i*step,price:70000+i*.6+190*Math.sin(i/13)}));
function exchange(now){
 return async url=>{
  const u=new URL(url),start=Date.parse(u.searchParams.get('start')),end=Date.parse(u.searchParams.get('end'));
  const raw=ticks.filter(c=>c.time>=start&&c.time<end&&c.time+step<=now).map(c=>[c.time/1000,c.price-10,c.price+10,c.price,c.price,10]);
  return {ok:true,json:async()=>raw};
 };
}
test('scheduled public archive makes a forecast before actuals exist, later verifies only real candle closes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'btc-public-')),file=path.join(dir,'history.json');
 try{
  const aNow=ticks[600].time+step+2000;
  const first=await run({now:aNow,fetchImpl:exchange(aNow),file});
  assert.equal(first.newForecast,true);
  let data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.records.length,1);
  const frozen=data.records[0].points.map(p=>p.forecast);
  assert.equal(data.records[0].points.some(p=>p.actual!==null),false);
  assert.ok(data.records[0].madeAt<Math.min(...data.records[0].points.map(p=>p.time)));
  const secondNow=aNow+8*step;
  const second=await run({now:secondNow,fetchImpl:exchange(secondNow),file});
  assert.equal(second.newForecast,true);
  data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.records.length,2);
  assert.ok(data.records[0].points.some(p=>p.actual!==null));
  assert.deepEqual(data.records[0].points.map(p=>p.forecast),frozen,'old forecasts must stay fixed');
  assert.ok(data.records[0].points.every(p=>p.actual===null||Number.isFinite(p.actual)));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('public worker does not fabricate forecasts if Coinbase returns no candles',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'btc-public-')),file=path.join(dir,'archive.json');
 try{
  await assert.rejects(run({file,fetchImpl:async()=>({ok:true,json:async()=>[]})}),/Insufficient continuous/);
  assert.equal(fs.existsSync(file),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
