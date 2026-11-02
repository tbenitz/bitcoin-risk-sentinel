/* Runs Timestral-5M ONNX in a dedicated worker. No model inference is sent to a server. */
'use strict';
importScripts('./timestral-prep.js');
const MODEL='https://huggingface.co/onnx-community/Timestral-5M-ONNX/resolve/bf7ea5b0c2b14ac2719659d6f14fbfd9596fa6c5/onnx/model.onnx';
const ORT='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.bundle.min.mjs';
const WASM='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const DB='btc-local-timestral-model-v1',STORE='weights',KEY='timestral-5m-onnx-bf7ea5b';
let ortPromise,sessionPromise,backend='';
function database(){return new Promise((resolve,reject)=>{if(!('indexedDB' in self))return reject(Error('No IndexedDB'));const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(STORE);q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});}
async function cachedBytes(){let db;try{db=await database();return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),q=t.objectStore(STORE).get(KEY);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}catch{return null;}finally{db?.close();}}
async function storeBytes(bytes){let db;try{db=await database();await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(bytes,KEY);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}catch(e){postMessage({type:'progress',message:'Model running; permanent cache unavailable ('+e.message+').'});}finally{db?.close();}}
function status(message){postMessage({type:'progress',message});}
async function loadModel(){let bytes=await cachedBytes();if(bytes&&bytes.byteLength!==21212151){bytes=null;status('Cached model was incomplete; downloading again…');}
 if(bytes){status('Loading cached 21 MB Timestral model…');return bytes;}
 status('Downloading Timestral-5M model (~21 MB) once…');
 const res=await fetch(MODEL,{mode:'cors'});if(!res.ok)throw Error('Model download HTTP '+res.status);
 const buf=await res.arrayBuffer();if(buf.byteLength!==21212151)throw Error('Model download was incomplete: '+buf.byteLength+' bytes.');
 storeBytes(buf.slice(0));return buf;
}
async function getOrt(){if(!ortPromise)ortPromise=import(ORT).then(m=>m.default?.InferenceSession?m.default:m).catch(e=>{ortPromise=null;throw Error('ONNX runtime download failed: '+e.message);});return ortPromise;}
async function getSession(){if(!sessionPromise)sessionPromise=(async()=>{
 const ort=await getOrt();ort.env.wasm.wasmPaths=WASM;ort.env.wasm.numThreads=1;
 const model=await loadModel();const providers=['wasm'];
 // WebAssembly is preferred: benchmarked faster than WebGPU for this particular 5M graph.
 // Some browsers can't initialize GPU sessions in workers, so wasm is reliable on Chromebooks.
 status('Initializing local CPU inference…');const session=await ort.InferenceSession.create(model,{executionProviders:providers,graphOptimizationLevel:'all'});backend='WASM (on-device CPU)';
 status('Timestral-5M ready locally ('+backend+').');return session;
 })().catch(e=>{sessionPromise=null;throw e;});return sessionPromise;}
self.onmessage=async({data})=>{if(!data||!Number.isInteger(data.id))return;const id=data.id;
 try{
  const session=await getSession(),ort=await getOrt();if(data.type==='warmup'){postMessage({id,ok:true,backend});return;}
  if(data.type!=='forecast')throw Error('Unknown operation');
  const prep=TimestralPrep.prepare(data.prices);
  const output=await session.run({
   scaled:new ort.Tensor('float32',prep.scaled,[2,512]),
   missing:new ort.Tensor('float32',prep.missing,[2,512]),
   time_mask:new ort.Tensor('bool',prep.timeMask,[2,1,17,17]),
   variate_mask:new ort.Tensor('bool',prep.variateMask,[17,1,2,2]),
   positions:new ort.Tensor('int64',prep.positions,[2,17])
  });
  const result=TimestralPrep.denormalize(await output.preds.getData(),prep);
  postMessage({id,ok:true,backend,result});
 }catch(e){postMessage({id,ok:false,error:e?.message||String(e)});}
};