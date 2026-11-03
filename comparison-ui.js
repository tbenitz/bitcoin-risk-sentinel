/* Draw, freeze, and verify user and Timestral BTC forecasts on one absolute-time chart. */
(()=>{'use strict';
const E=window.BtcComparisonEngine;
if(!E){console.error('Comparison engine missing');return;}
const STORAGE='btc-comparison-ledger-v2', $=id=>document.getElementById(id);
const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE))||[];}catch{return [];}};
let records=(Array.isArray(read())?read():[]).filter(r=>r&&E.CONFIG[r.horizon]&&Array.isArray(r.sketch)&&Number.isFinite(r.at)&&Number.isFinite(r.anchor)).slice(-60);
let selected=records.at(-1)?.id||'', draft=null, drawing=false, drawBounds=null, lastLiveTime=0,lastSavedAt=0,lastReadAt=0,lastError='',loading=false,latest=null,lastCanvasData=null;
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const pretty=n=>n==null?'—':n.toFixed(2)+'%';
const byTime=t=>new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const horizon=()=>Number($('horizon').value)||24;
const current=()=>records.find(r=>r.id===selected)||null;
const model=rec=>E.modelFor(rec,window.BtcForecastTracker?.getRecords?.()||[]);
function safeStore(){try{localStorage.setItem(STORAGE,JSON.stringify(records.slice(-60)));}catch(e){tell('Storage full; export predictions for backup. '+e.message);}}
function tell(message){lastError=message;$('comparisonStatus').textContent=message;}
const el=(tag,klass,text)=>{const node=document.createElement(tag);if(klass)node.className=klass;if(text!=null)node.textContent=text;return node;};
const extras=el('div','comparison-extra');extras.innerHTML=`<div class="compare-actions"><label>Review <select id="comparisonPick" aria-label="Select a saved prediction"></select></label><label>Drawing scale <select id="comparisonScale"><option value="2">±2%</option><option value="5" selected>±5%</option><option value="10">±10%</option><option value="25">±25%</option></select></label><button class="btn small outline" id="comparisonRefresh" type="button">Refresh actual BTC</button><button class="btn small outline" id="comparisonExport" type="button">Export predictions</button></div><div class="compare-score" id="comparisonScore" aria-live="polite"></div><div class="compare-status" id="comparisonStatus">Draw from the vertical forecast start line; lock the prediction to compare it with real BTC and Timestral.</div><details class="compare-checkpoints"><summary>View predictions vs actual BTC by timestamp</summary><div class="compare-scroll"><table><thead><tr><th>Target time</th><th>Your line</th><th>Timestral</th><th>Actual BTC</th><th>Checkpoint</th></tr></thead><tbody id="comparisonRows"></tbody></table></div></details>`;
$('chart').closest('.chart-card').append(extras);
const style=el('style');style.textContent=`.comparison-extra{border-top:1px solid var(--stroke);padding:12px 19px 16px}.compare-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.compare-actions label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}.compare-actions select{color:#eaf6ff;background:#132339;border:1px solid #415976;padding:8px;border-radius:8px;max-width:min(360px,78vw)}.compare-score{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0 4px}.compare-score>div{border:1px solid #2a3a52;background:#0a1523;border-radius:10px;padding:10px;min-width:0}.compare-score strong{display:block;font-size:19px;margin:5px 0;color:#ebf6ff}.compare-score span{display:block;color:#9cb3cd;font-size:11px}.compare-status{color:#a7c3df;font-size:12px;padding-top:7px;line-height:1.6}.compare-checkpoints{margin-top:10px;color:#b7cee8}.compare-checkpoints summary{cursor:pointer;padding:8px 0;font-size:12px;font-weight:650}.compare-scroll{overflow:auto;max-height:320px}.compare-scroll table{border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap}.compare-scroll th,.compare-scroll td{padding:9px;border-bottom:1px solid #26394b;text-align:right}.compare-scroll th:first-child,.compare-scroll td:first-child{text-align:left}.compare-scroll th{color:#b4d5f3}@media(max-width:700px){.compare-score{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
document.head.append(style);
$('continueSketch').textContent='Lock & compare';$('continueSketch').title='Save your line and start a real Timestral comparison';$('clearSketch').textContent='New drawing';
const chart=$('chart');chart.setAttribute('aria-label','Fixed-timestamp chart: saved user BTC prediction, Timestral prediction, and verified actual Bitcoin prices');
function list(){const box=$('comparisonPick'),prev=selected;box.replaceChildren();const opt=el('option',null,'New drawing · not locked');opt.value='';box.append(opt);for(const r of records.slice().reverse()){const o=el('option',null,byTime(r.at)+' · '+r.horizon+'h'+(r.modelId?' · model':' · awaiting model'));o.value=r.id;box.append(o);}box.value=prev;}
function redraw(){if(lastCanvasData)draw(lastCanvasData);}
function startNew(){draft=null;selected='';drawing=false;drawBounds=null;$('horizon').disabled=false;list();tell('New sketch: draw in the future region, then click Lock & compare. Nothing is graded until real BTC candles close.');update();redraw();}
function observe(livePrice,liveAt){if(Number.isFinite(livePrice)&&livePrice>0&&Number.isFinite(liveAt)){latest={price:livePrice,at:liveAt};const rec=current();if(rec&&liveAt>=rec.at&&liveAt<=rec.at+rec.horizon*3600000&&liveAt-lastLiveTime>=15000){rec.ticks=Array.isArray(rec.ticks)?rec.ticks:[];rec.ticks.push({time:liveAt,price:livePrice,source:'live tick'});rec.ticks=rec.ticks.slice(-850);lastLiveTime=liveAt;if(Date.now()-lastSavedAt>90000){safeStore();lastSavedAt=Date.now();}}}}
function geometry(record,width,height,hist=[],models=[]){const margin={l:18,r:83,t:30,b:42},left=margin.l,right=width-margin.r,top=margin.t,bottom=height-margin.b;
 const anchorAt=record?.at||latest?.at||Date.now(),anchor=record?.anchor||latest?.price||100000,hrs=record?.horizon||horizon(),end=anchorAt+hrs*3600000,begin=anchorAt-Math.min(hrs*3600000*.28,12*3600000),dx=right-left;
 const split=left+dx*(anchorAt-begin)/(end-begin),x=t=>left+(t-begin)/(end-begin)*dx;
 let min=anchor*(1-(Number(record?.rangePct||$('comparisonScale').value)||5)/100),max=anchor*(1+(Number(record?.rangePct||$('comparisonScale').value)||5)/100);
 const prices=[...hist.filter(p=>p.t>=begin&&p.t<=anchorAt).map(p=>p.p),...(record?.sketch||[]).map(p=>p.price),...(record?.actuals||[]).map(p=>p.price),...(record?.ticks||[]).map(p=>p.price),...models.flatMap(m=>[m.anchor,...m.points.flatMap(p=>[p.adapted,p.lo,p.hi])])].filter(n=>Number.isFinite(n)&&n>0);
 // Preserve price-to-pixel mapping while the pointer is down.
 if(drawBounds){min=drawBounds.min;max=drawBounds.max;}else if(prices.length){min=Math.min(min,...prices);max=Math.max(max,...prices);const buffer=(max-min)*0.08;min-=buffer;max+=buffer;}
 const y=p=>bottom-(p-min)/Math.max(1,max-min)*(bottom-top);
 return{left,right,top,bottom,split,x,y,min,max,begin,end,anchorAt,anchor,hrs};}
let currentGeometry=null;
function draw(canvasData){lastCanvasData=canvasData;const canvas=$('chart'),rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return true;
 const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const rec=current()||draft,modelRec=rec?model(rec):null,models=modelRec?[modelRec]:[];
 const g=geometry(rec,rect.width,rect.height,canvasData.history||[],models);currentGeometry=g;
 const {left,right,top,bottom,split,x,y}=g;
 ctx.clearRect(0,0,rect.width,rect.height);ctx.fillStyle='#111f32';ctx.fillRect(left,top,right-left,bottom-top);ctx.fillStyle='#172b41';ctx.fillRect(split,top,right-split,bottom-top);
 ctx.font='11px system-ui';ctx.textAlign='left';for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.setLineDash([3,5]);ctx.strokeStyle='#34465d';ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#91acc8';ctx.fillText(money(g.max-(g.max-g.min)*i/4),right+5,yy+4);}
 ctx.setLineDash([5,4]);ctx.strokeStyle='#be9b69';ctx.beginPath();ctx.moveTo(split,top);ctx.lineTo(split,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#d5b887';ctx.fillText('FORECAST START · FIXED',Math.min(right-190,split+6),top+13);
 const line=(points,color,width=2,dash=[])=>{const good=points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.price)&&p.price>0&&p.time>=g.begin&&p.time<=g.end);if(!good.length)return;ctx.beginPath();good.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.price)):ctx.moveTo(x(p.time),y(p.price)));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
 const hist=(rec?.history||canvasData.history||[]).filter(p=>p.t<=g.anchorAt&&p.t>=g.begin).map(p=>({time:p.t,price:p.p}));line(hist,'#4adeb6',2);
 if(modelRec){const points=modelRec.points.filter(p=>p.time>=g.begin&&p.time<=g.end);
  if(points.length){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.hi)):ctx.moveTo(x(p.time),y(p.hi)));for(let i=points.length-1;i>=0;i--)ctx.lineTo(x(points[i].time),y(points[i].lo));ctx.closePath();ctx.fillStyle='#f0bb5228';ctx.fill();}
  line([{time:modelRec.asOf,price:modelRec.anchor},...modelRec.points.map(p=>({time:p.time,price:p.adapted}))],'#ffbc5f',2.6);
 }
 if(rec){line([{time:rec.at,price:rec.anchor},...rec.sketch.map(p=>({time:rec.at+p.f*rec.horizon*3600000,price:p.price}))],'#b5a0ff',2.8,[7,4]);
  const actual=E.mergeActual(rec.actuals||[],rec.ticks||[],rec.at,g.end);line([{time:rec.at,price:rec.anchor},...actual],'#48dcff',2.7);
  if(actual.length){const last=actual.at(-1);ctx.fillStyle='#48dcff';ctx.beginPath();ctx.arc(x(last.time),y(last.price),4,0,Math.PI*2);ctx.fill();}
 }
 if(Number.isFinite(canvasData.price)&&canvasData.price>0&&canvasData.liveAt>=g.anchorAt&&canvasData.liveAt<=g.end){const xx=x(canvasData.liveAt),yy=y(canvasData.price);ctx.setLineDash([3,5]);ctx.strokeStyle='#68c9db';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#a5d6e6';ctx.fillText('LIVE',Math.min(right-33,xx+4),top+28);ctx.beginPath();ctx.arc(xx,yy,3.5,0,Math.PI*2);ctx.fill();}
 ctx.fillStyle='#98b3d1';ctx.textAlign='center';ctx.fillText(byTime(g.anchorAt),split,bottom+17);ctx.fillText(byTime(g.end),right-45,bottom+17);ctx.fillText(byTime(g.begin),left+45,bottom+17);
 $('chartEmpty').style.display=(rec||hist.length)?'none':'block';update();return true;
}
function pointer(event){const v=currentGeometry;if(!v)return null;const rect=chart.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(x<v.split||x>v.right||y<v.top||y>v.bottom)return null;return{x,y,f:Math.max(0,Math.min(1,(x-v.split)/(v.right-v.split))),price:v.max-(y-v.top)/(v.bottom-v.top)*(v.max-v.min)};}
chart.addEventListener('pointerdown',e=>{const p=pointer(e);if(!p||!latest||Date.now()-latest.at>90000){tell('Cannot start a timestamped prediction without a current live BTC quote.');return;}e.stopImmediatePropagation();e.preventDefault();const scale=Number($('comparisonScale').value)||5;selected='';draft=E.create({at:latest.at,anchor:latest.price,horizon:horizon(),rangePct:scale});drawBounds={min:latest.price*(1-scale/100),max:latest.price*(1+scale/100)};draw(lastCanvasData||{history:[],price:latest.price,liveAt:latest.at});const g=currentGeometry;const px=e.clientX-chart.getBoundingClientRect().left,py=e.clientY-chart.getBoundingClientRect().top;const f=Math.max(0,Math.min(1,(px-g.split)/(g.right-g.split))),price=g.max-(py-g.top)/(g.bottom-g.top)*(g.max-g.min);if(f>0)draft.sketch.push({f,price:Math.max(.01,price)});draft.history=(lastCanvasData?.history||[]).filter(p=>p.t<=draft.at&&p.t>=draft.at-Math.min(draft.horizon*3600000*.28,12*3600000)).slice(-110);drawing=true;chart.setPointerCapture(e.pointerId);list();update();redraw();},true);
chart.addEventListener('pointermove',e=>{if(!drawing)return;e.stopImmediatePropagation();e.preventDefault();const g=currentGeometry;if(!g)return;const rect=chart.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,frac=Math.max(0,Math.min(1,(x-g.split)/(g.right-g.split))),val=g.max-(Math.max(g.top,Math.min(g.bottom,y))-g.top)/(g.bottom-g.top)*(g.max-g.min);E.append(draft,frac,Math.max(.01,val));update();redraw();},true);
function end(e){if(!drawing)return;e.stopImmediatePropagation();drawing=false;drawBounds=null;update();redraw();}
for(const event of ['pointerup','pointercancel','lostpointercapture'])chart.addEventListener(event,end,true);
function update(){const rec=current()||draft,modelRec=rec?model(rec):null,score=rec?E.score(rec,modelRec):null,sketch=rec?.sketch||[],last=sketch.at(-1);
 $('scenarioPct').textContent=last&&rec?pretty((last.price/rec.anchor-1)*100):'—';$('scenarioPrice').textContent=rec?'From '+money(rec.anchor)+' at '+byTime(rec.at):'Draw after a BTC price arrives';$('continueSketch').disabled=(!draft||draft.sketch.length<2||drawing);$('comparisonScore').replaceChildren();
 const paired=score?.paired||0,scoreUser=paired?score.pairedUserMae:score?.userMae,scoreModel=paired?score.pairedModelMae:score?.modelMae;
 const items=[['Verified actual candles',score?score.resolved+' / '+score.possible:'0','Only future candles are scored after closing'],['Your line · price error',pretty(scoreUser),paired?paired+' shared checkpoints (fair comparison)':score?.userResolved+' observed sketch checkpoints'],['Timestral · price error',pretty(scoreModel),modelRec?(paired?paired+' shared checkpoints (fair comparison)':score?.modelResolved+' model checkpoints'):'No aligned model prediction'],['Direction correct',pretty(score?.userDirection)+' / '+pretty(score?.modelDirection),'Your line / Timestral; verified only']];
 for(const [label,value,small] of items){const box=el('div');box.append(el('span',null,label),el('strong',null,value),el('span',null,small));$('comparisonScore').append(box);}
 $('comparisonRows').replaceChildren();if(score){for(const p of score.points){const tr=el('tr');const fields=[byTime(p.time),money(p.user),money(p.model),money(p.actual),p.actual==null?'Awaiting close':p.actualAt?('Closed '+byTime(p.actualAt)):'Unverified'];for(const value of fields)tr.append(el('td',null,value));$('comparisonRows').append(tr);}}
 if(rec){const evaluated=score?.resolved||0;const modelInfo=modelRec?'Timestral as of '+byTime(modelRec.asOf):'Timestral not connected for this prediction';$('comparisonStatus').textContent=(draft?'UNLOCKED · Save to start tracking. ':'LOCKED · Original drawing and anchor preserved. ')+'Start '+byTime(rec.at)+' at '+money(rec.anchor)+' · target '+byTime(rec.at+rec.horizon*3600000)+' · '+evaluated+' verified points. '+modelInfo+(lastError?' · '+lastError:'');}
}
async function backfill(rec){if(!rec||loading)return;const cfg=E.CONFIG[rec.horizon];const until=Math.min(Date.now()-1500,rec.at+rec.horizon*3600000+cfg.stepMs);if(until<rec.at+cfg.stepMs)return;
 loading=true;try{const start=rec.at-cfg.stepMs,end=until;
 const url='https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+(cfg.stepMs/1000)+'&start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString();
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!response.ok)throw Error('Coinbase historical candles HTTP '+response.status);const rows=await response.json();const actuals=E.normalizeActual(rows,cfg.stepMs,Date.now());rec.actuals=E.mergeActual(rec.actuals,actuals,rec.at,rec.at+rec.horizon*3600000+cfg.stepMs);safeStore();lastReadAt=Date.now();lastError='';update();redraw();
 }catch(e){tell('Actual price verification currently unavailable: '+e.message+'. Existing saved predictions were retained.');}finally{loading=false;}}
async function lock(){if(!draft||draft.sketch.length<2)return;const rec=draft;draft=null;rec.lockedAt=Date.now();records.push(rec);if(records.length>60)records=records.slice(-60);selected=rec.id;safeStore();list();tell('Prediction locked at '+byTime(rec.at)+'. Fetching real candles and running local Timestral…');update();await backfill(rec);
 const tracker=window.BtcForecastTracker;if(!tracker){tell('Line saved; Timestral module not loaded. Your actual prices will still be evaluated.');return;}
 try{const response=await tracker.generateForHorizon(E.CONFIG[rec.horizon].key);if(response){rec.modelId=response.id;safeStore();list();update();tell('Drawing + Timestral frozen at their own timestamps. Actual BTC prices will be plotted as they occur.');}else{tell('Your line is locked. Timestral was busy; press Forecast now and return to this prediction.');}}
 catch(e){tell('Your drawing was saved, but Timestral could not run: '+e.message);}
 redraw();
}
$('continueSketch').onclick=lock;$('clearSketch').onclick=startNew;
$('comparisonPick').addEventListener('change',e=>{selected=e.target.value;draft=null;drawBounds=null;const rec=current();if(rec){$('horizon').value=rec.horizon;backfill(rec);}update();redraw();});
$('comparisonScale').addEventListener('change',()=>redraw());
$('comparisonRefresh').onclick=()=>{const r=current();if(r)backfill(r);else tell('Save a prediction first to fetch its subsequent actual candles.');};
$('comparisonExport').onclick=()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),records:records.map(r=>({...r,metrics:E.score(r,model(r))}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='btc-real-prediction-comparisons.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
$('horizon').addEventListener('change',()=>{if(current()){startNew();}else{draft=null;update();redraw();}});
window.addEventListener('btc:model-forecast',e=>{const r=current();if(r&&!r.modelId){const row=E.modelFor(r,[e.detail]);if(row){r.modelId=row.id;safeStore();list();}}update();redraw();});
window.addEventListener('btc:model-outcomes',()=>{update();redraw();});
setInterval(()=>{const r=current();if(r&&!loading&&Date.now()-lastReadAt>60000)backfill(r);},60000);
window.addEventListener('resize',redraw);
window.BtcCompare={draw:({price,liveAt,history})=>{observe(price,liveAt);return draw({price,liveAt,history});},riskDownPct:()=>{const r=current()||draft;if(!r||!r.sketch?.length)return null;return Math.min(0,...r.sketch.map(p=>(p.price/r.anchor-1)*100));}};
list();update();setTimeout(()=>redraw(),20);const old=current();if(old)backfill(old);
})();