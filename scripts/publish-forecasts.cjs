/* Public Bitcoin forecast archive. GitHub Actions, no credentials, no fabricated market prices.
 * Prices come from completed Coinbase candles before each forecast is committed. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const F=require('../forecast-core.js');
const DATA=path.join(__dirname,'../data/public-history.json');
const H='1h',cfg=F.CONFIG[H],MS=cfg.seconds*1000;
async function run({fetchImpl=fetch,now=Date.now(),file=DATA}={}){
 async function candlesBetween(a,b){
  const query=new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles');
  query.searchParams.set('granularity',String(cfg.seconds));
  query.searchParams.set('start',new Date(a).toISOString());
  query.searchParams.set('end',new Date(b).toISOString());
  const res=await fetchImpl(query.toString(),{headers:{accept:'application/json'}});
  if(!res.ok)throw Error('Coinbase candles HTTP '+res.status);
  const json=await res.json();return F.parseCoinbase(json,cfg.seconds,now);
 }
 // Strict under 300 Coinbase buckets per request. Never use incomplete candles.
 const raw=[];for(let k=1;k>=0;k--){const end=now-k*275*MS;raw.push(...await candlesBetween(end-275*MS,end));}
 const candles=F.tail(raw,MS,512);
 if(candles.length<120)throw Error('Insufficient continuous real Coinbase candles ('+candles.length+')');
 const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{records:[]};
 let records=(Array.isArray(old.records)?old.records:[]).filter(r=>r&&r.horizon===H&&Array.isArray(r.points));
 let resolved=0;
 for(const r of records)resolved+=F.settle(r,candles,now);
 const last=candles.at(-1);
 const has=records.some(r=>r.asOf===last.time&&r.madeAt>=last.time);
 if(!has){
  const r=F.createPrediction({candles,horizon:H,now,prior:records});
  r.id='public-'+now+'-'+r.asOf;
  r.mode='Historical pattern + momentum (public)';
  r.inputTail=candles.slice(-40);
  r.public=true;
  records.push(r);
 }
 records=records.slice(-350);
 const result={format:'btc-public-forecast-v1',updatedAt:new Date(now).toISOString(),
  source:'Coinbase completed BTC/USD candles',frequency:'Best-effort GitHub Actions, twice hourly',
  records};
 // No network or price errors may result in synthetic forecast data; throw instead.
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 return {records:records.length,newForecast:!has,settledPoints:resolved,origin:last.time};
}
if(require.main===module)run().then(x=>process.stdout.write('Saved public BTC forecast results: '+JSON.stringify(x)+'\n')).catch(e=>{console.error('No public forecast published:',e.message);process.exitCode=1;});
module.exports={run};
