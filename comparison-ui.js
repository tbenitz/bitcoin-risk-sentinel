/* Draw, freeze, and verify user and Timestral BTC forecasts on one absolute-time chart. */
(()=>{'use strict';
const E=window.BtcComparisonEngine,Signals=window.BtcForecastSignals;
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
const extras=el('div','comparison-extra');extras.innerHTML=`<div class="compare-actions"><label>Review <select id="comparisonPick" aria-label="Select a saved prediction"></select></label><label>Drawing scale <select id="comparisonScale"><option value="2">±2%</option><option value="5" selected>±5%</option><option value="10">±10%</option><option value="25">±25%</option></select></label><button class="btn small outline" id="comparisonRefresh" type="button">Refresh actual BTC</button><button class="btn small outline" id="comparisonExport" type="button">Export predictions</button></div><div class="compare-methods"><span><i style="background:#d6f778"></i> Pattern analog (historical ensemble)</span><span><i style="background:#ff82ae"></i> Recent momentum</span><span><i style="background:#63aafa"></i> Walk-forward winner</span><span><i style="background:#b6dfff;border-top:2px dashed #b6dfff"></i> Closest historical pattern (example, not a forecast)</span></div><div class="compare-score" id="comparisonScore" aria-live="polite"></div><div class="compare-method-score" id="comparisonMethods"></div><div class="compare-status" id="comparisonStatus">Draw from the vertical forecast start line; lock the prediction to compare it with real BTC and Timestral.</div><details class="compare-checkpoints"><summary>View predictions vs actual BTC by timestamp</summary><div class="compare-scroll"><table><thead><tr><th>Target time</th><th>Your line</th><th>Timestral</th><th>Pattern analog</th><th>Momentum</th><th>Backtest winner</th><th>Actual BTC</th><th>Checkpoint</th></tr></thead><tbody id="comparisonRows"></tbody></table></div></details>`;
$('chart').closest('.chart-card').append(extras);
// Draw on the full-range chart; after locking, default to a meaningful zoom of actual forecast dollars.
const intro=$('chart').closest('.chart-card').querySelector('.chart-intro');
const lens=el('label','compare-lens');
lens.append(document.createTextNode('View '));
const viewSelect=el('select');viewSelect.id='comparisonView';
for(const [value,label] of [['detail','Forecast zoom · reveal moves'],['full','Full range · include sketch']]){
 const option=el('option',null,label);option.value=value;viewSelect.append(option);
}
viewSelect.value=records.at(-1)?.signals?.points?.length?'detail':'full';lens.append(viewSelect);intro.append(lens);
const rangeNote=el('div','comparison-range');rangeNote.id='comparisonRange';
intro.after(rangeNote);
const outlook=el('div','comparison-outlooks');outlook.id='comparisonOutlooks';
rangeNote.after(outlook);
for(const [id,label,color] of [['timestral','Timestral-5M','#ffbc5f'],['analog','Historical analog','#d6f778'],['momentum','Momentum','#ff82ae'],['nearest','Closest pattern · scenario','#b6dfff']]){
 const card=el('div','outlook-card');const heading=el('span',null,label);heading.style.borderLeft='3px solid '+color;
 const amount=el('strong',null,'—');amount.id='outlook-'+id;
 card.append(heading,amount);outlook.append(card);
}
viewSelect.addEventListener('change',()=>redraw());

const style=el('style');style.textContent=`.comparison-extra{border-top:1px solid var(--stroke);padding:12px 19px 16px}.compare-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.compare-actions label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}.compare-actions select{color:#eaf6ff;background:#132339;border:1px solid #415976;padding:8px;border-radius:8px;max-width:min(360px,78vw)}.compare-methods{display:flex;gap:13px;align-items:center;flex-wrap:wrap;margin:12px 0;font-size:11px;color:#a5c3d8}.compare-methods i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:4px}.compare-method-score{display:flex;flex-wrap:wrap;gap:9px;margin:11px 0;color:#b8d6eb;font-size:12px}.compare-method-score strong{color:#f1f8ff}.compare-method-score>span{padding:6px 9px;border:1px solid #2a3a52;border-radius:9px}.compare-score{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0 4px}.compare-score>div{border:1px solid #2a3a52;background:#0a1523;border-radius:10px;padding:10px;min-width:0}.compare-score strong{display:block;font-size:19px;margin:5px 0;color:#ebf6ff}.compare-score span{display:block;color:#9cb3cd;font-size:11px}.compare-status{color:#a7c3df;font-size:12px;padding-top:7px;line-height:1.6}.compare-checkpoints{margin-top:10px;color:#b7cee8}.compare-checkpoints summary{cursor:pointer;padding:8px 0;font-size:12px;font-weight:650}.compare-scroll{overflow:auto;max-height:320px}.compare-scroll table{border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap}.compare-scroll th,.compare-scroll td{padding:9px;border-bottom:1px solid #26394b;text-align:right}.compare-scroll th:first-child,.compare-scroll td:first-child{text-align:left}.compare-scroll th{color:#b4d5f3}@media(max-width:700px){.compare-score{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
style.textContent+=`.compare-lens{display:flex;align-items:center;gap:7px;color:#bcd8eb;font-size:12px;margin-left:auto}
.compare-lens select{color:#edf8ff;background:#15304a;border:1px solid #5c7899;padding:7px 9px;border-radius:8px;font-weight:650;max-width:275px}
.comparison-range{padding:4px 20px 6px;color:#9fc9e8;font-size:11px;line-height:1.5}
.comparison-outlooks{padding:4px 18px 10px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
.outlook-card{border:1px solid #293b51;background:#0c1829;border-radius:9px;padding:8px 10px;min-width:0}
.outlook-card span{display:block;padding-left:7px;color:#9dbee0;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.outlook-card strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px;color:#f3f9ff}
@media(max-width:850px){.comparison-outlooks{grid-template-columns:repeat(2,minmax(0,1fr))}.compare-lens{margin-left:0}}
@media(max-width:520px){.compare-lens{width:100%}.compare-lens select{max-width:220px}}`;
document.head.append(style);
$('continueSketch').textContent='Lock & compare';$('continueSketch').title='Save your line and start a real Timestral comparison';$('clearSketch').textContent='New drawing';
const chart=$('chart');chart.setAttribute('aria-label','Fixed-timestamp chart: saved user BTC prediction, Timestral prediction, and verified actual Bitcoin prices');
function list(){const box=$('comparisonPick'),prev=selected;box.replaceChildren();const opt=el('option',null,'New drawing · not locked');opt.value='';box.append(opt);for(const r of records.slice().reverse()){const o=el('option',null,byTime(r.at)+' · '+r.horizon+'h'+(r.modelId?' · model':' · awaiting model'));o.value=r.id;box.append(o);}box.value=prev;}
function redraw(){if(lastCanvasData)draw(lastCanvasData);}
function startNew(){draft=null;selected='';drawing=false;drawBounds=null;viewSelect.value='full';$('horizon').disabled=false;list();tell('New sketch: draw in the future region, then click Lock & compare. Nothing is graded until real BTC candles close.');update();redraw();}
function observe(livePrice,liveAt){if(Number.isFinite(livePrice)&&livePrice>0&&Number.isFinite(liveAt)){latest={price:livePrice,at:liveAt};const rec=current();if(rec&&liveAt>=rec.at&&liveAt<=rec.at+rec.horizon*3600000&&liveAt-lastLiveTime>=15000){rec.ticks=Array.isArray(rec.ticks)?rec.ticks:[];rec.ticks.push({time:liveAt,price:livePrice,source:'live tick'});rec.ticks=rec.ticks.slice(-850);lastLiveTime=liveAt;if(Date.now()-lastSavedAt>90000){safeStore();lastSavedAt=Date.now();}}}}
function geometry(record,width,height,hist=[],models=[]){const margin={l:18,r:108,t:30,b:42},left=margin.l,right=width-margin.r,top=margin.t,bottom=height-margin.b;
 const anchorAt=record?.at||latest?.at||Date.now(),anchor=record?.anchor||latest?.price||100000,hrs=record?.horizon||horizon(),end=anchorAt+hrs*3600000,begin=anchorAt-Math.min(hrs*3600000*.28,12*3600000),dx=right-left;
 const split=left+dx*(anchorAt-begin)/(end-begin),x=t=>left+(t-begin)/(end-begin)*dx;
 const prediction=[...(record?.signals?.points||[]).flatMap(p=>[p.momentum,p.analog,p.nearest,p.validated]),...models.flatMap(m=>[m.anchor,...m.points.map(p=>p.adapted)])].filter(n=>Number.isFinite(n)&&n>0);
 const results=[...(record?.actuals||[]).map(p=>p.price),...(record?.ticks||[]).map(p=>p.price),...(latest&&latest.at>=anchorAt&&latest.at<=end?[latest.price]:[])].filter(n=>Number.isFinite(n)&&n>0);
 const historical=hist.filter(p=>p.t>=begin&&p.t<=anchorAt).map(p=>p.p).filter(n=>Number.isFinite(n)&&n>0);
 const drawing=!!drawBounds;
 const mode=(viewSelect.value==='detail'&&record&&!drawing)?'detail':'full';
 const modelBounds=mode==='full'?models.flatMap(m=>m.points.flatMap(p=>[p.lo,p.hi])):[];
 const range=E.viewRange({anchor,horizon:hrs,rangePct:Number(record?.rangePct||$('comparisonScale').value)||5,mode,sketch:(record?.sketch||[]).map(p=>p.price),predictions:prediction.concat(modelBounds),actuals:results,history:historical});
 let {min,max}=range;
 if(drawBounds){min=drawBounds.min;max=drawBounds.max;}
 const y=p=>bottom-(p-min)/Math.max(1,max-min)*(bottom-top);
 return{left,right,top,bottom,split,x,y,min,max,begin,end,anchorAt,anchor,hrs,range};}

let currentGeometry=null;
function draw(canvasData){lastCanvasData=canvasData;const canvas=$('chart'),rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return true;
 const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const rec=current()||draft,modelRec=rec?model(rec):null,models=modelRec?[modelRec]:[];
 const g=geometry(rec,rect.width,rect.height,canvasData.history||[],models);currentGeometry=g;
 const {left,right,top,bottom,split,x,y}=g;
 ctx.clearRect(0,0,rect.width,rect.height);ctx.fillStyle='#111f32';ctx.fillRect(left,top,right-left,bottom-top);ctx.fillStyle='#172b41';ctx.fillRect(split,top,right-split,bottom-top);
 ctx.font='11px system-ui';ctx.textAlign='left';for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.setLineDash([3,5]);ctx.strokeStyle='#34465d';ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#91acc8';ctx.fillText(money(g.max-(g.max-g.min)*i/4),right+5,yy+4);}
 ctx.setLineDash([5,4]);ctx.strokeStyle='#be9b69';ctx.beginPath();ctx.moveTo(split,top);ctx.lineTo(split,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#d5b887';ctx.fillText('FORECAST START · FIXED',Math.min(right-190,split+6),top+13);
 ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
 const line=(points,color,width=2,dash=[])=>{const good=points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.price)&&p.price>0&&p.time>=g.begin&&p.time<=g.end);if(!good.length)return;ctx.beginPath();good.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.price)):ctx.moveTo(x(p.time),y(p.price)));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
 const hist=(rec?.history||canvasData.history||[]).filter(p=>p.t<=g.anchorAt&&p.t>=g.begin).map(p=>({time:p.t,price:p.p}));line(hist,'#4adeb6',2);
 if(modelRec){const points=modelRec.points.filter(p=>p.time>=g.begin&&p.time<=g.end);
  if(points.length&&g.range.mode==='full'){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.hi)):ctx.moveTo(x(p.time),y(p.hi)));for(let i=points.length-1;i>=0;i--)ctx.lineTo(x(points[i].time),y(points[i].lo));ctx.closePath();ctx.fillStyle='#f0bb5228';ctx.fill();}
  line([{time:modelRec.asOf,price:modelRec.anchor},...modelRec.points.map(p=>({time:p.time,price:p.adapted}))],'#ffbc5f',2.6);
 }
 if(rec?.signals?.points?.length){
   const sig=rec.signals,series=name=>[{time:sig.asOf,price:sig.anchor},...sig.points.map(p=>({time:p.time,price:p[name]}))];
   line(series('analog'),'#d6f778',2.2);
   line(series('momentum'),'#ff82ae',2.2);
   line(series('nearest'),'#b6dfff',1.5,[3,6]);
   if(sig.backtest?.verified)line(series('validated'),'#63aafa',3);
 }
 if(rec){const sketchInView=g.range.mode==='full'||rec.sketch.every(p=>p.price>=g.min&&p.price<=g.max);
  if(sketchInView)line([{time:rec.at,price:rec.anchor},...rec.sketch.map(p=>({time:rec.at+p.f*rec.horizon*3600000,price:p.price}))],'#b5a0ff',2.8,[7,4]);
  const actual=E.mergeActual(rec.actuals||[],rec.ticks||[],rec.at,g.end);line([{time:rec.at,price:rec.anchor},...actual],'#48dcff',2.7);
  if(actual.length){const last=actual.at(-1);ctx.fillStyle='#48dcff';ctx.beginPath();ctx.arc(x(last.time),y(last.price),4,0,Math.PI*2);ctx.fill();}
 }
 if(Number.isFinite(canvasData.price)&&canvasData.price>0&&canvasData.liveAt>=g.anchorAt&&canvasData.liveAt<=g.end){const xx=x(canvasData.liveAt),yy=y(canvasData.price);ctx.setLineDash([3,5]);ctx.strokeStyle='#68c9db';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#a5d6e6';ctx.fillText('LIVE',Math.min(right-33,xx+4),top+28);ctx.beginPath();ctx.arc(xx,yy,3.5,0,Math.PI*2);ctx.fill();}
 ctx.restore();
 ctx.fillStyle='#98b3d1';ctx.textAlign='center';ctx.fillText(byTime(g.anchorAt),split,bottom+17);ctx.fillText(byTime(g.end),right-45,bottom+17);ctx.fillText(byTime(g.begin),left+45,bottom+17);
 const zoomed=g.range.mode==='detail';const factor=g.range.zoomFactor;
 $('comparisonRange').textContent=zoomed?
   'FORECAST ZOOM ×'+factor.toFixed(1)+' · price axis '+money(g.min)+' to '+money(g.max)+' (span '+money(g.max-g.min)+'). Your purple sketch is temporarily hidden if outside this price range; use Full range to compare. The 10–90% band is hidden only in zoom. Forecast values are unchanged.':
   'FULL COMPARISON · includes your entire sketch. Small BTC forecasts may appear straight here; use Forecast zoom to inspect their actual dollar movement.';
 $('chartEmpty').style.display=(rec||hist.length)?'none':'block';update();return true;
}
function pointer(event){const v=currentGeometry;if(!v)return null;const rect=chart.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(x<v.split||x>v.right||y<v.top||y>v.bottom)return null;return{x,y,f:Math.max(0,Math.min(1,(x-v.split)/(v.right-v.split))),price:v.max-(y-v.top)/(v.bottom-v.top)*(v.max-v.min)};}
chart.addEventListener('pointerdown',e=>{const p=pointer(e);if(!p||!latest||Date.now()-latest.at>90000){tell('Cannot start a timestamped prediction without a current live BTC quote.');return;}e.stopImmediatePropagation();e.preventDefault();const scale=Number($('comparisonScale').value)||5;selected='';draft=E.create({at:latest.at,anchor:latest.price,horizon:horizon(),rangePct:scale});drawBounds={min:latest.price*(1-scale/100),max:latest.price*(1+scale/100)};draw(lastCanvasData||{history:[],price:latest.price,liveAt:latest.at});const g=currentGeometry;const px=e.clientX-chart.getBoundingClientRect().left,py=e.clientY-chart.getBoundingClientRect().top;const f=Math.max(0,Math.min(1,(px-g.split)/(g.right-g.split))),price=g.max-(py-g.top)/(g.bottom-g.top)*(g.max-g.min);if(f>0)draft.sketch.push({f,price:Math.max(.01,price)});draft.history=(lastCanvasData?.history||[]).filter(p=>p.t<=draft.at&&p.t>=draft.at-Math.min(draft.horizon*3600000*.28,12*3600000)).slice(-110);drawing=true;chart.setPointerCapture(e.pointerId);list();update();redraw();},true);
chart.addEventListener('pointermove',e=>{if(!drawing)return;e.stopImmediatePropagation();e.preventDefault();const g=currentGeometry;if(!g)return;const rect=chart.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,frac=Math.max(0,Math.min(1,(x-g.split)/(g.right-g.split))),val=g.max-(Math.max(g.top,Math.min(g.bottom,y))-g.top)/(g.bottom-g.top)*(g.max-g.min);E.append(draft,frac,Math.max(.01,val));update();redraw();},true);
function end(e){if(!drawing)return;e.stopImmediatePropagation();drawing=false;drawBounds=null;update();redraw();}
for(const event of ['pointerup','pointercancel','lostpointercapture'])chart.addEventListener(event,end,true);
function update(){const rec=current()||draft,modelRec=rec?model(rec):null,score=rec?E.score(rec,modelRec):null,sketch=rec?.sketch||[],last=sketch.at(-1);
 const card=(id,forecast)=>{const node=$('outlook-'+id);if(!node)return;
  if(!rec||!Number.isFinite(forecast)||forecast<=0){node.textContent=rec?'Not available':'Lock a drawing';return;}
  const usdDelta=forecast-rec.anchor,change=usdDelta/rec.anchor*100;
  node.textContent=(change>=0?'↑ ':'↓ ')+(usdDelta>=0?'+':'-')+'$'+Math.abs(usdDelta).toFixed(2)+' ('+(change>=0?'+':'')+change.toFixed(3)+'%)';
 };
 const signalTail=rec?.signals?.points?.at(-1);
 card('timestral',modelRec?.points?.at(-1)?.adapted);
 card('analog',signalTail?.analog);card('momentum',signalTail?.momentum);card('nearest',signalTail?.nearest);

 $('scenarioPct').textContent=last&&rec?pretty((last.price/rec.anchor-1)*100):'—';$('scenarioPrice').textContent=rec?'From '+money(rec.anchor)+' at '+byTime(rec.at):'Draw after a BTC price arrives';$('continueSketch').disabled=(!draft||draft.sketch.length<2||drawing);$('comparisonScore').replaceChildren();
 const paired=score?.paired||0,scoreUser=paired?score.pairedUserMae:score?.userMae,scoreModel=paired?score.pairedModelMae:score?.modelMae;
 const items=[['Verified actual candles',score?score.resolved+' / '+score.possible:'0','Only future candles are scored after closing'],['Your line · price error',pretty(scoreUser),paired?paired+' shared checkpoints (fair comparison)':score?.userResolved+' observed sketch checkpoints'],['Timestral · price error',pretty(scoreModel),modelRec?(paired?paired+' shared checkpoints (fair comparison)':score?.modelResolved+' model checkpoints'):'No aligned model prediction'],['Direction correct',pretty(score?.userDirection)+' / '+pretty(score?.modelDirection),'Your line / Timestral; verified only']];
 for(const [label,value,small] of items){const box=el('div');box.append(el('span',null,label),el('strong',null,value),el('span',null,small));$('comparisonScore').append(box);}
 const meta=$('comparisonMethods');meta.replaceChildren();
 if(rec?.signals&&score){
  const signal=rec.signals;
  const samples=score.points.filter(p=>p.actual!=null);
  const error=name=>{const matches=samples.map(p=>({actual:p.actual,pred:Signals.atTime(signal,p.time,name)})).filter(p=>p.pred!=null);return matches.length?{n:matches.length,mape:matches.reduce((total,p)=>total+Math.abs(p.pred-p.actual)/p.actual*100,0)/matches.length}:null;};
  const scores=[['Pattern',error('analog')],['Momentum',error('momentum')],['Backtest choice',error('validated')]];
  for(const [label,result] of scores){const span=el('span');span.append(el('span',null,label+' · '),el('strong',null,result?pretty(result.mape):'Awaiting results'),el('span',null,result?' ('+result.n+' verified)':''));meta.append(span);}
  const back=signal.backtest,desc=el('span');desc.textContent='Historic walk-forward: '+(back.verified?(signal.selected==='flat'?'no-change baseline':signal.selected)+' best':'insufficient evidence')+' · '+back.origins+' trials · '+signal.usedCandles+' closed candles · no future data used';meta.append(desc);
  for(const [label,key] of [['Pattern outlook','analog'],['Momentum outlook','momentum'],['Walk-forward choice','validated']]){
    const tail=signal.points.at(-1),change=tail?100*(tail[key]/signal.anchor-1):null;
    const badge=el('span');badge.append(el('span',null,label+' · '),el('strong',null,change==null?'—':(change>=0?'+':'')+change.toFixed(2)+'%'));
    meta.append(badge);
  }
  if(!back.verified){meta.append(el('span',null,'Exploratory signals only; insufficient walk-forward evidence.'));}

 } else if(rec){meta.append(el('span',null,'Signal forecasts unavailable for this saved prediction. Earlier records are never backfilled using newer data.'));}
 $('comparisonRows').replaceChildren();if(score){for(const p of score.points){const tr=el('tr');const fields=[byTime(p.time),money(p.user),money(p.model),money(rec?.signals?Signals.atTime(rec.signals,p.time,'analog'):null),money(rec?.signals?Signals.atTime(rec.signals,p.time,'momentum'):null),money(rec?.signals?Signals.atTime(rec.signals,p.time,'validated'):null),money(p.actual),p.actual==null?'Awaiting close':p.actualAt?('Closed '+byTime(p.actualAt)):'Unverified'];for(const value of fields)tr.append(el('td',null,value));$('comparisonRows').append(tr);}}
 if(rec){const evaluated=score?.resolved||0;const modelInfo=modelRec?'Timestral as of '+byTime(modelRec.asOf):'Timestral not connected for this prediction';$('comparisonStatus').textContent=(draft?'UNLOCKED · Save to start tracking. ':'LOCKED · Original drawing and anchor preserved. ')+'Start '+byTime(rec.at)+' at '+money(rec.anchor)+' · target '+byTime(rec.at+rec.horizon*3600000)+' · '+evaluated+' verified points. '+modelInfo+(lastError?' · '+lastError:'');}
}
async function backfill(rec){if(!rec||loading)return;const cfg=E.CONFIG[rec.horizon];const until=Math.min(Date.now()-1500,rec.at+rec.horizon*3600000+cfg.stepMs);if(until<rec.at+cfg.stepMs)return;
 loading=true;try{const start=rec.at-cfg.stepMs,end=until;
 const url='https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+(cfg.stepMs/1000)+'&start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString();
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!response.ok)throw Error('Coinbase historical candles HTTP '+response.status);const rows=await response.json();const actuals=E.normalizeActual(rows,cfg.stepMs,Date.now());rec.actuals=E.mergeActual(rec.actuals,actuals,rec.at,rec.at+rec.horizon*3600000+cfg.stepMs);safeStore();lastReadAt=Date.now();lastError='';update();redraw();
 }catch(e){tell('Actual price verification currently unavailable: '+e.message+'. Existing saved predictions were retained.');}finally{loading=false;}}
async function lock(){if(!draft||draft.sketch.length<2)return;const rec=draft;draft=null;rec.lockedAt=Date.now();viewSelect.value='detail';records.push(rec);if(records.length>60)records=records.slice(-60);selected=rec.id;safeStore();list();tell('Prediction locked at '+byTime(rec.at)+'. Fetching real candles and running local Timestral…');update();await backfill(rec);
 const tracker=window.BtcForecastTracker;if(!tracker){tell('Line saved; Timestral module not loaded. Your actual prices will still be evaluated.');return;}
 // Freeze independently calculated BTC pattern/momentum paths *now*, never generate them later with hindsight.
 if(Signals){try{const cfg=E.CONFIG[rec.horizon],candles=await tracker.loadCandlesForHorizon(cfg.key);
  rec.signals=Signals.forecast({candles,asOf:rec.at,createdAt:rec.lockedAt,horizon:rec.horizon,stepMs:cfg.stepMs,steps:cfg.steps});
  safeStore();update();redraw();
 }catch(e){tell('Signal forecast unavailable: '+e.message+'. Your drawing is still locked.');}}
 try{const response=await tracker.generateForHorizon(E.CONFIG[rec.horizon].key);if(response){rec.modelId=response.id;safeStore();list();update();tell('Drawing + Timestral frozen at their own timestamps. Actual BTC prices will be plotted as they occur.');}else{tell('Your line is locked. Timestral was busy; press Forecast now and return to this prediction.');}}
 catch(e){tell('Your drawing was saved, but Timestral could not run: '+e.message);}
 redraw();
}
$('continueSketch').onclick=lock;$('clearSketch').onclick=startNew;
$('comparisonPick').addEventListener('change',e=>{selected=e.target.value;draft=null;drawBounds=null;const rec=current();viewSelect.value=rec&&(rec.signals?.points?.length||model(rec)?.points?.length)?'detail':'full';if(rec){$('horizon').value=rec.horizon;backfill(rec);}update();redraw();});
$('comparisonScale').addEventListener('change',()=>redraw());
$('comparisonRefresh').onclick=()=>{const r=current();if(r)backfill(r);else tell('Save a prediction first to fetch its subsequent actual candles.');};
$('comparisonExport').onclick=()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),records:records.map(r=>({...r,metrics:E.score(r,model(r))}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='btc-real-prediction-comparisons.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
$('horizon').addEventListener('change',()=>{if(current()){startNew();}else{draft=null;update();redraw();}});
window.addEventListener('btc:model-forecast',e=>{const r=current();if(r&&!r.modelId){const row=E.modelFor(r,[e.detail]);if(row){r.modelId=row.id;safeStore();list();}}update();redraw();});
window.addEventListener('btc:model-outcomes',()=>{update();redraw();});
setInterval(()=>{const r=current();if(r&&!loading&&Date.now()-lastReadAt>60000)backfill(r);},60000);
window.addEventListener('resize',redraw);
window.BtcCompare={draw:({price,liveAt,history})=>{observe(price,liveAt);return draw({price,liveAt,history});},riskDownPct:()=>{const r=current()||draft;if(!r||!r.sketch?.length)return null;return Math.min(0,...r.sketch.map(p=>(p.price/r.anchor-1)*100));}};
list();update();setTimeout(()=>redraw(),20);const old=current();if(old){$('horizon').value=String(old.horizon);backfill(old);}
})();