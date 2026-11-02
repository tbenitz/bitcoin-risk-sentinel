/* Timestral-5M ONNX preprocessing and postprocessing for fixed 512→32 export.
   Port of Mistral's causal patch scaling, masking, symmetric averaging,
   quantile denormalization. Source method:
   https://huggingface.co/onnx-community/Timestral-5M-ONNX
   Modified MIT model weights © 2026 Mistral AI; see project README. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TimestralPrep=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CONTEXT=512,HORIZON=32,PATCH=32,NP=16,TOKENS=17,NQ=21,MIN_SCALE=1e-6,EPS32=1.1920928955078125e-7;
const f32=Math.fround;
function prepare(context){
 if(!context||!context.length)throw Error('Timestral requires actual historical prices.');
 const x=new Float64Array(CONTEXT).fill(NaN),n=Math.min(context.length,CONTEXT);
 for(let i=0;i<n;i++){const v=Number(context[context.length-n+i]);if(Number.isFinite(v))x[CONTEXT-n+i]=v;}
 const observed=Array.from(x,v=>Number.isFinite(v));if(observed.filter(Boolean).length<64)throw Error('Need 64 or more observed candles for a forecast.');
 const scaled=new Float32Array(2*CONTEXT),missing=new Float32Array(2*CONTEXT),loc=[],scale=[],ctxMin=[],ctxMax=[];
 let nonnegative=true;
 for(let r=0;r<2;r++){
  const row=Float64Array.from(x,v=>Number.isFinite(v)?(r===0?f32(v):-f32(v)):0);
  const locs=new Float64Array(CONTEXT),scales=new Float64Array(CONTEXT);
  let weight=0,sum=0,m2=0,prev=0;
  for(let t=0;t<CONTEXT;t++){
   const w=observed[t]?1:0,v=observed[t]?row[t]:0;
   weight+=w;sum+=w*v;
   const den=Math.max(weight,1),mean=sum/den;
   m2+=(v-prev)*(v-mean)*w;
   locs[t]=f32(mean);scales[t]=f32(Math.max(Math.sqrt(m2/Math.max(den-1,1)),MIN_SCALE));prev=mean;
  }
  for(let patch=0;patch<NP;patch++){
   const end=(patch+1)*PATCH-1,L=locs[end],S=Math.max(scales[end],EPS32);
   for(let k=0;k<PATCH;k++){
    const t=patch*PATCH+k;
    scaled[r*CONTEXT+t]=observed[t]?f32(Math.asinh(f32(f32(f32(row[t])-L)/S))):0;
   }
  }
  loc.push(locs[CONTEXT-1]);scale.push(scales[CONTEXT-1]);
  let mn=Infinity,mx=-Infinity;
  for(let t=0;t<CONTEXT;t++){
   missing[r*CONTEXT+t]=observed[t]?0:1;
   if(observed[t]){mn=Math.min(mn,row[t]);mx=Math.max(mx,row[t]);if(r===0&&row[t]<0)nonnegative=false;}
  }
  ctxMin.push(Number.isFinite(mn)?mn:0);ctxMax.push(Number.isFinite(mx)?mx:0);
 }
 const observedPatch=Array.from({length:NP},(_,p)=>observed.slice(p*PATCH,(p+1)*PATCH).some(Boolean));
 let begun=false;const keyValid=observedPatch.map(v=>begun=(begun||v));
 const firstObserved=Math.max(0,observedPatch.indexOf(true));
 const timeMask=new Uint8Array(2*TOKENS*TOKENS),positions=new BigInt64Array(2*TOKENS);
 for(let r=0;r<2;r++)for(let q=0;q<TOKENS;q++){
  positions[r*TOKENS+q]=BigInt(q-firstObserved);
  for(let k=0;k<TOKENS;k++){
   const permitted=q<NP?(k<NP&&((k<=q&&keyValid[k])||q===k)):(k<NP?keyValid[k]:true);
   timeMask[(r*TOKENS+q)*TOKENS+k]=permitted?1:0;
  }
 }
 const variateMask=new Uint8Array(TOKENS*4);
 for(let i=0;i<TOKENS;i++)variateMask.set([1,0,0,1],i*4);
 return {scaled,missing,timeMask,variateMask,positions,loc,scale,ctxMin,ctxMax,nonnegative};
}
function denormalize(preds,p){
 if(!preds||preds.length!==2*HORIZON*NQ)throw Error('Timestral ONNX result has unexpected dimensions.');
 const rows=[0,1].map(r=>{
  const out=new Float64Array(HORIZON*NQ),cap=p.scale[r]*1e4;
  for(let h=0;h<HORIZON;h++){
   let lo=Infinity,hi=-Infinity;
   for(let j=0;j<NQ;j++){
    const z=Number(preds[(r*HORIZON+h)*NQ+j]);if(Number.isNaN(z))throw Error('Timestral produced NaN.');
    const v=f32(f32(Math.sinh(z))*p.scale[r]+p.loc[r]);out[h*NQ+j]=v;
    if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}
   }
   for(let j=0;j<NQ;j++){
    let v=out[h*NQ+j];if(v===Infinity)v=Number.isFinite(hi)?hi:0;
    else if(v===-Infinity)v=Number.isFinite(lo)?lo:0;
    if(!Number.isFinite(v))v=0;
    out[h*NQ+j]=Math.min(Math.max(v,p.ctxMin[r]-cap),p.ctxMax[r]+cap);
   }
  }
  return out;
 });
 const quantiles=[];
 for(let h=0;h<HORIZON;h++){
  const q=[];
  for(let j=0;j<NQ;j++){
   let v=0.5*(rows[0][h*NQ+j]-rows[1][h*NQ+NQ-1-j]);
   if(p.nonnegative)v=Math.max(0,v);
   q.push(v);
  }
  quantiles.push(q);
 }
 return {model:'mistralai/Timestral-5M',median:quantiles.map(q=>q[10]),q10:quantiles.map(q=>q[2]),q90:quantiles.map(q=>q[18]),quantiles};
}
return {CONTEXT,HORIZON,NQ,prepare,denormalize};
});