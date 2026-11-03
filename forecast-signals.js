/* Experimental, deterministic BTC signal forecasts. Never interpolate a future *observed* price.
   All forecasts are computed using closed candles available before the prediction is locked.
   They are independent of Timestral's median. No random oscillations or drawn fake market data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BtcForecastSignals=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const min=(n,l,h)=>Math.max(l,Math.min(h,n));
const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))));};
const quantile=(arr,q)=>{const a=[...arr].sort((x,y)=>x-y);if(!a.length)return null;const x=(a.length-1)*q,l=Math.floor(x);return a[l]+(a[Math.min(a.length-1,l+1)]-a[l])*(x-l);};
function clean(candles,asOf,stepMs){
 if(!Array.isArray(candles))throw Error('Missing real historical BTC candles');
 const rows=candles.map(c=>({time:Number(c.time),price:Number(c.price)})).filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.price)&&c.price>0&&c.time+stepMs<=asOf+1).sort((a,b)=>a.time-b.time);
 const unique=[];for(const c of rows){if(unique.length&&unique.at(-1).time===c.time)unique[unique.length-1]=c;else unique.push(c);}
 const contiguous=[];for(let i=unique.length-1;i>=0;i--){const row=unique[i],prev=contiguous.at(-1);if(prev&&Math.abs(prev.time-row.time-stepMs)>stepMs*.03)break;contiguous.push(row);}contiguous.reverse();
 if(contiguous.length<120)throw Error('Not enough contiguous closed BTC candles (need 120; got '+contiguous.length+').');
 return contiguous.slice(-512);
}
function coreForecast(prices,steps){
 const n=prices.length;if(n<120)throw Error('Need at least 120 closed candle prices.');
 const logs=prices.map(x=>Math.log(x)),r=logs.slice(1).map((x,i)=>x-logs[i]);
 const recent=r.slice(-Math.min(48,r.length)),vol=Math.max(1e-5,std(recent));
 // Multi-speed momentum: fast/medium trend minus longer-term drift, shrunk toward no-change.
 const m=(k)=>mean(r.slice(-k));
 const drift=min(.4*m(6)+.4*m(18)+.2*m(48),-2*vol,2*vol);
 const accel=min(m(6)-m(24),-vol,vol);
 const trend=[],anchor=prices.at(-1);let acc=0;
 for(let h=1;h<=steps;h++){
   const d=(.88*drift*Math.exp(-(h-1)/Math.max(5,steps*.45))+.18*accel*Math.exp(-(h-1)/4));
   acc+=min(d,-2*vol,2*vol);
   trend.push(anchor*Math.exp(acc));
 }
 // Find similar historical return *shapes*. Only use instances with fully observed future,
 // and keep neighbors sufficiently far apart to avoid duplicate instances dominating weights.
 const lookback=24,candidates=[];
 const now=r.slice(-lookback),nowVol=Math.max(1e-5,std(now));
 const nowMean=mean(now),norm=now.map(x=>(x-nowMean)/nowVol);
 for(let t=Math.max(lookback,35);t<=r.length-steps-1;t++){
  const past=r.slice(t-lookback,t),pVol=Math.max(1e-5,std(past)),pMean=mean(past);
  const shape=mean(past.map((x,i)=>Math.pow((x-pMean)/pVol-norm[i],2)));
  const slope=Math.abs(pMean-nowMean)/Math.max(vol,1e-5);
  const volatility=Math.abs(Math.log(pVol/nowVol));
  candidates.push({t,score:shape+.16*slope+.1*volatility,scale:min(nowVol/pVol,.5,2),returns:r.slice(t,t+steps)});
 }
 candidates.sort((a,b)=>a.score-b.score);
 const neighbors=[];for(const item of candidates){if(neighbors.every(n=>Math.abs(n.t-item.t)>=Math.max(5,Math.floor(steps/4))))neighbors.push(item);if(neighbors.length>=9)break;}
 const scenarios=neighbors.map(item=>{let total=0;return item.returns.map(ret=>{total+=min(ret*item.scale,-3*vol,3*vol);return anchor*Math.exp(total);});});
 const weights=neighbors.map(n=>Math.exp(-Math.min(15,n.score)*1.8));const normWeight=weights.reduce((s,v)=>s+v,0)||1;
 const analog=[],lo=[],hi=[],typical=[];
 for(let h=0;h<steps;h++){
  const pricesAt=scenarios.map(p=>p[h]);
  analog.push(pricesAt.length?scenarios.reduce((s,series,i)=>s+series[h]*weights[i],0)/normWeight:anchor);
  lo.push(pricesAt.length?quantile(pricesAt,.1):anchor);
  hi.push(pricesAt.length?quantile(pricesAt,.9):anchor);
  typical.push(scenarios[0]?.[h]??anchor);
 }
 return {momentum:trend,analog,nearest:typical,lo,hi,volatilityPct:vol*100,analogMatches:neighbors.length,nearestDistance:neighbors[0]?.score??null,driftPct:drift*100};
}
function backtest(prices,steps){
 const minTrain=Math.max(150,steps+48),length=prices.length,stats={momentum:{error:0,n:0},analog:{error:0,n:0},flat:{error:0,n:0}};
 // Strict walk-forward: every origin uses only earlier prices, never the evaluation segment.
 const origins=[];for(let end=length-steps-1;end>=minTrain&&origins.length<16;end-=Math.max(5,Math.floor(steps*.8)))origins.push(end);
 for(const end of origins){const context=prices.slice(0,end),forecast=coreForecast(context,steps),anchor=context.at(-1);for(let h=0;h<steps;h+=Math.max(1,Math.ceil(steps/8))){const actual=prices[end+h];if(!Number.isFinite(actual))continue;for(const [name,value] of [['momentum',forecast.momentum[h]],['analog',forecast.analog[h]],['flat',anchor]]){stats[name].error+=Math.abs(value-actual)/actual;stats[name].n++;}}}
 for(const name of Object.keys(stats))stats[name].mape=stats[name].n?100*stats[name].error/stats[name].n:null;
 // Best evidence: require at least six independent origins, do not declare a winner on noise.
 const enough=origins.length>=6;
 const scores=Object.entries(stats).filter(([,v])=>v.mape!=null).sort((a,b)=>a[1].mape-b[1].mape);
 const winner=enough?scores[0]?.[0]||'flat':'unvalidated';
 return {stats,origins:origins.length,winner,verified:enough};
}
function forecast({candles,asOf,horizon,stepMs,steps,createdAt=Date.now()}){
 if(!Number.isFinite(asOf)||!Number.isFinite(createdAt)||!Number.isFinite(stepMs)||stepMs<=0||!Number.isInteger(steps)||steps<1||steps>32)throw Error('Invalid forecast timestamp or horizon.');
 const history=clean(candles,asOf,stepMs),prices=history.map(c=>c.price),last=history.at(-1),ref=last.time+stepMs;
 const calc=coreForecast(prices,steps),validation=backtest(prices,steps);
 const best=validation.winner==='analog'?'analog':validation.winner==='momentum'?'momentum':'flat';
 // The best-scoring model could be no-change: do not claim predictive skill if so.
 const anchor=last.price;
 const points=Array.from({length:steps},(_,i)=>({time:ref+(i+1)*stepMs,analog:calc.analog[i],momentum:calc.momentum[i],nearest:calc.nearest[i],validated:best==='flat'?anchor:calc[best][i],q10:Math.min(calc.lo[i],calc.hi[i]),q90:Math.max(calc.lo[i],calc.hi[i])}));
 return {id:'signal-'+createdAt+'-'+horizon,createdAt,asOf:ref,anchor,horizon,stepMs,usedCandles:prices.length,source:'Coinbase closed candles',volatilityPct:calc.volatilityPct,driftPct:calc.driftPct,analogMatches:calc.analogMatches,nearestDistance:calc.nearestDistance,backtest:validation,selected:best,points};
}
function atTime(record,t,name='analog'){
 if(!record||!Array.isArray(record.points)||!record.points.length||!Number.isFinite(t))return null;
 const k=new Set(['analog','momentum','nearest','validated']);if(!k.has(name))return null;
 const series=[{time:record.asOf,price:record.anchor},...record.points.map(p=>({time:p.time,price:p[name]}))];
 if(t<series[0].time||t>series.at(-1).time)return null;
 for(let i=1;i<series.length;i++)if(t<=series[i].time){const a=series[i-1],b=series[i];return a.price+(b.price-a.price)*(t-a.time)/(b.time-a.time);}
 return null;
}
return {clean,coreForecast,backtest,forecast,atTime};
});