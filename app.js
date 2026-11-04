/* BTC Forecast Lab — single-chart, source-backed prediction / verification workflow. */
(()=>{'use strict';
const F=window.BTCForecast,DeepSeek=window.BtcDeepSeek;
if(!F){document.body.textContent='Forecast application failed to load its calculations.';return;}
const $=id=>document.getElementById(id), USD=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
const pct=(n,d=2)=>Number.isFinite(n)?(n>0?'+':'')+n.toFixed(d)+'%':'—';
const when=t=>Number.isFinite(t)?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const timeShort=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const defaults={horizon:'1h',auto:true,spacing:5,range:'auto',historyLimit:250,drop24:4,jump:1.4,notifications:false,newsEnabled:false,newsInterval:30,sessionHours:6,inputTokens:2500,outputTokens:550,tokenCap:200000,dollarCap:2};
const getJson=(store,key,defaultValue)=>{try{const x=JSON.parse(store.getItem(key));return x??defaultValue;}catch{return defaultValue;}};
let settings={...defaults,...getJson(localStorage,'btc-lab-settings-v3',{})};
if(!F.CONFIG[settings.horizon])settings.horizon='1h';
let records=getJson(localStorage,'btc-lab-history-v3',[]);if(!Array.isArray(records))records=[];
records=records.filter(r=>r&&F.CONFIG[r.horizon]&&Array.isArray(r.points)).slice(-500);
let apiKey=sessionStorage.getItem('btc-lab-deepseek-key')||'';
let usage=getJson(sessionStorage,'btc-lab-usage-v3',{input:0,output:0,cached:0,searches:0,fetches:0,calls:0,cost:0});
let sentiment=getJson(sessionStorage,'btc-lab-sentiment-v3',null);
const state={live:null,ws:null,wsRetry:0,candles:[],source:'',historyFetching:false,historyAt:0,selected:null,follow:true,shared:null,drawMode:false,draft:null,drawScale:null,geom:null,autoBusy:false,lastAutoAt:0,lastNewsAt:0,modelWorker:null,modelReady:false,modelLoading:false,modelFault:'',modelJobs:new Map(),workerId:0,renderQueued:false,historyLoaded:false,newsBusy:false,lastAlert:0,error:''};
const elm=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
function showError(msg){state.error=msg||'';$('errorStatus').textContent=state.error;}
function status(msg){$('progressStatus').textContent=msg;}
function store(){try{records=records.slice(-Number(settings.historyLimit||250));localStorage.setItem('btc-lab-history-v3',JSON.stringify(records));}catch(e){showError('Could not save prediction history in this browser ('+e.message+'). Export existing results for backup.');}}
function storeSettings(){localStorage.setItem('btc-lab-settings-v3',JSON.stringify(settings));if(apiKey)sessionStorage.setItem('btc-lab-deepseek-key',apiKey);else sessionStorage.removeItem('btc-lab-deepseek-key');}
function active(){return state.shared||records.find(x=>x.id===state.selected)||null;}
function latest(h=settings.horizon){return records.filter(r=>r.horizon===h).at(-1)||null;}
function select(record,follow=false){state.shared=null;state.selected=record?.id||null;state.follow=follow;showError('');redraw();render();if(record)backfill(record).catch(e=>showError('Cannot verify earlier prices: '+e.message));}
function setStatus(stateName,message){$('connStatus').textContent=message;$('liveDot').className='dot '+stateName;}
function setLive(price,source,at=Date.now(),extra={}){if(!(price>0)||!Number.isFinite(price))return;
 state.live={...state.live,...extra,price,at,source};setStatus('good','Live · '+source);
 $('btcPrice').textContent=USD(price);
 const change=state.live.open24h>0?100*(price/state.live.open24h-1):null;
 $('dayChange').textContent=change==null?'Latest exchange trade':pct(change)+' in 24h';$('dayChange').className='note '+(change==null?'':change<0?'quote-down':'quote-up');
 riskCheck();redraw();
}
function websocket(){let ws;try{ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');}catch(e){setStatus('bad','WebSocket unavailable');return;}
 state.ws=ws;const timeout=setTimeout(()=>{if(ws.readyState!==1)ws.close();},12000);
 ws.onopen=()=>{clearTimeout(timeout);state.wsRetry=0;ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker']}));};
 ws.onmessage=e=>{try{const q=JSON.parse(e.data);if(q.type==='ticker'&&q.product_id==='BTC-USD')setLive(Number(q.price),'Coinbase live',Date.now(),{open24h:Number(q.open_24h)||state.live?.open24h,high24h:Number(q.high_24h)||state.live?.high24h,low24h:Number(q.low_24h)||state.live?.low24h});}catch{}};
 ws.onerror=()=>clearTimeout(timeout);ws.onclose=()=>{clearTimeout(timeout);if(state.ws!==ws)return;state.ws=null;setStatus('bad','Reconnecting BTC…');const delay=Math.min(60000,1500*1.7**Math.min(8,++state.wsRetry));setTimeout(websocket,delay);};
}
async function httpJSON(url,timeoutMs=15000){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);try{const r=await fetch(url,{signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();return j;}finally{clearTimeout(timer);}}
async function priceFallback(){if(state.live&&Date.now()-state.live.at<25000)return;try{const x=await httpJSON('https://api.exchange.coinbase.com/products/BTC-USD/ticker',10000);setLive(Number(x.price),'Coinbase REST');}
 catch(e){try{const x=await httpJSON('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',10000),q=Object.values(x.result||{})[0];if(!q?.c?.length)throw Error('Missing Kraken ticker');setLive(Number(q.c[0]),'Kraken REST');}catch{setStatus('bad','Price feed unavailable');}}}
async function get24h(){try{const x=await httpJSON('https://api.exchange.coinbase.com/products/BTC-USD/stats');if(state.live){state.live.open24h=Number(x.open)||null;state.live.high24h=Number(x.high)||null;state.live.low24h=Number(x.low)||null;}riskCheck();}catch{}}
function candleUrl(cfg,start,end){return 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+cfg.seconds+'&start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString();}
async function getCandles(horizon,opts={}){
 const cfg=F.CONFIG[horizon],ms=cfg.seconds*1000,now=Date.now(),until=opts.until||now,all=[];
 const desired=opts.count||512,batches=Math.ceil(desired/275);
 try{
  for(let k=batches-1;k>=0;k--){const end=until-k*275*ms,start=end-275*ms;const raw=await httpJSON(candleUrl(cfg,start,end),18000);all.push(...F.parseCoinbase(raw,cfg.seconds,now));}
  let candles=F.dedupe(all);if(candles.length>=96)return candles;
  throw Error('Coinbase supplied too few closed candles ('+candles.length+')');
 }catch(err){
  if(cfg.seconds===21600)throw Error('Coinbase 6-hour candles unavailable. Kraken does not provide native 6-hour OHLC; no substitute prices were invented ('+err.message+').');
  try{const x=await httpJSON('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+(cfg.seconds/60),18000);if(x.error?.length)throw Error(x.error.join('; '));const key=Object.keys(x.result||{}).find(k=>k!=='last');const candles=F.parseKraken(x.result?.[key]||[],cfg.seconds,now);if(candles.length<96)throw Error('Only '+candles.length+' Kraken candles');return candles;}catch(second){throw Error('Historical BTC search failed (Coinbase: '+err.message+'; Kraken: '+second.message+').');}
 }
}
async function fetchRange(rec){const cfg=F.CONFIG[rec.horizon],step=cfg.seconds*1000,now=Date.now(),start=rec.asOf-step*3,end=Math.min(now,rec.asOf+(cfg.steps+1)*step),all=[];
 if(end<=start+step)return [];
 try{const raw=await httpJSON(candleUrl(cfg,start,end+step),15000);return F.parseCoinbase(raw,cfg.seconds,now);}catch(e){
  // Do not score an old Coinbase-origin forecast from another exchange without making that provenance clear.
  if(rec.source==='Coinbase')throw e;
  const j=await httpJSON('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+(cfg.seconds/60));const key=Object.keys(j.result||{}).find(x=>x!=='last');return F.parseKraken(j.result?.[key]||[],cfg.seconds,now).filter(p=>p.time>=start&&p.time<=end+step);
 }
}
function settleAll(candles,horizon){let changed=0;for(const rec of records){if(rec.horizon===horizon)changed+=F.settle(rec,candles);}if(state.shared?.horizon===horizon)changed+=F.settle(state.shared,candles);if(changed){store();renderHistory();render();}return changed;}
async function historyRefresh(horizon=settings.horizon){if(state.historyFetching)return;state.historyFetching=true;try{const candles=await getCandles(horizon);if(settings.horizon===horizon){state.candles=candles;state.source=candles.at(-1)?.source||'';state.historyAt=Date.now();$('sourceStatus').textContent=state.source+' · '+candles.length+' closed candles';}
 settleAll(candles,horizon);state.historyLoaded=true;showError('');redraw();return candles;
 }catch(e){showError(e.message);throw e;}finally{state.historyFetching=false;}}
async function backfill(rec){const missing=rec.points.some(p=>p.time<=Date.now()-1500&&(p.actual==null||p.actual===undefined));if(!missing)return;
 try{const bars=await fetchRange(rec),n=F.settle(rec,bars);if(n){store();render();renderHistory();redraw();}return n;}catch(e){showError('Older outcome lookup: '+e.message);}}
function workerRequest(type,prices=[]){if(!state.modelWorker){state.modelWorker=new Worker('./timestral-worker.js');state.modelWorker.onmessage=({data})=>{
  if(data.type==='progress'){$('modelInfo').textContent=data.message;return;}const j=state.modelJobs.get(data.id);if(!j)return;state.modelJobs.delete(data.id);clearTimeout(j.timeout);if(data.ok)j.resolve(data.result||{backend:data.backend});else j.reject(Error(data.error||'Timestral inference error'));};
  state.modelWorker.onerror=e=>{state.modelFault=e.message||'Worker loading error';for(const j of state.modelJobs.values()){clearTimeout(j.timeout);j.reject(Error(state.modelFault));}state.modelJobs.clear();state.modelWorker?.terminate();state.modelWorker=null;};}
 const id=++state.workerId;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{state.modelJobs.delete(id);reject(Error('Local Timestral model did not respond in 150 seconds.'));},150000);state.modelJobs.set(id,{resolve,reject,timeout});state.modelWorker.postMessage({id,type,prices});});}
async function warmModel(){if(state.modelReady||state.modelLoading)return;state.modelLoading=true;$('engineStatus').textContent='Starting Timestral';$('modelInfo').textContent='First run downloads ~21 MB once';try{const x=await workerRequest('warmup');state.modelReady=true;state.modelFault='';$('engineStatus').textContent='Timestral + history';$('modelInfo').textContent='On-device '+(x.backend||'WASM');status('Timestral is ready. It will be included in subsequent forecasts.');}catch(e){state.modelReady=false;state.modelFault=e.message;$('engineStatus').textContent='History models active';$('modelInfo').textContent='Timestral unavailable · see details';status('Price-history models remain active; Timestral: '+e.message);}finally{state.modelLoading=false;}}
async function generate({manual=false,sketch=null,sketchAtTime=null,spot=null}={}){
 if(state.autoBusy)return;state.autoBusy=true;const horizon=settings.horizon,cfg=F.CONFIG[horizon];$('forecastButton').disabled=true;
 try{
  let candles=state.candles;
  if(candles.length<120||Date.now()-state.historyAt>Math.max(90000,cfg.seconds*850)){candles=await historyRefresh(horizon);}
  candles=F.tail(candles,cfg.seconds*1000);
  if(candles.length<120)throw Error('No sufficient contiguous live exchange candles for a real forecast.');
  const last=candles.at(-1);if(!manual){const old=records.filter(x=>!x.sketch&&x.horizon===horizon).at(-1);if(old&&old.asOf>=last.time)return;const age=Date.now()-(old?.madeAt||0);if(old&&age<settings.spacing*60000)return;}
  status('Forecasting from '+candles.length+' verified '+last.source+' candles ending '+when(last.time)+'…');
  let model=null,modelMadeAt=null;
  if(state.modelReady){try{const m=await workerRequest('forecast',candles.map(c=>c.price));if(m.model==='mistralai/Timestral-5M'){model=m;modelMadeAt=Date.now();}}
    catch(e){state.modelReady=false;state.modelFault=e.message;$('modelInfo').textContent='Timestral error; using historical forecasts';}}
  const now=Date.now();const rec=F.createPrediction({candles,horizon,now,spot:spot??state.live?.price,sketch,sketchAtTime,model,modelMadeAt,prior:records});
  rec.inputTail=candles.slice(-35);rec.mode=model?'Timestral + matched-history ensemble':'Matched history + momentum ensemble';
  records.push(rec);state.lastAutoAt=now;store();if(state.follow||manual){state.selected=rec.id;state.shared=null;state.follow=true;}
  showError('');status('Forecast #'+records.length+' frozen at '+when(rec.madeAt)+' · '+rec.mode+'. Next actual candle is not scored until after closing.');
  render();renderHistory();redraw();
 }catch(e){showError('Forecast unavailable: '+e.message);status('Forecast skipped; no predicted prices have been invented.');}
 finally{state.autoBusy=false;$('forecastButton').disabled=false;}}
function riskCheck(){const l=state.live;if(!l)return;let danger='Within limits';const day=l.open24h>0?(l.price/l.open24h-1)*100:null;if(day!==null&&day<=-settings.drop24)danger='24h drop alert';const last=state.candles.at(-1),prev=state.candles.at(-2);if(last&&prev&&Math.abs((last.price/prev.price-1)*100)>=settings.jump)danger='Fast-move alert';$('riskStatus').textContent=danger;if(danger!=='Within limits'&&Date.now()-state.lastAlert>15*60000){state.lastAlert=Date.now();if(settings.notifications&&'Notification'in window&&Notification.permission==='granted')new Notification('BTC Forecast Lab risk alert',{body:danger+' · BTC '+USD(l.price)});}}
function renderHeader(){const selected=active(),stats=F.evidence(records,settings.horizon),done=records.filter(r=>r.horizon===settings.horizon&&F.scoreRecord(r)?.completed).length;
 $('verifiedCount').textContent=String(done);$('verifiedInfo').textContent=done?'Calibrating from completed forecasts':'Only real future closes can verify';
 $('nextForecast').textContent=settings.auto?'Automatic':'Paused';$('autoInfo').textContent=settings.auto?'Runs on each newly closed candle':'Use Predict now for manual snapshots';
 $('engineStatus').textContent=state.modelReady?'Timestral + history':state.modelLoading?'Loading Timestral':'History algorithms';
 $('learningStatus').textContent=stats.n>=8?'Adaptive method weights use '+stats.n+' completed predictions; frozen originals unchanged.':'Learning after 8 fully resolved predictions ('+stats.n+'/8).';
 $('forecastMessage').textContent=state.drawMode?'Draw in the future area; release to save your prediction automatically.':state.follow?'Following newest forecast · drawing automatically creates a new snapshot':'Reviewing saved forecast · click Viewing latest to resume';
 $('followButton').textContent=state.follow?'Viewing latest':'Return to latest';
 $('asOf').textContent=selected?'Forecast saved '+when(selected.madeAt):'Awaiting first forecast';
 $('activeSub').textContent=selected?'Frozen '+when(selected.madeAt)+' · '+selected.mode+(selected.sketch?' · Your drawing saved':' · Automatic prediction'):'Draw a future guess, or allow the app to predict automatically. Historical prices are searched first.';
 const sc=selected?F.scoreRecord(selected):null,points=selected?.points,last=points?.at(-1);
 $('guessSummary').textContent=last&&Number.isFinite(last.forecast)?pct(100*(last.forecast/selected.anchor-1)):'—';$('guessDetail').textContent=last?'Forecast '+USD(last.forecast)+' · '+selected.mode:'Waiting for a market-data forecast';
 const lastDraw=selected?.sketch?.at(-1);$('drawSummary').textContent=lastDraw?pct(100*(lastDraw.price/(selected.spot||selected.anchor)-1)):'Not drawn';$('drawDetail').textContent=lastDraw?'Your line is frozen at '+when(selected.sketchAt):'Optional: draw a path on the same chart';
 $('accuracySummary').textContent=sc?.forecastMae!=null?sc.forecastMae.toFixed(3)+'% MAE':'Pending';$('accuracyDetail').textContent=sc?.scored?sc.scored+'/'+sc.total+' observed checkpoints · '+(sc.direction==null?'direction pending':sc.direction.toFixed(0)+'% direction right'):'Awaiting real future candle closes';
}
function renderHistory(){const box=$('historyRows');box.replaceChildren();const all=state.shared?[state.shared,...records.slice().reverse()]:records.slice().reverse();$('historyCount').textContent=records.length+' saved forecasts in this browser'+(state.shared?' · 1 shared read-only result':'');
 if(!all.length){box.append(elm('div','The first automatic forecast will appear when live BTC history is ready.','none'));return;}
 const header=elm('div','','item itemhead');header.setAttribute('aria-hidden','true');for(const x of ['Created','Predicted move','Verified','Price error','Method']){const y=elm('span',x);if(['Verified','Method'].includes(x))y.className='hide-sm';header.append(y);}box.append(header);
 for(const r of all.slice(0,100)){
  const sc=F.scoreRecord(r),last=r.points?.at(-1),move=Number.isFinite(last?.forecast)?100*(last.forecast/r.anchor-1):null;
  const item=elm('button','','item'+(active()?.id===r.id?' active':''));item.type='button';item.setAttribute('aria-label','Review prediction from '+when(r.madeAt));
  const cells=[[when(r.madeAt),r.horizon+(r.sketch?' · drawn':' · automatic')],[pct(move),last?USD(last.forecast):'Legacy sketch'],[sc?.scored?sc.scored+'/'+sc.total:'Pending','actual candles'],[sc?.forecastMae==null?'—':sc.forecastMae.toFixed(3)+'%','MAE'],[r.mode||'Previously saved','']];
  cells.forEach(([main,sub],i)=>{const col=elm('span');if(i===2||i===4)col.className='hide-sm';col.append(elm('strong',main),elm('span',sub,'sub'));item.append(col);});
  item.onclick=()=>{if(r===state.shared){state.follow=false;render();redraw();}else select(r,false);};box.append(item);
 }
}
function renderCheckpoints(){const box=$('checkpointRows');box.replaceChildren();const r=active();if(!r){const tr=elm('tr');const c=elm('td','No saved predictions');c.colSpan=5;tr.append(c);box.append(tr);return;}
 for(const p of r.points){const tr=elm('tr');const err=Number.isFinite(p.actual)&&Number.isFinite(p.forecast)?100*Math.abs(p.actual-p.forecast)/p.actual:null;
 for(const value of [when(p.time),USD(p.forecast),USD(p.user),USD(p.actual),err==null?'Pending':err.toFixed(3)+'%'])tr.append(elm('td',value));box.append(tr);}
}
function render(){renderHeader();renderCheckpoints();$('newsStatus').textContent=sentiment?'Score '+Math.round(sentiment.score)+'/100 · '+sentiment.label:settings.newsEnabled?'Enabled · awaiting first check':'Off · optional';renderUsage();}
function redraw(){if(state.renderQueued)return;state.renderQueued=true;requestAnimationFrame(()=>{state.renderQueued=false;drawChart();});}
function geometry(record,ctxHistory,canvas,price){const cfg=F.CONFIG[record?.horizon||settings.horizon],ms=cfg.seconds*1000;
 const origin=record?.asOf||ctxHistory.at(-1)?.time||Date.now(),end=origin+cfg.steps*ms,begin=origin-Math.min(24*ms,cfg.steps*ms*.5),rect=canvas.getBoundingClientRect();
 const left=18,right=Math.max(100,rect.width-84),top=31,bottom=Math.max(100,rect.height-41),dx=right-left;
 const x=t=>left+(t-begin)/(end-begin)*dx,split=x(origin);
 const recent=ctxHistory.filter(p=>p.time>=begin&&p.time<=origin).map(x=>x.price);
 const candidate=[...recent,...(record?.points||[]).flatMap(p=>[p.forecast,p.actual,p.lo,p.hi]),...(record?.sketch||[]).map(x=>x.price),price,record?.anchor].filter(n=>Number.isFinite(n)&&n>0);
 let anchor=record?.anchor||ctxHistory.at(-1)?.price||price||100000;
 const configRange=Number(settings.range);const range=settings.range==='auto'?cfg.range:configRange;
 let min=Math.min(...candidate,anchor*(1-range/100)),max=Math.max(...candidate,anchor*(1+range/100));
 if(state.drawScale){min=state.drawScale.min;max=state.drawScale.max;}else{const extra=(max-min)*.06;min-=extra;max+=extra;}
 const y=v=>bottom-(v-min)/Math.max(1,max-min)*(bottom-top);
 return{cfg,origin,end,begin,left,right,top,bottom,min,max,x,y,split,rect};
}
function drawChart(){const canvas=$('chart'),rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const record=active(),draft=state.draft,plotRecord=draft?{horizon:settings.horizon,asOf:state.candles.at(-1)?.time||draft.at,anchor:draft.anchor,sketch:draft.points,points:[],sketchAt:draft.at}:record;
 let history=record?.inputTail||state.candles;history=Array.isArray(history)?history:[];const g=geometry(plotRecord,history,canvas,state.live?.price);state.geom=g;
 const {left,right,top,bottom,x,y,split}=g;ctx.fillStyle='#0c192a';ctx.fillRect(left,top,right-left,bottom-top);ctx.fillStyle='#142a41';ctx.fillRect(split,top,right-split,bottom-top);
 ctx.font='11px system-ui';ctx.textAlign='left';for(let i=0;i<5;i++){const yy=top+i*(bottom-top)/4;ctx.strokeStyle='#2e435c';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#89a8c1';ctx.fillText(USD(g.max-(g.max-g.min)*i/4),right+6,yy+4);}
 const trace=(pairs,color,width=2,dash=[])=>{const good=pairs.filter(q=>Number.isFinite(q.time)&&Number.isFinite(q.price)&&q.price>0&&q.time>=g.begin&&q.time<=g.end).sort((a,b)=>a.time-b.time);if(!good.length)return;ctx.beginPath();good.forEach((q,i)=>i?ctx.lineTo(x(q.time),y(q.price)):ctx.moveTo(x(q.time),y(q.price)));ctx.lineWidth=width;ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
 trace(history.map(p=>({time:p.time,price:p.price})),'#4bdec0',2.2);
 if(record?.points?.length){const p=record.points,original={time:record.asOf,price:record.anchor};const bounds=p.filter(z=>Number.isFinite(z.lo)&&Number.isFinite(z.hi));if(bounds.length){ctx.beginPath();bounds.forEach((z,i)=>i?ctx.lineTo(x(z.time),y(z.hi)):ctx.moveTo(x(z.time),y(z.hi)));for(let i=bounds.length-1;i>=0;i--)ctx.lineTo(x(bounds[i].time),y(bounds[i].lo));ctx.closePath();ctx.fillStyle='#ffc46b18';ctx.fill();}
 trace([original,...p.map(z=>({time:z.time,price:z.forecast}))],'#ffc46b',2.9);
 trace([original,...p.filter(z=>Number.isFinite(z.actual)).map(z=>({time:z.time,price:z.actual}))],'#53d9f7',3);
 }
 if(plotRecord?.sketch?.length){const anchor=Number.isFinite(plotRecord.spot)?plotRecord.spot:plotRecord.anchor,sketchStart=plotRecord.sketchAt||draft?.at||plotRecord.asOf;
 const sketchSeries=[{time:sketchStart,price:anchor},...plotRecord.sketch.map(z=>({time:sketchStart+z.f*g.cfg.steps*g.cfg.seconds*1000,price:z.price}))];trace(sketchSeries,'#b8a4ff',2.8,[8,5]);}
 if(state.live&&state.live.at>=g.origin&&state.live.at<=g.end){const xx=x(state.live.at);ctx.strokeStyle='#57bcd9';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#9fe6f9';ctx.fillText('LIVE',Math.min(right-34,xx+3),top+19);ctx.beginPath();ctx.arc(xx,y(state.live.price),3.5,0,2*Math.PI);ctx.fill();}
 ctx.strokeStyle='#d5a964';ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(split,top);ctx.lineTo(split,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#edc27d';ctx.textAlign='left';ctx.fillText('PREDICTION START · FIXED',Math.min(right-178,split+5),top+13);
 ctx.fillStyle='#8ca7c5';ctx.textAlign='center';ctx.fillText(timeShort(g.begin),left+38,bottom+17);ctx.fillText(timeShort(g.origin),split,bottom+17);ctx.fillText(when(g.end),right-58,bottom+17);
 const visible=Boolean(history.length||record?.points?.length);$('plotMsg').textContent=visible?'':state.historyFetching?'Loading real exchange candles…':'No real BTC price history available. Retrying…';
}
function canvasPoint(e){const g=state.geom;if(!g)return null;const r=$('chart').getBoundingClientRect(),xx=e.clientX-r.left,yy=e.clientY-r.top;if(xx<g.split||xx>g.right||yy<g.top||yy>g.bottom)return null;return{f:Math.max(0,Math.min(1,(xx-g.split)/(g.right-g.split))),price:Math.max(.01,g.max-(yy-g.top)/(g.bottom-g.top)*(g.max-g.min))};}
function pointerDown(e){const spot=state.live;if(!spot||Date.now()-spot.at>120000){showError('A current BTC price is required before drawing.');return;}const p=canvasPoint(e);if(!p)return;
 e.preventDefault();$('chart').setPointerCapture(e.pointerId);const g=state.geom;state.drawScale={min:g.min,max:g.max};state.drawMode=true;state.draft={at:Date.now(),anchor:spot.price,points:[{f:0,price:spot.price}]};if(p.f>.003)state.draft.points.push(p);state.follow=true;state.shared=null;status('Drawing a forecast from real BTC '+USD(spot.price)+' — release to freeze and predict.');redraw();}
function pointerMove(e){if(!state.drawMode||!state.draft)return;const p=canvasPoint(e);if(!p)return;e.preventDefault();const points=state.draft.points,last=points.at(-1);if(p.f<last.f-.003)return;if(p.f-last.f>.003)points.push(p);else if(p.f>0){last.f=p.f;last.price=p.price;}if(points.length>150)points.splice(1,1);redraw();}
function pointerEnd(e){if(!state.drawMode)return;state.drawMode=false;state.drawScale=null;const d=state.draft;state.draft=null;if(d.points.length<2||d.points.at(-1).f<.015){status('A longer stroke is needed. Draw across the future region.');redraw();return;}status('Sketch locked. Searching actual BTC price history before estimating future prices…');generate({manual:true,sketch:d.points,sketchAtTime:d.at,spot:d.anchor}).then(()=>{state.follow=true;render();redraw();});}
function renderUsage(){const estimated=Math.ceil(Number(settings.sessionHours)*60/Number(settings.newsInterval)),per=Number(settings.inputTokens)+Number(settings.outputTokens),used=usage.input+usage.output;
 const estimatedTotal=estimated*per,estimatedCost=estimated*(settings.inputTokens*.15+settings.outputTokens*.60)/1e6;const summary=`~${per.toLocaleString()} tokens/check · ~${estimatedTotal.toLocaleString()} tokens per ${settings.sessionHours}h planned session · ≈ $${estimatedCost.toFixed(4)} excluding search fees`;const actual=`Actual in this tab: ${used.toLocaleString()} tokens (${usage.input} input, ${usage.output} output), ${usage.calls} checks, estimated $${usage.cost.toFixed(4)}`;
 $('usagePreview').textContent=summary+'\n'+actual;
 $('sentimentDetails').textContent=sentiment?`Last check ${when(sentiment.at)} · ${sentiment.label} (${Math.round(sentiment.score)}/100, ${sentiment.confidence}) · ${sentiment.summary}`:'No successful DeepSeek news check yet.';
}
async function checkNews(){if(state.newsBusy)return;if(!apiKey){if(settings.newsEnabled)showError('DeepSeek news checks require an API key in Settings. Price forecasting still runs normally.');return;}if(!DeepSeek)return;
 const estimated=Number(settings.inputTokens)+Number(settings.outputTokens),used=usage.input+usage.output;if(settings.tokenCap&&used+estimated>settings.tokenCap){status('DeepSeek token budget reached. News checks paused; BTC forecasts continue.');return;}if(settings.dollarCap&&usage.cost+(estimated*1.1/1e6)>settings.dollarCap){status('DeepSeek dollar budget reached. News checks paused.');return;}
 state.newsBusy=true;try{const day=state.live?.open24h>0?100*(state.live.price/state.live.open24h-1):null;const result=await DeepSeek.sentiment({mode:'flash',key:apiKey,price:state.live?.price,change24h:day});const u=result.usage||{};
 const input=Number(u.input)||0,output=Number(u.output)||0,cached=Number(u.cached)||0,searches=Number(u.searches)||0,fetches=Number(u.fetches)||0;
 const cost=(input*.15+output*.60)/1e6+(.00075*(searches+fetches));usage={input:usage.input+input,output:usage.output+output,cached:usage.cached+cached,searches:usage.searches+searches,fetches:usage.fetches+fetches,calls:usage.calls+1,cost:usage.cost+cost};
 sentiment={...result.sentiment,at:Date.now(),sources:result.sources||[]};sessionStorage.setItem('btc-lab-usage-v3',JSON.stringify(usage));sessionStorage.setItem('btc-lab-sentiment-v3',JSON.stringify(sentiment));state.lastNewsAt=Date.now();showError('');render();status('News sentiment checked with DeepSeek; '+(input+output)+' actual tokens reported.');
 }catch(e){state.lastNewsAt=Date.now();showError('DeepSeek news check unavailable: '+e.message+' — BTC forecasts continue independently.');}finally{state.newsBusy=false;}}
function populateSettings(){const put=(id,v)=>$(id).value=String(v);
 put('sAuto',settings.auto?'on':'off');put('sSpacing',settings.spacing);put('sRange',settings.range);put('sHistoryLimit',settings.historyLimit);put('sDrop24',settings.drop24);put('sJump',settings.jump);$('sNotifications').checked=Boolean(settings.notifications);
 $('sNewsEnabled').checked=Boolean(settings.newsEnabled);put('sNewsInterval',settings.newsInterval);put('sSessionHours',settings.sessionHours);put('sInputTokens',settings.inputTokens);put('sOutputTokens',settings.outputTokens);put('sTokenCap',settings.tokenCap);put('sDollarCap',settings.dollarCap);$('sApiKey').value=apiKey;renderUsage();}
function saveSettings(){const num=(id,min,max)=>Math.max(min,Math.min(max,Number($(id).value)||0));
 settings={...settings,auto:$('sAuto').value==='on',spacing:num('sSpacing',5,60),range:$('sRange').value,historyLimit:num('sHistoryLimit',50,500),drop24:num('sDrop24',.1,40),jump:num('sJump',.1,20),notifications:$('sNotifications').checked,newsEnabled:$('sNewsEnabled').checked,newsInterval:num('sNewsInterval',15,360),sessionHours:num('sSessionHours',1,24),inputTokens:num('sInputTokens',100,50000),outputTokens:num('sOutputTokens',100,16000),tokenCap:num('sTokenCap',0,10000000),dollarCap:num('sDollarCap',0,100)};
 apiKey=$('sApiKey').value.trim();storeSettings();store();if(settings.notifications&&'Notification'in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});render();redraw();status('Settings saved. Auto forecasts '+(settings.auto?'enabled':'paused')+'.');}
function legacyImport(){if(localStorage.getItem('btc-lab-legacy-import-v3'))return;const old=getJson(localStorage,'btc-comparison-ledger-v2',[]),oldModel=getJson(localStorage,'btc-timestral-tracker-v1',[]);let added=0;
 if(Array.isArray(old))for(const source of old){if(!Number.isFinite(source.at)||!Number.isFinite(source.anchor)||!Array.isArray(source.sketch)||!F.CONFIG[({1:'1h',6:'6h',24:'24h',168:'7d'})[source.horizon]])continue;
  const h=({1:'1h',6:'6h',24:'24h',168:'7d'})[source.horizon],cfg=F.CONFIG[h],sketch=source.sketch.map(p=>({f:Number(p.f),price:Number(p.price)})).filter(p=>Number.isFinite(p.f)&&p.price>0);
  if(!sketch.length||records.some(r=>r.id==='legacy-'+source.id))continue;
  const model=Array.isArray(oldModel)?oldModel.find(m=>m.id===source.modelId&&m.horizon===h&&Array.isArray(m.points)):null;
  const estimateAt=time=>{if(!model)return null;const points=[{time:model.asOf,adapted:model.anchor},...model.points];if(!Number.isFinite(model.asOf)||time<points[0].time||time>points.at(-1).time)return null;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(time<=b.time){const f=(time-a.time)/(b.time-a.time);return a.adapted+(b.adapted-a.adapted)*f;}}return null;};
  const points=Array.from({length:cfg.steps},(_,i)=>{const time=source.at+(i+1)*cfg.seconds*1000;return{time,forecast:estimateAt(time),lo:null,hi:null,baseline:source.anchor,user:F.sketchAt(sketch,source.at,time,source.anchor,cfg.steps*cfg.seconds*1000),actual:null};});
  const history=(source.history||[]).map(p=>({time:p.time??p.t,price:p.price??p.p,source:'Coinbase'}));
  records.push({id:'legacy-'+source.id,legacy:true,mode:model?'Imported Timestral + drawing':'Legacy sketch · no historical model snapshot',horizon:h,asOf:source.at,madeAt:source.lockedAt||source.at,anchor:source.anchor,source:'Coinbase',spot:source.anchor,sketchAt:source.at,sketch,methods:model?{timestral:points.map(p=>p.forecast)}:{},modelMadeAt:model?{timestral:model.createdAt}:{},weights:{},points,inputTail:history});added++;
 }
 if(added)store();localStorage.setItem('btc-lab-legacy-import-v3','1');}
async function compressedLink(r){const body=JSON.stringify({v:1,record:r});const bytes=new TextEncoder().encode(body);let data=bytes,flag='r';if('CompressionStream'in window){const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));data=new Uint8Array(await new Response(stream).arrayBuffer());flag='g';}
 let binary='';for(const byte of data)binary+=String.fromCharCode(byte);return location.origin+location.pathname+'#review='+flag+'.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function loadShared(){if(!location.hash.startsWith('#review='))return;try{let token=location.hash.slice(8),[flag,b64]=token.split('.');if(!['r','g'].includes(flag)||!b64||b64.length>60000)throw Error('Invalid shared result');b64=b64.replace(/-/g,'+').replace(/_/g,'/');const str=atob(b64),bytes=Uint8Array.from(str,x=>x.charCodeAt(0));let payload=bytes;
 if(flag==='g'){if(!('DecompressionStream'in window))throw Error('This browser cannot open compressed links.');payload=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
 const obj=JSON.parse(new TextDecoder().decode(payload)),r=obj.record;if(!F.CONFIG[r?.horizon]||!Number.isFinite(r.madeAt)||!Array.isArray(r.points)||r.points.length>32||!r.points.every(p=>Number.isFinite(p.time)))throw Error('Invalid saved prediction');
 state.shared=r;state.selected=null;state.follow=false;status('Opened a read-only shared prediction. Real BTC candles will be fetched to verify the outcome.');backfill(r).then(()=>{render();renderHistory();redraw();});
 }catch(e){showError('Shared prediction cannot be opened: '+e.message);}}
function exportHistory(){const payload=JSON.stringify({format:'btc-forecast-lab-v3',exportedAt:new Date().toISOString(),records},null,2),blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob),a=elm('a');a.href=url;a.download='btc-forecast-history-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function importHistory(file){try{if(file.size>8e6)throw Error('File too large');const data=JSON.parse(await file.text()),list=data.records;if(!Array.isArray(list)||list.length>1000)throw Error('Expected a forecast history JSON export');let count=0;const ids=new Set(records.map(r=>r.id));for(const r of list){if(!F.CONFIG[r?.horizon]||!Array.isArray(r.points)||!Number.isFinite(r.asOf)||!Number.isFinite(r.madeAt)||ids.has(r.id))continue;if(r.points.length!==F.CONFIG[r.horizon].steps)continue;records.push(r);ids.add(r.id);count++;}records.sort((a,b)=>a.madeAt-b.madeAt);store();renderHistory();status('Imported '+count+' independent historical prediction snapshots.');}catch(e){showError('Import failed: '+e.message);}}
function setupUI(){const c=$('chart');c.addEventListener('pointerdown',pointerDown);c.addEventListener('pointermove',pointerMove);c.addEventListener('pointerup',pointerEnd);c.addEventListener('pointercancel',pointerEnd);c.addEventListener('lostpointercapture',pointerEnd);new ResizeObserver(redraw).observe(c);
 $('drawButton').onclick=()=>{state.follow=true;state.shared=null;state.drawMode=false;state.draft=null;status('Draw directly on the right-hand shaded future chart area; release to automatically save and predict.');c.focus();redraw();};
 $('forecastButton').onclick=()=>generate({manual:true});$('followButton').onclick=()=>{state.shared=null;state.follow=true;state.selected=latest()?.id||null;render();renderHistory();redraw();};
 $('horizons').onclick=e=>{const btn=e.target.closest('[data-h]');if(!btn)return;settings.horizon=btn.dataset.h;storeSettings();for(const b of $('horizons').querySelectorAll('button'))b.classList.toggle('active',b.dataset.h===settings.horizon);state.selected=latest()?.id||null;state.follow=true;state.shared=null;state.candles=[];render();redraw();historyRefresh(settings.horizon).then(()=>generate()).catch(()=>{});};
 $('settingsButton').onclick=()=>{populateSettings();$('settingsDialog').showModal();};$('closeSettings').onclick=()=>{$('settingsDialog').close();};$('settingsForm').onsubmit=e=>{e.preventDefault();saveSettings();$('settingsDialog').close();};
 for(const id of ['sNewsInterval','sSessionHours','sInputTokens','sOutputTokens'])$(id).addEventListener('input',()=>{const prev={newsInterval:settings.newsInterval,sessionHours:settings.sessionHours,inputTokens:settings.inputTokens,outputTokens:settings.outputTokens};for(const k of Object.keys(prev)){const inputId={newsInterval:'sNewsInterval',sessionHours:'sSessionHours',inputTokens:'sInputTokens',outputTokens:'sOutputTokens'}[k];settings[k]=Math.max(1,Number($(inputId).value)||prev[k]);}renderUsage();Object.assign(settings,prev);});
 $('newsNow').onclick=()=>{if(!apiKey){populateSettings();$('settingsDialog').showModal();$('sApiKey').focus();return;}checkNews();};
 $('shareButton').onclick=async()=>{const rec=active();if(!rec){status('Select a saved forecast before sharing.');return;}try{const link=await compressedLink(rec);await navigator.clipboard.writeText(link);status('Read-only review link copied. Other people can see the original prediction and verified actual prices.');}catch(e){showError('Could not copy share link: '+e.message);}};
 $('exportButton').onclick=exportHistory;$('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=e=>{const file=e.target.files?.[0];if(file)importHistory(file);e.target.value='';};
 window.addEventListener('resize',redraw);window.addEventListener('hashchange',()=>loadShared().then(()=>{render();redraw();}));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){priceFallback();historyRefresh(settings.horizon).then(()=>{if(settings.auto)generate();}).catch(()=>{});}});
}
let updating=false;async function loop(){if(updating)return;updating=true;try{const horizon=settings.horizon,cfg=F.CONFIG[horizon];await priceFallback();const newest=Math.floor((Date.now()-1500)/(cfg.seconds*1000))*(cfg.seconds*1000),known=state.candles.at(-1)?.time||0;
 if(!state.historyFetching&&(!state.candles.length||newest>known&&Date.now()-state.historyAt>30000)){
  const c=await historyRefresh(horizon);if(c&&settings.auto)await generate();
 } else if(settings.auto&&!latest(horizon)&&state.candles.length)await generate();
 if(settings.newsEnabled&&apiKey&&Date.now()-state.lastNewsAt>settings.newsInterval*60000&&state.live)await checkNews();
 }catch{}finally{updating=false;renderHeader();}}
legacyImport();setupUI();state.selected=latest()?.id||null;render();renderHistory();redraw();loadShared();websocket();priceFallback();get24h();warmModel();
historyRefresh(settings.horizon).then(()=>{if(settings.auto)generate();}).catch(()=>{});
setInterval(loop,25000);setInterval(()=>{if(state.live&&Date.now()-state.live.at>90000)setStatus('bad','Price quote stale');},15000);setInterval(()=>{renderHeader();},30000);
window.__btcLab={snapshot:()=>({records:records.slice(),settings:{...settings},selected:active()?.id||null,modelReady:state.modelReady,feed:state.source}),core:F};
})();