/* Bitcoin Forecast Lab v4: one automatic chart; user drawings are pinned, not replaced. */
(()=>{'use strict';
const F=window.BTCForecast,DeepSeek=window.BtcDeepSeek;
if(!F){document.body.textContent='Unable to load the forecasting engine.';return;}
const $=id=>document.getElementById(id);
const USD=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
const percent=n=>Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—';
const date=t=>Number.isFinite(t)?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const clock=t=>Number.isFinite(t)?new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
const getJSON=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}};
const defaults={horizon:'1h',auto:true,spacing:5,range:'auto',historyLimit:250,drop24:4,jump:1.4,notifications:false,newsEnabled:false,newsInterval:30,sessionHours:6,inputTokens:2500,outputTokens:550,tokenCap:200000,dollarCap:2};
let settings={...defaults,...getJSON(localStorage,'btc-lab-settings-v3',{})};
if(!F.CONFIG[settings.horizon])settings.horizon='1h';
let records=getJSON(localStorage,'btc-lab-history-v3',[]);
if(!Array.isArray(records))records=[];
records=records.filter(r=>r&&F.CONFIG[r.horizon]&&Array.isArray(r.points)).sort((a,b)=>a.madeAt-b.madeAt).slice(-500);
let publicRecords=[];let publicLoadedAt=0;
let apiKey=sessionStorage.getItem('btc-lab-deepseek-key')||'';
let usage=getJSON(sessionStorage,'btc-lab-usage-v3',{input:0,output:0,cached:0,searches:0,fetches:0,calls:0,cost:0});
let sentiment=getJSON(sessionStorage,'btc-lab-sentiment-v3',null);
const savedPinned=localStorage.getItem('btc-lab-pinned-v4');
const state={live:null,ws:null,wsRetry:0,candles:[],source:'',historyAt:0,historyBusy:false,selectedId:records.some(r=>r.id===savedPinned)?savedPinned:null,shared:null,loading:false,lastAutoAt:0,modelWorker:null,modelReady:false,modelLoading:false,modelFailure:'',jobs:new Map(),workerId:0,draw:null,chartScale:null,geom:null,lastTickSave:0,renderQueued:false,newsBusy:false,lastNewsAt:0,error:'',lastAlert:0,backfillBusy:false,lastCatchupAt:0,loopBusy:false,historyFilter:'all'};
const ui=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const latest=(h=settings.horizon)=>records.filter(r=>r.horizon===h).at(-1)||null;
const selected=()=>state.shared||records.find(r=>r.id===state.selectedId)||latest();
const pinned=()=>!!state.selectedId||!!state.shared;
const endTime=r=>r?.points?.at(-1)?.time||0;
function info(message){$('progressStatus').textContent=message;}
function error(message){state.error=String(message||'');$('errorStatus').textContent=state.error;}
function persist(){try{records=records.slice(-Math.max(50,Number(settings.historyLimit)||250));localStorage.setItem('btc-lab-history-v3',JSON.stringify(records));}catch(e){error('Browser storage is full. Export your history for backup: '+e.message);}}
function persistSettings(){try{localStorage.setItem('btc-lab-settings-v3',JSON.stringify(settings));if(apiKey)sessionStorage.setItem('btc-lab-deepseek-key',apiKey);else sessionStorage.removeItem('btc-lab-deepseek-key');}catch(e){error('Could not save settings: '+e.message);}}
function select(record,shouldPin=true){state.shared=null;state.selectedId=shouldPin?record?.id||null:null;
 if(state.selectedId)localStorage.setItem('btc-lab-pinned-v4',state.selectedId);else localStorage.removeItem('btc-lab-pinned-v4');
 if(record&&record.horizon!==settings.horizon){settings.horizon=record.horizon;persistSettings();syncHorizon();}
 error('');render();repaint();if(record)backfill(record).catch(e=>error('Could not update saved result: '+e.message));
}
function setPrice(price,source,at=Date.now(),extra={}){if(!(Number(price)>0))return;
 state.live={...state.live,...extra,price:Number(price),source,at};
 $('btcPrice').textContent=USD(price);
 const change=state.live.open24h>0?100*(price/state.live.open24h-1):null;
 $('dayChange').textContent=(change==null?'BTC / USD':percent(change)+' in 24 hours')+' · '+source;
 const rec=selected();
 if(rec&&!state.shared&&rec.id===state.selectedId&&at>=rec.asOf&&at<=endTime(rec)&&at-(rec.lastTickAt||0)>=25000){
   rec.ticks=Array.isArray(rec.ticks)?rec.ticks:[];rec.ticks.push({time:at,price:Number(price)});
   rec.ticks=rec.ticks.slice(-700);rec.lastTickAt=at;
   if(at-state.lastTickSave>65000){persist();state.lastTickSave=at;}
 }
 risk();repaint();
 $('connStatus').textContent=source+' · live';$('connStatus').className='pill';
}
function connectWS(){let ws;try{ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');}catch{return;}
 state.ws=ws;const deadline=setTimeout(()=>{if(ws.readyState!==1)ws.close();},11000);
 ws.onopen=()=>{clearTimeout(deadline);state.wsRetry=0;ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker']}));};
 ws.onmessage=e=>{try{const v=JSON.parse(e.data);if(v.type==='ticker'&&v.product_id==='BTC-USD')setPrice(Number(v.price),'Coinbase',Date.now(),{open24h:Number(v.open_24h)||state.live?.open24h,high24h:Number(v.high_24h)||state.live?.high24h});}catch{}};
 ws.onerror=()=>clearTimeout(deadline);ws.onclose=()=>{clearTimeout(deadline);if(state.ws!==ws)return;state.ws=null;$('connStatus').className='pill warn';$('connStatus').textContent='Price feed reconnecting';setTimeout(connectWS,Math.min(60000,1200*1.8**Math.min(8,++state.wsRetry)));};
}
async function fetchJSON(url,timeout=16000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}finally{clearTimeout(timer);}
}
async function priceFallback(){if(state.live&&Date.now()-state.live.at<30000)return;try{const j=await fetchJSON('https://api.exchange.coinbase.com/products/BTC-USD/ticker',12000);setPrice(Number(j.price),'Coinbase REST');}
 catch{try{const j=await fetchJSON('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',12000),x=Object.values(j.result||{})[0];setPrice(Number(x?.c?.[0]),'Kraken REST');}catch{$('connStatus').className='pill bad';$('connStatus').textContent='Market feed offline';}}}
async function get24h(){try{const j=await fetchJSON('https://api.exchange.coinbase.com/products/BTC-USD/stats');if(state.live){state.live.open24h=Number(j.open);state.live.high24h=Number(j.high);state.live.low24h=Number(j.low);}risk();}catch{}}
const coinUrl=(cfg,start,end)=>'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+cfg.seconds+'&start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString();
async function candlesFor(horizon,count=512){const cfg=F.CONFIG[horizon],step=cfg.seconds*1000,now=Date.now(),samples=[];
 try{
  for(let k=Math.ceil(count/275)-1;k>=0;k--){const end=now-k*275*step,start=end-275*step;const raw=await fetchJSON(coinUrl(cfg,start,end));samples.push(...F.parseCoinbase(raw,cfg.seconds,now));}
  const x=F.tail(samples,step,512);if(x.length<120)throw Error('Coinbase returned only '+x.length+' continuous candles');return x;
 }catch(first){
  if(cfg.seconds===21600)throw Error('Coinbase 6-hour history unavailable: '+first.message);
  try{const j=await fetchJSON('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+(cfg.seconds/60));if(j.error?.length)throw Error(j.error.join(', '));const pair=Object.keys(j.result||{}).find(k=>k!=='last'),candles=F.tail(F.parseKraken(j.result[pair]||[],cfg.seconds,Date.now()),step,512);if(candles.length<120)throw Error('Kraken returned only '+candles.length+' candles');return candles;}
  catch(second){throw Error('Live BTC candle search failed: '+first.message+' / '+second.message);}
 }
}
async function candlesInRecordRange(rec){const cfg=F.CONFIG[rec.horizon],ms=cfg.seconds*1000,now=Date.now(),start=rec.asOf-2*ms,end=Math.min(now,rec.asOf+(cfg.steps+1)*ms);
 if(end<rec.asOf+ms)return [];
 const all=[];try{
  const chunks=Math.ceil((end-start)/(275*ms));
  for(let j=0;j<chunks;j++){const a=start+j*275*ms,b=Math.min(end+ms,a+275*ms);const raw=await fetchJSON(coinUrl(cfg,a,b));all.push(...F.parseCoinbase(raw,cfg.seconds,now));}
  return F.dedupe(all);
 }catch(e){
  if(rec.source==='Coinbase'||cfg.seconds===21600)throw e;
  const j=await fetchJSON('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+(cfg.seconds/60));
  if(j.error?.length)throw Error(j.error.join(', '));const pair=Object.keys(j.result||{}).find(k=>k!=='last');return F.parseKraken(j.result[pair]||[],cfg.seconds,now).filter(c=>c.time>=start&&c.time<=end+ms);
 }
}
function settleSet(candles,h){let n=0;for(const r of records){if(r.horizon===h)n+=F.settle(r,candles);}if(state.shared?.horizon===h)n+=F.settle(state.shared,candles);
 if(n){persist();render();renderHistory();repaint();}return n;}
async function refreshHistory(h=settings.horizon){
 if(state.historyBusy)return state.candles;
 state.historyBusy=true;
 try{const rows=await candlesFor(h);if(h===settings.horizon){state.candles=rows;state.source=rows.at(-1)?.source||'';state.historyAt=Date.now();}
  settleSet(rows,h);error('');repaint();return rows;
 }catch(e){error(e.message);throw e;}finally{state.historyBusy=false;}
}
async function backfill(r){if(!r||!r.points?.some(p=>p.time<=Date.now()-1500&&p.time>r.madeAt&&p.actual==null))return 0;
 const rows=await candlesInRecordRange(r),count=F.settle(r,rows);if(count){persist();render();renderHistory();repaint();}return count;
}
async function catchUp(){if(state.backfillBusy||Date.now()-state.lastCatchupAt<95000)return;state.lastCatchupAt=Date.now();state.backfillBusy=true;
 try{const targets=records.filter(r=>r.points.some(p=>p.time>r.madeAt&&p.time<=Date.now()-1500&&p.actual==null)).sort((a,b)=>b.madeAt-a.madeAt).slice(0,4);
  for(const r of targets){try{await backfill(r);}catch{/* Retry later, preserve pending points. */}}
 }finally{state.backfillBusy=false;}
}
function requestModel(type,prices=[]){if(!state.modelWorker){state.modelWorker=new Worker('./timestral-worker.js?v=11');state.modelWorker.onmessage=({data})=>{
   if(data.type==='progress'){$('modelStatus').textContent=data.message;return;}
   const p=state.jobs.get(data.id);if(!p)return;state.jobs.delete(data.id);clearTimeout(p.timer);data.ok?p.resolve(data.result||{backend:data.backend}):p.reject(Error(data.error||'Timestral error'));
  };
  state.modelWorker.onerror=e=>{const message=e.message||'Model worker error';for(const p of state.jobs.values()){clearTimeout(p.timer);p.reject(Error(message));}state.jobs.clear();state.modelWorker.terminate();state.modelWorker=null;};
 }
 const id=++state.workerId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{state.jobs.delete(id);reject(Error('Local Timestral timed out after 150 seconds'));},150000);state.jobs.set(id,{resolve,reject,timer});state.modelWorker.postMessage({id,type,prices});});
}
async function startModel(){if(state.modelReady||state.modelLoading)return;state.modelLoading=true;
 try{const r=await requestModel('warmup');state.modelReady=true;state.modelFailure='';$('modelStatus').textContent='Timestral ready · '+(r.backend||'on-device CPU');
  // When inference starts after the first fallback forecast, make a NEW honest snapshot.
  if(settings.auto&&state.candles.length>=120&&!latest()?.methods?.timestral)generate({force:true}).catch(()=>{});
 }catch(e){state.modelFailure=e.message;$('modelStatus').textContent='Pattern/momentum active · local Timestral unavailable';$('modelStatus').title=e.message;}finally{state.modelLoading=false;}
}
async function generate({force=false}={}){
 if(state.loading)return null;const h=settings.horizon,cfg=F.CONFIG[h];state.loading=true;info('Searching recent real BTC candles and predicting…');
 try{
  let candles=state.candles;
  if(candles.length<120||Date.now()-state.historyAt>Math.max(60000,cfg.seconds*800)){candles=await refreshHistory(h);}
  candles=F.tail(candles,cfg.seconds*1000);
  if(candles.length<120)throw Error('Need at least 120 continuous completed market candles.');
  const last=candles.at(-1),previous=records.filter(r=>r.horizon===h&&!r.legacy).at(-1);
  if(!force&&previous&&(previous.asOf>=last.time||Date.now()-previous.madeAt<settings.spacing*60000))return previous;
  let model=null,madeAt=null;
  if(state.modelReady){try{const m=await requestModel('forecast',candles.map(c=>c.price));if(m.model==='mistralai/Timestral-5M'){model=m;madeAt=Date.now();}}
   catch(e){state.modelReady=false;state.modelFailure=e.message;$('modelStatus').textContent='Using pattern + momentum · Timestral error';}}
  const created=Date.now(),rec=F.createPrediction({candles,horizon:h,now:created,spot:state.live?.price,prior:records,model,modelMadeAt:madeAt});
  rec.mode=model?'Timestral + real price patterns':'Real price patterns + momentum';
  rec.inputTail=candles.slice(-60);rec.ticks=[];
  records.push(rec);state.lastAutoAt=created;persist();
  // Critical: never displace a pinned user drawing or a selected historic result.
  info('Automatic prediction saved at '+clock(created)+'. Real BTC closes will verify it.');
  render();renderHistory();repaint();return rec;
 }catch(e){error('Prediction not available: '+e.message);info('Forecast paused until real candle history is available.');return null;}
 finally{state.loading=false;}
}
function risk(){const l=state.live;if(!l)return;const move=l.open24h>0?(l.price/l.open24h-1)*100:null,prev=state.candles.at(-2),last=state.candles.at(-1);
 let alert=null;if(move!=null&&move<=-settings.drop24)alert='24h BTC drop';if(prev&&last&&Math.abs(100*(last.price/prev.price-1))>=settings.jump)alert='Fast move';
 $('riskStatus').textContent=alert?'Risk: '+alert:'Risk: within rules';
 if(alert&&Date.now()-state.lastAlert>15*60000){state.lastAlert=Date.now();if(settings.notifications&&'Notification'in window&&Notification.permission==='granted')new Notification('BTC price alert',{body:alert+' · '+USD(l.price)});}
}
function timeUntilNext(){const cfg=F.CONFIG[settings.horizon],ms=cfg.seconds*1000;const next=Math.ceil((Date.now()+1)/ms)*ms;return Math.max(0,Math.ceil((next-Date.now())/1000));}
function progressView(){
 const r=selected(),sc=r&&F.scoreRecord(r),now=Date.now();
 $('modelMove').textContent=r?percent(100*(r.points.at(-1).forecast/r.anchor-1)):'—';
 $('modelTarget').textContent=r?'Predicted '+USD(r.points.at(-1).forecast)+' · '+r.mode:'Waiting for BTC data';
 const actual=r?.points?.filter(p=>Number.isFinite(p.actual)).at(-1);
 const currentPrice=actual?.actual??(r&&now<endTime(r)&&state.live?.at>r.asOf?state.live.price:null);
 $('actualMove').textContent=r&&Number.isFinite(currentPrice)?percent(100*(currentPrice/r.anchor-1)):'—';
 $('actualDetail').textContent=actual?'Last verified '+clock(actual.time):'Live price until candle closes · unscored';
 $('accuracyValue').textContent=sc?.forecastMae!=null?sc.forecastMae.toFixed(3)+'% error':'Pending';
 $('accuracyDetail').textContent=sc?sc.scored+'/'+sc.total+' closed candles verified':'Not scored until future prices exist';
 const e=F.evidence(records,settings.horizon);
 $('learningValue').textContent=e.n>=8?e.n+' verified':' '+e.n+' / 8';
 $('learningDetail').textContent=e.n>=8?'Method weights recalibrate on completed results':'Waiting for enough completed forecasts';
 const remaining=r?Math.max(0,endTime(r)-now):0;
 const snapInfo=r?'Created '+date(r.madeAt)+' · '+(F.scoreRecord(r)?.completed?'Completed and graded':Math.round(remaining/60000)+' min remaining'):'Waiting for first forecast';
 $('viewTitle').textContent=state.shared?'Shared prediction':pinned()?'Pinned prediction':'Live Bitcoin forecast';
 $('viewSubtitle').textContent=snapInfo;
 $('drawHint').innerHTML=r?.sketch?.length?'Your <strong>purple drawing is saved and stays here</strong> while automatic forecasts continue.':pinned()?'Viewing a saved result. <strong>Return to newest</strong> to draw.':'Optional: <strong>draw once in the blue future area</strong>. Your line stays visible while the app predicts on its own.';
 $('goLive').hidden=!pinned();
 $('newDrawing').hidden=!r?.sketch?.length;
 const next=timeUntilNext(),mins=Math.floor(next/60),sec=next%60;
 $('cycleStatus').textContent=settings.auto?'● Auto on · next candle in '+mins+':'+String(sec).padStart(2,'0'):'Ⅱ Auto paused';
 $('dataStatus').textContent='BTC: '+(state.source||state.live?.source||'connecting')+' · '+state.candles.length+' closed candles';
 $('newsStatus').textContent=sentiment?'DeepSeek: '+Math.round(sentiment.score)+'/100 '+sentiment.label:settings.newsEnabled?'DeepSeek: scheduled':'DeepSeek: off (optional)';
}
function render(){progressView();renderHistory();}
function renderHistory(){
 const sorted=records.filter(r=>r.horizon===settings.horizon).slice().reverse();
 const id=selected()?.id;
 $('historyCount').textContent='· '+records.length+' saved';
 $('publicCount').textContent=publicRecords.length?'· '+publicRecords.length+' public':'';
 const strip=$('recentStrip');strip.replaceChildren();
 if(!sorted.length){strip.append(ui('span','First automatic prediction will appear after BTC candles load.'));return;}
 for(const r of sorted.slice(0,5)){const sc=F.scoreRecord(r),btn=ui('button');btn.type='button';btn.className=r.id===id?'selected':'';
   const target=r.points.at(-1)?.forecast,delta=target>0?percent((target/r.anchor-1)*100):'—';
   btn.append(ui('span',date(r.madeAt)+(r.sketch?' · Your drawing':''),'when'),ui('strong',delta),ui('small',sc?.scored?sc.scored+'/'+sc.total+' verified':'Awaiting real price'));
   btn.onclick=()=>select(r,true);strip.append(btn);
 }
 // Populate history modal only when shown to avoid a long, heavy page.
 if($('historyDialog').open)renderHistoryModal();
}
async function loadPublicArchive(){
 if(Date.now()-publicLoadedAt<300000)return;
 publicLoadedAt=Date.now();
 try{const response=await fetch('./data/public-history.json?at='+Math.floor(Date.now()/300000),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(data?.format!=='btc-public-forecast-v1'||!Array.isArray(data.records))throw Error('Unexpected public archive format');
  publicRecords=data.records.filter(r=>r&&F.CONFIG[r.horizon]&&Array.isArray(r.points)).slice(-350);
  renderHistory();
 }catch(e){$('publicArchiveInfo').textContent='Public archive temporarily unavailable. Local forecasting still works.';}
}
function renderHistoryModal(){
 const box=$('historyRows');box.replaceChildren();
 const viewingPublic=state.historyFilter==='public',pool=viewingPublic?publicRecords:records;
 $('myResults').classList.toggle('primary',!viewingPublic);$('publicResults').classList.toggle('primary',viewingPublic);
 $('publicArchiveInfo').textContent=viewingPublic?'GitHub Actions saves public BTC forecasts twice hourly. No Timestral cloud service.':'Your device keeps its own frozen forecasts and drawings.';
 if(!pool.length)box.append(ui('p',viewingPublic?'No published forecasts yet. GitHub Actions will add them after its first scheduled run.':'No saved forecasts yet; automatic forecasting will begin after BTC candles load.','note'));
 for(const r of pool.slice().reverse().slice(0,100)){const sc=F.scoreRecord(r),button=ui('button');button.type='button';if(selected()?.id===r.id)button.className='active';
 const caption=ui('div');caption.append(ui('strong',date(r.madeAt)+' · '+r.horizon+(r.sketch?' · user drawn':' · automatic')),ui('br'),ui('small',r.mode||'Previous forecast'));
 const stat=ui('div',sc?.forecastMae!=null?sc.forecastMae.toFixed(3)+'% error':(sc?.scored||0)+' / '+(sc?.total||0)+' verified');
 button.append(caption,stat);button.onclick=()=>{if(viewingPublic){state.shared=r;state.selectedId=null;if(r.horizon!==settings.horizon){settings.horizon=r.horizon;syncHorizon();}render();repaint();backfill(r).catch(()=>{});}else select(r,true);$('historyDialog').close();};box.append(button);}
 const tbody=$('checkpointRows');tbody.replaceChildren();const r=selected();
 if(r)for(const p of r.points){const row=ui('tr');const err=Number.isFinite(p.actual)?100*Math.abs(p.forecast-p.actual)/p.actual:null;
  for(const cell of [date(p.time),USD(p.forecast),USD(p.user),USD(p.actual),err==null?'Pending':err.toFixed(3)+'%'])row.append(ui('td',cell));tbody.append(row);}
}
function repaint(){if(state.renderQueued)return;state.renderQueued=true;requestAnimationFrame(()=>{state.renderQueued=false;paint();});}
function chartGeometry(rec,history,canvas){
 const cfg=F.CONFIG[rec?.horizon||settings.horizon],ms=cfg.seconds*1000;
 const origin=rec?.asOf||history.at(-1)?.time||Date.now(),finish=origin+cfg.steps*ms,begin=origin-Math.min(ms*20,ms*cfg.steps*.42);
 const box=canvas.getBoundingClientRect(),left=17,right=box.width-80,top=22,bottom=box.height-35,x=t=>left+(t-begin)/(finish-begin)*(right-left);
 const reference=rec?.anchor||history.at(-1)?.price||state.live?.price||100000;
 const prices=[reference,...history.filter(p=>p.time>=begin&&p.time<=origin).map(p=>p.price),
  ...(rec?.points||[]).flatMap(p=>[p.forecast,p.lo,p.hi,p.actual,p.user]),
  ...(rec?.sketch||[]).map(p=>p.price),
  ...(rec?.ticks||[]).map(p=>p.price)];
 if(rec&&state.live?.at>=origin&&state.live.at<=finish)prices.push(state.live.price);
 const range=settings.range==='auto'?cfg.range:Math.max(.2,Number(settings.range)||cfg.range);
 let min=Math.min(reference*(1-range/100),...prices.filter(p=>Number.isFinite(p)&&p>0)),max=Math.max(reference*(1+range/100),...prices.filter(p=>Number.isFinite(p)&&p>0));
 if(state.chartScale){min=state.chartScale.min;max=state.chartScale.max;}else{const buffer=Math.max(2,(max-min)*.07);min-=buffer;max+=buffer;}
 const y=p=>bottom-(p-min)/Math.max(1,max-min)*(bottom-top);
 return{cfg,origin,finish,begin,x,y,left,right,top,bottom,min,max,box,reference};
}
function paint(){
 const canvas=$('chart'),rect=canvas.getBoundingClientRect();if(rect.width<10||rect.height<10)return;
 const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const rec=selected(),history=(rec?.inputTail?.length?rec.inputTail:state.candles)||[];
 const g=chartGeometry(rec,history,canvas);state.geom=g;
 const {x,y,left,right,top,bottom}=g;
 ctx.fillStyle='#0d1a2b';ctx.fillRect(left,top,right-left,bottom-top);
 ctx.fillStyle='#14283d';ctx.fillRect(x(g.origin),top,right-x(g.origin),bottom-top);
 ctx.textAlign='left';ctx.font='11px system-ui';ctx.lineWidth=1;
 for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;ctx.strokeStyle='#284258';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#86a7c3';ctx.fillText(USD(g.max-(g.max-g.min)*i/4),right+5,yy+4);}
 const line=(points,color,width=2,dash=[])=>{const arr=points.filter(p=>Number.isFinite(p?.time)&&Number.isFinite(p?.price)&&p.price>0&&p.time>=g.begin&&p.time<=g.finish).sort((a,b)=>a.time-b.time);
  if(arr.length<2)return;ctx.beginPath();arr.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.price)):ctx.moveTo(x(p.time),y(p.price)));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
 line(history.map(p=>({time:p.time,price:p.price})),'#55dfbd',2);
 if(rec?.points?.length){
  const valid=rec.points.filter(p=>Number.isFinite(p.lo)&&Number.isFinite(p.hi));
  if(valid.length>1){ctx.beginPath();valid.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.hi)):ctx.moveTo(x(p.time),y(p.hi)));for(let i=valid.length-1;i>=0;i--)ctx.lineTo(x(valid[i].time),y(valid[i].lo));ctx.closePath();ctx.fillStyle='#ffd48b12';ctx.fill();}
  const anchor={time:rec.asOf,price:rec.anchor};
  line([anchor,...rec.points.map(p=>({time:p.time,price:p.forecast}))],'#ffbf6e',2.8);
  const actual=[anchor,...rec.points.filter(p=>Number.isFinite(p.actual)).map(p=>({time:p.time,price:p.actual})),...(rec.ticks||[])];
  if(rec.asOf<=Date.now()&&Date.now()<g.finish&&state.live?.at>=rec.asOf)actual.push({time:state.live.at,price:state.live.price});
  line(actual.filter(p=>p.time<=Date.now()),'#67dbff',2.8);
  const user=rec.sketch?.length?[{time:rec.sketchAt,price:rec.spot||rec.anchor},...rec.sketch.map(p=>({time:rec.sketchAt+p.f*(g.finish-rec.sketchAt),price:p.price}))]:[];
  line(user,'#c2a6ff',2.8,[7,4]);
  const draw=state.draw;
  if(draw?.id===rec.id)line([{time:draw.at,price:draw.anchor},...draw.points.map(p=>({time:draw.at+p.f*(g.finish-draw.at),price:p.price}))],'#c2a6ff',3,[6,4]);
 }
 const marker=x(g.origin);ctx.setLineDash([5,6]);ctx.strokeStyle='#d0a66a';ctx.beginPath();ctx.moveTo(marker,top);ctx.lineTo(marker,bottom);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#b8d4e4';ctx.fillText('FORECAST BEGINS',Math.min(right-120,marker+6),top+13);
 if(state.live&&state.live.at>=g.origin&&state.live.at<=g.finish){const xx=x(state.live.at);ctx.strokeStyle='#67dbff';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#67dbff';ctx.fillText('NOW',Math.min(right-24,xx+3),top+28);}
 ctx.textAlign='center';ctx.fillStyle='#9eb7cc';ctx.fillText(clock(g.begin),left+38,bottom+16);ctx.fillText(clock(g.origin),marker,bottom+16);ctx.fillText(date(g.finish),right-55,bottom+16);
 $('plotMsg').textContent=(rec||history.length)?'':state.historyBusy?'Loading real market prices…':'Waiting for price history; no forecast has been invented.';
}
function pointerPos(e,g=state.geom,startAt){if(!g)return null;const b=$('chart').getBoundingClientRect(),xx=e.clientX-b.left,yy=e.clientY-b.top;
 const liveX=g.x(startAt||Math.max(g.origin,Math.min(Date.now(),g.finish-1000)));
 if(xx<liveX-2||xx>g.right||yy<g.top||yy>g.bottom)return null;
 return{f:Math.max(0,Math.min(1,(xx-liveX)/(g.right-liveX))),price:Math.max(.01,g.max-(yy-g.top)/(g.bottom-g.top)*(g.max-g.min))};
}
function pointerDown(e){
 if(state.shared||pinned())return;
 const r=selected(),live=state.live;
 if(!r||!live||Date.now()-live.at>90000||r.sketch?.length||Date.now()>=endTime(r)-60000){info('Waiting for a current forecast with future time remaining.');return;}
 const p=pointerPos(e,state.geom,Date.now());if(!p)return;
 e.preventDefault();$('chart').setPointerCapture(e.pointerId);
 state.chartScale={min:state.geom.min,max:state.geom.max};
 const at=Date.now();state.draw={id:r.id,at,anchor:live.price,points:[{f:0,price:live.price}],drawing:true};
 if(p.f>.001)state.draw.points.push(p);
 info('Drawing… release to save on this forecast. You will not need to redraw.');
 repaint();
}
function pointerMove(e){const d=state.draw;if(!d?.drawing)return;const g=state.geom,p=pointerPos(e,g,d.at);if(!p)return;e.preventDefault();
 const arr=d.points,last=arr.at(-1);if(p.f<last.f-.002)return;
 if(p.f-last.f>.003)arr.push(p);else if(p.f>0){last.f=p.f;last.price=p.price;}
 if(arr.length>120)arr.splice(1,1);repaint();
}
function pointerUp(e){const d=state.draw;if(!d?.drawing)return;
 d.drawing=false;state.chartScale=null;state.draw=null;const rec=records.find(r=>r.id===d.id);
 if(!rec){repaint();return;}
 try{F.attachDrawing(rec,{at:d.at,anchor:d.anchor,points:d.points});persist();select(rec,true);
   info('Drawing locked! Auto predictions continue and actual BTC will fill in over your line.');
 }catch(e){error('Drawing not saved: '+e.message);repaint();}
}
function riskAndTime(){risk();progressView();}
function renderUsage(){const checks=Math.ceil(settings.sessionHours*60/settings.newsInterval),per=settings.inputTokens+settings.outputTokens;
 const expectedTokens=checks*per,estimated=(checks*(settings.inputTokens*.15+settings.outputTokens*.60)/1e6+checks*.00075);
 $('usagePreview').textContent='Next DeepSeek check: ~'+per.toLocaleString()+' tokens · Planned '+settings.sessionHours+'h: ~'+expectedTokens.toLocaleString()+' tokens and $'+estimated.toFixed(4)+' (estimate)\nActual this browser tab: '+(usage.input+usage.output).toLocaleString()+' tokens · '+usage.calls+' checks · $'+Number(usage.cost||0).toFixed(4)+' estimated.';
 $('sentimentDetails').textContent=sentiment?'Last news search '+date(sentiment.at)+' · '+sentiment.label+' ('+Math.round(sentiment.score)+'/100) · '+sentiment.summary:'No completed DeepSeek news check yet.';
}
async function checkNews(){
 if(state.newsBusy||!apiKey||!DeepSeek)return;
 const estimated=settings.inputTokens+settings.outputTokens;
 if(settings.tokenCap&&usage.input+usage.output+estimated>settings.tokenCap)return;
 if(settings.dollarCap&&usage.cost+(estimated*1.1/1e6)>settings.dollarCap)return;
 state.newsBusy=true;
 try{const last=state.live;const change=last?.open24h>0?100*(last.price/last.open24h-1):null;
  const out=await DeepSeek.sentiment({mode:'flash',price:last?.price,key:apiKey,change24h:change});
  const u=out.usage||{},input=Number(u.input)||0,output=Number(u.output)||0,cached=Number(u.cached)||0,searches=Number(u.searches)||0,fetches=Number(u.fetches)||0;
  const cost=(input*.15+output*.60)/1e6+.00075*(searches+fetches);
  usage={input:usage.input+input,output:usage.output+output,cached:usage.cached+cached,searches:usage.searches+searches,fetches:usage.fetches+fetches,calls:usage.calls+1,cost:usage.cost+cost};
  sentiment={...out.sentiment,at:Date.now(),sources:out.sources||[]};
  sessionStorage.setItem('btc-lab-usage-v3',JSON.stringify(usage));sessionStorage.setItem('btc-lab-sentiment-v3',JSON.stringify(sentiment));
  state.lastNewsAt=Date.now();renderUsage();progressView();
 }catch(e){state.lastNewsAt=Date.now();error('DeepSeek news check unavailable: '+e.message+'; BTC predictions continue.');}
 finally{state.newsBusy=false;}
}
function settingsToForm(){const set=(id,val)=>$(id).value=String(val);
 set('sAuto',settings.auto?'on':'off');set('sSpacing',settings.spacing);set('sRange',settings.range);set('sHistoryLimit',settings.historyLimit);
 set('sDrop24',settings.drop24);set('sJump',settings.jump);$('sNotifications').checked=!!settings.notifications;
 $('sNewsEnabled').checked=!!settings.newsEnabled;set('sNewsInterval',settings.newsInterval);set('sSessionHours',settings.sessionHours);
 set('sInputTokens',settings.inputTokens);set('sOutputTokens',settings.outputTokens);set('sTokenCap',settings.tokenCap);set('sDollarCap',settings.dollarCap);set('sApiKey',apiKey);renderUsage();
}
function saveSettings(){const n=(id,lo,hi)=>Math.max(lo,Math.min(hi,Number($(id).value)||0));
 settings={...settings,auto:$('sAuto').value==='on',spacing:n('sSpacing',5,60),range:$('sRange').value,historyLimit:n('sHistoryLimit',50,500),
 drop24:n('sDrop24',.1,40),jump:n('sJump',.1,20),notifications:$('sNotifications').checked,newsEnabled:$('sNewsEnabled').checked,
 newsInterval:n('sNewsInterval',15,360),sessionHours:n('sSessionHours',1,24),inputTokens:n('sInputTokens',100,50000),outputTokens:n('sOutputTokens',100,16000),tokenCap:n('sTokenCap',0,10000000),dollarCap:n('sDollarCap',0,100)};
 apiKey=$('sApiKey').value.trim();persistSettings();progressView();repaint();info('Settings saved. '+(settings.auto?'Automatic predictions are on.':'Automatic predictions are paused.'));}
async function exportData(){const blob=new Blob([JSON.stringify({type:'btc-forecast-lab-v4',exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=ui('a');a.href=url;a.download='btc-forecast-results-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);}
async function importData(file){try{if(file.size>10000000)throw Error('File exceeds 10 MB');const data=JSON.parse(await file.text());if(!Array.isArray(data.records)||data.records.length>1000)throw Error('Invalid predictions file');
 const ids=new Set(records.map(r=>r.id));let added=0;for(const r of data.records){if(!F.CONFIG[r.horizon]||!Array.isArray(r.points)||r.points.length!==F.CONFIG[r.horizon].steps||!Number.isFinite(r.madeAt)||ids.has(r.id))continue;records.push(r);ids.add(r.id);added++;}
 records.sort((a,b)=>a.madeAt-b.madeAt);persist();render();info('Imported '+added+' saved predictions.');}catch(e){error('Import failed: '+e.message);}}
async function shareSelected(){const r=selected();if(!r)return;
 // Compress a single frozen record, never the DeepSeek API key or client settings.
 const content=new TextEncoder().encode(JSON.stringify({v:1,record:{...r,inputTail:(r.inputTail||[]).slice(-60),ticks:[]}})),stream='CompressionStream'in window?new Blob([content]).stream().pipeThrough(new CompressionStream('gzip')):new Blob([content]).stream();
 const bytes=new Uint8Array(await new Response(stream).arrayBuffer()),flag='CompressionStream'in window?'g':'r';
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 const link=location.origin+location.pathname+'#review='+flag+'.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 await navigator.clipboard.writeText(link);info('Read-only prediction review link copied.');
}
async function openShared(){if(!location.hash.startsWith('#review='))return;
 try{const [flag,part]=location.hash.slice(8).split('.');if(!['g','r'].includes(flag)||!part||part.length>65000)throw Error('Invalid shared link');
 const binary=atob(part.replace(/-/g,'+').replace(/_/g,'/')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),payload=flag==='g'?new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):bytes;
 const r=JSON.parse(new TextDecoder().decode(payload)).record;
 if(!F.CONFIG[r?.horizon]||!Number.isFinite(r.madeAt)||!Array.isArray(r.points)||r.points.length!==F.CONFIG[r.horizon].steps)throw Error('Invalid forecast');
 state.shared=r;state.selectedId=null;settings.horizon=r.horizon;syncHorizon();render();repaint();backfill(r).catch(()=>{});info('Reviewing a shared prediction; actual prices are verified from the exchange.');
 }catch(e){error('Cannot open shared prediction: '+e.message);}
}
function syncHorizon(){for(const b of $('horizons').querySelectorAll('[data-h]'))b.classList.toggle('active',b.dataset.h===settings.horizon);}
async function loop(){if(state.loopBusy)return;state.loopBusy=true;
 try{await priceFallback();const cfg=F.CONFIG[settings.horizon],ms=cfg.seconds*1000,expectedClose=Math.floor((Date.now()-1500)/ms)*ms;
  if(!state.historyBusy&&(!state.candles.length||state.candles.at(-1).time<expectedClose&&Date.now()-state.historyAt>25000)){
   const candles=await refreshHistory();if(candles&&settings.auto)await generate();
  }else if(settings.auto&&!latest()&&state.candles.length)await generate();
  await catchUp();
  if(Date.now()-publicLoadedAt>=600000)loadPublicArchive().catch(()=>{});
  if(settings.newsEnabled&&apiKey&&state.live&&Date.now()-state.lastNewsAt>settings.newsInterval*60000)await checkNews();
 }catch{/* Error already displayed by market-data loader. */}finally{state.loopBusy=false;progressView();}
}
function setup(){
 syncHorizon();
 const canvas=$('chart');canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,pointerUp);
 new ResizeObserver(repaint).observe(canvas);window.addEventListener('resize',repaint);
 $('horizons').onclick=e=>{const b=e.target.closest('[data-h]');if(!b)return;settings.horizon=b.dataset.h;persistSettings();syncHorizon();state.candles=[];state.historyAt=0;state.shared=null;state.selectedId=null;localStorage.removeItem('btc-lab-pinned-v4');render();repaint();refreshHistory().then(()=>{if(settings.auto)generate();}).catch(()=>{});};
 $('goLive').onclick=()=>{state.shared=null;state.selectedId=null;localStorage.removeItem('btc-lab-pinned-v4');render();repaint();};
 $('newDrawing').onclick=async()=>{state.selectedId=null;state.shared=null;localStorage.removeItem('btc-lab-pinned-v4');await generate({force:true});render();repaint();info('Fresh automatic prediction ready. Draw once in the future area if you want.');};
 $('historyButton').onclick=()=>{renderHistoryModal();$('historyDialog').showModal();};
 $('myResults').onclick=()=>{state.historyFilter='mine';renderHistoryModal();};
 $('publicResults').onclick=()=>{state.historyFilter='public';renderHistoryModal();};
 $('closeHistory').onclick=()=>$('historyDialog').close();
 $('historyLatest').onclick=()=>{$('historyDialog').close();$('goLive').click();};
 $('settingsButton').onclick=()=>{settingsToForm();$('settingsDialog').showModal();};
 $('closeSettings').onclick=()=>$('settingsDialog').close();
 $('settingsForm').onsubmit=e=>{e.preventDefault();saveSettings();$('settingsDialog').close();};
 for(const id of ['sNewsInterval','sSessionHours','sInputTokens','sOutputTokens'])$(id).addEventListener('input',()=>{const before=[settings.newsInterval,settings.sessionHours,settings.inputTokens,settings.outputTokens];for(let i=0;i<4;i++)settings[['newsInterval','sessionHours','inputTokens','outputTokens'][i]]=Math.max(1,Number($(['sNewsInterval','sSessionHours','sInputTokens','sOutputTokens'][i]).value)||before[i]);renderUsage();['newsInterval','sessionHours','inputTokens','outputTokens'].forEach((k,i)=>settings[k]=before[i]);});
 $('shareButton').onclick=()=>shareSelected().catch(e=>error('Share unavailable: '+e.message));
 $('exportButton').onclick=exportData;$('importButton').onclick=()=>$('importFile').click();
 $('importFile').onchange=e=>{if(e.target.files?.[0])importData(e.target.files[0]);e.target.value='';};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)loop();});
 window.addEventListener('hashchange',openShared);
}
setup();render();repaint();openShared();loadPublicArchive();connectWS();priceFallback();get24h();
refreshHistory().then(()=>{if(settings.auto)generate();}).catch(()=>{});
startModel();
setInterval(loop,25000);setInterval(()=>{progressView();},1000);
window.__btcLab={snapshot:()=>({records:records.slice(),selected:selected()?.id||null,pinned:pinned(),auto:settings.auto,source:state.source,modelReady:state.modelReady}),core:F,forceForecast:()=>generate({force:true}),goLive:()=>{$('goLive').click();}};
})();