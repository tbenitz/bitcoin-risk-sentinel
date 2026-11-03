/* Fixed-origin Bitcoin prediction ledger. All times are Unix milliseconds; no invented observations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BtcComparisonEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CONFIG={1:{key:'1h',stepMs:300000,steps:12},6:{key:'6h',stepMs:900000,steps:24},24:{key:'24h',stepMs:3600000,steps:24},168:{key:'7d',stepMs:21600000,steps:28}};
const valid=n=>Number.isFinite(n)&&n>0;
const between=(n,a,b)=>Math.max(a,Math.min(b,n));
function create({id,at,anchor,horizon,rangePct=5}){if(!valid(anchor)||!Number.isFinite(at)||!CONFIG[horizon])throw Error('Cannot anchor a prediction without a real BTC price and time.');return{id:id||String(at),at,anchor,horizon,rangePct,sketch:[{f:0,price:anchor}],actuals:[],createdAt:Date.now(),modelId:null};}
function append(record,f,price){if(!record||!valid(price)||!Number.isFinite(f))throw Error('Invalid sketch point');f=between(f,0,1);const last=record.sketch.at(-1);if(f<last.f)return record;if(f-last.f<0.003){if(f===0)return record;last.f=f;last.price=price;}else record.sketch.push({f,price});return record;}
function atFraction(series,f){if(!Array.isArray(series)||!series.length)return null;const first=series[0],last=series.at(-1);if(f<first.f-1e-9||f>last.f+1e-9)return null;if(f<=first.f)return first.price;if(f>=last.f)return last.price;for(let i=1;i<series.length;i++){const b=series[i],a=series[i-1];if(f<=b.f){const fraction=(f-a.f)/Math.max(1e-12,b.f-a.f);return a.price+(b.price-a.price)*fraction;}}return null;}
function normalizeActual(candles,granularityMs,now=Date.now()){
 if(!Array.isArray(candles))return [];
 const points=candles.map(row=>({time:Number(row?.[0])*1000+granularityMs,price:Number(row?.[4]),source:'closed candle'})).filter(p=>valid(p.price)&&Number.isFinite(p.time)&&p.time<=now-1500).sort((a,b)=>a.time-b.time);
 return dedupe(points);
}
function dedupe(points){const result=[];for(const p of [...points].sort((a,b)=>a.time-b.time)){if(!Number.isFinite(p.time)||!valid(p.price))continue;if(result.length&&result.at(-1).time===p.time)result[result.length-1]=p;else result.push({time:p.time,price:p.price,source:p.source||'market'});}return result;}
function mergeActual(existing,incoming,at,end){return dedupe([...(existing||[]),...(incoming||[])].filter(p=>p.time>=at&&p.time<=end)).slice(-1500);}
function modelFor(record,models){if(!record||!Array.isArray(models))return null;const config=CONFIG[record.horizon];if(!config)return null;const eligible=models.filter(m=>m&&m.horizon===config.key&&Array.isArray(m.points)&&m.points.length&&Number.isFinite(m.asOf)&&Number.isFinite(m.createdAt)&&m.createdAt<=record.at+600000&&m.asOf<=record.at+60000&&m.asOf>=record.at-Math.max(config.stepMs*1.6,900000));
 if(record.modelId){const bound=models.find(m=>m.id===record.modelId);if(bound&&bound.horizon===config.key)return bound;}
 return eligible.sort((a,b)=>Math.abs(a.asOf-record.at)-Math.abs(b.asOf-record.at))[0]||null;}
function modelAt(model,t){if(!model||!Number.isFinite(t)||!Array.isArray(model.points)||!valid(model.anchor))return null;const before={time:model.asOf,adapted:model.anchor,lo:model.anchor,hi:model.anchor};const points=[before,...model.points];if(t<points[0].time||t>points.at(-1).time)return null;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(t<=b.time){const f=(t-a.time)/Math.max(1,b.time-a.time);return{price:a.adapted+(b.adapted-a.adapted)*f,lo:a.lo+(b.lo-a.lo)*f,hi:a.hi+(b.hi-a.hi)*f};}}return null;}
function actualAt(actuals,t,stepMs){ // First real closed candle at or after the target time, within one interval.
 const found=(actuals||[]).find(p=>p.source==='closed candle'&&p.time>=t&&p.time<t+stepMs+1000);return found||null;
}
function score(record,model,now=Date.now()){const cfg=CONFIG[record?.horizon];if(!cfg)return{resolved:0,possible:0,paired:0,userMae:null,modelMae:null,baselineMae:null,modelDirection:null,userDirection:null};const deadline=record.at+record.horizon*3600000;const series=[];
 for(let i=1;i<=cfg.steps;i++){const t=record.at+i*cfg.stepMs;if(t>deadline+1)break;const f=i/cfg.steps,user=atFraction(record.sketch,f),prior=actualAt(record.actuals,t,cfg.stepMs),actual=(t<=now&&prior&&prior.time<=now)?prior.price:null,modelPoint=modelAt(model,t);const modelEligible=modelPoint&&model.createdAt<=t;series.push({time:t,actual,user,model:modelEligible?modelPoint.price:null,modelLo:modelEligible?modelPoint.lo:null,modelHi:modelEligible?modelPoint.hi:null,actualAt:prior?.time||null});}
 const sample=series.filter(x=>valid(x.actual));const userSamples=sample.filter(x=>valid(x.user));const modelSamples=sample.filter(x=>valid(x.model));const paired=sample.filter(x=>valid(x.user)&&valid(x.model));const mape=(arr,k)=>arr.length?arr.reduce((n,x)=>n+Math.abs(x[k]-x.actual)/x.actual*100,0)/arr.length:null;const direction=(arr,k)=>{const comparable=arr.filter(x=>Math.abs(x.actual-record.anchor)>0.001&&Math.abs(x[k]-record.anchor)>0.001);return comparable.length?100*comparable.filter(x=>Math.sign(x[k]-record.anchor)===Math.sign(x.actual-record.anchor)).length/comparable.length:null;};
 return{resolved:sample.length,possible:cfg.steps,userResolved:userSamples.length,modelResolved:modelSamples.length,paired:paired.length,userMae:mape(userSamples,'user'),modelMae:mape(modelSamples,'model'),baselineMae:sample.length?sample.reduce((n,x)=>n+Math.abs(record.anchor-x.actual)/x.actual*100,0)/sample.length:null,pairedUserMae:mape(paired,'user'),pairedModelMae:mape(paired,'model'),userDirection:direction(userSamples,'user'),modelDirection:direction(modelSamples,'model'),points:series};}
// Compute meaningful price-axis ranges without altering, inventing or re-anchoring forecasts.
// In forecast mode exclude the user's sketch (which can be thousands of dollars away),
// extreme confidence quantiles and distant price history. Always label the magnification.
function viewRange({anchor,horizon=1,rangePct=5,mode='detail',sketch=[],predictions=[],actuals=[],history=[]}={}){
 if(!valid(anchor))throw Error('A real anchored BTC price is required for chart scaling.');
 const prices=a=>(Array.isArray(a)?a:[]).map(Number).filter(valid);
 const fullPrices=[anchor,...prices(sketch),...prices(predictions),...prices(actuals),...prices(history)];
 const fullMinimum=anchor*(1-Math.max(.1,rangePct)/100),fullMaximum=anchor*(1+Math.max(.1,rangePct)/100);
 const fullLo=Math.min(fullMinimum,...fullPrices),fullHi=Math.max(fullMaximum,...fullPrices);
 const fullPadding=Math.max((fullHi-fullLo)*.08,1);
 const full={min:Math.max(.01,fullLo-fullPadding),max:fullHi+fullPadding};
 if(mode!=='detail')return {...full,zoomFactor:1,mode:'full',full};
 const selected=[anchor,...prices(predictions),...prices(actuals)];
 const rawLo=Math.min(...selected),rawHi=Math.max(...selected);
 // A minimum real-dollar scale prevents amplifying cents into apparent meaningful moves.
 const minSpan=Math.max(10,anchor*.00030*Math.sqrt(Math.max(1,horizon)));
 const paddedSpan=Math.max(minSpan,(rawHi-rawLo)*1.24);
 const center=(rawHi+rawLo)*.5;
 const result={min:Math.max(.01,center-paddedSpan*.5),max:center+paddedSpan*.5};
 return {...result,zoomFactor:(full.max-full.min)/(result.max-result.min),mode:'detail',full};
}
return{CONFIG,create,append,atFraction,normalizeActual,mergeActual,modelFor,modelAt,score,viewRange};
});