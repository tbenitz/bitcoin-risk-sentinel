/* BTC Forecast Lab v2 — deterministic forecasting, frozen snapshots and strictly after-the-fact scoring.
   Never fabricate observed candles. All model inputs must predate recorded predictions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BTCForecast=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CONFIG={
 '1h':{label:'1 hour',seconds:300,steps:12,range:1.5},
 '6h':{label:'6 hours',seconds:900,steps:24,range:3},
 '24h':{label:'24 hours',seconds:3600,steps:24,range:5},
 '7d':{label:'7 days',seconds:21600,steps:28,range:12}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const valid=x=>Number.isFinite(x)&&x>0;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)/2)];};
const qtile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*q,k=Math.floor(i);return s[k]+(s[Math.min(k+1,s.length-1)]-s[k])*(i-k);};
function dedupe(candles){const by=new Map();for(const c of candles||[]){if(!Number.isFinite(c?.time)||!valid(c?.price))continue;by.set(c.time,{time:c.time,price:c.price,source:String(c.source||'exchange')});}return [...by.values()].sort((a,b)=>a.time-b.time);}
function parseCoinbase(raw,seconds,now=Date.now()){if(!Array.isArray(raw))throw Error('Invalid Coinbase candle response');const ms=seconds*1000;return dedupe(raw.map(c=>({time:Number(c?.[0])*1000+ms,price:Number(c?.[4]),source:'Coinbase'})).filter(c=>c.time<=now-1500));}
function parseKraken(raw,seconds,now=Date.now()){if(!Array.isArray(raw))throw Error('Invalid Kraken candle response');const ms=seconds*1000;return dedupe(raw.map(c=>({time:Number(c?.[0])*1000+ms,price:Number(c?.[4]),source:'Kraken'})).filter(c=>c.time<=now-1500));}
function tail(candles,ms,limit=512){const sorted=dedupe(candles);if(!sorted.length)return [];const x=[sorted.at(-1)];for(let i=sorted.length-2;i>=0&&x.length<limit;i--){if(Math.abs(x.at(-1).time-sorted[i].time-ms)>ms*.02)break;x.push(sorted[i]);}return x.reverse();}
function analytical(prices,steps){if(prices.length<96||steps<1||steps>32)throw Error('Need at least 96 historical prices for a forecast.');
 const anchor=prices.at(-1),logs=prices.map(Math.log),returns=logs.slice(1).map((x,i)=>x-logs[i]);
 const recent=returns.slice(-48),vol=Math.max(.000015,std(recent)),avg=k=>mean(returns.slice(-k));
 const drift=clamp(.50*avg(6)+.32*avg(18)+.18*avg(48),-1.5*vol,1.5*vol);
 const acceleration=clamp(avg(6)-avg(24),-vol,vol);
 let t=0;const momentum=[];
 for(let i=1;i<=steps;i++){t+=clamp(.84*drift*Math.exp(-(i-1)/Math.max(4,steps*.55))+.16*acceleration*Math.exp(-(i-1)/4),-1.5*vol,1.5*vol);momentum.push(anchor*Math.exp(t));}
 const lookback=24,target=returns.slice(-lookback),targetVol=Math.max(.000015,std(target)),targetMean=mean(target),shape=target.map(r=>(r-targetMean)/targetVol),candidates=[];
 for(let i=lookback;i+steps<returns.length-1;i++){
  const past=returns.slice(i-lookback,i),pastMean=mean(past),pastVol=Math.max(.000015,std(past));
  const distance=mean(past.map((r,j)=>((r-pastMean)/pastVol-shape[j])**2))+.12*Math.abs((pastMean-targetMean)/vol)+.1*Math.abs(Math.log(pastVol/targetVol));
  candidates.push({i,distance,ratio:clamp(targetVol/pastVol,.5,2)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 const nearest=[];for(const c of candidates){if(nearest.every(p=>Math.abs(p.i-c.i)>=Math.max(5,Math.ceil(steps/3))))nearest.push(c);if(nearest.length>=9)break;}
 const scenarios=nearest.map(n=>{let sum=0;return returns.slice(n.i,n.i+steps).map(r=>{sum+=clamp(r*n.ratio,-3*vol,3*vol);return anchor*Math.exp(sum);});});
 const weights=nearest.map(n=>Math.exp(-Math.min(12,n.distance)*1.6));const weightTotal=weights.reduce((a,b)=>a+b,0)||1;
 const analog=Array.from({length:steps},(_,i)=>scenarios.length?scenarios.reduce((s,series,j)=>s+series[i]*weights[j],0)/weightTotal:anchor);
 const low=Array.from({length:steps},(_,i)=>scenarios.length?qtile(scenarios.map(x=>x[i]),.1):anchor*Math.exp(-1.28*vol*Math.sqrt(i+1)));
 const high=Array.from({length:steps},(_,i)=>scenarios.length?qtile(scenarios.map(x=>x[i]),.9):anchor*Math.exp(1.28*vol*Math.sqrt(i+1)));
 return {momentum,analog,flat:Array(steps).fill(anchor),low,high,volPct:vol*100,driftPct:drift*100,neighbors:nearest.length};
}
function scoreRecord(record){if(!record?.points)return null;const eligible=record.points.filter(p=>valid(p.actual)&&p.time>record.madeAt),modelEligible=eligible.filter(p=>valid(p.forecast));
 const calc=(arr,name)=>arr.length?mean(arr.map(p=>100*Math.abs(p[name]-p.actual)/p.actual)):null;
 const direction=(arr,name)=>{const rows=arr.filter(p=>valid(p[name])&&Math.abs(p[name]-record.anchor)>0.01&&Math.abs(p.actual-record.anchor)>0.01);return rows.length?100*rows.filter(p=>Math.sign(p[name]-record.anchor)===Math.sign(p.actual-record.anchor)).length/rows.length:null;};
 const both=eligible.filter(p=>valid(p.user)&&valid(p.forecast));
 return {scored:eligible.length,total:record.points.length,completed:eligible.length===record.points.filter(p=>p.time>record.madeAt).length&&eligible.length>0,forecastMae:calc(modelEligible,'forecast'),baselineMae:calc(eligible,'baseline'),userMae:calc(eligible.filter(p=>valid(p.user)),'user'),pairedForecastMae:calc(both,'forecast'),pairedUserMae:calc(both,'user'),direction:direction(modelEligible,'forecast'),userDirection:direction(eligible,'user'),coverage:eligible.length?100*eligible.filter(p=>p.actual>=p.lo&&p.actual<=p.hi).length/eligible.length:null};
}
function evidence(records,horizon,now=Date.now()){
 const history=(records||[]).filter(r=>r.horizon===horizon&&r.points?.length&&r.points.at(-1).time<=now&&r.madeAt<r.points.at(-1).time&&valid(r.points.at(-1).actual)).slice(-100);
 const types=['timestral','analog','momentum','flat'],stats={};
 for(const kind of types){const rows=history.filter(r=>valid(r.methods?.[kind]?.at(-1))&&r.modelMadeAt?.[kind]<r.points.at(-1).time);const errors=rows.map(r=>100*Math.abs(r.methods[kind].at(-1)-r.points.at(-1).actual)/r.points.at(-1).actual);stats[kind]={n:errors.length,mape:errors.length?mean(errors):null,medianError:median(errors)};}
 return {n:history.length,stats};
}
function weightsFromHistory(records,horizon,available,now=Date.now()){
 const e=evidence(records,horizon,now),methods=available.filter(x=>x!=='flat');
 if(!methods.length)throw Error('No candidate methods');
 const sufficientlyScored=methods.every(m=>e.stats[m].n>=8),floor=.02;let w={};
 if(sufficientlyScored){for(const k of methods)w[k]=1/Math.max(floor,e.stats[k].mape);const total=Object.values(w).reduce((s,x)=>s+x,0);for(const k of methods)w[k]/=total;}
 else{const timestral=methods.includes('timestral');if(timestral){w={timestral:.55,analog:.28,momentum:.17};}else{w={analog:.60,momentum:.40};}for(const k of Object.keys(w))if(!methods.includes(k))delete w[k];const total=Object.values(w).reduce((s,x)=>s+x,0);for(const k of Object.keys(w))w[k]/=total;}
 // A verified no-change baseline can shrink unhelpful forecasts. Do not replace or rewrite earlier predictions.
 const baseline=e.stats.flat,win=methods.filter(m=>e.stats[m].n>=8).sort((a,b)=>e.stats[a].mape-e.stats[b].mape)[0];
 const shrink=baseline.n>=8&&win&&baseline.mape<e.stats[win].mape*.85?.65:1;
 return {weights:w,evidence:e,shrink,trained:sufficientlyScored};
}
function sketchAt(sketch,at,target,anchor,horizonMs){if(!Array.isArray(sketch)||!sketch.length||!Number.isFinite(at))return null;const f=(target-at)/horizonMs;if(f<0||f>1)return null;const s=[{f:0,price:anchor},...sketch.filter(p=>Number.isFinite(p.f)&&valid(p.price))].sort((a,b)=>a.f-b.f);if(f>=s.at(-1).f)return s.at(-1).price;for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i];if(f<=b.f){const d=clamp((f-a.f)/Math.max(.000001,b.f-a.f),0,1);return a.price+(b.price-a.price)*d;}}return anchor;}
function createPrediction({candles,horizon,now=Date.now(),spot=null,sketch=null,sketchAtTime=null,model=null,modelMadeAt=null,prior=[]}){
 const cfg=CONFIG[horizon];if(!cfg)throw Error('Invalid forecast horizon');const stepMs=cfg.seconds*1000,context=tail(candles,stepMs);
 if(context.length<120)throw Error('Not enough continuous, closed market candles (need 120, got '+context.length+').');
 const last=context.at(-1);if(last.time>now-1000)throw Error('Price candle has not closed');
 const calc=analytical(context.map(c=>c.price),cfg.steps);const methods={analog:calc.analog,momentum:calc.momentum,flat:calc.flat};
 let timestralReady=false;
 if(model?.median?.length>=cfg.steps&&model.median.slice(0,cfg.steps).every(valid)&&Number.isFinite(modelMadeAt)&&modelMadeAt<=now){methods.timestral=model.median.slice(0,cfg.steps);timestralReady=true;}
 const calib=weightsFromHistory(prior,horizon,Object.keys(methods),now);const a=last.price;
 const start=last.time,points=[],fullHorizon=cfg.steps*stepMs;
 for(let i=0;i<cfg.steps;i++){
  const target=start+stepMs*(i+1),f=(i+1)/cfg.steps;
  const combined=Object.entries(calib.weights).reduce((s,[name,w])=>s+w*methods[name][i],0);
  const forecast=Math.max(.01,a+(combined-a)*calib.shrink);
  const possibleLow=timestralReady?model.q10?.[i]:null,possibleHigh=timestralReady?model.q90?.[i]:null;
  const lo=valid(possibleLow)?Math.min(forecast,possibleLow):Math.min(forecast,calc.low[i]);
  const hi=valid(possibleHigh)?Math.max(forecast,possibleHigh):Math.max(forecast,calc.high[i]);
  points.push({time:target,forecast,lo,hi,baseline:a,user:sketchAt(sketch,sketchAtTime,target,Number.isFinite(spot)?spot:a,fullHorizon),actual:null});
 }
 const methodMadeAt={analog:now,momentum:now,flat:now};if(timestralReady)methodMadeAt.timestral=modelMadeAt;
 return {id:'btc-'+now+'-'+Math.random().toString(36).slice(2,7),horizon,asOf:start,madeAt:now,anchor:a,source:context.at(-1).source,usedCandles:context.length,spot:valid(spot)?spot:null,sketchAt:sketchAtTime||null,sketch:Array.isArray(sketch)?sketch.map(x=>({f:x.f,price:x.price})):null,methods,modelMadeAt:methodMadeAt,weights:calib.weights,calibration:{n:calib.evidence.n,trained:calib.trained,shrink:calib.shrink,stats:calib.evidence.stats},stats:{volPct:calc.volPct,driftPct:calc.driftPct,neighbors:calc.neighbors},points};
}
function settle(record,candles,now=Date.now()){if(!record?.points)return 0;const cfg=CONFIG[record.horizon];if(!cfg)return 0;const index=new Map(dedupe(candles).filter(c=>!record.source||record.source===c.source).map(x=>[x.time,x.price]));let count=0;
 for(const point of record.points){if(point.time>now-1500||point.actual!==null&&point.actual!==undefined||point.time<=record.madeAt)continue;const price=index.get(point.time);if(valid(price)){point.actual=price;point.verifiedAt=now;count++;}}
 return count;
}
function forecastValue(record,target,name='forecast'){
 if(!record?.points?.length||target<record.asOf||target>record.points.at(-1).time)return null;const arr=[{time:record.asOf,forecast:record.anchor,lo:record.anchor,hi:record.anchor},...record.points];
 for(let i=1;i<arr.length;i++)if(target<=arr[i].time){const a=arr[i-1],b=arr[i],q=(target-a.time)/(b.time-a.time);return a[name]+(b[name]-a[name])*q;}return null;
}
return{CONFIG,parseCoinbase,parseKraken,dedupe,tail,analytical,sketchAt,createPrediction,scoreRecord,settle,evidence,weightsFromHistory,forecastValue};
});