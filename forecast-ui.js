/* Live Bitcoin Timestral forecasting, outcome scoring and evidence-based calibration. */
(()=>{'use strict';
const E=window.BtcForecastEngine;
if(!E){console.error('Forecast core missing');return;}
const STORAGE='btc-timestral-tracker-v1';
const SETTINGS='btc-timestral-settings-v1';
const fallback={horizon:'6h',refresh:15,auto:false};
const read=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))||def;}catch{return def;}};
const saved=read(STORAGE,[]);
const rows=Array.isArray(saved)?saved.filter(x=>x&&E.HORIZONS[x.horizon]&&Array.isArray(x.points)).slice(-120):[];
let opts={...fallback,...read(SETTINGS,{})};opts.auto=false; // no surprise background inference after reload
let observed=[],active=null,timer=null,working=false,lastCheckAt=0,latestError='',latestSource='';
const usd=n=>Number.isFinite(Number(n))?'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(2)+'%':'—';
const $=id=>document.getElementById(id);
const el=(tag,props={},text)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='className')n.className=v;else n.setAttribute(k,v);}if(text!==undefined)n.textContent=text;return n;};
const shell=el('section',{className:'card btc-forecast',id:'btcForecast'});
shell.innerHTML=`<div class="btc-fore-top"><div><div class="eyebrow">Timestral-5M · Mistral AI</div><h2>Live Bitcoin Forecast Lab</h2><p>Real candle data → probabilistic forecast → actual outcome → adaptive calibration.</p></div><div class="btc-fore-btns"><span id="btcForecastStatus" class="pill"><span class="dot warn"></span> Load local model</span><button id="btcForecastSettings" class="btn small outline">Forecast settings</button><button id="btcForecastNow" class="btn small primary">Forecast now</button><button id="btcForecastAuto" class="btn small">Start auto</button></div></div>
<div class="btc-fore-menu"><label>Prediction horizon <select id="btcForecastHorizon"><option value="1h">1 hour · 5m candles</option><option value="6h">6 hours · 15m candles</option><option value="24h">24 hours · hourly candles</option><option value="7d">7 days · 6h candles</option></select></label><div class="btc-fore-swatches"><span><b class="btc-gold"></b> Timestral adjusted median</span><span><b class="btc-blue"></b> Actual BTC</span><span><b class="btc-purple"></b> 10–90% band</span></div></div>
<div class="btc-fore-stats"><div><small>Forecast destination</small><strong id="btcForecastTarget">Not available</strong><span id="btcForecastDelta">Waiting for model</span></div><div><small>Scored prediction points</small><strong id="btcForecastCount">0</strong><span id="btcForecastScored">No verified outcomes</span></div><div><small>Median absolute % error</small><strong id="btcForecastMae">—</strong><span id="btcForecastBase">Baseline: —</span></div><div><small>Direction accuracy / 80% interval coverage</small><strong id="btcForecastAccuracy">— / —</strong><span id="btcForecastAdaptive">Calibration not established</span></div></div>
<div class="btc-fore-plot"><canvas id="btcForecastCanvas" aria-label="Historical BTC candles and Timestral probabilistic forecast"></canvas><p id="btcForecastEmpty">Timestral-5M runs on this device. Click Forecast now to download the 21 MB model once, then generate a real forecast from live BTC history.</p></div>
<div class="btc-fore-bottom"><span id="btcForecastDetails">The model makes zero-shot forecasts. Adaptation uses only forecasts whose target times have passed.</span><button id="btcForecastExport" class="btn small outline">Export accuracy history</button></div>
<details id="btcForecastConfig"><summary>On-device model and automatic evaluation</summary><div class="btc-config-grid"><div class="btc-model-local">Model: Timestral-5M ONNX · 21.2 MB · cached on this device · no forecasting server or key. <button class="btn small outline" type="button" id="btcWarmup">Download / initialize model</button></div><label>Refresh every <select id="btcForecastInterval"><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="180">3 hours</option><option value="360">6 hours</option></select></label></div><div class="btc-fore-bottom"><p>The model executes locally using ONNX Runtime Web in a background Web Worker, with CPU/WebAssembly inference. The browser initially downloads its 21 MB weights from Hugging Face and caches them in IndexedDB. Predictions are computed on your device, not sent to any forecast API. BTC candles still come from Coinbase. DeepSeek remains optional and separate for news sentiment. Auto runs only while this tab remains open.</p><button class="btn small primary" id="btcForecastSave">Save forecast settings</button></div></details>
<div class="btc-fore-error" id="btcForecastError" role="status" aria-live="polite"></div>`;
const css=el('style');css.textContent=`.btc-forecast{margin-bottom:16px;overflow:hidden}.btc-fore-top{padding:24px 25px 16px;display:flex;gap:14px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.btc-fore-top h2{font-size:25px;letter-spacing:-.6px;margin:7px 0}.btc-fore-top p{color:var(--muted);font-size:12px;margin:0;line-height:1.5}.btc-fore-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.btc-fore-menu{padding:7px 25px 15px;display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.btc-fore-menu label{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:9px}.btc-fore-menu select,.btc-config-grid input,.btc-config-grid select{color:var(--text);background:#0a1422;border:1px solid #42546e;padding:9px 12px;border-radius:8px}.btc-fore-swatches{display:flex;gap:17px;flex-wrap:wrap;color:var(--muted);font-size:11px}.btc-fore-swatches b{display:inline-block;width:18px;height:3px;margin-right:5px;vertical-align:middle}.btc-gold{background:#f8bc65}.btc-blue{background:#49dcc1}.btc-purple{background:#ab96ff}.btc-fore-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:0 25px 14px}.btc-fore-stats>div{background:#0b1523;padding:13px 14px;border:1px solid #29364a;border-radius:12px;min-width:0}.btc-fore-stats small,.btc-fore-stats span{display:block;color:var(--muted);font-size:11px;line-height:1.55}.btc-fore-stats strong{display:block;margin:5px 0;font-size:clamp(18px,2vw,28px);letter-spacing:-.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.btc-fore-plot{position:relative;height:340px;padding:4px 14px 0}.btc-fore-plot canvas{width:100%;height:100%;display:block}.btc-fore-plot p{position:absolute;top:40%;left:20%;right:20%;color:#b1c5dc;text-align:center;background:#0b1620cc;border-radius:12px;padding:16px;line-height:1.6;pointer-events:none}.btc-fore-bottom{padding:12px 25px 18px;display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--muted);line-height:1.65}.btc-fore-bottom p{max-width:820px;margin:0}.btc-forecast details{border-top:1px solid #2a3b50;background:#0b1523;padding:0 25px}.btc-forecast summary{cursor:pointer;color:#a5d8ff;padding:14px 0;font-weight:650}.btc-config-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr);gap:14px;padding:10px 0}.btc-config-grid label{display:grid;gap:8px;font-size:12px;color:var(--muted)}.btc-model-local{font-size:12px;color:var(--muted);line-height:1.7;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.btc-fore-error{padding:0 25px;color:#ff8796;font-size:12px;line-height:1.6}.btc-fore-error:not(:empty){padding-bottom:15px}@media(max-width:900px){.btc-fore-stats{grid-template-columns:1fr 1fr}}@media(max-width:620px){.btc-fore-stats{padding:0 12px 12px}.btc-fore-top,.btc-fore-menu{padding-left:13px;padding-right:13px}.btc-fore-plot{height:265px}.btc-fore-plot p{left:9%;right:9%}.btc-config-grid{grid-template-columns:1fr}.btc-fore-bottom{padding-left:13px;padding-right:13px}.btc-fore-stats strong{font-size:19px}}`;
document.head.append(css);
const spot=document.querySelector('.metrics');spot?.after(shell);
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(rows.slice(-120)));}catch(e){showError('Cannot save local forecast history: '+e.message);}}
function saveOpts(){localStorage.setItem(SETTINGS,JSON.stringify({...opts,auto:false}));}
function showError(msg){latestError=msg;$('btcForecastError').textContent=msg;}
function status(msg,ready=false){$('btcForecastStatus').replaceChildren(el('span',{className:'dot'+(ready?' live':' warn')}),document.createTextNode(msg));}
// Single persistent browser Web Worker runs the real model with ONNX Runtime Web.
let forecastWorker=null,workerId=0;
const pending=new Map();
function localForecast(type,prices=[]){
 if(!forecastWorker){
  forecastWorker=new Worker('./timestral-worker.js');
  forecastWorker.onmessage=({data})=>{
   if(data.type==='progress'){status(data.message);return;}
   const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);
   if(data.ok)job.resolve(data.result||{backend:data.backend});else job.reject(Error(data.error||'Local model error'));
  };
  forecastWorker.onerror=e=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Model worker: '+e.message));}pending.clear();forecastWorker.terminate();forecastWorker=null;};
 }
 const id=++workerId;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local inference timed out after 180 seconds. Check download permissions and network connectivity.'));},180000);
  pending.set(id,{resolve,reject,timer});
  forecastWorker.postMessage({id,type,prices});
 });
}
async function json(url,init){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),120000);try{const r=await fetch(url,{...init,signal:ctrl.signal,cache:'no-store'});if(!r.ok){let msg='HTTP '+r.status;try{const x=await r.json();msg+=x.detail?' — '+JSON.stringify(x.detail).slice(0,200):'';}catch{}throw Error(msg);}return await r.json();}finally{clearTimeout(timer);}}
const candleCache=new Map();
async function loadCandles(horizon){
 const cfg=E.HORIZONS[horizon],now=Date.now(),ms=cfg.seconds*1000;
 if(!cfg)throw Error('Unsupported BTC candle timeframe');
 const end=Math.floor(now/ms)*ms,cache=candleCache.get(horizon);
 if(cache?.end===end&&cache.points?.length>=120)return cache.points;
 // Coinbase permits at most 300 candles per request. Two 280-bar windows give 512+ closed candles.
 const pages=await Promise.all([0,1].map(async page=>{
   const endAt=end-page*280*ms,startAt=endAt-280*ms;
   const url='https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+cfg.seconds+'&start='+new Date(startAt).toISOString()+'&end='+new Date(endAt).toISOString();
   return json(url);
 }));
 const data=E.parseCandles(pages.flat(),cfg.seconds,now).slice(-512);
 if(data.length<120)throw Error('Coinbase returned too few complete candles ('+data.length+'). Need at least 120 for pattern forecasting.');
 candleCache.set(horizon,{end,points:data});return data;
}
async function evaluateAll(){let changed=false;for(const horizon of Object.keys(E.HORIZONS)){const pending=rows.some(r=>r.horizon===horizon&&r.points.some(p=>p.actual==null&&p.time<=Date.now()));if(!pending)continue;try{const candles=await loadCandles(horizon);const count=E.settle(rows.filter(r=>r.horizon===horizon),candles);if(count)changed=true;}catch(e){showError('Could not score '+horizon+': '+e.message);}}if(changed){persist();window.dispatchEvent(new Event('btc:model-outcomes'));}renderStats();}
async function generate(requestedHorizon=null){if(working)return null;working=true;showError('');$('btcForecastNow').disabled=true;status('Fetching BTC candles…');try{
 const horizon=E.HORIZONS[requestedHorizon]?requestedHorizon:opts.horizon,cfg=E.HORIZONS[horizon],candles=await loadCandles(horizon);if(horizon===opts.horizon)observed=candles;
 const last=candles[candles.length-1],asOf=last.time+cfg.seconds*1000,anchor=last.price;
 // Re-running the exact same closed candle is not independent evidence.
 const existing=rows.findLast(r=>r.horizon===horizon&&r.asOf===asOf);
 if(existing){active=existing;status('Latest candle already forecast',true);render();window.dispatchEvent(new CustomEvent('btc:model-forecast',{detail:existing}));return existing;}
 status('Running Timestral-5M on this device…');const response=await localForecast('forecast',candles.map(c=>c.price));if(response.model!=='mistralai/Timestral-5M')throw Error('Local model returned an invalid response.');const sample={...response,median:response.median.slice(0,cfg.steps),q10:response.q10.slice(0,cfg.steps),q90:response.q90.slice(0,cfg.steps)};
 const record=E.forecastRecord({horizon,asOf,anchor,values:sample,records:rows});rows.push(record);if(rows.length>120)rows.splice(0,rows.length-120);active=record;persist();lastCheckAt=Date.now();status('Timestral forecast complete',true);render();window.dispatchEvent(new CustomEvent('btc:model-forecast',{detail:record}));return record;
 }catch(e){status('Forecast not available');showError('Forecast failed: '+(e.name==='AbortError'?'Model initialization timed out':e.message)+'. Existing BTC live prices remain unaffected.');}finally{working=false;$('btcForecastNow').disabled=false;}}
function renderStats(){const r=E.measure(rows,opts.horizon);$('btcForecastCount').textContent=String(r.count);$('btcForecastScored').textContent=r.count?'Scored only after real candle closes':'No verified outcomes yet';$('btcForecastMae').textContent=pct(r.mae);$('btcForecastBase').textContent='No-change baseline: '+pct(r.baselineMae);$('btcForecastAccuracy').textContent=pct(r.direction)+' / '+pct(r.coverage);$('btcForecastAdaptive').textContent=r.count<24?'Adapts after 24 resolved points':r.mae<r.baselineMae?'Adaptive model beating naive baseline':'Naive baseline has lower error so far';}
function render(){const horizon=opts.horizon;active=rows.filter(r=>r.horizon===horizon).at(-1)||null;const current=active,tail=current?.points.at(-1);$('btcForecastTarget').textContent=tail?usd(tail.adapted):'Not available';$('btcForecastDelta').textContent=tail?((tail.adapted/current.anchor-1)*100).toFixed(2)+'% vs '+usd(current.anchor):'Waiting for Timestral';$('btcForecastDetails').textContent=current?'Forecast as of '+new Date(current.asOf).toLocaleString()+' · calibration model weight '+Math.round(current.weight*100)+'% · '+current.priorSamples+' prior settled points. Changes are measured against future observed candles; no simulated trades.':'The model makes zero-shot forecasts. Adaptation uses only forecasts whose target times have passed.';renderStats();draw();}
function draw(){const canvas=$('btcForecastCanvas'),rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 const w=rect.width,h=rect.height,left=17,top=24,right=w-74,bottom=h-34,split=left+(right-left)*0.65;
 const record=active,pts=record?.points||[],historical=observed.filter(x=>Number.isFinite(x.price));const values=[...historical.map(x=>x.price),...pts.flatMap(x=>[x.lo,x.hi,x.actual].filter(x=>x>0))];if(!values.length){$('btcForecastEmpty').style.display='block';return;}
 $('btcForecastEmpty').style.display=record?'none':'block';const mn=Math.min(...values),mx=Math.max(...values),margin=Math.max((mx-mn)*0.13,mx*0.002);const lo=mn-margin,hi=mx+margin;const y=p=>bottom-(p-lo)/(hi-lo)*(bottom-top),xHist=i=>left+(split-left)*i/Math.max(1,historical.length-1),xFuture=i=>split+(right-split)*(i+1)/Math.max(1,pts.length);
 c.fillStyle='#182941';c.fillRect(split,top,right-split,bottom-top);c.font='11px system-ui';c.strokeStyle='#2b3d52';c.fillStyle='#90a4bc';c.textAlign='left';for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;c.setLineDash([3,6]);c.beginPath();c.moveTo(left,yy);c.lineTo(right,yy);c.stroke();c.fillText(usd(hi-(hi-lo)*i/4),right+6,yy+3);}c.setLineDash([]);c.fillStyle='#f8bc65';c.fillText('FORECAST →',split+8,top+13);
 if(historical.length){c.beginPath();historical.forEach((v,i)=>i?c.lineTo(xHist(i),y(v.price)):c.moveTo(xHist(i),y(v.price)));c.strokeStyle='#49dcc1';c.lineWidth=2.1;c.stroke();c.beginPath();c.arc(split,y(historical.at(-1).price),3.5,0,Math.PI*2);c.fillStyle='#49dcc1';c.fill();}
 if(pts.length){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(xFuture(i),y(p.hi)):c.moveTo(xFuture(i),y(p.hi)));for(let i=pts.length-1;i>=0;i--)c.lineTo(xFuture(i),y(pts[i].lo));c.closePath();c.fillStyle='#a993ff29';c.fill();
 c.beginPath();c.moveTo(split,y(record.anchor));pts.forEach((p,i)=>c.lineTo(xFuture(i),y(p.adapted)));c.strokeStyle='#f8bc65';c.lineWidth=2.5;c.stroke();
 const scored=pts.map((p,i)=>({...p,i})).filter(p=>p.actual!=null);if(scored.length){c.beginPath();c.moveTo(split,y(record.anchor));scored.forEach(p=>c.lineTo(xFuture(p.i),y(p.actual)));c.strokeStyle='#49dcc1';c.lineWidth=2;c.setLineDash([4,4]);c.stroke();c.setLineDash([]);}
 c.fillStyle='#99acc4';c.textAlign='center';c.fillText(new Date(record.asOf).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),split,bottom+18);c.fillText('+'+opts.horizon,right-12,bottom+18);}
}
function refreshAutoUI(){ $('btcForecastAuto').textContent=opts.auto?'Stop auto':'Start auto';$('btcForecastAuto').classList.toggle('primary',!opts.auto);}
function schedule(){clearInterval(timer);refreshAutoUI();if(opts.auto){timer=setInterval(async()=>{if(working)return;await evaluateAll();await generate();},opts.refresh*60000);}}
function exportRecords(){const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),model:'mistralai/Timestral-5M',records:rows},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='timestral-btc-forecast-outcomes.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('btcForecastHorizon').value=E.HORIZONS[opts.horizon]?opts.horizon:'6h';$('btcForecastInterval').value=String(opts.refresh);
$('btcForecastHorizon').onchange=e=>{opts.horizon=e.target.value;saveOpts();observed=[];render();loadCandles(opts.horizon).then(a=>{observed=a;render();}).catch(e=>showError(e.message));};
$('btcForecastSettings').onclick=()=>{$('btcForecastConfig').open=true;$('btcWarmup').focus();};
$('btcForecastSave').onclick=()=>{opts.refresh=Number($('btcForecastInterval').value);saveOpts();showError('');$('btcForecastConfig').open=false;schedule();status('Local model · ready to load');};
window.BtcForecastTracker={getRecords:()=>rows,generateForHorizon:h=>generate(h),loadCandlesForHorizon:h=>loadCandles(h)};
$('btcForecastNow').onclick=()=>generate();$('btcForecastAuto').onclick=()=>{opts.auto=!opts.auto;schedule();if(opts.auto)generate();};
$('btcForecastExport').onclick=exportRecords;
$('btcWarmup').onclick=async()=>{showError('');status('Loading local model…');$('btcWarmup').disabled=true;try{const x=await localForecast('warmup');status('Model ready · '+x.backend,true);}catch(e){status('Local model unavailable');showError(e.message);}finally{$('btcWarmup').disabled=false;}};
window.addEventListener('resize',()=>draw());
status('Local model · ready to load');render();
// Settles old forecasts using public historical candles, even when the browser was closed.
evaluateAll().then(()=>{loadCandles(opts.horizon).then(a=>{observed=a;render();}).catch(e=>showError('Market history: '+e.message));});
})();